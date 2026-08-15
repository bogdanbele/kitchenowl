"""Per-recipe ingredient substitutes, written by the cook

Revision ID: b2d4subst01
Revises: a1c3f5spiso2
Create Date: 2026-08-16

"""

from alembic import op
import sqlalchemy as sa


revision = "b2d4subst01"
down_revision = "a1c3f5spiso2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("recipe_items", schema=None) as batch_op:
        # Nullable: every existing row predates the idea, and "no substitutes"
        # is the honest reading of a recipe nobody has annotated.
        batch_op.add_column(sa.Column("substitutes", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("recipe_items", schema=None) as batch_op:
        batch_op.drop_column("substitutes")
