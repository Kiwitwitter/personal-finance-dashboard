"""Initialize app schema tables and seed categories

Revision ID: 0001_init_app_schema
Revises:
Create Date: 2026-11-11 02:50:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_init_app_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS app")

    op.create_table(
        "account_preferences",
        sa.Column("account_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("include_in_net_worth", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("custom_color", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
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
        "card_profiles",
        sa.Column("account_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("is_charge_card", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("credit_limit_override", sa.Numeric(18, 4), nullable=True),
        sa.Column("statement_closing_day", sa.SmallInteger(), nullable=True),
        sa.Column("payment_due_day", sa.SmallInteger(), nullable=True),
        sa.Column("apr_override", sa.Numeric(9, 4), nullable=True),
        sa.Column("minimum_payment_override", sa.Numeric(18, 4), nullable=True),
        sa.Column("annual_fee", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("annual_fee_month", sa.SmallInteger(), nullable=True),
        sa.Column("autopay_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("autopay_source_account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reward_notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "categories",
        sa.Column("slug", sa.Text(), primary_key=True),
        sa.Column("name_zh", sa.Text(), nullable=False),
        sa.Column("name_en", sa.Text(), nullable=False),
        sa.Column("group_name", sa.Text(), nullable=False, server_default="lifestyle"),
        sa.Column("color", sa.Text(), nullable=False, server_default="#6366f1"),
        sa.Column("icon", sa.Text(), nullable=False, server_default="tag"),
        sa.Column("is_income", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_transfer", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        schema="app",
    )

    op.create_table(
        "budgets",
        sa.Column(
            "category_slug",
            sa.Text(),
            sa.ForeignKey("app.categories.slug", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("monthly_limit", sa.Numeric(18, 2), nullable=False),
        sa.Column("rollover_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("alert_threshold_pct", sa.SmallInteger(), nullable=False, server_default="80"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "budget_month_overrides",
        sa.Column("year_month", sa.String(7), primary_key=True),
        sa.Column(
            "category_slug",
            sa.Text(),
            sa.ForeignKey("app.categories.slug", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("limit_override", sa.Numeric(18, 2), nullable=True),
        sa.Column("rollover_adjustment", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        schema="app",
    )

    op.create_table(
        "transaction_overrides",
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("custom_merchant", sa.Text(), nullable=True),
        sa.Column("category_slug", sa.Text(), nullable=True),
        sa.Column("tx_kind", sa.Text(), nullable=True),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("split_items", postgresql.JSONB(), nullable=True),
        sa.Column("is_reviewed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("updated_by", sa.Text(), nullable=False, server_default="user"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "merchant_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("match_pattern", sa.Text(), nullable=False),
        sa.Column("match_type", sa.Text(), nullable=False, server_default="contains"),
        sa.Column("target_merchant", sa.Text(), nullable=True),
        sa.Column("target_category_slug", sa.Text(), nullable=True),
        sa.Column("target_tx_kind", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("merchant_key", sa.Text(), unique=True, nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "category_slug",
            sa.Text(),
            nullable=False,
            server_default="services_subscriptions",
        ),
        sa.Column("cadence", sa.Text(), nullable=False, server_default="monthly"),
        sa.Column("expected_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("last_charged_date", sa.Date(), nullable=True),
        sa.Column("next_due_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_ignored", sa.Boolean(), nullable=False, server_default="false"),
        schema="app",
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value_json", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    op.create_table(
        "ai_digests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("period_key", sa.Text(), nullable=False),
        sa.Column("summary_markdown", sa.Text(), nullable=False),
        sa.Column("highlights_json", postgresql.JSONB(), nullable=True),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="app",
    )

    # Seed unified budget categories aligned with Plaid PFC primary categories
    op.execute(
        """
        INSERT INTO app.categories (slug, name_zh, name_en, group_name, color, icon, is_income, is_transfer, sort_order)
        VALUES
          ('food_dining', '餐饮美食', 'Food & Dining', 'lifestyle', '#f97316', 'utensils', false, false, 10),
          ('shopping', '日常购物', 'Shopping & Merchandise', 'lifestyle', '#ec4899', 'shopping-bag', false, false, 20),
          ('housing_utilities', '居住与账单', 'Rent & Utilities', 'essential', '#0ea5e9', 'home', false, false, 30),
          ('transportation', '交通出行', 'Transportation', 'essential', '#14b8a6', 'car', false, false, 40),
          ('services_subscriptions', '服务与订阅', 'Services & Subscriptions', 'essential', '#8b5cf6', 'repeat', false, false, 50),
          ('entertainment', '休闲娱乐', 'Entertainment', 'lifestyle', '#eab308', 'film', false, false, 60),
          ('travel', '差旅度假', 'Travel', 'lifestyle', '#06b6d4', 'plane', false, false, 70),
          ('medical', '医疗健康', 'Medical & Health', 'essential', '#10b981', 'heart-pulse', false, false, 80),
          ('personal_care', '个人护理', 'Personal Care', 'lifestyle', '#f43f5e', 'sparkles', false, false, 90),
          ('fixed_loans', '房贷与车贷', 'Mortgage & Auto Loans', 'financial', '#6366f1', 'landmark', false, false, 100),
          ('fees_interest', '手续费与年费', 'Bank Fees & Interest', 'financial', '#ef4444', 'alert-circle', false, false, 110),
          ('other_expense', '其他支出', 'Other Expenses', 'lifestyle', '#64748b', 'more-horizontal', false, false, 120),
          ('income', '工资与收入', 'Income & Refunds', 'income', '#22c55e', 'trending-up', true, false, 200),
          ('cc_payment', '信用卡还款', 'Credit Card Payment', 'transfer', '#94a3b8', 'credit-card', false, true, 300),
          ('internal_transfer', '内部转账', 'Internal Transfer', 'transfer', '#94a3b8', 'arrow-left-right', false, true, 310)
        ON CONFLICT (slug) DO NOTHING;
        """
    )

    # Seed starter monthly budgets (fully editable in UI)
    op.execute(
        """
        INSERT INTO app.budgets (category_slug, monthly_limit, rollover_enabled, alert_threshold_pct, is_active)
        VALUES
          ('food_dining', 1200.00, false, 80, true),
          ('shopping', 800.00, false, 80, true),
          ('housing_utilities', 2500.00, false, 90, true),
          ('transportation', 400.00, false, 80, true),
          ('services_subscriptions', 350.00, false, 85, true),
          ('entertainment', 300.00, false, 80, true),
          ('travel', 600.00, true, 85, true),
          ('medical', 250.00, true, 85, true),
          ('personal_care', 200.00, false, 80, true)
        ON CONFLICT (category_slug) DO NOTHING;
        """
    )

    # Pre-mark Amex Platinum cards as charge/flexible-limit cards if present in public.accounts
    op.execute(
        """
        INSERT INTO app.card_profiles (account_id, is_charge_card, annual_fee, reward_notes)
        SELECT a.id, true, 695.00, '5x Flights & Prepaid Hotels · Flexible Spend Limit'
        FROM public.accounts a
        WHERE a.class = 'liability'
          AND a.subtype = 'credit card'
          AND a.name ILIKE '%Platinum%'
        ON CONFLICT (account_id) DO NOTHING;
        """
    )

    # Create read-only role for safe AI / MCP inspection
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_ai_ro') THEN
            CREATE ROLE finance_ai_ro NOLOGIN;
          END IF;
          GRANT USAGE ON SCHEMA public, app TO finance_ai_ro;
          GRANT SELECT ON ALL TABLES IN SCHEMA public, app TO finance_ai_ro;
          ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO finance_ai_ro;
        EXCEPTION WHEN insufficient_privilege THEN
          NULL;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("ai_digests", schema="app")
    op.drop_table("settings", schema="app")
    op.drop_table("subscriptions", schema="app")
    op.drop_table("merchant_rules", schema="app")
    op.drop_table("transaction_overrides", schema="app")
    op.drop_table("budget_month_overrides", schema="app")
    op.drop_table("budgets", schema="app")
    op.drop_table("categories", schema="app")
    op.drop_table("card_profiles", schema="app")
    op.drop_table("account_preferences", schema="app")
