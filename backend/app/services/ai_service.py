from __future__ import annotations

import json
from typing import Any

import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.app_models import AiDigest
from app.services.finance_service import (
    get_budget_dashboard,
    get_credit_cards_dashboard,
    get_investments_dashboard,
    get_overview_dashboard,
)


async def get_ai_status(db: AsyncSession) -> dict[str, Any]:
    settings = get_settings()
    latest = (
        await db.execute(select(AiDigest).order_by(desc(AiDigest.created_at)).limit(1))
    ).scalar_one_or_none()
    return {
        "enabled": settings.gemini_enabled,
        "provider": settings.ai_provider_label,
        "model": settings.gemini_model,
        "latest_digest": {
            "period_key": latest.period_key,
            "summary_markdown": latest.summary_markdown,
            "model_name": latest.model_name,
            "created_at": latest.created_at.isoformat(),
        }
        if latest
        else None,
    }


async def _call_cliproxy_chat(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> tuple[str, str]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    candidates = [model]
    if model == "gemini-3.8-flash-high":
        candidates.append("gemini-3.8-flash-tiered")
    elif model == "gemini-3.8-flash":
        candidates = ["gemini-3.8-flash-high", "gemini-3.8-flash-tiered"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_error = ""
    async with httpx.AsyncClient(timeout=90.0) as client:
        for candidate in candidates:
            payload = {
                "model": candidate,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
            }
            resp = await client.post(endpoint, headers=headers, json=payload)
            if resp.status_code == 200:
                body = resp.json()
                choices = body.get("choices") or []
                if choices:
                    content = (choices[0].get("message") or {}).get("content") or ""
                    if content.strip():
                        return content.strip(), body.get("model") or candidate
            last_error = f"HTTP {resp.status_code}: {resp.text[:300]}"

    raise RuntimeError(f"CLIProxyAPI 调用失败 ({last_error})")


async def ask_financial_copilot(
    db: AsyncSession, question: str, year_month: str | None = None
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.gemini_enabled:
        return {
            "enabled": False,
            "answer": (
                "当前未配置 `AI_API_KEY` / `GEMINI_API_KEY` 环境变量。\n\n"
                "当你在容器环境变量中配置 `AI_API_BASE_URL` 与 `AI_API_KEY`（CLIProxyAPI）后，"
                "即可在此直接进行自然语言财务诊断、信用卡积分优化与全资产分析。"
            ),
        }

    overview = await get_overview_dashboard(db)
    budget = await get_budget_dashboard(db, year_month)
    cards = await get_credit_cards_dashboard(db)
    investments = await get_investments_dashboard(db)

    context_payload = {
        "net_worth": overview["net_worth"],
        "asset_allocation": overview.get("asset_allocation", []),
        "manual_assets": investments.get("manual_assets", []),
        "credit_cards_summary": cards["summary"],
        "credit_card_issuer_groups": [
            {
                "institution_name": g["institution_name"],
                "card_count": g["card_count"],
                "total_balance": g["total_balance"],
                "utilization_pct": g["utilization_pct"],
                "month_spend": g["month_spend"],
                "year_points_earned": g.get("year_points_earned", 0),
            }
            for g in cards.get("issuer_groups", [])
        ],
        "cards_detail": [
            {
                "display_name": c["display_name"],
                "institution_name": c["institution_name"],
                "current_balance": c["current_balance"],
                "effective_limit": c["effective_limit"],
                "utilization_pct": c["utilization_pct"],
                "next_due_date": c["next_due_date"],
                "days_until_due": c["days_until_due"],
                "points_program_name": c.get("points_program_name"),
                "year_points_earned": c.get("year_points_earned"),
            }
            for c in cards["cards"]
        ],
        "rewards_summary": cards.get("rewards_summary"),
        "reward_programs": cards.get("reward_programs", []),
        "budget_month": budget["year_month"],
        "month_elapsed_pct": budget["month_elapsed_pct"],
        "budget_summary": budget["summary"],
        "budget_categories": budget["categories"],
        "subscriptions": budget["subscriptions"][:12],
        "investments_by_bucket": investments["by_tax_bucket"],
        "broad_positions": investments.get("broad_positions", [])[:15],
    }

    system_prompt = (
        "你是用户的私人首席财务官（CFO）。请严格基于提供的实时 PostgreSQL 账本与实时市场估值数据，"
        "用简洁、准确、条理清晰的中文 Markdown 回答问题。分析时请综合考虑：券商证券持仓、实物贵金属与加密资产等其他资产、"
        "各发卡行信用卡的使用率/现金覆盖率/积分价值（UR/MR/Bilt/Atmos/Hilton 等），"
        "以及当月预算消耗节奏（Burn Rate）与周期性订阅。"
    )
    user_prompt = (
        f"实时财务上下文 JSON:\n```json\n{json.dumps(context_payload, ensure_ascii=False)}\n```\n\n"
        f"用户问题：{question}"
    )

    used_model = settings.gemini_model
    if settings.ai_api_base_url.strip():
        text_ans, used_model = await _call_cliproxy_chat(
            base_url=settings.ai_api_base_url,
            api_key=settings.effective_ai_key,
            model=settings.gemini_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
    else:
        from google import genai

        client = genai.Client(api_key=settings.effective_ai_key)
        resp = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=f"{system_prompt}\n\n{user_prompt}",
        )
        text_ans = resp.text or "未能生成分析结果。"

    digest = AiDigest(
        scope="copilot_qa",
        period_key=budget["year_month"],
        summary_markdown=text_ans,
        highlights_json={"question": question, "provider": settings.ai_provider_label},
        model_name=used_model,
    )
    db.add(digest)
    await db.commit()

    return {
        "enabled": True,
        "provider": settings.ai_provider_label,
        "model": used_model,
        "answer": text_ans,
    }
