"""Heuristics for turning a scraped web page into a usable recipe.

The scraper library gets us structured data when a site provides it. What arrives
is still shaped for a browser rather than for reading in the app: instructions
come back as one newline-separated blob, yields as prose like "Serves 4", and
descriptions carry the blog furniture around the recipe ("Jump to Recipe", the
affiliate-link disclaimer). These functions clean that up, and provide a
last-resort extraction for pages that publish no structured data at all.

Everything here is pure so it can be tested without a network or a database.
"""

import json
import re
from typing import Any

from bs4 import BeautifulSoup, Tag

# Blogs pad the description with navigation and legal boilerplate. Matching on
# whole lines rather than substrings keeps a sentence that merely mentions, say,
# a jump cut in a video from being thrown away.
_BOILERPLATE_LINES = re.compile(
    r"^\s*(jump to (the )?recipe|print recipe|pin (this )?recipe|save (this )?recipe"
    r"|skip to (the )?recipe|watch the video|rate this recipe"
    r"|this post (may|might) contain affiliate links.*"
    r"|as an amazon associate.*)\s*$",
    re.IGNORECASE,
)

# "Step 1", "1.", "1)" — the site already numbered the step, and a markdown
# ordered list is about to number it again. Strip theirs, keep ours.
_STEP_PREFIX = re.compile(r"^\s*(step\s*)?\d{1,2}\s*[.):\-]\s+|^\s*step\s+\d{1,2}\s*$", re.IGNORECASE)

# A heading inside instructions ends in a colon — but so does plenty of prose
# ("Add the flour, then whisk hard:"). A heading is also short and label-like, so
# require few words and no clause punctuation.
_HEADING = re.compile(r"^[^.!?,;]{2,48}:$")
_HEADING_MAX_WORDS = 5

# Some sites label each step with a bare verb and put the instruction on the
# next line, which arrives as:
#
#     Boil
#     In a pot over medium heat, combine pork and enough water to cover.
#
# Numbering both gives a list where every other entry is a single word. A line
# that short, with no punctuation and a real sentence under it, is a label for
# what follows rather than an instruction of its own.
#
# The trade: a genuinely terse step ("Serve") becomes a heading. The text is
# still shown either way, so the cost is styling, where the cost of the old
# behaviour was a list that read as broken.
_LABEL_MAX_WORDS = 3
_SENTENCE_MIN_WORDS = 5

_YIELD_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def clean_description(text: str | None) -> str:
    """Drop blog furniture and collapse the runs of blank lines it leaves behind."""
    if not text:
        return ""
    kept = [line for line in text.splitlines() if not _BOILERPLATE_LINES.match(line)]
    # Three or more newlines become two: one blank line is a paragraph break,
    # more than that is just the hole left by a line we removed.
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def parse_yields(value: str | int | None) -> int | None:
    """Pull a serving count out of whatever the site calls it.

    Handles "4", "Serves 4", "4 to 6 servings", "Makes 12 cookies", "Für 4 Personen".
    On a range the lower bound wins, because scaling a recipe up is easier than
    discovering halfway through that you are short.

    Returns None rather than 0 when there is no number, so the caller can leave
    the recipe's own default in place.
    """
    if value is None:
        return None
    if isinstance(value, int):
        return value if value > 0 else None

    match = _YIELD_NUMBER.search(value)
    if not match:
        return None
    try:
        # Sites write "1.5 dozen"; a fractional serving count is not useful, but
        # the integer part still is.
        number = int(float(match.group().replace(",", ".")))
    except ValueError:
        return None
    return number if number > 0 else None


def _split_instructions(instructions: str | list[str] | None) -> list[str]:
    if not instructions:
        return []
    if isinstance(instructions, str):
        parts = instructions.splitlines()
    else:
        # A list entry can itself hold several newline-separated steps.
        parts = [line for entry in instructions for line in str(entry).splitlines()]
    return [part.strip() for part in parts if part and part.strip()]


def instructions_to_markdown(instructions: str | list[str] | None) -> str:
    """Render instructions as a numbered markdown list, keeping any section headings.

    The scraper hands back a blob of newline-separated sentences, which the app
    then shows as one grey wall of text. Numbering the steps is what makes it
    followable while cooking, and it is the shape a person would have typed by
    hand anyway.
    """
    lines = _split_instructions(instructions)
    if not lines:
        return ""

    def is_heading(index: int) -> bool:
        line = lines[index]
        if _HEADING.match(line) and len(line.split()) <= _HEADING_MAX_WORDS:
            return True

        # A bare label only counts as one when there is a real instruction under
        # it. Without that test, a recipe written entirely in short lines would
        # come out as headings with no steps at all.
        if re.search(r"[.!?:,;]", line) or len(line.split()) > _LABEL_MAX_WORDS:
            return False
        following = lines[index + 1] if index + 1 < len(lines) else ""
        return len(following.split()) >= _SENTENCE_MIN_WORDS

    rendered: list[str] = []
    step = 0
    for index, line in enumerate(lines):
        if is_heading(index):
            # A new section restarts the numbering, the way a recipe card does.
            rendered.append(f"\n## {line.rstrip(':')}\n")
            step = 0
            continue
        text = _STEP_PREFIX.sub("", line).strip()
        if not text:
            # The line was nothing but "Step 3" — a label for the step that follows.
            continue
        step += 1
        rendered.append(f"{step}. {text}")

    return "\n".join(rendered).strip()


