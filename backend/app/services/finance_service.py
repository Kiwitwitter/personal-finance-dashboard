from __future__ import annotations

import calendar
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
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
    SubscriptionItem,
    TransactionOverride,
)
from app.models.public_models import (
    Account,
    BalanceSnapshot,
    Connection,
    HoldingSnapshot,
    InvestmentTransaction,
    LiabilityDetail,
    Security,
    SyncRun,
    Transaction,
)
from app.services.classification import classify_transaction
from app.services.market_service import LiveQuote, get_live_quotes, normalize_market_symbol

ZERO = Decimal("0")


def to_float(val: Decimal | float | int | None) -> float:
    if val is None:
        return 0.0
    return round(float(val), 2)


def today_la() -> date:
    settings = get_settings()
    return datetime.now(settings.tz).date()


def month_bounds(year_month: str | None = None) -> tuple[str, date, date]:
    today = today_la()
    if not year_month:
        ym = today.strftime("%Y-%m")
    else:
        ym = year_month.strip()
    year, month = map(int, ym.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    return ym, date(year, month, 1), date(year, month, last_day)


def compute_next_day_of_month(day_of_month: int | None, ref: date) -> date | None:
    if not day_of_month or day_of_month < 1 or day_of_month > 31:
        return None
    max_curr = calendar.monthrange(ref.year, ref.month)[1]
    candidate = date(ref.year, ref.month, min(day_of_month, max_curr))
    if candidate >= ref:
        return candidate
    if ref.month == 12:
        ny, nm = ref.year + 1, 1
    else:
        ny, nm = ref.year, ref.month + 1
    max_next = calendar.monthrange(ny, nm)[1]
    return date(ny, nm, min(day_of_month, max_next))


def format_account_label(
    institution: str | None,
    raw_name: str | None,
    mask: str | None,
    pref_name: str | None,
    official_name: str | None = None,
) -> str:
    if pref_name and pref_name.strip():
        return pref_name.strip()
    inst = (institution or "").strip()
    nm = (raw_name or "Account").strip()
    off = (official_name or "").strip()
    generic_names = {"CREDIT CARD", "INDIVIDUAL", "CHECKING", "SAVINGS"}
    if nm.upper() in generic_names and off and off.upper() not in generic_names:
        nm = off
    generic = nm.upper() in generic_names
    inst_prefix_needed = generic or (
        inst.lower() == "chase" and not nm.lower().startswith("chase")
    )
    base = f"{inst} {nm}".strip() if (inst_prefix_needed and inst) else nm
    if mask:
        return f"{base} •••• {mask}"
    return base


def detect_card_skin(
    institution: str | None,
    raw_name: str | None,
    official_name: str | None,
    display_name: str | None,
    perk_hint: str | None = None,
) -> str:
    haystack = " ".join(
        s.lower() for s in (institution, raw_name, official_name, display_name, perk_hint) if s
    )
    inst_l = (institution or "").lower()
    if "american express" in inst_l or "amex" in haystack:
        if "platinum" in haystack:
            return "amex-platinum"
        if "gold" in haystack:
            return "amex-gold"
        if "hilton" in haystack:
            return "amex-hilton"
        if "blue cash" in haystack or "bce" in haystack or "bcp" in haystack:
            return "amex-bce"
        return "amex-classic"
    if "bilt" in inst_l or "bilt" in haystack:
        return "bilt-palladium"
    if "bank of america" in inst_l or "atmos" in haystack:
        if "atmos" in haystack or "alaska" in haystack or "ascent" in haystack:
            return "boa-atmos-ascent"
        if "travel rewards" in haystack:
            return "boa-travel-rewards"
        if "customized cash" in haystack or "cash rewards" in haystack:
            return "boa-customized-cash"
        return "boa-travel-rewards"
    if "chase" in inst_l:
        if "prime" in haystack or "amazon" in haystack:
            return "chase-prime"
        if "sapphire reserve" in haystack or "csr" in haystack:
            return "chase-sapphire-reserve"
        if "sapphire preferred" in haystack or "csp" in haystack:
            return "chase-sapphire-preferred"
        if "ink" in haystack:
            return "chase-ink"
        return "chase-freedom"
    return "generic-slate"


def default_program_for_skin(skin: str) -> tuple[str, str]:
    mapping: dict[str, tuple[str, str]] = {
        "chase-sapphire-reserve": ("chase_ur", "旅行/餐饮 3x · 其他 1x"),
        "chase-sapphire-preferred": ("chase_ur", "餐饮 3x · 旅行 2x · 其他 1x"),
        "chase-freedom": ("chase_ur", "餐饮/药店 3x · 日常 1.5x"),
        "chase-ink": ("chase_ur", "办公/通信 3x · 其他 1x"),
        "chase-prime": ("chase_prime_cash", "Amazon/Whole Foods 5x · 餐饮加油 2x"),
        "amex-platinum": ("amex_mr", "机票/酒店 5x · 其他 1x"),
        "amex-gold": ("amex_mr", "餐饮/超市 4x · 机票 3x"),
        "amex-hilton": ("hilton_honors", "希尔顿 7x · 餐饮超市加油 5x · 其他 3x"),
        "amex-bce": ("amex_cash", "超市/网购/加油 3% · 其他 1%"),
        "bilt-palladium": ("bilt_points", "餐饮 3x · 旅行 2x · 房租/其他 1x"),
        "boa-atmos-ascent": ("atmos_miles", "航司 3x · 加油充电/通勤 2x · 其他 1x"),
        "boa-travel-rewards": ("boa_points", "全品类无脑 1.5x"),
        "boa-customized-cash": ("boa_points", "自选类别 3% · 超市 2%"),
    }
    return mapping.get(skin, ("chase_ur", "日常消费 1x"))


def estimate_tx_points_multiplier(skin: str, primary_cat: str, detailed_cat: str, text_u: str) -> float:
    is_dining = primary_cat == "FOOD_AND_DRINK" and "GROCERIES" not in detailed_cat
    is_grocery = "GROCERIES" in detailed_cat or any(
        k in text_u for k in ("WHOLEFDS", "WHOLE FOODS", "TRADER JOE", "SAFEWAY", "COSTCO", "WEEE", "99 RANCH")
    )
    is_travel = primary_cat == "TRAVEL" or any(
        k in text_u for k in ("AIRLINE", "UNITED", "DELTA", "ALASKA", "HOTEL", "HYATT", "MARRIOTT", "HILTON", "AIRBNB")
    )
    is_transit_gas = primary_cat == "TRANSPORTATION" or any(
        k in text_u for k in ("UBER", "LYFT", "TESLA SUPERCHARGER", "SHELL", "CHEVRON", "AVIS")
    )
    is_amazon = any(k in text_u for k in ("AMAZON", "AMZN", "WHOLEFDS", "WHOLE FOODS"))

    if skin == "chase-sapphire-reserve":
        return 3.0 if (is_dining or is_travel or is_transit_gas) else 1.0
    if skin == "chase-sapphire-preferred":
        if is_dining:
            return 3.0
        if is_travel or is_transit_gas:
            return 2.0
        return 1.0
    if skin == "chase-freedom":
        return 3.0 if is_dining else 1.5
    if skin == "chase-prime":
        if is_amazon:
            return 5.0
        if is_dining or is_transit_gas:
            return 2.0
        return 1.0
    if skin == "amex-platinum":
        return 5.0 if is_travel else 1.0
    if skin == "amex-gold":
        if is_dining or is_grocery:
            return 4.0
        return 3.0 if is_travel else 1.0
    if skin == "amex-hilton":
        if "HILTON" in text_u:
            return 7.0
        if is_dining or is_grocery or is_transit_gas:
            return 5.0
        return 3.0
    if skin == "amex-bce":
        if is_grocery or is_transit_gas or is_amazon:
            return 3.0
        return 1.0
    if skin == "bilt-palladium":
        if is_dining:
            return 3.0
        if is_travel:
            return 2.0
        return 1.0
    if skin == "boa-atmos-ascent":
        if is_travel:
            return 3.0
        if is_transit_gas:
            return 2.0
        return 1.0
    if skin == "boa-travel-rewards":
        return 1.5
    return 1.0


async def get_manual_assets_enriched(
    db: AsyncSession,
    quotes: dict[str, LiveQuote] | None = None,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(select(ManualAsset).order_by(ManualAsset.id.asc()))
    ).scalars().all()
    if not rows:
        return []

    if quotes is None:
        syms = [a.symbol for a in rows if a.symbol]
        quotes = await get_live_quotes(syms, force_refresh=force_refresh) if syms else {}

    items: list[dict[str, Any]] = []
    for asset in rows:
        qty = float(asset.quantity or ZERO)
        sym_norm = normalize_market_symbol(asset.symbol)
        q = quotes.get(asset.symbol or "") or (quotes.get(sym_norm) if sym_norm else None)
        if q is not None:
            unit_price = q.price
            day_change_pct = q.change_pct
            day_change_val = round(qty * q.change, 2) if q.change is not None else 0.0
            sparkline = q.sparkline
            quote_source = q.source
            quote_updated_at = q.updated_at
        else:
            unit_price = float(asset.manual_unit_price or ZERO)
            day_change_pct = None
            day_change_val = 0.0
            sparkline = [round(unit_price, 2)] if unit_price > 0 else []
            quote_source = "manual"
            quote_updated_at = asset.updated_at.isoformat() if asset.updated_at else None

        mkt_val = round(qty * unit_price, 2)
        cost = float(asset.cost_basis_total) if asset.cost_basis_total is not None else None
        gain = round(mkt_val - cost, 2) if (cost is not None and cost > 0) else None
        gain_pct = round(gain / cost * 100.0, 2) if (gain is not None and cost and cost > 0) else None

        items.append(
            {
                "id": asset.id,
                "name": asset.name,
                "asset_type": asset.asset_type,
                "symbol": asset.symbol,
                "quantity": qty,
                "unit": asset.unit,
                "unit_price": round(unit_price, 2),
                "market_value": mkt_val,
                "cost_basis_total": round(cost, 2) if cost is not None else None,
                "manual_unit_price": float(asset.manual_unit_price) if asset.manual_unit_price is not None else None,
                "unrealized_gain": gain,
                "unrealized_gain_pct": gain_pct,
                "day_change_pct": day_change_pct,
                "day_change_value": day_change_val,
                "sparkline": sparkline,
                "quote_source": quote_source,
                "quote_updated_at": quote_updated_at,
                "include_in_net_worth": bool(asset.include_in_net_worth),
                "notes": asset.notes,
            }
        )
    return items


async def load_rules_and_categories(
    db: AsyncSession,
) -> tuple[list[MerchantRule], dict[str, Category]]:
    rules_res = await db.execute(
        select(MerchantRule)
        .where(MerchantRule.is_active.is_(True))
        .order_by(MerchantRule.priority.asc(), MerchantRule.id.asc())
    )
    cats_res = await db.execute(select(Category).order_by(Category.sort_order.asc()))
    rules = list(rules_res.scalars().all())
    cats = {c.slug: c for c in cats_res.scalars().all()}
    return rules, cats


async def get_sync_status(db: AsyncSession) -> dict[str, Any]:
    now = datetime.now(get_settings().tz)
    latest_run = (
        await db.execute(select(SyncRun).order_by(desc(SyncRun.id)).limit(1))
    ).scalar_one_or_none()
    conns = list(
        (await db.execute(select(Connection).order_by(Connection.institution_name.asc())))
        .scalars()
        .all()
    )
    hours_ago: float | None = None
    if latest_run and latest_run.started_at:
        delta = now - latest_run.started_at.astimezone(get_settings().tz)
        hours_ago = round(delta.total_seconds() / 3600.0, 1)

    degraded = [
        {"institution": c.institution_name, "status": c.status}
        for c in conns
        if (c.status or "").lower() != "active"
    ]
    return {
        "latest_run_id": latest_run.id if latest_run else None,
        "batch": latest_run.batch if latest_run else None,
        "status": latest_run.status if latest_run else "unknown",
        "started_at": latest_run.started_at.isoformat() if latest_run and latest_run.started_at else None,
        "txn_date_to": latest_run.txn_date_to.isoformat() if latest_run and latest_run.txn_date_to else None,
        "hours_since_sync": hours_ago,
        "is_stale": bool(hours_ago is not None and hours_ago > 12.0),
        "connections_total": len(conns),
        "connections_active": len(conns) - len(degraded),
        "degraded_connections": degraded,
        "institutions": [
            {
                "id": str(c.id),
                "name": c.institution_name,
                "provider": c.provider,
                "status": c.status,
            }
            for c in conns
        ],
    }


async def get_accounts_enriched(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(Account, Connection.institution_name, AccountPreference)
            .outerjoin(Connection, Connection.id == Account.connection_id)
            .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
            .order_by(
                Account.class_.asc(),
                Connection.institution_name.asc(),
                Account.name.asc(),
            )
        )
    ).all()

    result: list[dict[str, Any]] = []
    for acc, inst_name, pref in rows:
        curr = acc.current_balance or ZERO
        avail = acc.available_balance
        result.append(
            {
                "id": str(acc.id),
                "institution_name": inst_name or "Manual",
                "class": acc.class_ or "other",
                "type": acc.type,
                "subtype": acc.subtype,
                "mask": acc.mask,
                "raw_name": acc.name,
                "official_name": acc.official_name,
                "display_name": format_account_label(
                    inst_name,
                    acc.name,
                    acc.mask,
                    pref.display_name if pref else None,
                    acc.official_name,
                ),
                "custom_display_name": pref.display_name if pref else None,
                "currency": acc.currency or "USD",
                "current_balance": to_float(curr),
                "available_balance": to_float(avail) if avail is not None else None,
                "is_hidden": bool(pref.is_hidden) if pref else False,
                "include_in_net_worth": bool(pref.include_in_net_worth) if pref else True,
                "notes": pref.notes if pref else None,
            }
        )
    return result


