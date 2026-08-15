"""Spiso (Foodminder) inventory link, one row per user

Revision ID: a1c3f5spiso1
Revises: 0b10d67750be
Create Date: 2026-08-15

"""

from alembic import op
import sqlalchemy as sa


revision = "a1c3f5spiso1"
down_revision = "0b10d67750be"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "spiso_link",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("base_url", sa.String(), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("home_id", sa.String(), nullable=True),
        sa.Column("home_name", sa.String(), nullable=True),
        sa.Column("invalid_since", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        # One link per person. The unique constraint is what makes "connect
        # again" an update rather than a second row holding a stale token.
        sa.UniqueConstraint("user_id"),
    )
    with op.batch_alter_table("spiso_link", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_spiso_link_user_id"), ["user_id"], unique=True)


def downgrade():
    with op.batch_alter_table("spiso_link", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_spiso_link_user_id"))
    op.drop_table("spiso_link")