def _first_recipe_node(data: Any) -> dict[str, Any] | None:
    """Find the schema.org Recipe anywhere in a JSON-LD document.

    Publishers nest it inconsistently: bare, in an @graph, or in a list beside
    the site's Organization and BreadcrumbList nodes.
    """
    if isinstance(data, list):
        for entry in data:  # pyright: ignore[reportUnknownVariableType]
            found = _first_recipe_node(entry)
            if found:
                return found
        return None
    if not isinstance(data, dict):
        return None

    node = data  # pyright: ignore[reportUnknownVariableType]
    node_type = node.get("@type")
    types = node_type if isinstance(node_type, list) else [node_type]
    if any(isinstance(t, str) and t.lower() == "recipe" for t in types):  # pyright: ignore[reportUnknownVariableType]
        return node  # pyright: ignore[reportUnknownVariableType]

    if "@graph" in node:
        return _first_recipe_node(node["@graph"])
    return None


def _text_of(value: Any) -> str:
    """Flatten the several shapes a schema.org text field arrives in."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return _text_of(value.get("text") or value.get("name"))  # pyright: ignore[reportUnknownArgumentType]
    if isinstance(value, list):
        return "\n".join(
            filter(None, (_text_of(entry) for entry in value))  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
        )
    return str(value)


def _instruction_lines(value: Any) -> list[str]:
    """Read recipeInstructions, which may be text, a list, or HowToSection trees."""
    if value is None:
        return []
    if isinstance(value, str):
        return [line for line in value.splitlines() if line.strip()]
    if isinstance(value, list):
        lines: list[str] = []
        for entry in value:  # pyright: ignore[reportUnknownVariableType]
            lines.extend(_instruction_lines(entry))
        return lines
    if isinstance(value, dict):
        if str(value.get("@type", "")).lower() == "howtosection":  # pyright: ignore[reportUnknownArgumentType]
            name = _text_of(value.get("name"))
            steps = _instruction_lines(value.get("itemListElement"))
            # Re-emit the section name as a heading line so the markdown pass
            # picks it up rather than treating it as another step.
            return ([f"{name}:"] if name else []) + steps
        return [line for line in _text_of(value).splitlines() if line.strip()]
    return []


def recipe_from_jsonld(html: str) -> dict[str, Any] | None:
    """Last-resort extraction straight from a page's JSON-LD.

    The scraper library already reads structured data on the sites it knows. This
    runs when it has come back empty and covers pages whose markup it rejects —
    a stray trailing comma in one script tag should not lose the whole recipe, so
    each block is parsed independently.

    Returns None when there is no Recipe node, which is the caller's signal that
    the page genuinely has nothing to offer.
    """
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        if not isinstance(script, Tag):
            continue
        try:
            data = json.loads(script.get_text())
        except (ValueError, TypeError):
            continue
        node = _first_recipe_node(data)
        if not node:
            continue

        name = _text_of(node.get("name"))
        if not name:
            # Without a title there is nothing worth importing, and an untitled
            # recipe is worse than a failed import: it looks like it worked.
            continue

        ingredients = [
            line
            for line in (
                _text_of(entry).strip()
                for entry in (node.get("recipeIngredient") or node.get("ingredients") or [])  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
            )
            if line
        ]
        return {
            "name": name,
            "description": clean_description(_text_of(node.get("description"))),
            "instructions": _instruction_lines(node.get("recipeInstructions")),
            "ingredients": ingredients,
            "yields": parse_yields(_text_of(node.get("recipeYield"))),
            "image": _first_image(node.get("image")),
        }
    return None


def _first_image(value: Any) -> str | None:
    """schema.org image is a URL, a list of them, or an ImageObject."""
    if not value:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for entry in value:  # pyright: ignore[reportUnknownVariableType]
            found = _first_image(entry)
            if found:
                return found
        return None
    if isinstance(value, dict):
        return _first_image(value.get("url") or value.get("contentUrl"))  # pyright: ignore[reportUnknownArgumentType]
    return None