async def get_credit_cards_dashboard(db: AsyncSession) -> dict[str, Any]:
    ref_today = today_la()
    ym, m_start, m_end = month_bounds()

    # Latest liability_details per account
    latest_liab_subq = (
        select(
            LiabilityDetail.account_id,
            func.max(LiabilityDetail.run_id).label("max_run"),
        )
        .group_by(LiabilityDetail.account_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(Account, Connection.institution_name, AccountPreference, CardProfile, LiabilityDetail)
            .outerjoin(Connection, Connection.id == Account.connection_id)
            .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
            .outerjoin(CardProfile, CardProfile.account_id == Account.id)
            .outerjoin(latest_liab_subq, latest_liab_subq.c.account_id == Account.id)
            .outerjoin(
                LiabilityDetail,
                (LiabilityDetail.account_id == Account.id)
                & (LiabilityDetail.run_id == latest_liab_subq.c.max_run),
            )
            .where(Account.class_ == "liability", Account.subtype == "credit card")
            .order_by(desc(Account.current_balance))
        )
    ).all()

    card_ids = [acc.id for acc, *_ in rows]

    # Pull card transactions (last 370 days) to compute month spend, payment history, and card product hints
    cutoff = ref_today - timedelta(days=370)
    recent_pay_cutoff = ref_today - timedelta(days=150)
    card_txns = list(
        (
            await db.execute(
                select(Transaction)
                .where(Transaction.account_id.in_(card_ids), Transaction.date >= cutoff)
                .order_by(desc(Transaction.date))
            )
        )
        .scalars()
        .all()
    )

    month_spend_by_card: dict[uuid.UUID, Decimal] = defaultdict(lambda: ZERO)
    tx_count_month_by_card: dict[uuid.UUID, int] = defaultdict(int)
    payment_dates_by_card: dict[uuid.UUID, list[tuple[date, Decimal]]] = defaultdict(list)
    perk_hint_by_card: dict[uuid.UUID, str] = {}
    purchase_txns_by_card: dict[uuid.UUID, list[tuple[date, float, str, str, str]]] = defaultdict(list)

    for tx in card_txns:
        combined_u = " ".join(
            p.upper() for p in (tx.merchant_name, tx.name, tx.description) if p
        )
        if "TRAVEL CREDIT $300/YEAR" in combined_u:
            perk_hint_by_card[tx.account_id] = "Sapphire Reserve"
        elif "ANNUAL MEMBERSHIP FEE" in combined_u and abs(tx.amount + Decimal("95")) < Decimal("0.01"):
            perk_hint_by_card.setdefault(tx.account_id, "Sapphire Preferred")

        primary = (tx.category_primary or "").upper()
        detailed = (tx.category_detailed or "").upper()
        is_payment = tx.amount > 0 and (
            primary in ("LOAN_PAYMENTS", "TRANSFER_IN")
            or any(k in combined_u for k in ("PAYMENT", "AUTOPAY", "THANK YOU", "PYMT", "EPAYMENT"))
        )
        if is_payment and tx.date >= recent_pay_cutoff:
            payment_dates_by_card[tx.account_id].append((tx.date, tx.amount))
        elif not is_payment and tx.amount != 0:
            if m_start <= tx.date <= m_end:
                month_spend_by_card[tx.account_id] += -tx.amount
                if tx.amount < 0:
                    tx_count_month_by_card[tx.account_id] += 1
            if "ANNUAL MEMBERSHIP FEE" not in combined_u and "LATE FEE" not in combined_u:
                purchase_txns_by_card[tx.account_id].append(
                    (tx.date, float(-tx.amount), primary, detailed, combined_u)
                )

    # Liquid cash from depository/cash accounts for cash coverage check
    cash_rows = (
        await db.execute(select(Account).where(Account.class_ == "cash"))
    ).scalars().all()
    liquid_cash = sum(
        (
            (a.available_balance if a.available_balance is not None else (a.current_balance or ZERO))
            for a in cash_rows
            if (a.subtype or "") != "limited purpose checking"
        ),
        ZERO,
    )

    reward_programs_db = {
        rp.program_code: rp
        for rp in (await db.execute(select(RewardProgram))).scalars().all()
    }
    program_month_pts: dict[str, float] = defaultdict(float)
    program_year_pts: dict[str, float] = defaultdict(float)
    program_card_cnt: dict[str, int] = defaultdict(int)

    cards_out: list[dict[str, Any]] = []
    total_balance = ZERO
    revolving_balance_for_util = ZERO
    total_revolving_limit = ZERO
    total_annual_fees = ZERO
    cards_over_30 = 0
    due_within_14d_amount = ZERO
    due_within_14d_count = 0

    for acc, inst_name, pref, profile, liab in rows:
        bal = acc.current_balance or ZERO
        avail = acc.available_balance
        total_balance += bal

        is_charge = bool(profile.is_charge_card) if profile else ("platinum" in (acc.name or "").lower())
        limit_override = profile.credit_limit_override if profile else None

        effective_limit: Decimal | None = None
        if limit_override is not None and limit_override > 0:
            effective_limit = limit_override
            is_charge = False
        elif not is_charge and avail is not None:
            implied = max(bal, ZERO) + max(avail, ZERO)
            if implied > 0:
                effective_limit = implied

        util_pct: float | None = None
        util_status = "charge" if is_charge else "unknown"
        if effective_limit and effective_limit > 0:
            pos_bal = max(bal, ZERO)
            revolving_balance_for_util += pos_bal
            total_revolving_limit += effective_limit
            util_pct = round(float(pos_bal / effective_limit * Decimal("100")), 1)
            if util_pct >= 30.0:
                util_status = "high"
                cards_over_30 += 1
            elif util_pct >= 10.0:
                util_status = "good"
            else:
                util_status = "excellent"

        # Payment history & due date resolution
        payments = payment_dates_by_card.get(acc.id, [])
        last_pay_date = payments[0][0] if payments else None
        last_pay_amt = payments[0][1] if payments else None

        inferred_due_day: int | None = None
        if payments:
            day_counts = Counter(p[0].day for p in payments)
            inferred_due_day = day_counts.most_common(1)[0][0]

        configured_due_day = profile.payment_due_day if profile else None
        effective_due_day = configured_due_day or inferred_due_day
        due_date: date | None = (
            liab.next_payment_due_date
            if (liab and liab.next_payment_due_date and liab.next_payment_due_date >= ref_today)
            else compute_next_day_of_month(effective_due_day, ref_today)
        )
        days_until_due = (due_date - ref_today).days if due_date else None

        if days_until_due is not None and 0 <= days_until_due <= 14 and bal > 0:
            due_within_14d_amount += bal
            due_within_14d_count += 1

        apr = (
            profile.apr_override
            if (profile and profile.apr_override is not None)
            else (liab.interest_rate_pct if liab else None)
        )
        min_pay = (
            profile.minimum_payment_override
            if (profile and profile.minimum_payment_override is not None)
            else (liab.minimum_payment_amount if liab else None)
        )
        annual_fee = profile.annual_fee if profile else ZERO
        total_annual_fees += annual_fee

        perk_hint = perk_hint_by_card.get(acc.id)
        effective_official = acc.official_name
        if (
            (acc.name or "").strip().upper() == "CREDIT CARD"
            and perk_hint
            and not (pref and pref.display_name)
        ):
            effective_official = f"{perk_hint}®"

        resolved_display_name = format_account_label(
            inst_name,
            acc.name,
            acc.mask,
            pref.display_name if pref else None,
            effective_official,
        )
        detected_skin = detect_card_skin(
            inst_name,
            acc.name,
            effective_official,
            resolved_display_name,
            perk_hint,
        )
        configured_skin = profile.card_skin if (profile and profile.card_skin) else None
        effective_skin = configured_skin or detected_skin
        card_image_url = profile.card_image_url if (profile and profile.card_image_url) else None

        def_prog_code, earn_summary = default_program_for_skin(effective_skin)
        prog_code = (
            profile.points_program_code
            if (profile and profile.points_program_code)
            else def_prog_code
        )
        rp_meta = reward_programs_db.get(prog_code)
        cpp_val = float(rp_meta.cpp_valuation) if rp_meta else 1.0
        prog_name = rp_meta.display_name if rp_meta else prog_code

        card_month_pts = 0.0
        card_year_pts = 0.0
        for t_dt, net_spend_f, p_cat, d_cat, txt_u in purchase_txns_by_card.get(acc.id, []):
            mult = estimate_tx_points_multiplier(effective_skin, p_cat, d_cat, txt_u)
            pts = net_spend_f * mult
            card_year_pts += pts
            if m_start <= t_dt <= m_end:
                card_month_pts += pts

        card_month_pts = max(round(card_month_pts), 0)
        card_year_pts = max(round(card_year_pts), 0)
        program_month_pts[prog_code] += card_month_pts
        program_year_pts[prog_code] += card_year_pts
        program_card_cnt[prog_code] += 1

        cards_out.append(
            {
                "account_id": str(acc.id),
                "institution_name": inst_name or "Card Issuer",
                "raw_name": acc.name,
                "official_name": acc.official_name,
                "mask": acc.mask,
                "display_name": resolved_display_name,
                "custom_display_name": pref.display_name if pref else None,
                "card_skin": configured_skin,
                "detected_skin": detected_skin,
                "effective_skin": effective_skin,
                "card_image_url": card_image_url,
                "points_program_code": prog_code,
                "points_program_name": prog_name,
                "points_cpp": cpp_val,
                "month_points_earned": int(card_month_pts),
                "year_points_earned": int(card_year_pts),
                "year_points_value_usd": round(card_year_pts * cpp_val / 100.0, 2),
                "earn_rate_summary": earn_summary,
                "current_balance": to_float(bal),
                "available_credit": to_float(avail) if avail is not None else None,
                "effective_limit": to_float(effective_limit) if effective_limit is not None else None,
                "credit_limit_override": to_float(limit_override) if limit_override is not None else None,
                "is_charge_card": is_charge,
                "utilization_pct": util_pct,
                "utilization_status": util_status,
                "month_spend": to_float(month_spend_by_card[acc.id]),
                "month_tx_count": tx_count_month_by_card[acc.id],
                "statement_closing_day": profile.statement_closing_day if profile else None,
                "payment_due_day": configured_due_day,
                "inferred_due_day": inferred_due_day,
                "due_date_is_inferred": bool(configured_due_day is None and inferred_due_day is not None),
                "next_due_date": due_date.isoformat() if due_date else None,
                "days_until_due": days_until_due,
                "apr_pct": to_float(apr) if apr is not None else None,
                "minimum_payment": to_float(min_pay) if min_pay is not None else None,
                "annual_fee": to_float(annual_fee),
                "annual_fee_month": profile.annual_fee_month if profile else None,
                "autopay_enabled": bool(profile.autopay_enabled) if profile else False,
                "reward_notes": profile.reward_notes if profile else None,
                "last_payment_date": last_pay_date.isoformat() if last_pay_date else None,
                "last_payment_amount": to_float(last_pay_amt) if last_pay_amt is not None else None,
            }
        )

    grouped_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for c_item in cards_out:
        grouped_map[c_item["institution_name"]].append(c_item)

    issuer_groups: list[dict[str, Any]] = []
    for inst_label, inst_cards in grouped_map.items():
        grp_bal = sum(c["current_balance"] for c in inst_cards)
        grp_rev_bal = sum(
            max(c["current_balance"], 0.0)
            for c in inst_cards
            if not c["is_charge_card"] and (c["effective_limit"] or 0) > 0
        )
        grp_limit = sum(
            (c["effective_limit"] or 0.0)
            for c in inst_cards
            if not c["is_charge_card"] and (c["effective_limit"] or 0) > 0
        )
        grp_util = round(grp_rev_bal / grp_limit * 100.0, 1) if grp_limit > 0 else None
        grp_spend = sum(c["month_spend"] for c in inst_cards)
        grp_fees = sum(c["annual_fee"] for c in inst_cards)
        grp_m_pts = sum(c["month_points_earned"] for c in inst_cards)
        grp_y_pts = sum(c["year_points_earned"] for c in inst_cards)
        issuer_groups.append(
            {
                "institution_name": inst_label,
                "card_count": len(inst_cards),
                "total_balance": round(grp_bal, 2),
                "total_revolving_limit": round(grp_limit, 2),
                "utilization_pct": grp_util,
                "month_spend": round(grp_spend, 2),
                "annual_fees": round(grp_fees, 2),
                "month_points_earned": int(grp_m_pts),
                "year_points_earned": int(grp_y_pts),
                "cards": inst_cards,
            }
        )
    issuer_groups.sort(key=lambda g: (-g["card_count"], -g["total_balance"], g["institution_name"]))

    reward_programs_out: list[dict[str, Any]] = []
    total_rewards_value_usd = 0.0
    total_month_pts = 0
    total_year_pts = 0
    for code, rp in reward_programs_db.items():
        m_pts = int(round(program_month_pts.get(code, 0.0)))
        y_pts = int(round(program_year_pts.get(code, 0.0)))
        confirmed = float(rp.confirmed_points) if rp.confirmed_points is not None else None
        effective_pts = confirmed if confirmed is not None else float(y_pts)
        cpp = float(rp.cpp_valuation)
        est_usd = round(effective_pts * cpp / 100.0, 2)
        total_rewards_value_usd += est_usd
        total_month_pts += m_pts
        total_year_pts += y_pts
        reward_programs_out.append(
            {
                "program_code": code,
                "display_name": rp.display_name,
                "issuer_group": rp.issuer_group,
                "confirmed_points": round(confirmed) if confirmed is not None else None,
                "estimated_12m_points": y_pts,
                "month_points_earned": m_pts,
                "effective_points": int(round(effective_pts)),
                "is_calibrated": confirmed is not None,
                "cpp_valuation": cpp,
                "estimated_value_usd": est_usd,
                "cards_count": program_card_cnt.get(code, 0),
                "color": rp.color,
                "notes": rp.notes,
            }
        )
    reward_programs_out.sort(key=lambda r: (-r["estimated_value_usd"], -r["effective_points"]))

    overall_util = (
        round(float(revolving_balance_for_util / total_revolving_limit * Decimal("100")), 1)
        if total_revolving_limit > 0
        else 0.0
    )
    pos_total_bal = max(total_balance, ZERO)
    coverage_ratio = (
        round(float(liquid_cash / pos_total_bal), 2) if pos_total_bal > 0 else 99.9
    )

    return {
        "as_of_date": ref_today.isoformat(),
        "current_month": ym,
        "summary": {
            "card_count": len(cards_out),
            "total_balance": to_float(total_balance),
            "total_revolving_limit": to_float(total_revolving_limit),
            "overall_utilization_pct": overall_util,
            "cards_over_30_pct": cards_over_30,
            "total_annual_fees": to_float(total_annual_fees),
            "liquid_cash_available": to_float(liquid_cash),
            "net_cash_after_all_cards": to_float(liquid_cash - pos_total_bal),
            "cash_coverage_ratio": coverage_ratio,
            "due_within_14d_amount": to_float(due_within_14d_amount),
            "due_within_14d_count": due_within_14d_count,
        },
        "cards": cards_out,
        "issuer_groups": issuer_groups,
        "reward_programs": reward_programs_out,
        "rewards_summary": {
            "total_estimated_value_usd": round(total_rewards_value_usd, 2),
            "month_points_earned": total_month_pts,
            "year_points_earned": total_year_pts,
            "programs_count": len(reward_programs_out),
        },
    }


