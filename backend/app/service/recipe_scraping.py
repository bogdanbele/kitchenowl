import re
from collections.abc import Callable
from typing import Any
from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import SchemaOrgException
from recipe_scrapers.__version__ import __version__ as recipe_scrapers_version
from requests_hardened import Config, Manager
import requests
from app.config import FRONT_URL
from app.errors import ForbiddenRequest
from app.models.recipe import RecipeVisibility
from app.service.ingredient_parsing import parseIngredients
from app.util.recipe_import import (
    clean_description,
    instructions_to_markdown,
    parse_yields,
    recipe_from_jsonld,
)

from app.models import Recipe, Item, Household

# What a scraper raises when a site simply does not publish a field. Missing data
# is the normal case, not an error, so every read goes through _optional().
_MISSING_FIELD = (
    NotImplementedError,
    ValueError,
    TypeError,
    AttributeError,
    KeyError,
    SchemaOrgException,
)


def _optional[T](read: Callable[[], T]) -> T | None:
    """Read one field, treating "this site doesn't have it" as None."""
    try:
        return read()
    except _MISSING_FIELD:
        return None

# taken from the recipe-scrapers library to circumvent anti-scraping measures that block requests with the default user agent
USER_AGENT = f"Mozilla/5.0 (compatible; Windows NT 10.0; Win64; x64; rv:{recipe_scrapers_version}) recipe-scrapers/{recipe_scrapers_version}"

request_manager = Manager(
    Config(
        default_timeout=(2, 10),
        never_redirect=False,
        ip_filter_enable=True,
        ip_filter_allow_loopback_ips=False,
        user_agent_override=USER_AGENT,
    )
)


def _buildDescription(blurb: str | None, instructions: str | list[str] | None) -> str:
    """Blurb first, then the steps as a numbered markdown list.

    The steps used to be appended as the scraper returned them: one paragraph of
    newline-separated sentences, which reads as a wall of grey text on a phone
    propped against a chopping board. Numbering them is what makes an imported
    recipe usable while actually cooking.
    """
    parts = [clean_description(blurb), instructions_to_markdown(instructions)]
    return "\n\n".join(part for part in parts if part)


def _itemsFor(ingredients: list[str], household: Household) -> dict[str, Any]:
    items: dict[str, Any] = {}
    for ingredient in parseIngredients(ingredients, household.language):
        name = ingredient.name if ingredient.name else ingredient.originalText or ""
        item = Item.find_name_starts_with(household.id, name)
        if item:
            items[ingredient.originalText] = item.obj_to_dict() | {
                "description": ingredient.description,
                "optional": False,
            }
        else:
            items[ingredient.originalText] = None
    return items


def _scrapeFromJsonLd(url: str, html: str, household: Household) -> dict[str, Any] | None:
    """Read the page's own JSON-LD when the scraper library came back empty.

    Sites the library has no parser for still very often publish schema.org data
    for search engines. Before, any such page failed the import outright.
    """
    extracted = recipe_from_jsonld(html)
    if not extracted:
        return None

    recipe = Recipe()
    recipe.name = str(extracted["name"]).strip()[:128]
    recipe.description = _buildDescription(
        extracted.get("description"), extracted.get("instructions")
    )
    yields = extracted.get("yields")
    if yields:
        recipe.yields = yields
    recipe.photo = extracted.get("image")
    recipe.source = url
    return {
        "recipe": recipe.obj_to_dict(),
        "items": _itemsFor(extracted.get("ingredients") or [], household),
    }


