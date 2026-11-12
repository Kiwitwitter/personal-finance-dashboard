from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from app.models.app_models import MerchantRule, TransactionOverride

PLAID_PRIMARY_TO_SLUG: dict[str, str] = {
    "FOOD_AND_DRINK": "food_dining",
    "GENERAL_MERCHANDISE": "shopping",
    "RENT_AND_UTILITIES": "housing_utilities",
    "HOME_IMPROVEMENT": "housing_utilities",
    "TRANSPORTATION": "transportation",
    "GENERAL_SERVICES": "services_subscriptions",
    "GOVERNMENT_AND_NON_PROFIT": "services_subscriptions",
    "ENTERTAINMENT": "entertainment",
    "TRAVEL": "travel",
    "MEDICAL": "medical",
    "PERSONAL_CARE": "personal_care",
    "BANK_FEES": "fees_interest",
    "INCOME": "income",
    "TRANSFER_IN": "internal_transfer",
    "TRANSFER_OUT": "internal_transfer",
}

CC_ISSUER_PAYMENT_KEYWORDS: tuple[str, ...] = (
    "AMEX EPAYMENT",
    "AMERICAN EXPRESS",
    "CHASE CREDIT CRD",
    "PAYMENT THANK YOU",
    "AUTOPAY",
    "ONLINE PMT",
    "MOBILE PYMT",
    "CARDMEMBER SERV",
    "BILT",
    "BANK OF AMERICA CREDIT",
    "BA ELECTRONIC PAYMENT",
    "APPLECARD",
    "CITI CARD",
    "CAPITAL ONE",
    "DISCOVER",
    "CREDIT CARD",
)

LOAN_KEYWORDS: tuple[str, ...] = (
    "MORTGAGE",
    "AUTO LEASE",
    "AUTO FINANCE",
    "CHASE AUTO",
    "HOME LOAN",
)


@dataclass(slots=True)
class ClassifiedTxn:
    display_merchant: str
    category_slug: str
    tx_kind: str  # expense | income | cc_payment | loan_payment | internal_transfer | ignored
    matched_rule_id: int | None = None
    is_overridden: bool = False


def clean_default_merchant(merchant_name: str | None, name: str | None, description: str | None) -> str:
    raw = (merchant_name or name or description or "Unknown").strip()
    return " ".join(raw.split())


def match_merchant_rule(
    rules: Iterable[MerchantRule],
    merchant_name: str | None,
    name: str | None,
    description: str | None,
) -> MerchantRule | None:
    haystacks = [
        s.lower()
        for s in (merchant_name, name, description)
        if s and s.strip()
    ]
    if not haystacks:
        return None

    for rule in rules:
        if not rule.is_active:
            continue
        pat = (rule.match_pattern or "").strip().lower()
        if not pat:
            continue
        mtype = rule.match_type or "contains"
        for h in haystacks:
            if mtype == "exact" and h == pat:
                return rule
            if mtype == "starts_with" and h.startswith(pat):
                return rule
            if mtype == "contains" and pat in h:
                return rule
    return None


def classify_transaction(
    *,
    source: str,
    account_class: str | None,
    account_subtype: str | None,
    amount: Decimal,
    category_primary: str | None,
    category_detailed: str | None,
    merchant_name: str | None,
    name: str | None,
    description: str | None,
    override: TransactionOverride | None = None,
    rules: Iterable[MerchantRule] = (),
) -> ClassifiedTxn:
    base_merchant = clean_default_merchant(merchant_name, name, description)
    combined_upper = " ".join(
        part.upper() for part in (merchant_name, name, description, category_detailed) if part
    )
    primary = (category_primary or "").upper()
    subtype = (account_subtype or "").lower()

    # 1. Compute automatic baseline classification
    auto_kind = "expense"
    auto_cat = PLAID_PRIMARY_TO_SLUG.get(primary, "other_expense")

    if primary in ("TRANSFER_IN", "TRANSFER_OUT"):
        auto_kind = "internal_transfer"
        auto_cat = "internal_transfer"
    elif source == "liability" and subtype == "credit card":
        if amount > 0:
            # Distinguish credit card bill payment vs merchant refund/statement credit
            is_bill_pay = primary in ("LOAN_PAYMENTS", "TRANSFER_IN") or any(
                kw in combined_upper
                for kw in ("PAYMENT", "AUTOPAY", "THANK YOU", "ONLINE PMT", "PYMT", "EPAYMENT")
            )
            if is_bill_pay:
                auto_kind = "cc_payment"
                auto_cat = "cc_payment"
            else:
                # Merchant refund or card statement credit reduces spending in that category
                auto_kind = "expense"
                auto_cat = PLAID_PRIMARY_TO_SLUG.get(primary, "other_expense")
        elif amount == 0:
            auto_kind = "ignored"
            auto_cat = "other_expense"
        else:
            auto_kind = "expense"
            auto_cat = PLAID_PRIMARY_TO_SLUG.get(primary, "other_expense")
    elif source == "liability" and subtype in ("mortgage", "auto"):
        auto_kind = "loan_payment"
        auto_cat = "fixed_loans"
    elif source == "cash":
        if amount > 0:
            if primary == "LOAN_PAYMENTS":
                auto_kind = "internal_transfer"
                auto_cat = "internal_transfer"
            else:
                auto_kind = "income"
                auto_cat = "income"
        elif amount < 0:
            if primary == "LOAN_PAYMENTS":
                if any(kw in combined_upper for kw in LOAN_KEYWORDS) and not any(
                    kw in combined_upper for kw in ("AMEX", "CARDMEMBER", "CREDIT CRD", "BILT")
                ):
                    auto_kind = "loan_payment"
                    auto_cat = "fixed_loans"
                else:
                    # Checking paying off a credit card -> never double count!
                    auto_kind = "cc_payment"
                    auto_cat = "cc_payment"
            elif any(kw in combined_upper for kw in CC_ISSUER_PAYMENT_KEYWORDS):
                auto_kind = "cc_payment"
                auto_cat = "cc_payment"
            else:
                auto_kind = "expense"
                auto_cat = PLAID_PRIMARY_TO_SLUG.get(primary, "other_expense")

    # 2. Apply MerchantRule if matched
    matched_rule = match_merchant_rule(rules, merchant_name, name, description)
    rule_id: int | None = None
    if matched_rule is not None:
        rule_id = matched_rule.id
        if matched_rule.target_merchant:
            base_merchant = matched_rule.target_merchant
        if matched_rule.target_category_slug:
            auto_cat = matched_rule.target_category_slug
        if matched_rule.target_tx_kind:
            auto_kind = matched_rule.target_tx_kind

    # 3. Apply per-transaction manual override (highest precedence)
    if override is not None:
        final_merchant = override.custom_merchant or base_merchant
        final_cat = override.category_slug or auto_cat
        final_kind = override.tx_kind or auto_kind
        return ClassifiedTxn(
            display_merchant=final_merchant,
            category_slug=final_cat,
            tx_kind=final_kind,
            matched_rule_id=rule_id,
            is_overridden=True,
        )

    return ClassifiedTxn(
        display_merchant=base_merchant,
        category_slug=auto_cat,
        tx_kind=auto_kind,
        matched_rule_id=rule_id,
        is_overridden=False,
    )