async def get_budget_settings(db: AsyncSession) -> dict[str, Any]:
    row = await db.get(AppSetting, "budget_config")
    defaults = {"include_fixed_loans": False, "monthly_income_target": 0.0}
    if row and isinstance(row.value_json, dict):
        defaults.update(row.value_json)
    return defaults


async def get_budget_dashboard(db: AsyncSession, year_month: str | None = None) -> dict[str, Any]:
    ref_today = today_la()
    ym, m_start, m_end = month_bounds(year_month)
    days_in_month = (m_end - m_start).days + 1
    if ref_today < m_start:
        days_elapsed = 0
    elif ref_today > m_end:
        days_elapsed = days_in_month
    else:
        days_elapsed = (ref_today - m_start).days + 1
    month_elapsed_pct = round(days_elapsed / days_in_month * 100.0, 1)

    rules, categories = await load_rules_and_categories(db)
    budget_cfg = await get_budget_settings(db)
    include_fixed_loans = bool(budget_cfg.get("include_fixed_loans", False))

    budgets_rows = (
        await db.execute(select(Budget).where(Budget.is_active.is_(True)))
    ).scalars().all()
    budgets_map = {b.category_slug: b for b in budgets_rows}

    month_overrides_rows = (
        await db.execute(
            select(BudgetMonthOverride).where(BudgetMonthOverride.year_month == ym)
        )
    ).scalars().all()
    month_overrides_map = {o.category_slug: o for o in month_overrides_rows}

    # Available historical months in transactions
    months_rows = (
        await db.execute(
            select(func.to_char(Transaction.date, "YYYY-MM").label("ym"))
            .group_by("ym")
            .order_by(desc("ym"))
        )
    ).scalars().all()
    available_months = list(months_rows)
    if ym not in available_months:
        available_months.insert(0, ym)

    # Pull 6 months window ending at m_end for cashflow trend + current month breakdown
    six_m_year = m_start.year
    six_m_month = m_start.month - 5
    while six_m_month <= 0:
        six_m_month += 12
        six_m_year -= 1
    trend_start = date(six_m_year, six_m_month, 1)

    tx_rows = (
        await db.execute(
            select(Transaction, Account.class_, Account.subtype, TransactionOverride)
            .join(Account, Account.id == Transaction.account_id)
            .outerjoin(TransactionOverride, TransactionOverride.transaction_id == Transaction.id)
            .where(Transaction.date >= trend_start, Transaction.date <= m_end)
            .order_by(desc(Transaction.date))
        )
    ).all()

    cat_spent: dict[str, Decimal] = defaultdict(lambda: ZERO)
    cat_tx_count: dict[str, int] = defaultdict(int)
    cat_merchants: dict[str, Counter[str]] = defaultdict(Counter)

    month_income = ZERO
    month_cc_payments = ZERO
    month_fixed_loans = ZERO

    trend_buckets: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"income": ZERO, "expense": ZERO, "fixed_loans": ZERO}
    )

    for tx, acc_class, acc_subtype, ov in tx_rows:
        classified = classify_transaction(
            source=tx.source,
            account_class=acc_class,
            account_subtype=acc_subtype,
            amount=tx.amount,
            category_primary=tx.category_primary,
            category_detailed=tx.category_detailed,
            merchant_name=tx.merchant_name,
            name=tx.name,
            description=tx.description,
            override=ov,
            rules=rules,
        )
        tx_ym = tx.date.strftime("%Y-%m")
        in_selected_month = m_start <= tx.date <= m_end

        if classified.tx_kind == "income":
            inc_val = max(tx.amount, ZERO)
            trend_buckets[tx_ym]["income"] += inc_val
            if in_selected_month:
                month_income += inc_val
        elif classified.tx_kind == "loan_payment":
            loan_val = abs(tx.amount)
            trend_buckets[tx_ym]["fixed_loans"] += loan_val
            if in_selected_month:
                month_fixed_loans += loan_val
                if include_fixed_loans:
                    cat_spent["fixed_loans"] += loan_val
                    cat_tx_count["fixed_loans"] += 1
                    cat_merchants["fixed_loans"][classified.display_merchant] += float(loan_val)
        elif classified.tx_kind == "cc_payment":
            if in_selected_month and tx.source == "cash" and tx.amount < 0:
                month_cc_payments += abs(tx.amount)
        elif classified.tx_kind == "expense":
            # Spending is negative in public.transactions; refunds are positive
            net_spend = -tx.amount
            trend_buckets[tx_ym]["expense"] += net_spend
            if in_selected_month:
                cat_spent[classified.category_slug] += net_spend
                if tx.amount < 0:
                    cat_tx_count[classified.category_slug] += 1
                    cat_merchants[classified.category_slug][classified.display_merchant] += float(
                        abs(tx.amount)
                    )

    # Build category budget items
    budget_items: list[dict[str, Any]] = []
    total_budgeted = ZERO
    total_budgeted_spent = ZERO
    unbudgeted_spent = ZERO

    for slug, cat in categories.items():
        if cat.is_income or cat.is_transfer:
            continue
        if slug == "fixed_loans" and not include_fixed_loans:
            continue

        b = budgets_map.get(slug)
        mo = month_overrides_map.get(slug)
        raw_spent = max(cat_spent.get(slug, ZERO), ZERO)

        base_limit = b.monthly_limit if b else None
        rollover_adj = mo.rollover_adjustment if mo else ZERO
        effective_limit: Decimal | None = None
        if mo and mo.limit_override is not None:
            effective_limit = mo.limit_override + rollover_adj
        elif base_limit is not None:
            effective_limit = base_limit + rollover_adj

        if effective_limit is not None and effective_limit > 0:
            total_budgeted += effective_limit
            total_budgeted_spent += raw_spent
            pct_used = round(float(raw_spent / effective_limit * Decimal("100")), 1)
            pace_delta = round(pct_used - month_elapsed_pct, 1)
            threshold = b.alert_threshold_pct if b else 80
            if pct_used > 100.0:
                status = "over_budget"
            elif pct_used >= threshold or pace_delta > 15.0:
                status = "watch"
            else:
                status = "on_track"
            remaining = effective_limit - raw_spent
        else:
            if raw_spent == 0 and b is None:
                continue
            unbudgeted_spent += raw_spent
            pct_used = None
            pace_delta = None
            status = "unbudgeted"
            remaining = None

        top_merchants = [
            {"merchant": m, "amount": round(amt, 2)}
            for m, amt in cat_merchants[slug].most_common(3)
        ]

        budget_items.append(
            {
                "category_slug": slug,
                "name_zh": cat.name_zh,
                "name_en": cat.name_en,
                "group_name": cat.group_name,
                "color": cat.color,
                "icon": cat.icon,
                "base_monthly_limit": to_float(base_limit) if base_limit is not None else None,
                "effective_limit": to_float(effective_limit) if effective_limit is not None else None,
                "rollover_enabled": bool(b.rollover_enabled) if b else False,
                "rollover_adjustment": to_float(rollover_adj),
                "alert_threshold_pct": b.alert_threshold_pct if b else 80,
                "spent": to_float(raw_spent),
                "remaining": to_float(remaining) if remaining is not None else None,
                "pct_used": pct_used,
                "pace_delta_pct": pace_delta,
                "status": status,
                "tx_count": cat_tx_count.get(slug, 0),
                "top_merchants": top_merchants,
            }
        )

    budget_items.sort(
        key=lambda x: (
            0 if x["effective_limit"] is not None else 1,
            -(x["spent"] or 0.0),
        )
    )

    total_living_spent = total_budgeted_spent + unbudgeted_spent
    total_pct_used = (
        round(float(total_budgeted_spent / total_budgeted * Decimal("100")), 1)
        if total_budgeted > 0
        else 0.0
    )

    # Chronological 6-month trend
    trend_months: list[str] = []
    cy, cm = trend_start.year, trend_start.month
    while (cy, cm) <= (m_start.year, m_start.month):
        trend_months.append(f"{cy:04d}-{cm:02d}")
        if cm == 12:
            cy += 1
            cm = 1
        else:
            cm += 1

    cashflow_trend = []
    for t_ym in trend_months:
        bkt = trend_buckets[t_ym]
        exp = max(bkt["expense"], ZERO)
        loans = max(bkt["fixed_loans"], ZERO)
        inc = max(bkt["income"], ZERO)
        total_out = exp + (loans if include_fixed_loans else ZERO)
        cashflow_trend.append(
            {
                "year_month": t_ym,
                "income": to_float(inc),
                "living_expense": to_float(exp),
                "fixed_loans": to_float(loans),
                "net_cashflow": to_float(inc - exp - loans),
                "total_outflow": to_float(total_out),
            }
        )

    subscriptions = await detect_recurring_subscriptions(db, rules)

    return {
        "year_month": ym,
        "available_months": available_months,
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "month_elapsed_pct": month_elapsed_pct,
        "settings": {
            "include_fixed_loans": include_fixed_loans,
        },
        "summary": {
            "total_budgeted": to_float(total_budgeted),
            "total_budgeted_spent": to_float(total_budgeted_spent),
            "unbudgeted_spent": to_float(unbudgeted_spent),
            "total_living_spent": to_float(total_living_spent),
            "fixed_loans_paid": to_float(month_fixed_loans),
            "cc_payments_excluded": to_float(month_cc_payments),
            "month_income": to_float(month_income),
            "net_savings": to_float(month_income - total_living_spent - month_fixed_loans),
            "budget_used_pct": total_pct_used,
            "remaining_budget": to_float(total_budgeted - total_budgeted_spent),
        },
        "categories": budget_items,
        "cashflow_trend": cashflow_trend,
        "subscriptions": subscriptions,
    }