def scrapePublic(url: str, html: str, household: Household) -> dict[str, Any] | None:
    try:
        scraper = scrape_html(html, url, supported_only=False)
    except Exception:
        return _scrapeFromJsonLd(url, html, household)

    title = _optional(lambda: scraper.title().strip()[:128])
    if not title:
        # No title from the library. The page may still carry structured data it
        # declined to parse, so try that before giving up on the import.
        return _scrapeFromJsonLd(url, html, household)

    recipe = Recipe()
    recipe.name = title

    for attribute, read in (
        ("time", lambda: scraper.total_time()),
        ("cook_time", lambda: scraper.cook_time()),
        ("prep_time", lambda: scraper.prep_time()),
    ):
        minutes = _optional(lambda read=read: int(read()))  # pyright: ignore[reportUnknownLambdaType]
        if minutes is not None:
            setattr(recipe, attribute, minutes)

    # parse_yields, not a bare regex: the old `\d*` matched the empty string
    # before the "S" of "Serves 4" and threw the count away.
    yields = parse_yields(_optional(lambda: scraper.yields()))
    if yields:
        recipe.yields = yields

    # instructions_list keeps the steps separate; instructions() has already
    # glued them into one string, which is lossier but is all some sites give.
    instructions = _optional(lambda: scraper.instructions_list()) or _optional(
        lambda: scraper.instructions()
    )
    recipe.description = _buildDescription(
        _optional(lambda: scraper.description()), instructions
    )
    # A site with no image should not fail the whole import, which is what an
    # unguarded call here used to do.
    recipe.photo = _optional(lambda: scraper.image())
    recipe.source = url

    return {
        "recipe": recipe.obj_to_dict(),
        "items": _itemsFor(_optional(lambda: scraper.ingredients()) or [], household),
    }


def scrapeLocal(recipe_id: int, household: Household):
    recipe = Recipe.find_by_id(recipe_id)
    if not recipe:
        return None
    if recipe.visibility == RecipeVisibility.PRIVATE:
        recipe.checkAuthorized()
    recipe.server_scrapes = recipe.server_scrapes + 1
    recipe.save()

    items = {}
    for ingredient in recipe.items:
        items[ingredient.item.name + " " + ingredient.description] = (
            ingredient.obj_to_item_dict()
        )

    return {
        "recipe": recipe.obj_to_dict()
        | {
            "id": None,
            "visibility": RecipeVisibility.PRIVATE,
            "source": "kitchenowl:///recipe/" + str(recipe.id),
        },
        "items": items,
    }


def scrapeKitchenOwl(
    original_url: str, api_url: str, recipe_id: int
) -> dict[str, Any] | None:
    res = requests.get(api_url + "/recipe/" + str(recipe_id))
    if res.status_code != requests.codes.ok:
        if res.status_code == requests.codes.unauthorized:
            raise ForbiddenRequest()
        return None

    recipe = res.json() | {
        "id": None,
        "visibility": RecipeVisibility.PRIVATE,
        "source": original_url,
    }
    if recipe["photo"] is not None:
        recipe["photo"] = api_url + "/upload/" + recipe["photo"]
    items = {}

    for ingredient in recipe["items"]:
        items[ingredient["name"] + " " + ingredient["description"]] = ingredient

    return {"recipe": recipe, "items": items}


def scrape(url: str, household: Household) -> dict[str, Any] | None:
    localMatch = re.match(
        r"(kitchenowl:\/\/|"
        + re.escape((FRONT_URL or "").removesuffix("/"))
        + r")\/recipe\/(\d+)",
        url,
    )
    if localMatch:
        return scrapeLocal(int(localMatch.group(2)), household)

    kitchenowlMatch = re.match(
        r"((https?:\/\/)?app\.kitchenowl\.org|.+)\/recipe\/(\d+)", url
    )
    if kitchenowlMatch and url.startswith("https://app.kitchenowl.org/"):
        return scrapeKitchenOwl(
            url, "https://app.kitchenowl.org/api", int(kitchenowlMatch.group(3))
        )
    if "http" not in url:
        url = "http://" + url

    try:
        res = request_manager.send_request("GET", url)
    except Exception:
        return None
    if res.status_code != requests.codes.ok:
        return None

    if kitchenowlMatch and "<title>KitchenOwl</title>" in res.text:
        return scrapeKitchenOwl(
            url, kitchenowlMatch.group(1) + "/api", int(kitchenowlMatch.group(3))
        )

    return scrapePublic(url, res.text, household)
