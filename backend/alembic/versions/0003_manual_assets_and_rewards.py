"""Add manual_assets and reward_programs tables

Revision ID: 0003_manual_assets_and_rewards
Revises: 0002_add_card_art_fields
Create Date: 2026-11-11 12:23:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_manual_assets_and_rewards"
down_revision: Union[str, None] = "0002_add_card_art_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "card_profiles",
        sa.Column("points_program_code", sa.Text(), nullable=True),
        schema="app",
    )

    op.create_table(
        "manual_assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("asset_type", sa.Text(), nullable=False, server_default="other"),
        sa.Column("symbol", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False, server_default="1"),
        sa.Column("unit", sa.Text(), nullable=False, server_default="unit"),
        sa.Column("cost_basis_total", sa.Numeric(18, 2), nullable=True),
        sa.Column("manual_unit_price", sa.Numeric(18, 4), nullable=True),
        sa.Column("include_in_net_worth", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "reward_programs",
        sa.Column("program_code", sa.Text(), primary_key=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("issuer_group", sa.Text(), nullable=False),
        sa.Column("confirmed_points", sa.Numeric(18, 2), nullable=True),
        sa.Column("cpp_valuation", sa.Numeric(8, 3), nullable=False, server_default="1.0"),
        sa.Column("color", sa.Text(), nullable=False, server_default="#38bdf8"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    # Seed common credit card reward ecosystems (balances editable in UI)
    op.execute(
        """
        INSERT INTO app.reward_programs (program_code, display_name, issuer_group, confirmed_points, cpp_valuation, color, notes)
        VALUES
          ('chase_ur', 'Chase Ultimate Rewards (UR)', 'Chase', NULL, 2.05, '#2563eb', 'CSR / CSP / Freedom 积分池 · 酒店/航司转点参考估值 ~2.05¢'),
          ('amex_mr', 'Amex Membership Rewards (MR)', 'American Express', NULL, 2.00, '#38bdf8', 'Membership Rewards 积分池 · 航司转点参考估值 ~2.0¢'),
          ('bilt_points', 'Bilt Rewards Points', 'Bilt Rewards', NULL, 2.10, '#a855f7', 'Bilt 积分池 · 凯悦/航司转点参考估值 ~2.1¢'),
          ('atmos_miles', 'Atmos™ / Alaska Miles', 'Bank of America', NULL, 1.50, '#14b8a6', 'Atmos Rewards / 寰宇一家里程参考估值 ~1.5¢'),
          ('hilton_honors', 'Hilton Honors Points', 'American Express', NULL, 0.50, '#6366f1', 'Hilton Honors 联名卡酒店积分参考估值 ~0.5¢'),
          ('chase_prime_cash', 'Amazon Prime Rewards', 'Chase', NULL, 1.00, '#f59e0b', 'Prime Visa 返现积分 (1 pt = 1¢)'),
          ('amex_cash', 'Amex Reward Dollars', 'American Express', NULL, 1.00, '#06b6d4', 'Blue Cash 返现美元'),
          ('boa_points', 'BoA Travel Rewards Points', 'Bank of America', NULL, 1.00, '#ef4444', 'Travel Rewards 旅行账单抵扣积分')
        ON CONFLICT (program_code) DO NOTHING;
        """
    )

    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA app TO finance_ai_ro;")


def downgrade() -> None:
    op.drop_table("reward_programs", schema="app")
    op.drop_table("manual_assets", schema="app")
    op.drop_column("card_profiles", "points_program_code", schema="app")