async def detect_recurring_subscriptions(
    db: AsyncSession, rules: list[MerchantRule] | None = None
) -> list[dict[str, Any]]:
    if rules is None:
        rules, _ = await load_rules_and_categories(db)

    cutoff = today_la() - timedelta(days=150)
    rows = (
        await db.execute(
            select(Transaction, Account.class_, Account.subtype, Account.name, Account.mask)
            .join(Account, Account.id == Transaction.account_id)
            .where(Transaction.date >= cutoff, Transaction.amount < 0)
            .order_by(desc(Transaction.date))
        )
    ).all()

    saved_subs = {
        s.merchant_key: s
        for s in (await db.execute(select(SubscriptionItem))).scalars().all()
    }

    by_merchant: dict[str, list[tuple[date, Decimal, str]]] = defaultdict(list)
    for tx, acc_class, acc_subtype, acc_name, acc_mask in rows:
        c = classify_transaction(
            source=tx.source,
            account_class=acc_class,
            account_subtype=acc_subtype,
            amount=tx.amount,
            category_primary=tx.category_primary,
            category_detailed=tx.category_detailed,
            merchant_name=tx.merchant_name,
            name=tx.name,
            description=tx.description,
            rules=rules,
        )
        if c.tx_kind != "expense":
            continue
        if c.category_slug not in (
            "services_subscriptions",
            "entertainment",
            "housing_utilities",
            "personal_care",
        ):
            continue
        key = c.display_merchant.strip()
        if len(key) < 2:
            continue
        acc_lbl = f"{acc_name} ••{acc_mask}" if acc_mask else (acc_name or "")
        by_merchant[key].append((tx.date, abs(tx.amount), acc_lbl))

    detected: list[dict[str, Any]] = []
    for merchant, charges in by_merchant.items():
        distinct_months = {d.strftime("%Y-%m") for d, _, _ in charges}
        if len(distinct_months) < 2 or len(charges) > 8:
            continue
        amounts = [float(a) for _, a, _ in charges]
        avg_amt = sum(amounts) / len(amounts)
        if avg_amt <= 0:
            continue
        max_dev = max(abs(a - avg_amt) / avg_amt for a in amounts)
        # Recurring subscription amounts usually stay within ~20% variance across months
        if max_dev > 0.22:
            continue

        saved = saved_subs.get(merchant)
        if saved and saved.is_ignored:
            continue

        last_date, last_amt, acc_lbl = charges[0]
        next_est = compute_next_day_of_month(last_date.day, today_la())
        detected.append(
            {
                "merchant_key": merchant,
                "display_name": saved.display_name if saved else merchant,
                "expected_amount": to_float(saved.expected_amount) if saved else round(avg_amt, 2),
                "last_amount": to_float(last_amt),
                "last_charged_date": last_date.isoformat(),
                "next_expected_date": next_est.isoformat() if next_est else None,
                "months_seen": len(distinct_months),
                "account_label": acc_lbl,
            }
        )

    detected.sort(key=lambda x: -x["expected_amount"])
    return detected[:20]


