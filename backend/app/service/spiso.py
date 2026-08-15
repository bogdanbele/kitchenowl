from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import requests

from app.errors import InvalidUsage, UnauthorizedRequest

"""
Talking to a Spiso (Foodminder) server on the user's behalf.

Everything here is read-only against Spiso except the login that starts a
session. KitchenOwl never writes to someone's inventory: this is a window onto
what is in the house, and a bug here should be unable to lose food.

Two facts from Spiso's own source shape this file:

1. `/homes/:id/snapshot` is **plaintext by design** for shared homes — the trade
   is written up in its backup.ts — while personal cloud backup stays end-to-end
   encrypted with xchacha20-poly1305. So a shared home can be read, and a
   personal backup cannot be, by anyone without the user's key. When a snapshot
   comes back as an encrypted envelope we say so plainly instead of showing an
   empty kitchen.
2. Items carry deletion tombstones (`removedAt`). A tombstone is a row that
   exists so a deletion can travel between devices; treating one as food would
   put things back in the fridge that somebody threw away.
"""

TIMEOUT_SECONDS = 15
# A phone's whole kitchen. Well above a real inventory, low enough that a
# misconfigured base_url pointing at something huge cannot exhaust memory here.
MAX_ITEMS = 5000


class SpisoError(Exception):
    """Something Spiso said, in words worth showing to the person who asked."""


def normalise_base_url(raw: str) -> str:
    """A base URL that is safe to send a credential to.

    HTTPS is required for anything that is not localhost: this request carries a
    password, and the point of asking for the address is that it is not
    hardcoded, which is exactly the situation where a typo sends it in the
    clear.
    """
    value = (raw or "").strip().rstrip("/")
    if not value:
        raise InvalidUsage()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise SpisoError("That does not look like a server address.")
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme != "https" and not local:
        raise SpisoError("Use https — this sends your Spiso password.")
    return value


def _request(
    base_url: str, path: str, token: str | None = None, method: str = "GET", json: Any = None
) -> Any:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(
            method,
            f"{base_url}{path}",
            headers=headers,
            json=json,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        # Deliberately not the underlying error: it embeds the URL, which the
        # logs do not need and the browser certainly does not.
        raise SpisoError("Could not reach that Spiso server.")

    if response.status_code == 401:
        raise UnauthorizedRequest()
    if response.status_code >= 400:
        message = None
        try:
            message = (response.json().get("error") or {}).get("message")
        except ValueError:
            pass
        raise SpisoError(message or f"Spiso answered {response.status_code}.")
    try:
        return response.json()
    except ValueError:
        raise SpisoError("Spiso returned something that was not JSON.")


def login(base_url: str, email: str, password: str) -> tuple[str, dict[str, Any]]:
    """Exchange a password for a session token, and say who it belongs to.

    The password is not stored, here or anywhere else — this function is the
    only thing that ever sees it. The returned identity is what binds a Spiso
    account to a KitchenOwl one.
    """
    body = _request(base_url, "/auth/login", method="POST", json={"email": email, "password": password})
    token = (body or {}).get("token")
    if not isinstance(token, str) or not token:
        raise SpisoError("Spiso did not return a session.")
    user = (body or {}).get("user") or {}
    return token, {
        "id": str(user.get("id") or ""),
        "email": str(user.get("email") or email).strip().lower(),
        "name": user.get("displayName"),
    }


def homes(base_url: str, token: str) -> list[dict[str, Any]]:
    body = _request(base_url, "/homes", token=token)
    found = (body or {}).get("homes")
    if not isinstance(found, list):
        return []
    return [
        {"id": str(home.get("id")), "name": home.get("name") or "Home", "role": home.get("role")}
        for home in found
        if isinstance(home, dict) and home.get("id")
    ]


def snapshot_items(base_url: str, token: str, home_id: str) -> list[dict[str, Any]]:
    """The food in a shared home, as KitchenOwl wants to read it."""
    body = _request(base_url, f"/homes/{home_id}/snapshot", token=token)
    snapshot = (body or {}).get("snapshot")
    if not snapshot:
        return []

    if snapshot.get("format") != "spiso-home-snapshot":
        # An envelope from before shared homes dropped encryption, or a personal
        # backup. Either way the key is on someone's phone and this server will
        # never have it, so say that rather than reporting an empty kitchen.
        raise SpisoError(
            "That home's snapshot is still end-to-end encrypted, so only the Spiso app can open it. "
            "Opening the home in Spiso once re-uploads it in the readable format."
        )

    backup = snapshot.get("backup") or {}
    items = backup.get("items")
    if not isinstance(items, list):
        return []

    return [normalise_item(item) for item in items[:MAX_ITEMS] if _is_food(item)]


def snapshot_shopping(base_url: str, token: str, home_id: str) -> list[dict[str, Any]]:
    """The home's shopping list, out of the same snapshot as the inventory.

    Spiso is the source of truth for this list, so nothing here writes: what
    comes back is what the phones agreed on, and KitchenOwl shows it.

    Two states are filtered out for the same reason as the inventory —
    `removedAt` is a deletion travelling between devices, and `checkedAt` is
    something already in the trolley. Both would otherwise reappear as things
    still to buy.
    """
    body = _request(base_url, f"/homes/{home_id}/snapshot", token=token)
    snapshot = (body or {}).get("snapshot")
    if not snapshot:
        return []
    if snapshot.get("format") != "spiso-home-snapshot":
        raise SpisoError(
            "That home's snapshot is still end-to-end encrypted, so only the Spiso app can open it."
        )

    items = ((snapshot.get("backup") or {}).get("shoppingItems")) or []
    if not isinstance(items, list):
        return []

    out: list[dict[str, Any]] = []
    for item in items[:MAX_ITEMS]:
        if not isinstance(item, dict) or not item.get("name"):
            continue
        if item.get("removedAt") or item.get("checkedAt"):
            continue
        quantity = item.get("quantity")
        out.append(
            {
                "id": str(item.get("id") or ""),
                "name": str(item.get("name") or "").strip(),
                "quantity": quantity if isinstance(quantity, (int, float)) else 1,
                # Set when the item came from something in the kitchen running
                # out, which is worth knowing when deciding whether to buy it.
                "from_food_id": item.get("sourceFoodId"),
                "added_at": item.get("createdAt"),
            }
        )
    return out


def _is_food(item: Any) -> bool:
    if not isinstance(item, dict) or not item.get("name"):
        return False
    # A tombstone is a deletion travelling between devices, not something in the
    # fridge. `consumed` and `discarded` are gone too — the row survives so the
    # app can show history.
    if item.get("removedAt"):
        return False
    return item.get("status") not in ("consumed", "discarded", "used")


def normalise_item(item: dict[str, Any]) -> dict[str, Any]:
    quantity = item.get("quantity")
    return {
        "id": str(item.get("id") or ""),
        "name": str(item.get("name") or "").strip(),
        "quantity": quantity if isinstance(quantity, (int, float)) else 1,
        "category": item.get("category"),
        "emoji": item.get("emoji"),
        "location": item.get("storageLocation"),
        # The shelf within the fridge, or the cupboard within the pantry.
        # Free text on Spiso's side — "Door shelf", "Snack cabinet" — so it is
        # passed through as written and never parsed.
        "space": item.get("storageSpace"),
        # ISO 8601 as Spiso writes it. Left as a string rather than parsed into
        # epoch millis like the rest of this API, because it is a *date* — the
        # day something goes off does not shift with a timezone.
        "expires_on": item.get("expiryDate"),
        "opened_on": item.get("openedDate"),
        "status": item.get("status"),
    }
