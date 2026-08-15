from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Optional, Self, TYPE_CHECKING

from app import db
from sqlalchemy.orm import Mapped

Model = db.Model
if TYPE_CHECKING:
    from app.helpers.db_model_base import DbModelBase

    Model = DbModelBase


class SpisoLink(Model):
    """
    One person's connection to their Spiso (Foodminder) account.

    Keyed by KitchenOwl user, one row each, so the link is inherently personal:
    connecting yours tells this server nothing about anyone else's kitchen, and
    another member of the household sees the feature as unconfigured.

    **This row holds a credential for a different service**, which is a real
    cost and was chosen deliberately over the alternative of adding this origin
    to Spiso's CORS list. Consequences, kept honest:

    - The password is used once, to exchange for a session token, and is never
      written anywhere. The token is what is stored.
    - The token is never sent to the browser. It goes out only to `base_url`.
    - A Spiso session expires (30 days by default) and the link then reads as
      disconnected rather than silently failing — see `mark_invalid`.
    - Deleting the link deletes the token. There is no other copy.
    """

    __tablename__ = "spiso_link"

    id: Mapped[int] = db.Column(db.Integer, primary_key=True)
    user_id: Mapped[int] = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    base_url: Mapped[str] = db.Column(db.String(), nullable=False)
    token: Mapped[str] = db.Column(db.String(), nullable=False)
    home_id: Mapped[Optional[str]] = db.Column(db.String(), nullable=True)
    home_name: Mapped[Optional[str]] = db.Column(db.String(), nullable=True)
    # Who this is on the Spiso side. Recorded when the link is made, which is
    # the only moment both accounts are proven at once: the request carries a
    # KitchenOwl session *and* a Spiso password. That is what makes signing in
    # with Spiso credentials afterwards a lookup rather than a claim.
    spiso_user_id: Mapped[Optional[str]] = db.Column(db.String(), nullable=True, index=True)
    spiso_email: Mapped[Optional[str]] = db.Column(db.String(), nullable=True, index=True)
    # Set when Spiso last rejected the token, so the UI can say "sign in again"
    # rather than showing an empty kitchen, which looks like lost data.
    invalid_since: Mapped[Optional[datetime]] = db.Column(db.DateTime, nullable=True)
    created_at: Mapped[datetime] = db.Column(db.DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = db.Column(
        db.DateTime, default=datetime.now, onupdate=datetime.now
    )

    @classmethod
    def find_by_user(cls, user_id: int) -> Optional[Self]:
        return cls.query.filter(cls.user_id == user_id).first()

    @classmethod
    def find_by_spiso_email(cls, email: str) -> Optional[Self]:
        """Which KitchenOwl account a Spiso address signs into.

        Case-folded, because an email address is not case-sensitive in the half
        that matters and people type it however their keyboard felt.
        """
        cleaned = (email or "").strip().lower()
        if not cleaned:
            return None
        return cls.query.filter(cls.spiso_email == cleaned).first()

    def mark_invalid(self) -> None:
        self.invalid_since = datetime.now(timezone.utc)
        self.save()

    def mark_valid(self) -> None:
        if self.invalid_since is not None:
            self.invalid_since = None
            self.save()

    def obj_to_dict(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Deliberately hand-written rather than reflecting the columns: the
        default would serialise `token`, and this object is returned to a
        browser."""
        return {
            "connected": True,
            "base_url": self.base_url,
            "home_id": self.home_id,
            "home_name": self.home_name,
            "needs_sign_in": self.invalid_since is not None,
            "spiso_email": self.spiso_email,
            # Whether this Spiso account can be used to sign in to KitchenOwl.
            "sign_in_enabled": self.spiso_email is not None,
        }