async def get_overview_dashboard(db: AsyncSession, force_refresh: bool = False) -> dict[str, Any]:
    sync_info = await get_sync_status(db)
    accounts = await get_accounts_enriched(db)
    cc_dash = await get_credit_cards_dashboard(db)
    budget_dash = await get_budget_dashboard(db)
    inv_dash = await get_investments_dashboard(db, force_refresh=force_refresh)

    live_inv_by_acc = {a["id"]: a["current_balance"] for a in inv_dash["accounts"]}

    cash_total = 0.0
    investment_total = 0.0
    credit_card_debt = 0.0
    loan_debt = 0.0

    for a in accounts:
        if a["class"] == "investment" and a["id"] in live_inv_by_acc:
            a["current_balance"] = live_inv_by_acc[a["id"]]
        if not a["include_in_net_worth"]:
            continue
        bal = a["current_balance"]
        if a["class"] == "cash":
            cash_total += bal
        elif a["class"] == "investment":
            investment_total += bal
        elif a["class"] == "liability":
            if a["subtype"] == "credit card":
                credit_card_debt += bal
            else:
                loan_debt += bal

    manual_assets = inv_dash["manual_assets"]
    alternative_total = sum(
        m["market_value"] for m in manual_assets if m["include_in_net_worth"]
    )
    gold_total = sum(
        m["market_value"]
        for m in manual_assets
        if m["include_in_net_worth"] and m["asset_type"] == "precious_metal"
    )
    crypto_total = sum(
        m["market_value"]
        for m in manual_assets
        if m["include_in_net_worth"] and m["asset_type"] == "crypto"
    )
    other_alt_total = max(alternative_total - gold_total - crypto_total, 0.0)

    total_assets = round(cash_total + investment_total + alternative_total, 2)
    total_liabilities = round(credit_card_debt + loan_debt, 2)
    net_worth = round(total_assets - total_liabilities, 2)

    asset_allocation = [
        {"label": "券商投资 (Equities)", "value": round(investment_total, 2), "color": "#38bdf8"},
        {"label": "加密资产 (BTC)", "value": round(crypto_total, 2), "color": "#f59e0b"},
        {"label": "实物贵金属 (Gold)", "value": round(gold_total, 2), "color": "#eab308"},
        {"label": "流动现金 (Cash)", "value": round(cash_total, 2), "color": "#10b981"},
    ]
    if other_alt_total > 0:
        asset_allocation.append(
            {"label": "其他实物资产", "value": round(other_alt_total, 2), "color": "#a855f7"}
        )

    # Historical net worth from balance_snapshots (latest run per LA calendar date)
    snap_rows = (
        await db.execute(
            select(
                SyncRun.id,
                SyncRun.started_at,
                Account.class_,
                func.sum(BalanceSnapshot.current_balance).label("sum_bal"),
            )
            .join(SyncRun, SyncRun.id == BalanceSnapshot.run_id)
            .join(Account, Account.id == BalanceSnapshot.account_id)
            .group_by(SyncRun.id, SyncRun.started_at, Account.class_)
            .order_by(SyncRun.id.asc())
        )
    ).all()

    by_run: dict[int, dict[str, Any]] = {}
    for run_id, started_at, acc_cls, sum_bal in snap_rows:
        la_dt = started_at.astimezone(get_settings().tz).date().isoformat()
        entry = by_run.setdefault(
            run_id,
            {"run_id": run_id, "date": la_dt, "cash": 0.0, "investment": 0.0, "liability": 0.0},
        )
        entry[acc_cls or "other"] = to_float(sum_bal)

    by_date: dict[str, dict[str, Any]] = {}
    for _, item in sorted(by_run.items()):
        nw = round(item["cash"] + item["investment"] + alternative_total - item["liability"], 2)
        by_date[item["date"]] = {
            "date": item["date"],
            "cash": item["cash"],
            "investment": item["investment"],
            "alternative": round(alternative_total, 2),
            "total_assets": round(item["cash"] + item["investment"] + alternative_total, 2),
            "liabilities": item["liability"],
            "net_worth": nw,
        }

    # Ensure today's live point reflects real-time market marks
    today_iso = today_la().isoformat()
    by_date[today_iso] = {
        "date": today_iso,
        "cash": round(cash_total, 2),
        "investment": round(investment_total, 2),
        "alternative": round(alternative_total, 2),
        "total_assets": total_assets,
        "liabilities": total_liabilities,
        "net_worth": net_worth,
    }

    return {
        "as_of": datetime.now(get_settings().tz).isoformat(),
        "timezone": get_settings().app_timezone,
        "gemini_enabled": get_settings().gemini_enabled,
        "ai_provider": get_settings().ai_provider_label,
        "ai_model": get_settings().gemini_model,
        "sync": sync_info,
        "net_worth": {
            "net_worth": net_worth,
            "total_assets": total_assets,
            "total_liabilities": total_liabilities,
            "cash_total": round(cash_total, 2),
            "investment_total": round(investment_total, 2),
            "alternative_total": round(alternative_total, 2),
            "gold_total": round(gold_total, 2),
            "crypto_total": round(crypto_total, 2),
            "credit_card_debt": round(credit_card_debt, 2),
            "loan_debt": round(loan_debt, 2),
            "liquid_cash_available": cc_dash["summary"]["liquid_cash_available"],
            "portfolio_day_change": inv_dash["total_day_change"],
            "portfolio_day_change_pct": inv_dash["total_day_change_pct"],
            "rewards_estimated_usd": cc_dash["rewards_summary"]["total_estimated_value_usd"],
        },
        "asset_allocation": asset_allocation,
        "manual_assets": manual_assets,
        "net_worth_history": list(by_date.values()),
        "credit_cards_pulse": cc_dash["summary"],
        "rewards_pulse": cc_dash["rewards_summary"],
        "upcoming_cards": sorted(
            [c for c in cc_dash["cards"] if c["current_balance"] > 0],
            key=lambda c: (
                c["days_until_due"] if c["days_until_due"] is not None else 999,
                -c["current_balance"],
            ),
        )[:6],
        "budget_pulse": {
            "year_month": budget_dash["year_month"],
            "month_elapsed_pct": budget_dash["month_elapsed_pct"],
            **budget_dash["summary"],
        },
        "cashflow_trend": budget_dash["cashflow_trend"],
        "accounts": accounts,
    }


