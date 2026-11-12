from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, MetaData, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class PublicBase(DeclarativeBase):
    """Strictly READ-ONLY ORM mapping for upstream Plaid-synced public.* tables."""

    metadata = MetaData(schema="public")


class SyncRun(PublicBase):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    batch: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False)
    txn_date_from: Mapped[date | None] = mapped_column(Date)
    txn_date_to: Mapped[date | None] = mapped_column(Date)
    counts: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)


class Connection(PublicBase):
    __tablename__ = "connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    provider: Mapped[str | None] = mapped_column(Text)
    provider_connection_id: Mapped[str | None] = mapped_column(Text)
    institution_id: Mapped[str | None] = mapped_column(Text)
    institution_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_run: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("public.sync_runs.id"))
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Account(PublicBase):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.connections.id")
    )
    class_: Mapped[str | None] = mapped_column("class", Text)
    type: Mapped[str | None] = mapped_column(Text)
    subtype: Mapped[str | None] = mapped_column(Text)
    liability_kind: Mapped[str | None] = mapped_column(Text)
    mask: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    official_name: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    current_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    available_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    last_seen_run: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("public.sync_runs.id"))
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class BalanceSnapshot(PublicBase):
    __tablename__ = "balance_snapshots"

    run_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("public.sync_runs.id"), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.accounts.id"), primary_key=True
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    available_balance: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    currency: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class LiabilityDetail(PublicBase):
    __tablename__ = "liability_details"

    run_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("public.sync_runs.id"), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.accounts.id"), primary_key=True
    )
    liability_kind: Mapped[str | None] = mapped_column(Text)
    interest_rate_pct: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    minimum_payment_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    next_payment_due_date: Mapped[date | None] = mapped_column(Date)
    is_overdue: Mapped[bool | None] = mapped_column(Boolean)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Transaction(PublicBase):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.accounts.id"), nullable=False
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    direction: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    merchant_name: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    pending: Mapped[bool] = mapped_column(Boolean, nullable=False)
    category_primary: Mapped[str | None] = mapped_column(Text)
    category_detailed: Mapped[str | None] = mapped_column(Text)
    category: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB)
    first_seen_run: Mapped[int | None] = mapped_column(BigInteger)
    last_seen_run: Mapped[int | None] = mapped_column(BigInteger)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Security(PublicBase):
    __tablename__ = "securities"

    security_key: Mapped[str] = mapped_column(Text, primary_key=True)
    ticker_symbol: Mapped[str | None] = mapped_column(Text)
    security_name: Mapped[str | None] = mapped_column(Text)
    security_type: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class HoldingSnapshot(PublicBase):
    __tablename__ = "holdings_snapshots"

    snapshot_date: Mapped[date] = mapped_column(Date, primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.accounts.id"), primary_key=True
    )
    security_key: Mapped[str] = mapped_column(
        Text, ForeignKey("public.securities.security_key"), primary_key=True
    )
    holding_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(24, 10))
    cost_basis: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    institution_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    institution_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    currency: Mapped[str | None] = mapped_column(Text)
    run_id: Mapped[int | None] = mapped_column(BigInteger)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class InvestmentTransaction(PublicBase):
    __tablename__ = "investment_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public.accounts.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[str | None] = mapped_column(Text)
    security_key: Mapped[str | None] = mapped_column(Text)
    ticker_symbol: Mapped[str | None] = mapped_column(Text)
    security_name: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    direction: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(24, 10))
    fees: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    currency: Mapped[str | None] = mapped_column(Text)
    first_seen_run: Mapped[int | None] = mapped_column(BigInteger)
    last_seen_run: Mapped[int | None] = mapped_column(BigInteger)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
