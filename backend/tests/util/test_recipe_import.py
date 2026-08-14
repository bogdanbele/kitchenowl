import json

import pytest

from app.util import recipe_import


@pytest.mark.parametrize(
    "value,expected",
    [
        ("4", 4),
        ("Serves 4", 4),
        ("serves 4 people", 4),
        ("4 to 6 servings", 4),  # lower bound: scaling up beats running short
        ("4-6", 4),
        ("Makes 12 cookies", 12),
        ("Für 4 Personen", 4),
        ("1.5 dozen", 1),
        ("1,5 dozen", 1),
        (6, 6),
        ("", None),
        ("a few", None),
        (None, None),
        ("0 servings", None),
        (0, None),
    ],
)
def testParseYields(value, expected):
    assert recipe_import.parse_yields(value) == expected


def testParseYieldsRegressionOnLeadingWord():
    """The original `\\d*` matched an empty string at position 0 and lost the count.

    "Serves 4" silently imported as no yield at all, which is the failure that
    looks like the site was at fault.
    """
    assert recipe_import.parse_yields("Serves 4") == 4


@pytest.mark.parametrize(
    "instructions,expected",
    [
        (None, ""),
        ("", ""),
        ([], ""),
        ("Boil water.", "1. Boil water."),
        ("Boil water.\nAdd pasta.", "1. Boil water.\n2. Add pasta."),
        (["Boil water.", "Add pasta."], "1. Boil water.\n2. Add pasta."),
        # The site numbered them already; we must not end up with "1. 1. Boil water."
        ("1. Boil water.\n2. Add pasta.", "1. Boil water.\n2. Add pasta."),
        ("Step 1: Boil water.\nStep 2: Add pasta.", "1. Boil water.\n2. Add pasta."),
        ("1) Boil water.", "1. Boil water."),
        # Blank lines and padding are noise, not steps.
        ("Boil water.\n\n   \nAdd pasta.", "1. Boil water.\n2. Add pasta."),
    ],
)
def testInstructionsToMarkdown(instructions, expected):
    assert recipe_import.instructions_to_markdown(instructions) == expected


def testInstructionsKeepSectionsAndRestartNumbering():
    markdown = recipe_import.instructions_to_markdown(
        ["For the marinade:", "Mix soy and garlic.", "To cook:", "Sear the pork.", "Rest it."]
    )
    assert markdown == (
        "## For the marinade\n\n"
        "1. Mix soy and garlic.\n\n"
        "## To cook\n\n"
        "1. Sear the pork.\n"
        "2. Rest it."
    )


def testInstructionsTreatSentenceWithColonAsAStep():
    """A colon does not make a heading; a short label with no sentence does."""
    markdown = recipe_import.instructions_to_markdown(["Add the flour, then whisk hard:"])
    assert markdown.startswith("1. Add the flour")


def testBareStepLabelDoesNotBecomeItsOwnStep():
    markdown = recipe_import.instructions_to_markdown(["Step 1", "Boil water."])
    assert markdown == "1. Boil water."


@pytest.mark.parametrize(
    "text,expected",
    [
        (None, ""),
        ("", ""),
        ("A sour pork soup.", "A sour pork soup."),
        ("Jump to Recipe\nA sour pork soup.", "A sour pork soup."),
        ("A sour pork soup.\nThis post may contain affiliate links.", "A sour pork soup."),
        ("Print Recipe\n\nA sour pork soup.\n\nPin this recipe", "A sour pork soup."),
    ],
)
def testCleanDescription(text, expected):
    assert recipe_import.clean_description(text) == expected


def testCleanDescriptionKeepsSentenceMentioningARemovedPhrase():
    """Whole-line matching, so prose about a video survives the video link."""
    text = "Watch the video below to see how thin to slice it."
    assert recipe_import.clean_description(text) == text


def _page(payload) -> str:
    return (
        "<html><head><script type='application/ld+json'>"
        + json.dumps(payload)
        + "</script></head><body></body></html>"
    )


