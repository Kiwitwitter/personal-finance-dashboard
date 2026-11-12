from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.app_models import (
    AccountPreference,
    AppSetting,
    Budget,
    BudgetMonthOverride,
    CardProfile,
    Category,
    ManualAsset,
    MerchantRule,
    RewardProgram,
    TransactionOverride,
)
from app.services.ai_service import ask_financial_copilot, get_ai_status
from app.services.finance_service import (
    get_accounts_enriched,
    get_budget_dashboard,
    get_credit_cards_dashboard,
    get_investments_dashboard,
    get_overview_dashboard,
    query_transactions,
)

router = APIRouter(prefix="/api")


class AccountPrefPatch(BaseModel):
    display_name: str | None = None
    is_hidden: bool | None = None
    include_in_net_worth: bool | None = None
    notes: str | None = None


class CardProfilePatch(BaseModel):
    display_name: str | None = None
    is_charge_card: bool | None = None
    credit_limit_override: float | None = None
    clear_limit_override: bool = False
    statement_closing_day: int | None = Field(default=None, ge=1, le=31)
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    apr_override: float | None = Field(default=None, ge=0, le=99)
    minimum_payment_override: float | None = Field(default=None, ge=0)
    annual_fee: float | None = Field(default=None, ge=0)
    annual_fee_month: int | None = Field(default=None, ge=1, le=12)
    autopay_enabled: bool | None = None
    card_skin: str | None = None
    card_image_url: str | None = None
    points_program_code: str | None = None
    reward_notes: str | None = None


class BudgetUpsertPayload(BaseModel):
    monthly_limit: float = Field(ge=0)
    rollover_enabled: bool = False
    alert_threshold_pct: int = Field(default=80, ge=10, le=100)
    year_month: str | None = None
    month_only_override: bool = False


class BudgetConfigPatch(BaseModel):
    include_fixed_loans: bool


class TransactionPatchPayload(BaseModel):
    custom_merchant: str | None = None
    category_slug: str | None = None
    tx_kind: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    is_reviewed: bool | None = None
    create_rule: bool = False
    rule_pattern: str | None = None


class MerchantRuleCreate(BaseModel):
    match_pattern: str
    match_type: str = "contains"
    target_merchant: str | None = None
    target_category_slug: str | None = None
    target_tx_kind: str | None = None
    priority: int = 100


class AiQuestionPayload(BaseModel):
    question: str
    year_month: str | None = None


class RewardProgramPatch(BaseModel):
    confirmed_points: float | None = None
    clear_confirmed_points: bool = False
    cpp_valuation: float | None = Field(default=None, ge=0.05, le=20.0)
    notes: str | None = None


class ManualAssetPayload(BaseModel):
    name: str
    asset_type: str = "other"
    symbol: str | None = None
    quantity: float = Field(ge=0)
    unit: str = "unit"
    cost_basis_total: float | None = None
    manual_unit_price: float | None = None
    include_in_net_worth: bool = True
    notes: str | None = None


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    row = (
        await db.execute(
            text(
                "SELECT current_database(), current_setting('TIMEZONE'), "
                "(SELECT count(*) FROM public.accounts) AS accounts_cnt"
            )
        )
    ).one()
    settings = get_settings()
    return {
        "status": "ok",
        "database": row[0],
        "db_timezone": row[1],
        "app_timezone": settings.app_timezone,
        "accounts_count": row[2],
        "gemini_enabled": settings.gemini_enabled,
    }


