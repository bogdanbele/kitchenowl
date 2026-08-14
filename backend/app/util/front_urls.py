"""Reading FRONT_URL as the list of origins it usually needs to be.

An instance is commonly reached by more than one origin: the public hostname
through a reverse proxy, and http://<host>:8080 directly on the LAN. FRONT_URL
took exactly one, and the socket layer passes it straight to
cors_allowed_origins — so live updates worked on the public URL and were
rejected with "Not an accepted origin." everywhere else, on every client
including the Flutter app.

Accepting a comma-separated list fixes that without loosening the default: an
unset FRONT_URL still yields nothing, and a single URL still yields exactly
that one.
"""


def parse_front_urls(value: str | None) -> list[str]:
    """Split FRONT_URL into origins, tolerating spaces and trailing slashes.

    A trailing slash is the difference between an origin that matches and one
    that silently does not, and it is invisible in an .env file, so it is
    stripped here rather than left to trip someone up.
    """
    if not value:
        return []
    return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
