"""Add card_skin and card_image_url to app.card_profiles

Revision ID: 0002_add_card_art_fields
Revises: 0001_init_app_schema
Create Date: 2026-11-11 12:15:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_card_art_fields"
down_revision: Union[str, None] = "0001_init_app_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("card_profiles", sa.Column("card_skin", sa.Text(), nullable=True), schema="app")
    op.add_column("card_profiles", sa.Column("card_image_url", sa.Text(), nullable=True), schema="app")


def downgrade() -> None:
    op.drop_column("card_profiles", "card_image_url", schema="app")
    op.drop_column("card_profiles", "card_skin", schema="app")