@router.get("/overview")
async def api_overview(
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await get_overview_dashboard(db, force_refresh=refresh)


@router.get("/accounts")
async def api_accounts(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return await get_accounts_enriched(db)


@router.patch("/accounts/{account_id}")
async def api_patch_account(
    account_id: uuid.UUID,
    payload: AccountPrefPatch,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pref = await db.get(AccountPreference, account_id)
    if pref is None:
        pref = AccountPreference(account_id=account_id)
        db.add(pref)

    if payload.display_name is not None:
        pref.display_name = payload.display_name.strip() or None
    if payload.is_hidden is not None:
        pref.is_hidden = payload.is_hidden
    if payload.include_in_net_worth is not None:
        pref.include_in_net_worth = payload.include_in_net_worth
    if payload.notes is not None:
        pref.notes = payload.notes.strip() or None

    await db.commit()
    return {"ok": True, "account_id": str(account_id)}


@router.get("/credit-cards")
async def api_credit_cards(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await get_credit_cards_dashboard(db)


@router.patch("/credit-cards/{account_id}")
async def api_patch_credit_card(
    account_id: uuid.UUID,
    payload: CardProfilePatch,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if payload.display_name is not None:
        pref = await db.get(AccountPreference, account_id)
        if pref is None:
            pref = AccountPreference(account_id=account_id)
            db.add(pref)
        pref.display_name = payload.display_name.strip() or None

    profile = await db.get(CardProfile, account_id)
    if profile is None:
        profile = CardProfile(account_id=account_id)
        db.add(profile)

    if payload.is_charge_card is not None:
        profile.is_charge_card = payload.is_charge_card
    if payload.clear_limit_override:
        profile.credit_limit_override = None
    elif payload.credit_limit_override is not None:
        profile.credit_limit_override = (
            Decimal(str(payload.credit_limit_override))
            if payload.credit_limit_override > 0
            else None
        )
    if payload.statement_closing_day is not None:
        profile.statement_closing_day = payload.statement_closing_day
    if payload.payment_due_day is not None:
        profile.payment_due_day = payload.payment_due_day
    if payload.apr_override is not None:
        profile.apr_override = Decimal(str(payload.apr_override))
    if payload.minimum_payment_override is not None:
        profile.minimum_payment_override = Decimal(str(payload.minimum_payment_override))
    if payload.annual_fee is not None:
        profile.annual_fee = Decimal(str(payload.annual_fee))
    if payload.annual_fee_month is not None:
        profile.annual_fee_month = payload.annual_fee_month
    if payload.autopay_enabled is not None:
        profile.autopay_enabled = payload.autopay_enabled
    if payload.card_skin is not None:
        skin_val = payload.card_skin.strip()
        profile.card_skin = None if skin_val in ("", "auto") else skin_val
    if payload.card_image_url is not None:
        profile.card_image_url = payload.card_image_url.strip() or None
    if payload.points_program_code is not None:
        p_code = payload.points_program_code.strip()
        profile.points_program_code = None if p_code in ("", "auto") else p_code
    if payload.reward_notes is not None:
        profile.reward_notes = payload.reward_notes.strip() or None

    await db.commit()
    return await get_credit_cards_dashboard(db)


@router.get("/categories")
async def api_categories(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    cats = (
        await db.execute(select(Category).order_by(Category.sort_order.asc()))
    ).scalars().all()
    return [
        {
            "slug": c.slug,
            "name_zh": c.name_zh,
            "name_en": c.name_en,
            "group_name": c.group_name,
            "color": c.color,
            "icon": c.icon,
            "is_income": c.is_income,
            "is_transfer": c.is_transfer,
        }
        for c in cats
    ]


@router.get("/budgets")
async def api_budgets(
    year_month: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await get_budget_dashboard(db, year_month=year_month)


@router.put("/budgets/settings/config")
async def api_update_budget_config(
    payload: BudgetConfigPatch,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    setting = await db.get(AppSetting, "budget_config")
    if setting is None:
        setting = AppSetting(
            key="budget_config",
            value_json={"include_fixed_loans": payload.include_fixed_loans},
        )
        db.add(setting)
    else:
        updated = dict(setting.value_json or {})
        updated["include_fixed_loans"] = payload.include_fixed_loans
        setting.value_json = updated
    await db.commit()
    return await get_budget_dashboard(db)


@router.put("/budgets/{category_slug}")
async def api_upsert_budget(
    category_slug: str,
    payload: BudgetUpsertPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    cat = await db.get(Category, category_slug)
    if cat is None:
        raise HTTPException(status_code=404, detail=f"Unknown category: {category_slug}")

    if payload.month_only_override and payload.year_month:
        mo = await db.get(BudgetMonthOverride, (payload.year_month, category_slug))
        if mo is None:
            mo = BudgetMonthOverride(
                year_month=payload.year_month,
                category_slug=category_slug,
                limit_override=Decimal(str(payload.monthly_limit)),
            )
            db.add(mo)
        else:
            mo.limit_override = Decimal(str(payload.monthly_limit))
    else:
        b = await db.get(Budget, category_slug)
        if b is None:
            b = Budget(
                category_slug=category_slug,
                monthly_limit=Decimal(str(payload.monthly_limit)),
                rollover_enabled=payload.rollover_enabled,
                alert_threshold_pct=payload.alert_threshold_pct,
                is_active=True,
            )
            db.add(b)
        else:
            b.monthly_limit = Decimal(str(payload.monthly_limit))
            b.rollover_enabled = payload.rollover_enabled
            b.alert_threshold_pct = payload.alert_threshold_pct
            b.is_active = True

    await db.commit()
    return await get_budget_dashboard(db, year_month=payload.year_month)


@router.get("/transactions")
async def api_transactions(
    year_month: str | None = Query(default=None),
    account_id: str | None = Query(default=None),
    institution: str | None = Query(default=None),
    category_slug: str | None = Query(default=None),
    tx_kind: str = Query(default="all"),
    pending_only: bool = Query(default=False),
    unreviewed_only: bool = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await query_transactions(
        db,
        year_month=year_month,
        account_id=account_id,
        institution=institution,
        category_slug=category_slug,
        tx_kind=tx_kind,
        pending_only=pending_only,
        unreviewed_only=unreviewed_only,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.patch("/transactions/{transaction_id}")
async def api_patch_transaction(
    transaction_id: uuid.UUID,
    payload: TransactionPatchPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    ov = await db.get(TransactionOverride, transaction_id)
    if ov is None:
        ov = TransactionOverride(transaction_id=transaction_id, updated_by="user")
        db.add(ov)

    if payload.custom_merchant is not None:
        ov.custom_merchant = payload.custom_merchant.strip() or None
    if payload.category_slug is not None:
        ov.category_slug = payload.category_slug or None
    if payload.tx_kind is not None:
        ov.tx_kind = payload.tx_kind or None
    if payload.notes is not None:
        ov.notes = payload.notes.strip() or None
    if payload.tags is not None:
        ov.tags = [t.strip() for t in payload.tags if t.strip()]
    if payload.is_reviewed is not None:
        ov.is_reviewed = payload.is_reviewed
    else:
        ov.is_reviewed = True

    created_rule_id: int | None = None
    if payload.create_rule and payload.rule_pattern and payload.rule_pattern.strip():
        rule = MerchantRule(
            match_pattern=payload.rule_pattern.strip(),
            match_type="contains",
            target_merchant=ov.custom_merchant,
            target_category_slug=ov.category_slug,
            target_tx_kind=ov.tx_kind,
            priority=50,
            is_active=True,
        )
        db.add(rule)
        await db.flush()
        created_rule_id = rule.id

    await db.commit()
    return {
        "ok": True,
        "transaction_id": str(transaction_id),
        "created_rule_id": created_rule_id,
    }


@router.get("/rules")
async def api_list_rules(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(MerchantRule).order_by(MerchantRule.priority.asc(), MerchantRule.id.desc())
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "match_pattern": r.match_pattern,
            "match_type": r.match_type,
            "target_merchant": r.target_merchant,
            "target_category_slug": r.target_category_slug,
            "target_tx_kind": r.target_tx_kind,
            "priority": r.priority,
            "is_active": r.is_active,
        }
        for r in rows
    ]


@router.post("/rules")
async def api_create_rule(
    payload: MerchantRuleCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rule = MerchantRule(
        match_pattern=payload.match_pattern.strip(),
        match_type=payload.match_type,
        target_merchant=payload.target_merchant.strip() if payload.target_merchant else None,
        target_category_slug=payload.target_category_slug,
        target_tx_kind=payload.target_tx_kind,
        priority=payload.priority,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"ok": True, "id": rule.id}


@router.delete("/rules/{rule_id}")
async def api_delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rule = await db.get(MerchantRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"ok": True}


@router.get("/investments")
async def api_investments(
    refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await get_investments_dashboard(db, force_refresh=refresh)


@router.patch("/reward-programs/{program_code}")
async def api_patch_reward_program(
    program_code: str,
    payload: RewardProgramPatch,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rp = await db.get(RewardProgram, program_code)
    if rp is None:
        raise HTTPException(status_code=404, detail="Reward program not found")
    if payload.clear_confirmed_points:
        rp.confirmed_points = None
    elif payload.confirmed_points is not None:
        rp.confirmed_points = Decimal(str(max(payload.confirmed_points, 0.0)))
    if payload.cpp_valuation is not None:
        rp.cpp_valuation = Decimal(str(payload.cpp_valuation))
    if payload.notes is not None:
        rp.notes = payload.notes.strip() or None
    await db.commit()
    return await get_credit_cards_dashboard(db)


@router.post("/manual-assets")
async def api_create_manual_asset(
    payload: ManualAssetPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    item = ManualAsset(
        name=payload.name.strip(),
        asset_type=payload.asset_type.strip() or "other",
        symbol=payload.symbol.strip().upper() if payload.symbol and payload.symbol.strip() else None,
        quantity=Decimal(str(payload.quantity)),
        unit=payload.unit.strip() or "unit",
        cost_basis_total=Decimal(str(payload.cost_basis_total)) if payload.cost_basis_total is not None else None,
        manual_unit_price=Decimal(str(payload.manual_unit_price)) if payload.manual_unit_price is not None else None,
        include_in_net_worth=payload.include_in_net_worth,
        notes=payload.notes.strip() if payload.notes and payload.notes.strip() else None,
    )
    db.add(item)
    await db.commit()
    return await get_investments_dashboard(db, force_refresh=True)


@router.patch("/manual-assets/{asset_id}")
async def api_update_manual_asset(
    asset_id: int,
    payload: ManualAssetPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    item = await db.get(ManualAsset, asset_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Manual asset not found")
    item.name = payload.name.strip()
    item.asset_type = payload.asset_type.strip() or "other"
    item.symbol = payload.symbol.strip().upper() if payload.symbol and payload.symbol.strip() else None
    item.quantity = Decimal(str(payload.quantity))
    item.unit = payload.unit.strip() or "unit"
    item.cost_basis_total = (
        Decimal(str(payload.cost_basis_total)) if payload.cost_basis_total is not None else None
    )
    item.manual_unit_price = (
        Decimal(str(payload.manual_unit_price)) if payload.manual_unit_price is not None else None
    )
    item.include_in_net_worth = payload.include_in_net_worth
    item.notes = payload.notes.strip() if payload.notes and payload.notes.strip() else None
    await db.commit()
    return await get_investments_dashboard(db, force_refresh=True)


@router.delete("/manual-assets/{asset_id}")
async def api_delete_manual_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    item = await db.get(ManualAsset, asset_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Manual asset not found")
    await db.delete(item)
    await db.commit()
    return await get_investments_dashboard(db, force_refresh=False)


@router.get("/ai/status")
async def api_ai_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await get_ai_status(db)


@router.post("/ai/ask")
async def api_ai_ask(
    payload: AiQuestionPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await ask_financial_copilot(db, payload.question, year_month=payload.year_month)
