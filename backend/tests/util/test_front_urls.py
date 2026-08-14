import pytest

from app.util import parse_front_urls


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, []),
        ("", []),
        ("https://kitchen.example.com", ["https://kitchen.example.com"]),
        # The case this exists for: public hostname and LAN address together.
        (
            "https://kitchen.example.com,http://192.168.1.10:8080",
            ["https://kitchen.example.com", "http://192.168.1.10:8080"],
        ),
        (" https://a.example.com , https://b.example.com ", ["https://a.example.com", "https://b.example.com"]),
        # A trailing slash is invisible in an .env file and is the difference
        # between an origin that matches and one that silently does not.
        ("https://kitchen.example.com/", ["https://kitchen.example.com"]),
        ("https://a.example.com,,https://b.example.com", ["https://a.example.com", "https://b.example.com"]),
    ],
)
def testParseFrontUrls(value, expected):
    assert parse_front_urls(value) == expected