async def query_transactions(
    db: AsyncSession,
    *,
    year_month: str | None = None,
    account_id: str | None = None,
    institution: str | None = None,
    category_slug: str | None = None,
    tx_kind: str | None = None,
    pending_only: bool = False,
    unreviewed_only: bool = False,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    rules, categories = await load_rules_and_categories(db)

    stmt = (
        select(
            Transaction,
            Account.name,
            Account.mask,
            Account.class_,
            Account.subtype,
            Connection.institution_name,
            AccountPreference.display_name,
            TransactionOverride,
        )
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Connection, Connection.id == Account.connection_id)
        .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
        .outerjoin(TransactionOverride, TransactionOverride.transaction_id == Transaction.id)
    )

    if year_month:
        _, d_start, d_end = month_bounds(year_month)
        stmt = stmt.where(Transaction.date >= d_start, Transaction.date <= d_end)
    if account_id:
        stmt = stmt.where(Transaction.account_id == uuid.UUID(account_id))
    if institution:
        stmt = stmt.where(Connection.institution_name == institution)
    if pending_only:
        stmt = stmt.where(Transaction.pending.is_(True))
    if unreviewed_only:
        stmt = stmt.where(
            (TransactionOverride.is_reviewed.is_(None))
            | (TransactionOverride.is_reviewed.is_(False))
        )

    stmt = stmt.order_by(desc(Transaction.date), desc(Transaction.pending), Transaction.id)
    rows = (await db.execute(stmt)).all()

    q_lower = search.strip().lower() if search and search.strip() else None

    filtered: list[dict[str, Any]] = []
    total_outflow = ZERO
    total_inflow = ZERO

    for tx, acc_name, acc_mask, acc_class, acc_subtype, inst_name, pref_name, ov in rows:
        c = classify_transaction(
            source=tx.source,
            account_class=acc_class,
            account_subtype=acc_subtype,
            amount=tx.amount,
            category_primary=tx.category_primary,
            category_detailed=tx.category_detailed,
            merchant_name=tx.merchant_name,
            name=tx.name,
            description=tx.description,
            override=ov,
            rules=rules,
        )

        if category_slug and c.category_slug != category_slug:
            continue
        if tx_kind and tx_kind != "all":
            if tx_kind == "transfer":
                if c.tx_kind not in ("cc_payment", "internal_transfer"):
                    continue
            elif c.tx_kind != tx_kind:
                continue

        cat_obj = categories.get(c.category_slug)
        acc_display = format_account_label(inst_name, acc_name, acc_mask, pref_name)
        notes = ov.notes if ov else None
        tags = list(ov.tags) if (ov and ov.tags) else []

        if q_lower:
            amt_str = f"{abs(float(tx.amount)):.2f}"
            hay = " ".join(
                str(p).lower()
                for p in (
                    c.display_merchant,
                    tx.merchant_name,
                    tx.name,
                    tx.description,
                    acc_display,
                    inst_name,
                    cat_obj.name_zh if cat_obj else "",
                    cat_obj.name_en if cat_obj else "",
                    notes or "",
                    " ".join(tags),
                    amt_str,
                )
                if p
            )
            if q_lower not in hay:
                continue

        if c.tx_kind == "expense":
            total_outflow += -tx.amount
        elif c.tx_kind == "income":
            total_inflow += max(tx.amount, ZERO)

        filtered.append(
            {
                "id": str(tx.id),
                "date": tx.date.isoformat(),
                "account_id": str(tx.account_id),
                "account_name": acc_display,
                "institution_name": inst_name or "Bank",
                "account_subtype": acc_subtype,
                "source": tx.source,
                "amount": to_float(tx.amount),
                "pending": tx.pending,
                "raw_name": tx.name,
                "raw_merchant": tx.merchant_name,
                "plaid_category": tx.category_primary,
                "display_merchant": c.display_merchant,
                "category_slug": c.category_slug,
                "category_name_zh": cat_obj.name_zh if cat_obj else c.category_slug,
                "category_color": cat_obj.color if cat_obj else "#64748b",
                "tx_kind": c.tx_kind,
                "is_overridden": c.is_overridden,
                "matched_rule_id": c.matched_rule_id,
                "is_reviewed": bool(ov.is_reviewed) if ov else False,
                "notes": notes,
                "tags": tags,
            }
        )

    total_count = len(filtered)
    sliced = filtered[offset : offset + limit]

    daily_map: dict[str, dict[str, float]] = defaultdict(lambda: {"expense": 0.0, "income": 0.0})
    cat_agg: dict[str, dict[str, Any]] = {}
    for item in filtered:
        dt_k = item["date"]
        if item["tx_kind"] == "expense":
            exp_val = -item["amount"]
            if exp_val > 0:
                daily_map[dt_k]["expense"] = round(daily_map[dt_k]["expense"] + exp_val, 2)
                c_entry = cat_agg.setdefault(
                    item["category_slug"],
                    {
                        "slug": item["category_slug"],
                        "name_zh": item["category_name_zh"],
                        "color": item["category_color"],
                        "amount": 0.0,
                    },
                )
                c_entry["amount"] = round(c_entry["amount"] + exp_val, 2)
        elif item["tx_kind"] == "income" and item["amount"] > 0:
            daily_map[dt_k]["income"] = round(daily_map[dt_k]["income"] + item["amount"], 2)

    daily_spend_series = [
        {"date": d_key, "expense": v["expense"], "income": v["income"]}
        for d_key, v in sorted(daily_map.items())[-31:]
    ]
    category_breakdown = sorted(cat_agg.values(), key=lambda x: -x["amount"])

    return {
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "filtered_expense_net": to_float(total_outflow),
        "filtered_income_total": to_float(total_inflow),
        "daily_spend_series": daily_spend_series,
        "category_breakdown": category_breakdown,
        "items": sliced,
    }


