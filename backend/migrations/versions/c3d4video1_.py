"""Recipe videos, links the cook found worth keeping

Revision ID: c3d4video1
Revises: b2d4subst01
Create Date: 2026-08-16

"""

from alembic import op
import sqlalchemy as sa


revision = "c3d4video1"
down_revision = "b2d4subst01"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("recipe", schema=None) as batch_op:
        # Nullable: every existing recipe predates this, and "no videos" is
        # the honest reading of one nobody has annotated yet.
        batch_op.add_column(sa.Column("videos", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("recipe", schema=None) as batch_op:
        batch_op.drop_column("videos")
