from __future__ import annotations

import re
import uuid
from decimal import Decimal
from typing import Any

from fastmcp import FastMCP
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.models.app_models import MerchantRule, TransactionOverride
from app.services.finance_service import (
    get_budget_dashboard,
    get_credit_cards_dashboard,
    get_investments_dashboard,
    get_overview_dashboard,
    query_transactions,
)

mcp = FastMCP(
    name="Personal Finance MCP",
    instructions=(
        "Read-only access to public.* Plaid-synced financial ledger and read-write access "
        "to app.* user budgets, credit card profiles, and transaction overrides in PostgreSQL."
    ),
)


@mcp.tool()
async def get_financial_overview(force_refresh_quotes: bool = False) -> dict[str, Any]:
    """Get real-time net worth (including live equities, precious metals, and crypto assets), asset allocation, sync health, credit card & rewards pulse, and current month budget summary."""
    async with AsyncSessionLocal() as db:
        return await get_overview_dashboard(db, force_refresh=force_refresh_quotes)


@mcp.tool()
async def get_credit_cards_status() -> dict[str, Any]:
    """Get all credit cards grouped by bank with balances, credit limits, utilization %, due dates, APR, liquid cash coverage, and points/miles reward programs."""
    async with AsyncSessionLocal() as db:
        return await get_credit_cards_dashboard(db)


@mcp.tool()
async def get_monthly_budget(year_month: str | None = None) -> dict[str, Any]:
    """Get monthly budget progress, burn-rate pacing vs calendar progress, 6-month cashflow trend, and recurring subscriptions. year_month format: YYYY-MM."""
    async with AsyncSessionLocal() as db:
        return await get_budget_dashboard(db, year_month=year_month)


@mcp.tool()
async def search_transactions(
    year_month: str | None = None,
    search: str | None = None,
    category_slug: str | None = None,
    institution: str | None = None,
    tx_kind: str = "all",
    pending_only: bool = False,
    limit: int = 50,
) -> dict[str, Any]:
    """Search and filter bank and credit card transactions. tx_kind can be all, expense, income, transfer, or loan_payment."""
    async with AsyncSessionLocal() as db:
        return await query_transactions(
            db,
            year_month=year_month,
            search=search,
            category_slug=category_slug,
            institution=institution,
            tx_kind=tx_kind,
            pending_only=pending_only,
            limit=min(max(limit, 1), 250),
        )


@mcp.tool()
async def get_investment_portfolio(force_refresh_quotes: bool = False) -> dict[str, Any]:
    """Get brokerage investment accounts, live market quotes, manual alternative assets (precious metals & crypto), tax bucket allocation, consolidated holdings, and recent trades."""
    async with AsyncSessionLocal() as db:
        return await get_investments_dashboard(db, force_refresh=force_refresh_quotes)


@mcp.tool()
async def categorize_transaction(
    transaction_id: str,
    category_slug: str | None = None,
    custom_merchant: str | None = None,
    tx_kind: str | None = None,
    notes: str | None = None,
    create_permanent_rule_for_pattern: str | None = None,
) -> dict[str, Any]:
    """Override a transaction's category/merchant/notes safely in app.transaction_overrides without modifying public.transactions."""
    tx_uuid = uuid.UUID(transaction_id)
    async with AsyncSessionLocal() as db:
        ov = await db.get(TransactionOverride, tx_uuid)
        if ov is None:
            ov = TransactionOverride(transaction_id=tx_uuid, updated_by="mcp")
            db.add(ov)
        if category_slug is not None:
            ov.category_slug = category_slug
        if custom_merchant is not None:
            ov.custom_merchant = custom_merchant
        if tx_kind is not None:
            ov.tx_kind = tx_kind
        if notes is not None:
            ov.notes = notes
        ov.is_reviewed = True
        ov.updated_by = "mcp"

        created_rule_id: int | None = None
        if create_permanent_rule_for_pattern and create_permanent_rule_for_pattern.strip():
            rule = MerchantRule(
                match_pattern=create_permanent_rule_for_pattern.strip(),
                match_type="contains",
                target_merchant=custom_merchant,
                target_category_slug=category_slug,
                target_tx_kind=tx_kind,
                priority=50,
                is_active=True,
            )
            db.add(rule)
            await db.flush()
            created_rule_id = rule.id

        await db.commit()
        return {
            "ok": True,
            "transaction_id": transaction_id,
            "created_rule_id": created_rule_id,
        }


_FORBIDDEN_SQL_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|SET|RESET)\b",
    re.IGNORECASE,
)


@mcp.tool()
async def execute_readonly_sql(sql: str, max_rows: int = 100) -> dict[str, Any]:
    """Execute a strictly read-only SELECT/WITH SQL query against public.* and app.* tables using the read-only finance_ai_ro role."""
    cleaned = sql.strip().rstrip(";").strip()
    if not cleaned or ";" in cleaned:
        raise ValueError("Only a single read-only SELECT or WITH statement is allowed.")
    if not re.match(r"^(SELECT|WITH)\b", cleaned, re.IGNORECASE):
        raise ValueError("Only SELECT or WITH read-only queries are allowed.")
    if _FORBIDDEN_SQL_RE.search(cleaned):
        raise ValueError("Mutating or administrative SQL keywords are prohibited.")

    bounded_limit = min(max(max_rows, 1), 500)
    async with AsyncSessionLocal() as db:
        async with db.begin():
            await db.execute(text("SET LOCAL TRANSACTION READ ONLY"))
            await db.execute(text("SET LOCAL ROLE finance_ai_ro"))
            await db.execute(text("SET LOCAL statement_timeout = '5000'"))
            result = await db.execute(text(cleaned))
            cols = list(result.keys())
            raw_rows = result.fetchmany(bounded_limit)
            rows = [
                {
                    col: (float(val) if isinstance(val, Decimal) else (str(val) if isinstance(val, uuid.UUID) else val))
                    for col, val in zip(cols, row)
                }
                for row in raw_rows
            ]
            return {
                "columns": cols,
                "row_count": len(rows),
                "rows": rows,
            }
