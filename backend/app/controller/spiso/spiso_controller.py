from flask import Blueprint, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import InvalidUsage, NotFoundRequest, UnauthorizedRequest, getClientIp
from app.helpers import validate_args
from app.models import Token, User
from app.models.spiso_link import SpisoLink
from app.service import spiso as spiso_service
from app.service.spiso import SpisoError
from .schemas import ChooseHome, Connect, SignIn

"""
A window onto the signed-in person's Spiso (Foodminder) inventory.

Every route works on `current_user` and nothing takes a user id, so there is no
route by which one account reaches another's kitchen — the feature is personal
because the data model is, not because the UI hides it.

Read-only towards Spiso. KitchenOwl never writes to an inventory: this shows
what is in the house, and no bug in a recipe app should be able to lose food.
"""

spiso = Blueprint("spiso", __name__)


def _link_or_404() -> SpisoLink:
    link = SpisoLink.find_by_user(current_user.id)
    if not link:
        raise NotFoundRequest()
    return link


@spiso.route("", methods=["GET"])
@jwt_required()
def getStatus():
    link = SpisoLink.find_by_user(current_user.id)
    return jsonify(link.obj_to_dict() if link else {"connected": False})


@spiso.route("/connect", methods=["POST"])
@jwt_required()
@validate_args(Connect)
def connect(args):
    base_url = spiso_service.normalise_base_url(args["base_url"])
    # The password lives exactly as long as this call. What is stored is the
    # session token it returns.
    token, identity = spiso_service.login(base_url, args["email"].strip(), args["password"])

    # A Spiso address can only sign into one KitchenOwl account, and this is
    # where that is decided. Refusing here is the difference between "your
    # account" and "whichever account claimed your email first".
    existing = SpisoLink.find_by_spiso_email(identity["email"])
    if existing and existing.user_id != current_user.id:
        raise InvalidUsage()

    link = SpisoLink.find_by_user(current_user.id) or SpisoLink()
    link.user_id = current_user.id
    link.base_url = base_url
    link.token = token
    link.spiso_user_id = identity["id"] or None
    link.spiso_email = identity["email"] or None
    link.invalid_since = None
    # A different account may have different homes, so a reconnect does not keep
    # a home id that may no longer exist.
    link.home_id = None
    link.home_name = None
    link.save()

    homes = spiso_service.homes(base_url, token)
    # One home is not a choice, so make it rather than asking.
    if len(homes) == 1:
        link.home_id = homes[0]["id"]
        link.home_name = homes[0]["name"]
        link.save()

    return jsonify({**link.obj_to_dict(), "homes": homes})


@spiso.route("/homes", methods=["GET"])
@jwt_required()
def listHomes():
    link = _link_or_404()
    try:
        return jsonify({"homes": spiso_service.homes(link.base_url, link.token)})
    except UnauthorizedRequest:
        link.mark_invalid()
        raise


@spiso.route("/home", methods=["POST"])
@jwt_required()
@validate_args(ChooseHome)
def chooseHome(args):
    link = _link_or_404()
    homes = spiso_service.homes(link.base_url, link.token)
    chosen = next((home for home in homes if home["id"] == args["home_id"]), None)
    if not chosen:
        raise NotFoundRequest()
    link.home_id = chosen["id"]
    link.home_name = chosen["name"]
    link.save()
    return jsonify(link.obj_to_dict())


@spiso.route("/inventory", methods=["GET"])
@jwt_required()
def getInventory():
    link = _link_or_404()
    if not link.home_id:
        return jsonify({"items": [], "home_name": None, "needs_home": True})
    try:
        items = spiso_service.snapshot_items(link.base_url, link.token, link.home_id)
    except UnauthorizedRequest:
        # A Spiso session expires. Saying so is the difference between "sign in
        # again" and an empty kitchen, which reads as lost data.
        link.mark_invalid()
        raise
    link.mark_valid()
    return jsonify({"items": items, "home_name": link.home_name, "needs_home": False})


@spiso.route("/shopping", methods=["GET"])
@jwt_required()
def getShopping():
    """Spiso's shopping list, which is the one that counts.

    Read-only, like the inventory: the phones write this list and KitchenOwl
    shows it. A second writer with no merge protocol is how a list loses the
    thing somebody added while walking to the shop.
    """
    link = _link_or_404()
    if not link.home_id:
        return jsonify({"items": [], "home_name": None, "needs_home": True})
    try:
        items = spiso_service.snapshot_shopping(link.base_url, link.token, link.home_id)
    except UnauthorizedRequest:
        link.mark_invalid()
        raise
    link.mark_valid()
    return jsonify({"items": items, "home_name": link.home_name, "needs_home": False})


@spiso.route("/login", methods=["POST"])
@validate_args(SignIn)
def loginWithSpiso(args):
    """Sign in to KitchenOwl with a Spiso password.

    No `base_url` is asked for and none is trusted from the request: the address
    comes from the link that was made while signed in to both. Otherwise this
    endpoint would happily send a password to whatever server a caller named.

    Deliberately unauthenticated — it is a login — and deliberately vague about
    why it failed. "No such account" and "wrong password" are the same answer
    here, because the difference tells a stranger which addresses exist.
    """
    email = (args["email"] or "").strip().lower()
    link = SpisoLink.find_by_spiso_email(email)
    if not link:
        raise UnauthorizedRequest(
            message="Unauthorized: IP {} Spiso sign-in for an unlinked address".format(getClientIp())
        )

    try:
        token, identity = spiso_service.login(link.base_url, email, args["password"])
    except SpisoError:
        # Spiso being unreachable and Spiso saying no are different things, but
        # not to someone at a login screen holding a password.
        raise UnauthorizedRequest(
            message="Unauthorized: IP {} Spiso sign-in rejected".format(getClientIp())
        )

    # The account moved, or the email was reassigned on the Spiso side. Either
    # way this is no longer the person the link was made for.
    if link.spiso_user_id and identity["id"] and identity["id"] != link.spiso_user_id:
        raise UnauthorizedRequest(
            message="Unauthorized: IP {} Spiso identity changed for {}".format(getClientIp(), email)
        )

    user = User.find_by_id(link.user_id)
    if not user:
        raise UnauthorizedRequest()

    # A successful sign-in is also a fresh Spiso session, so the inventory keeps
    # working without a second trip through the settings screen.
    link.token = token
    link.invalid_since = None
    link.save()

    device = args.get("device") or "Spiso sign-in"
    refreshToken, refreshModel = Token.create_refresh_token(user, device)
    accessToken, _ = Token.create_access_token(user, refreshModel)

    return jsonify(
        {
            "access_token": accessToken,
            "refresh_token": refreshToken,
            "user": user.obj_to_dict(),
        }
    )


@spiso.route("", methods=["DELETE"])
@jwt_required()
def disconnect():
    link = SpisoLink.find_by_user(current_user.id)
    if link:
        # Deletes the stored token with it. There is no other copy.
        db.session.delete(link)
        db.session.commit()
    return jsonify({"connected": False})