async def get_investments_dashboard(
    db: AsyncSession, force_refresh: bool = False
) -> dict[str, Any]:
    inv_accounts_rows = (
        await db.execute(
            select(Account, Connection.institution_name, AccountPreference)
            .outerjoin(Connection, Connection.id == Account.connection_id)
            .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
            .where(Account.class_ == "investment")
            .order_by(desc(Account.current_balance))
        )
    ).all()

    max_snap_date = (
        await db.execute(select(func.max(HoldingSnapshot.snapshot_date)))
    ).scalar_one_or_none()

    h_rows = []
    if max_snap_date:
        h_rows = (
            await db.execute(
                select(
                    HoldingSnapshot,
                    Security,
                    Account.name,
                    Account.mask,
                    Connection.institution_name,
                    AccountPreference.display_name,
                )
                .join(Security, Security.security_key == HoldingSnapshot.security_key)
                .join(Account, Account.id == HoldingSnapshot.account_id)
                .outerjoin(Connection, Connection.id == Account.connection_id)
                .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
                .where(HoldingSnapshot.snapshot_date == max_snap_date)
                .order_by(desc(HoldingSnapshot.institution_value))
            )
        ).all()

    manual_rows = (
        await db.execute(select(ManualAsset).order_by(ManualAsset.id.asc()))
    ).scalars().all()

    quote_symbols: list[str] = []
    for _, sec, *_ in h_rows:
        t = sec.ticker_symbol or sec.security_key
        if t and not t.startswith("CUR:"):
            quote_symbols.append(t)
    for ma in manual_rows:
        if ma.symbol:
            quote_symbols.append(ma.symbol)

    live_quotes = await get_live_quotes(quote_symbols, force_refresh=force_refresh)
    manual_assets = await get_manual_assets_enriched(
        db, quotes=live_quotes, force_refresh=False
    )

    holdings_out: list[dict[str, Any]] = []
    consolidated_map: dict[str, dict[str, Any]] = {}
    account_live_delta: dict[uuid.UUID, float] = defaultdict(float)
    equity_day_change_total = 0.0
    latest_quote_ts: str | None = None

    for h, sec, acc_name, acc_mask, inst_name, pref_name in h_rows:
        qty = float(h.quantity or ZERO)
        snap_price = float(h.institution_price or ZERO)
        snap_val = float(h.institution_value or ZERO)
        ticker = sec.ticker_symbol or sec.security_key
        q = live_quotes.get(ticker)

        if q is not None and not ticker.startswith("CUR:"):
            live_price = q.price
            mkt_val = round(qty * live_price, 2)
            account_live_delta[h.account_id] += mkt_val - snap_val
            day_chg_val = round(qty * q.change, 2) if q.change is not None else 0.0
            day_chg_pct = q.change_pct
            sparkline = q.sparkline
            quote_src = q.source
            if q.updated_at and (latest_quote_ts is None or q.updated_at > latest_quote_ts):
                latest_quote_ts = q.updated_at
        else:
            live_price = snap_price
            mkt_val = round(snap_val, 2)
            day_chg_val = 0.0
            day_chg_pct = None
            sparkline = [round(snap_price, 2)] if snap_price > 0 else []
            quote_src = "plaid_snapshot"

        equity_day_change_total += day_chg_val
        cost_f = float(h.cost_basis) if h.cost_basis is not None else None
        gain = round(mkt_val - cost_f, 2) if (cost_f is not None and cost_f > 0) else None
        gain_pct = (
            round(gain / cost_f * 100.0, 2)
            if (gain is not None and cost_f and cost_f > 0)
            else None
        )
        acc_lbl = format_account_label(inst_name, acc_name, acc_mask, pref_name)

        holdings_out.append(
            {
                "security_key": sec.security_key,
                "ticker": ticker,
                "security_name": sec.security_name or sec.security_key,
                "security_type": sec.security_type or "equity",
                "account_id": str(h.account_id),
                "account_name": acc_lbl,
                "institution_name": inst_name or "Broker",
                "quantity": qty,
                "snapshot_price": round(snap_price, 2),
                "price": round(live_price, 2),
                "market_value": mkt_val,
                "day_change_pct": day_chg_pct,
                "day_change_value": day_chg_val,
                "sparkline": sparkline,
                "quote_source": quote_src,
                "cost_basis": round(cost_f, 2) if cost_f is not None else None,
                "unrealized_gain": gain,
                "unrealized_gain_pct": gain_pct,
            }
        )

        agg = consolidated_map.setdefault(
            ticker,
            {
                "ticker": ticker,
                "security_name": sec.security_name or ticker,
                "security_type": sec.security_type or "equity",
                "total_quantity": 0.0,
                "price": round(live_price, 2),
                "snapshot_price": round(snap_price, 2),
                "day_change_pct": day_chg_pct,
                "day_change_value": 0.0,
                "sparkline": sparkline,
                "quote_source": quote_src,
                "total_value": 0.0,
                "total_cost": 0.0,
                "has_cost": False,
                "accounts_count": 0,
            },
        )
        agg["total_quantity"] = round(agg["total_quantity"] + qty, 6)
        agg["total_value"] = round(agg["total_value"] + mkt_val, 2)
        agg["day_change_value"] = round(agg["day_change_value"] + day_chg_val, 2)
        if cost_f is not None and cost_f > 0:
            agg["total_cost"] = round(agg["total_cost"] + cost_f, 2)
            agg["has_cost"] = True
        agg["accounts_count"] += 1

    holdings_out.sort(key=lambda x: -x["market_value"])

    brokerage_portfolio = 0.0
    tax_buckets: dict[str, float] = defaultdict(float)
    inst_buckets: dict[str, float] = defaultdict(float)
    accounts_list: list[dict[str, Any]] = []

    for acc, inst_name, pref in inv_accounts_rows:
        snap_bal = float(acc.current_balance or ZERO)
        live_bal = round(max(snap_bal + account_live_delta.get(acc.id, 0.0), 0.0), 2)
        brokerage_portfolio += live_bal
        inst = inst_name or "Brokerage"
        inst_buckets[inst] += live_bal

        sub = (acc.subtype or "").lower()
        raw_nm = (acc.name or "").lower()
        if "crypto" in raw_nm:
            bucket = "加密数字资产 (Crypto)"
        elif sub in ("roth", "ira"):
            bucket = "免税退休账户 (IRA / Roth)"
        elif sub == "hsa":
            bucket = "医疗储蓄账户 (HSA)"
        elif sub == "stock plan":
            bucket = "雇主股权激励 (RSU / Equity)"
        else:
            bucket = "应税美股券商 (Taxable)"
        tax_buckets[bucket] += live_bal

        accounts_list.append(
            {
                "id": str(acc.id),
                "institution_name": inst,
                "subtype": acc.subtype,
                "tax_bucket": bucket,
                "mask": acc.mask,
                "display_name": format_account_label(
                    inst, acc.name, acc.mask, pref.display_name if pref else None, acc.official_name
                ),
                "snapshot_balance": round(snap_bal, 2),
                "current_balance": live_bal,
                "live_delta": round(live_bal - snap_bal, 2),
                "weight_pct": 0.0,
            }
        )
    accounts_list.sort(key=lambda x: -x["current_balance"])

    manual_assets_value = 0.0
    manual_day_change_total = 0.0
    for ma in manual_assets:
        if not ma["include_in_net_worth"]:
            continue
        manual_assets_value += ma["market_value"]
        manual_day_change_total += ma["day_change_value"]
        if ma["quote_updated_at"] and (
            latest_quote_ts is None or ma["quote_updated_at"] > latest_quote_ts
        ):
            latest_quote_ts = ma["quote_updated_at"]
        if ma["asset_type"] == "crypto":
            tax_buckets["加密数字资产 (Crypto)"] += ma["market_value"]
            inst_buckets["Self-Custody (BTC/Crypto)"] += ma["market_value"]
        elif ma["asset_type"] == "precious_metal":
            tax_buckets["实物黄金贵金属 (Gold)"] += ma["market_value"]
            inst_buckets["Physical Vault (Gold)"] += ma["market_value"]
        else:
            tax_buckets["其他另类资产 (Alt)"] += ma["market_value"]
            inst_buckets["Manual Assets"] += ma["market_value"]

    total_portfolio = round(brokerage_portfolio + manual_assets_value, 2)
    total_day_change = round(equity_day_change_total + manual_day_change_total, 2)
    prev_portfolio = total_portfolio - total_day_change
    total_day_change_pct = (
        round(total_day_change / prev_portfolio * 100.0, 2) if prev_portfolio > 0 else 0.0
    )

    for item in accounts_list:
        if total_portfolio > 0:
            item["weight_pct"] = round(item["current_balance"] / total_portfolio * 100.0, 1)

    consolidated_positions = sorted(
        consolidated_map.values(), key=lambda x: -x["total_value"]
    )
    holdings_sum = sum(p["total_value"] for p in consolidated_positions)
    for p in consolidated_positions:
        p["weight_pct"] = round(p["total_value"] / holdings_sum * 100.0, 1) if holdings_sum > 0 else 0.0
        if p["has_cost"] and p["total_cost"] > 0:
            p["unrealized_gain"] = round(p["total_value"] - p["total_cost"], 2)
            p["unrealized_gain_pct"] = round(
                (p["total_value"] - p["total_cost"]) / p["total_cost"] * 100.0, 2
            )
        else:
            p["unrealized_gain"] = None
            p["unrealized_gain_pct"] = None

    # Unified broad positions (Equities + BTC + Gold) for cross-asset charts
    broad_positions: list[dict[str, Any]] = [
        {
            "ticker": p["ticker"],
            "name": p["security_name"],
            "category": "equity" if p["security_type"] != "cash" else "cash",
            "quantity": p["total_quantity"],
            "unit": "sh",
            "price": p["price"],
            "value": p["total_value"],
            "day_change_pct": p["day_change_pct"],
            "day_change_value": p["day_change_value"],
            "unrealized_gain": p["unrealized_gain"],
            "unrealized_gain_pct": p["unrealized_gain_pct"],
            "sparkline": p["sparkline"],
        }
        for p in consolidated_positions
        if p["total_value"] > 10
    ]
    for ma in manual_assets:
        if not ma["include_in_net_worth"]:
            continue
        broad_positions.append(
            {
                "ticker": "GOLD" if ma["symbol"] == "GC=F" else (ma["symbol"] or ma["unit"]).replace("-USD", ""),
                "name": ma["name"],
                "category": ma["asset_type"],
                "quantity": ma["quantity"],
                "unit": ma["unit"],
                "price": ma["unit_price"],
                "value": ma["market_value"],
                "day_change_pct": ma["day_change_pct"],
                "day_change_value": ma["day_change_value"],
                "unrealized_gain": ma["unrealized_gain"],
                "unrealized_gain_pct": ma["unrealized_gain_pct"],
                "sparkline": ma["sparkline"],
            }
        )
    broad_positions.sort(key=lambda x: -x["value"])
    broad_sum = sum(bp["value"] for bp in broad_positions)
    for bp in broad_positions:
        bp["weight_pct"] = round(bp["value"] / broad_sum * 100.0, 1) if broad_sum > 0 else 0.0

    # Recent investment transactions
    inv_tx_rows = (
        await db.execute(
            select(
                InvestmentTransaction,
                Account.name,
                Account.mask,
                Connection.institution_name,
                AccountPreference.display_name,
            )
            .join(Account, Account.id == InvestmentTransaction.account_id)
            .outerjoin(Connection, Connection.id == Account.connection_id)
            .outerjoin(AccountPreference, AccountPreference.account_id == Account.id)
            .order_by(desc(InvestmentTransaction.date))
            .limit(60)
        )
    ).all()

    recent_inv_txns = [
        {
            "id": str(itx.id),
            "date": itx.date.isoformat(),
            "type": itx.type or "trade",
            "ticker": itx.ticker_symbol or itx.security_key or "CASH",
            "security_name": itx.security_name,
            "quantity": float(itx.quantity) if itx.quantity is not None else None,
            "price": float(itx.price) if itx.price is not None else None,
            "amount": to_float(itx.amount),
            "account_name": format_account_label(inst_name, acc_name, acc_mask, pref_name),
            "institution_name": inst_name or "Broker",
        }
        for itx, acc_name, acc_mask, inst_name, pref_name in inv_tx_rows
    ]

    return {
        "total_portfolio_value": total_portfolio,
        "brokerage_portfolio_value": round(brokerage_portfolio, 2),
        "manual_assets_value": round(manual_assets_value, 2),
        "total_day_change": total_day_change,
        "total_day_change_pct": total_day_change_pct,
        "quotes_updated_at": latest_quote_ts or datetime.now(get_settings().tz).isoformat(),
        "holdings_snapshot_date": max_snap_date.isoformat() if max_snap_date else None,
        "by_tax_bucket": [
            {
                "bucket": k,
                "value": round(v, 2),
                "weight_pct": round(v / total_portfolio * 100.0, 1) if total_portfolio > 0 else 0.0,
            }
            for k, v in sorted(tax_buckets.items(), key=lambda item: -item[1])
            if v > 0
        ],
        "by_institution": [
            {
                "institution": k,
                "value": round(v, 2),
                "weight_pct": round(v / total_portfolio * 100.0, 1) if total_portfolio > 0 else 0.0,
            }
            for k, v in sorted(inst_buckets.items(), key=lambda item: -item[1])
            if v > 0
        ],
        "manual_assets": manual_assets,
        "broad_positions": broad_positions,
        "accounts": accounts_list,
        "consolidated_positions": consolidated_positions,
        "holdings": holdings_out,
        "recent_transactions": recent_inv_txns,
    }
