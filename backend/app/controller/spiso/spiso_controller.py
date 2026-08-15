from flask import Blueprint, jsonify
from flask_jwt_extended import current_user, jwt_required

from app import db
from app.errors import NotFoundRequest, UnauthorizedRequest
from app.helpers import validate_args
from app.models.spiso_link import SpisoLink
from app.service import spiso as spiso_service
from .schemas import ChooseHome, Connect

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
    token = spiso_service.login(base_url, args["email"].strip(), args["password"])

    link = SpisoLink.find_by_user(current_user.id) or SpisoLink()
    link.user_id = current_user.id
    link.base_url = base_url
    link.token = token
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


@spiso.route("", methods=["DELETE"])
@jwt_required()
def disconnect():
    link = SpisoLink.find_by_user(current_user.id)
    if link:
        # Deletes the stored token with it. There is no other copy.
        db.session.delete(link)
        db.session.commit()
    return jsonify({"connected": False})
