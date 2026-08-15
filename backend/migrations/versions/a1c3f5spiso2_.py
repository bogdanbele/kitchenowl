"""Bind a Spiso identity to the link, so it can sign in

Revision ID: a1c3f5spiso2
Revises: a1c3f5spiso1
Create Date: 2026-08-15

"""

from alembic import op
import sqlalchemy as sa


revision = "a1c3f5spiso2"
down_revision = "a1c3f5spiso1"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("spiso_link", schema=None) as batch_op:
        batch_op.add_column(sa.Column("spiso_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("spiso_email", sa.String(), nullable=True))
        batch_op.create_index(batch_op.f("ix_spiso_link_spiso_user_id"), ["spiso_user_id"])
        # Not unique at the database level on purpose: an address that is not
        # linked is NULL, and several NULLs are legitimate. The uniqueness that
        # matters — one KitchenOwl account per Spiso address — is enforced when
        # the link is made, where a clash can be explained.
        batch_op.create_index(batch_op.f("ix_spiso_link_spiso_email"), ["spiso_email"])


def downgrade():
    with op.batch_alter_table("spiso_link", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_spiso_link_spiso_email"))
        batch_op.drop_index(batch_op.f("ix_spiso_link_spiso_user_id"))
        batch_op.drop_column("spiso_email")
        batch_op.drop_column("spiso_user_id")
