from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from app.core.config import get_settings


@dataclass
class LiveQuote:
    symbol: str
    price: float
    prev_close: float | None
    change: float | None
    change_pct: float | None
    sparkline: list[float]
    updated_at: str
    source: str


_QUOTE_CACHE: dict[str, tuple[float, LiveQuote]] = {}
_CACHE_TTL_SECONDS = 30.0

_SYMBOL_ALIASES: dict[str, str] = {
    "BTC": "BTC-USD",
    "XBT": "BTC-USD",
    "ETH": "ETH-USD",
    "SOL": "SOL-USD",
    "GOLD": "GC=F",
    "XAU": "GC=F",
    "XAUUSD": "GC=F",
    "SILVER": "SI=F",
    "XAG": "SI=F",
}


def normalize_market_symbol(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = raw.strip().upper()
    if not cleaned or cleaned.startswith("CUR:"):
        return None
    return _SYMBOL_ALIASES.get(cleaned, cleaned)


async def _fetch_yahoo_quote(client: httpx.AsyncClient, symbol: str, tz_info: Any) -> LiveQuote | None:
    for host in ("query2.finance.yahoo.com", "query1.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{symbol}?interval=1d&range=7d"
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                continue
            payload = resp.json()
            results = payload.get("chart", {}).get("result")
            if not results:
                continue
            res0 = results[0]
            meta = res0.get("meta", {})
            price_raw = meta.get("regularMarketPrice")
            if price_raw is None:
                continue
            price = round(float(price_raw), 4)
            closes_raw = (
                res0.get("indicators", {})
                .get("quote", [{}])[0]
                .get("close", [])
            )
            sparkline = [round(float(x), 4) for x in closes_raw if x is not None]
            if not sparkline or abs(sparkline[-1] - price) > 0.01:
                sparkline.append(price)

            if len(sparkline) >= 2:
                prev_close = sparkline[-2]
            else:
                prev_raw = meta.get("previousClose") or meta.get("chartPreviousClose")
                prev_close = round(float(prev_raw), 4) if prev_raw else None

            sparkline = [round(x, 2) for x in sparkline[-7:]]

            change = round(price - prev_close, 4) if prev_close else None
            change_pct = (
                round((price - prev_close) / prev_close * 100.0, 2)
                if (prev_close and prev_close > 0)
                else None
            )
            mkt_ts = meta.get("regularMarketTime")
            if mkt_ts:
                updated_iso = datetime.fromtimestamp(int(mkt_ts), tz=tz_info).isoformat()
            else:
                updated_iso = datetime.now(tz_info).isoformat()

            return LiveQuote(
                symbol=symbol,
                price=price,
                prev_close=prev_close,
                change=change,
                change_pct=change_pct,
                sparkline=sparkline,
                updated_at=updated_iso,
                source="yahoo_live",
            )
        except Exception:
            continue
    return None


async def _fetch_coinbase_fallback(
    client: httpx.AsyncClient, symbol: str, tz_info: Any
) -> LiveQuote | None:
    pair_map = {
        "BTC-USD": "BTC-USD",
        "ETH-USD": "ETH-USD",
        "SOL-USD": "SOL-USD",
        "GC=F": "PAXG-USD",
    }
    pair = pair_map.get(symbol)
    if not pair:
        return None
    try:
        resp = await client.get(f"https://api.coinbase.com/v2/prices/{pair}/spot")
        if resp.status_code != 200:
            return None
        amt = float(resp.json()["data"]["amount"])
        return LiveQuote(
            symbol=symbol,
            price=round(amt, 4),
            prev_close=None,
            change=None,
            change_pct=None,
            sparkline=[round(amt, 2)],
            updated_at=datetime.now(tz_info).isoformat(),
            source="coinbase_spot",
        )
    except Exception:
        return None


async def get_live_quotes(
    symbols: list[str], force_refresh: bool = False
) -> dict[str, LiveQuote]:
    settings = get_settings()
    tz_info = settings.tz
    now_mono = time.monotonic()

    normalized_map: dict[str, str] = {}
    to_fetch: set[str] = set()
    out: dict[str, LiveQuote] = {}

    for raw in symbols:
        norm = normalize_market_symbol(raw)
        if not norm:
            continue
        normalized_map[raw] = norm
        cached = _QUOTE_CACHE.get(norm)
        if not force_refresh and cached and (now_mono - cached[0]) < _CACHE_TTL_SECONDS:
            out[raw] = cached[1]
            out[norm] = cached[1]
        else:
            to_fetch.add(norm)

    if to_fetch:
        sem = asyncio.Semaphore(4)
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:

            async def _resolve_one(sym: str) -> tuple[str, LiveQuote | None]:
                async with sem:
                    q = await _fetch_yahoo_quote(client, sym, tz_info)
                    if q is None:
                        q = await _fetch_coinbase_fallback(client, sym, tz_info)
                    return sym, q

            fetched = await asyncio.gather(*(_resolve_one(s) for s in sorted(to_fetch)))
            fetch_ts = time.monotonic()
            for sym, quote in fetched:
                if quote is not None:
                    _QUOTE_CACHE[sym] = (fetch_ts, quote)
                elif sym in _QUOTE_CACHE:
                    # Stale-if-error fallback
                    quote = _QUOTE_CACHE[sym][1]
                if quote is not None:
                    out[sym] = quote

        for raw, norm in normalized_map.items():
            if norm in out:
                out[raw] = out[norm]

    return out
