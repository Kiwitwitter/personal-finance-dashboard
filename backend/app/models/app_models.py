from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class AppBase(DeclarativeBase):
    """Read-Write ORM models owned exclusively by Personal Finance Dashboard in schema `app`."""

    metadata = MetaData(schema="app")


class AccountPreference(AppBase):
    __tablename__ = "account_preferences"

    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(Text)
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    custom_color: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CardProfile(AppBase):
    __tablename__ = "card_profiles"

    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    is_charge_card: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    credit_limit_override: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    statement_closing_day: Mapped[int | None] = mapped_column(SmallInteger)
    payment_due_day: Mapped[int | None] = mapped_column(SmallInteger)
    apr_override: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    minimum_payment_override: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    annual_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, server_default="0")
    annual_fee_month: Mapped[int | None] = mapped_column(SmallInteger)
    autopay_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    autopay_source_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    card_skin: Mapped[str | None] = mapped_column(Text)
    card_image_url: Mapped[str | None] = mapped_column(Text)
    points_program_code: Mapped[str | None] = mapped_column(Text)
    reward_notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Category(AppBase):
    __tablename__ = "categories"

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    name_zh: Mapped[str] = mapped_column(Text, nullable=False)
    name_en: Mapped[str] = mapped_column(Text, nullable=False)
    group_name: Mapped[str] = mapped_column(Text, nullable=False, server_default="lifestyle")
    color: Mapped[str] = mapped_column(Text, nullable=False, server_default="#6366f1")
    icon: Mapped[str] = mapped_column(Text, nullable=False, server_default="tag")
    is_income: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class Budget(AppBase):
    __tablename__ = "budgets"

    category_slug: Mapped[str] = mapped_column(
        Text, ForeignKey("app.categories.slug", ondelete="CASCADE"), primary_key=True
    )
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    rollover_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    alert_threshold_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="80")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class BudgetMonthOverride(AppBase):
    __tablename__ = "budget_month_overrides"

    year_month: Mapped[str] = mapped_column(String(7), primary_key=True)
    category_slug: Mapped[str] = mapped_column(
        Text, ForeignKey("app.categories.slug", ondelete="CASCADE"), primary_key=True
    )
    limit_override: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    rollover_adjustment: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, server_default="0"
    )
    notes: Mapped[str | None] = mapped_column(Text)


class TransactionOverride(AppBase):
    __tablename__ = "transaction_overrides"

    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    custom_merchant: Mapped[str | None] = mapped_column(Text)
    category_slug: Mapped[str | None] = mapped_column(Text)
    tx_kind: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    notes: Mapped[str | None] = mapped_column(Text)
    split_items: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_by: Mapped[str] = mapped_column(Text, nullable=False, server_default="user")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class MerchantRule(AppBase):
    __tablename__ = "merchant_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_pattern: Mapped[str] = mapped_column(Text, nullable=False)
    match_type: Mapped[str] = mapped_column(Text, nullable=False, server_default="contains")
    target_merchant: Mapped[str | None] = mapped_column(Text)
    target_category_slug: Mapped[str | None] = mapped_column(Text)
    target_tx_kind: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SubscriptionItem(AppBase):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    category_slug: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="services_subscriptions"
    )
    cadence: Mapped[str] = mapped_column(Text, nullable=False, server_default="monthly")
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    last_charged_date: Mapped[date | None] = mapped_column(Date)
    next_due_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    is_ignored: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class AppSetting(AppBase):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AiDigest(AppBase):
    __tablename__ = "ai_digests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    period_key: Mapped[str] = mapped_column(Text, nullable=False)
    summary_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    highlights_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ManualAsset(AppBase):
    __tablename__ = "manual_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    asset_type: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    symbol: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, server_default="1")
    unit: Mapped[str] = mapped_column(Text, nullable=False, server_default="unit")
    cost_basis_total: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    manual_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RewardProgram(AppBase):
    __tablename__ = "reward_programs"

    program_code: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    issuer_group: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed_points: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    cpp_valuation: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False, server_default="1.0")
    color: Mapped[str] = mapped_column(Text, nullable=False, server_default="#38bdf8")
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