def testJsonLdBareRecipe():
    result = recipe_import.recipe_from_jsonld(
        _page(
            {
                "@type": "Recipe",
                "name": "Pork Sinigang",
                "recipeYield": "Serves 4",
                "recipeIngredient": ["800 g pork belly", "1 packet sinigang mix"],
                "recipeInstructions": "Boil the pork.\nAdd the vegetables.",
                "image": "https://example.com/a.jpg",
            }
        )
    )
    assert result is not None
    assert result["name"] == "Pork Sinigang"
    assert result["yields"] == 4
    assert result["ingredients"] == ["800 g pork belly", "1 packet sinigang mix"]
    assert result["instructions"] == ["Boil the pork.", "Add the vegetables."]
    assert result["image"] == "https://example.com/a.jpg"


def testJsonLdInsideGraphBesideOtherNodes():
    result = recipe_import.recipe_from_jsonld(
        _page(
            {
                "@context": "https://schema.org",
                "@graph": [
                    {"@type": "Organization", "name": "A Food Blog"},
                    {"@type": ["Recipe", "NewsArticle"], "name": "Adobo"},
                ],
            }
        )
    )
    assert result is not None
    assert result["name"] == "Adobo"


def testJsonLdHowToSectionsBecomeHeadings():
    result = recipe_import.recipe_from_jsonld(
        _page(
            {
                "@type": "Recipe",
                "name": "Adobo",
                "recipeInstructions": [
                    {
                        "@type": "HowToSection",
                        "name": "Marinate",
                        "itemListElement": [
                            {"@type": "HowToStep", "text": "Combine soy and vinegar."}
                        ],
                    },
                    {"@type": "HowToStep", "text": "Simmer for 40 minutes."},
                ],
            }
        )
    )
    assert result is not None
    assert result["instructions"] == [
        "Marinate:",
        "Combine soy and vinegar.",
        "Simmer for 40 minutes.",
    ]
    assert recipe_import.instructions_to_markdown(result["instructions"]) == (
        "## Marinate\n\n1. Combine soy and vinegar.\n2. Simmer for 40 minutes."
    )


def testJsonLdImageObjectAndList():
    result = recipe_import.recipe_from_jsonld(
        _page(
            {
                "@type": "Recipe",
                "name": "Adobo",
                "image": [{"@type": "ImageObject", "url": "https://example.com/b.jpg"}],
            }
        )
    )
    assert result is not None
    assert result["image"] == "https://example.com/b.jpg"


def testMalformedBlockDoesNotHideALaterRecipe():
    html = (
        "<html><head>"
        "<script type='application/ld+json'>{ this is not json, }</script>"
        "<script type='application/ld+json'>"
        + json.dumps({"@type": "Recipe", "name": "Adobo"})
        + "</script></head></html>"
    )
    result = recipe_import.recipe_from_jsonld(html)
    assert result is not None
    assert result["name"] == "Adobo"


def testUntitledRecipeIsNotImported():
    """An untitled import is worse than a failed one: it looks like it worked."""
    assert recipe_import.recipe_from_jsonld(_page({"@type": "Recipe", "name": ""})) is None


def testPageWithoutStructuredData():
    assert recipe_import.recipe_from_jsonld("<html><body>Hi</body></html>") is None


def testBareVerbLabelBecomesAHeadingNotAStep():
    """Seen on kawalingpinoy.com: every other step was the single word "Boil"."""
    markdown = recipe_import.instructions_to_markdown(
        [
            "Rinse pork ribs and drain well.",
            "Boil",
            "In a pot over medium heat, combine pork and enough water to cover.",
            "Simmer",
            "Once broth clears, add tomatoes, onion, and fish sauce and lower the heat.",
        ]
    )
    assert markdown == (
        "1. Rinse pork ribs and drain well.\n\n"
        "## Boil\n\n"
        "1. In a pot over medium heat, combine pork and enough water to cover.\n\n"
        "## Simmer\n\n"
        "1. Once broth clears, add tomatoes, onion, and fish sauce and lower the heat."
    )


def testShortLineWithNothingUnderItStaysAStep():
    """Otherwise a recipe written in terse lines renders as headings and no steps."""
    assert recipe_import.instructions_to_markdown(["Boil water.", "Serve"]) == (
        "1. Boil water.\n2. Serve"
    )


def testShortLineFollowedByAnotherShortLineStaysAStep():
    assert recipe_import.instructions_to_markdown(["Chop the onion", "Fry it"]) == (
        "1. Chop the onion\n2. Fry it"
    )
