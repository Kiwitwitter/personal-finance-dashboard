import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Coins,
  Edit3,
  Layers,
  PieChart,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api, fmtMoney, fmtSignedMoney, institutionBadgeClass } from '../api';
import {
  AllocationMosaic,
  DivergingBarChart,
  DonutChart,
  Sparkline,
} from '../components/Charts';
import { ModalDialog } from '../components/ModalDialog';
import type { InvestmentsDashboard, ManualAssetItem } from '../types';

const BUCKET_COLORS: Record<string, string> = {
  '應稅個人美股 (Taxable Brokerage)': '#38bdf8',
  '應稅券商帳戶 (Taxable)': '#38bdf8',
  'Taxable Brokerage': '#38bdf8',
  'Roth IRA 免稅退休': '#10b981',
  'Roth IRA': '#10b981',
  'Traditional / Rollover IRA': '#6366f1',
  '加密資產 (Crypto)': '#f59e0b',
  'Crypto (自託管/現貨)': '#f59e0b',
  '貴金屬實物 (Gold)': '#eab308',
  'HSA 醫療免稅帳戶': '#14b8a6',
  '雇主股權激勵 (Stock Plan / RSU)': '#a855f7',
};

const FALLBACK_PALETTE = [
  '#38bdf8',
  '#f59e0b',
  '#10b981',
  '#eab308',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899',
];

export function InvestmentsView({
  onGlobalRefresh,
}: {
  onGlobalRefresh?: () => void;
}) {
  const holdingsCaptionId = useId();
  const [data, setData] = useState<InvestmentsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Manual Asset Add / Edit Modal State
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ManualAssetItem | null>(null);
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState('crypto');
  const [assetSymbol, setAssetSymbol] = useState('');
  const [assetQty, setAssetQty] = useState('');
  const [assetUnit, setAssetUnit] = useState('');
  const [assetCost, setAssetCost] = useState('');
  const [assetManualPrice, setAssetManualPrice] = useState('');
  const [assetIncludeNw, setAssetIncludeNw] = useState(true);
  const [assetNotes, setAssetNotes] = useState('');
  const [savingAsset, setSavingAsset] = useState(false);

  const loadPortfolio = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
    }
    try {
      const res = await api.getInvestments(force);
      setData(res);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPortfolio(false);
  }, [loadPortfolio]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void loadPortfolio(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadPortfolio]);

  const openCreateAsset = () => {
    setEditingAsset(null);
    setAssetName('');
    setAssetType('precious_metal');
    setAssetSymbol('GC=F');
    setAssetQty('1');
    setAssetUnit('oz');
    setAssetCost('');
    setAssetManualPrice('');
    setAssetIncludeNw(true);
    setAssetNotes('');
    setAssetModalOpen(true);
  };

  const openEditAsset = (item: ManualAssetItem) => {
    setEditingAsset(item);
    setAssetName(item.name);
    setAssetType(item.asset_type);
    setAssetSymbol(item.symbol ?? '');
    setAssetQty(String(item.quantity));
    setAssetUnit(item.unit);
    setAssetCost(item.cost_basis_total !== null ? String(item.cost_basis_total) : '');
    setAssetManualPrice(item.manual_unit_price !== null ? String(item.manual_unit_price) : '');
    setAssetIncludeNw(item.include_in_net_worth);
    setAssetNotes(item.notes ?? '');
    setAssetModalOpen(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAsset(true);
    try {
      const payload = {
        name: assetName.trim(),
        asset_type: assetType,
        symbol: assetSymbol.trim() || null,
        quantity: Number(assetQty),
        unit: assetUnit.trim() || 'unit',
        cost_basis_total: assetCost.trim() === '' ? null : Number(assetCost),
        manual_unit_price: assetManualPrice.trim() === '' ? null : Number(assetManualPrice),
        include_in_net_worth: assetIncludeNw,
        notes: assetNotes.trim() || null,
      };
      const updated = editingAsset
        ? await api.updateManualAsset(editingAsset.id, payload)
        : await api.createManualAsset(payload);
      setData(updated);
      setAssetModalOpen(false);
      onGlobalRefresh?.();
    } finally {
      setSavingAsset(false);
    }
  };

  const handleDeleteAsset = async (item: ManualAssetItem) => {
    const updated = await api.deleteManualAsset(item.id);
    setData(updated);
    setAssetModalOpen(false);
    onGlobalRefresh?.();
  };

  if (loading && !data) {
    return (
      <div className="py-16 text-center text-sm text-muted">
        正在获取实时行情并汇总 Charles Schwab、Fidelity、实物金条与 BTC 资产…
      </div>
    );
  }
  if (!data) return null;

  const bucketSlices = data.by_tax_bucket.map((b, idx) => {
    const matchedColor =
      Object.entries(BUCKET_COLORS).find(([k]) =>
        b.bucket.toLowerCase().includes(k.toLowerCase()),
      )?.[1] ??
      (b.bucket.includes('Crypto') || b.bucket.includes('加密') || b.bucket.includes('BTC')
        ? '#f59e0b'
        : b.bucket.includes('金') || b.bucket.includes('Gold')
          ? '#eab308'
          : FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]);
    return {
      label: b.bucket,
      value: b.value,
      color: matchedColor,
    };
  });

  const pnlItems = data.broad_positions
    .filter((p) => p.unrealized_gain !== null)
    .sort((a, b) => (b.unrealized_gain ?? 0) - (a.unrealized_gain ?? 0))
    .map((p) => ({
      label: p.ticker,
      sublabel: p.name,
      value: p.unrealized_gain ?? 0,
      pct: p.unrealized_gain_pct,
    }));

  const isDayPositive = data.total_day_change >= 0;
  const quoteTimeText = data.quotes_updated_at
    ? new Date(data.quotes_updated_at).toLocaleTimeString('zh-CN', {
        hour12: false,
        timeZone: 'America/Los_Angeles',
      })
    : '实时';

  return (
    <div className="space-y-6">
      {/* Live Market Pricing Bar */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            LIVE 实时行情引擎
          </span>
          <span className="text-muted">
            美股 · 黄金期货 (<code>GC=F</code>) · 比特币现货 (<code>BTC-USD</code>) 实时联动计价 · 最近刷新{' '}
            <strong className="tabular-nums text-[var(--text-primary)]">{quoteTimeText} PT</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            每 60s 自动拉取最新价
          </label>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => {
              void loadPortfolio(true);
              onGlobalRefresh?.();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '刷新报价中…' : '立即刷新实时价格'}
          </button>
        </div>
      </div>

      {/* Top Portfolio Summary + Tax Wrapper Donut Chart */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="surface-card flex flex-col justify-between rounded-2xl p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                全口径投资与实物资产总市值 ({data.accounts.length} 证券户 + {data.manual_assets.length} 另类资产)
              </span>
              <TrendingUp className="h-4 w-4 text-sky-400" />
            </div>
            <div className="money-val tabular-nums mt-2 text-3xl font-bold tracking-tight">
              {fmtMoney(data.total_portfolio_value)}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`money-val tabular-nums inline-flex items-center rounded-lg px-2 py-0.5 font-semibold ${
                  isDayPositive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                今日浮动 {fmtSignedMoney(data.total_day_change)} (
                {isDayPositive ? '+' : ''}
                {data.total_day_change_pct.toFixed(2)}%)
              </span>
              <span className="text-muted">
                券商 {fmtMoney(data.brokerage_portfolio_value, true)} + 金条/BTC{' '}
                {fmtMoney(data.manual_assets_value, true)}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-[var(--border-subtle)] pt-3.5">
            {data.by_institution.map((inst) => (
              <div key={inst.institution} className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted">{inst.institution}</span>
                  <span className="money-val tabular-nums font-semibold">
                    {fmtMoney(inst.value)}{' '}
                    <span className="text-[11px] text-muted">({inst.weight_pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                  <div
                    style={{ width: `${Math.min(inst.weight_pct, 100)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-amber-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax Bucket & Asset Class Donut Chart */}
        <div className="surface-card rounded-2xl p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span>账户税收属性与另类资产结构图 (Asset & Tax Allocation)</span>
            </div>
            <span className="text-[11px] text-muted">悬停扇区查看细分占比</span>
          </div>
          <DonutChart
            slices={bucketSlices}
            centerLabel="全组合市值"
            centerValue={fmtMoney(data.total_portfolio_value, true)}
          />
        </div>
      </div>

      {/* Alternative & Physical Assets Section */}
      <section className="surface-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4 text-amber-400" />
              <span>其他实物与数字资产（统一计入总资产 & 净值）</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              实物黄金与自托管加密货币按国际实时行情动态重估，与券商资产统一汇总
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateAsset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold hover:border-amber-400/60"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            新增其他资产
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.manual_assets.map((asset) => {
            const isUp = (asset.day_change_pct ?? 0) >= 0;
            const isGold = asset.asset_type === 'precious_metal';
            return (
              <article
                key={asset.id}
                className={`rounded-2xl border p-4 transition ${
                  isGold
                    ? 'border-yellow-500/35 bg-gradient-to-br from-yellow-500/10 via-transparent to-amber-500/5'
                    : 'border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/5'
                }`}
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold">{asset.name}</h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          asset.include_in_net_worth
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-slate-500/20 text-muted'
                        }`}
                      >
                        {asset.include_in_net_worth ? '已计入总资产' : '未计入净值'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      持有数量：
                      <strong className="tabular-nums text-[var(--text-primary)]">
                        {' '}
                        {asset.quantity} {asset.unit}
                      </strong>
                      {asset.symbol ? ` · 实时标的 ${asset.symbol}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditAsset(asset)}
                    aria-label={`编辑 ${asset.name}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-elevated)] hover:text-sky-400"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                </header>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-muted">实时折算总市值</div>
                    <div className="money-val tabular-nums text-2xl font-bold">
                      {fmtMoney(asset.market_value)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="money-val tabular-nums text-muted">
                        单价 {fmtMoney(asset.unit_price)}/{asset.unit}
                      </span>
                      {asset.day_change_pct !== null && (
                        <span
                          className={`tabular-nums font-semibold ${
                            isUp ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {asset.day_change_pct.toFixed(2)}% ({fmtSignedMoney(asset.day_change_value)})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <Sparkline points={asset.sparkline} positive={isUp} width={112} height={36} />
                    <span className="mt-1 text-[10px] text-muted">近 7 日实时价格走势</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Dual Chart Row: Allocation Treemap Mosaic + Unrealized PnL Diverging Bar Chart */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="surface-card rounded-2xl p-5 xl:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PieChart className="h-4 w-4 text-sky-400" />
                <span>全资产核心仓位权重与当日涨跌热力矩阵</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                面积按全组合市值权重缩放，色彩区分当日涨跌、黄金与 BTC 仓位
              </p>
            </div>
          </div>
          <AllocationMosaic items={data.broad_positions} />
        </div>

        <div className="surface-card rounded-2xl p-5 xl:col-span-5">
          <div className="mb-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <span>个股与标的未实现盈亏分布 (Unrealized PnL)</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              基于实时最新价对比券商持仓成本基准计算浮动盈亏
            </p>
          </div>
          <DivergingBarChart items={pnlItems} />
        </div>
      </div>

      {/* Consolidated Holdings & Account Breakdown */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <PieChart className="h-4 w-4 text-sky-400" />
              跨券商合并证券持仓明细（份额快照：{data.holdings_snapshot_date ?? '最新'} · 价格：实时）
            </h3>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={holdingsCaptionId}
            className="table-wrapper"
          >
            <table
              className="fin-table"
              style={
                {
                  '--label-2': '"数量"',
                  '--label-3': '"实时现价 / 1D"',
                  '--label-4': '"7日走势"',
                  '--label-5': '"实时市值"',
                  '--label-6': '"浮动盈亏"',
                  '--label-7': '"证券权重"',
                } as React.CSSProperties
              }
            >
              <caption id={holdingsCaptionId} className="sr-only">
                跨券商合并实时证券持仓表
              </caption>
              <thead>
                <tr>
                  <th>代码 / 标的名称</th>
                  <th className="text-right">总股数</th>
                  <th className="text-right">实时现价 / 1D</th>
                  <th className="text-center">7日走势</th>
                  <th className="text-right">总市值</th>
                  <th className="text-right">未实现盈亏</th>
                  <th className="text-right">证券内权重</th>
                </tr>
              </thead>
              <tbody>
                {data.consolidated_positions.map((pos) => {
                  const isUp = (pos.day_change_pct ?? 0) >= 0;
                  return (
                    <tr key={pos.ticker}>
                      <th>
                        <div className="font-semibold text-sky-400">{pos.ticker}</div>
                        <div className="max-w-[210px] truncate text-[11px] font-normal text-muted">
                          {pos.security_name}
                        </div>
                      </th>
                      <td className="tabular-nums text-right text-xs">
                        {pos.total_quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </td>
                      <td className="tabular-nums text-right text-xs">
                        <div className="money-val font-semibold">{fmtMoney(pos.price)}</div>
                        {pos.day_change_pct !== null && (
                          <div
                            className={`text-[11px] font-medium ${
                              isUp ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isUp ? '+' : ''}
                            {pos.day_change_pct.toFixed(2)}%
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <Sparkline points={pos.sparkline} positive={isUp} width={76} height={24} />
                      </td>
                      <td className="money-val tabular-nums text-right font-semibold">
                        <div>{fmtMoney(pos.total_value)}</div>
                        {pos.day_change_value !== 0 && (
                          <div
                            className={`text-[11px] font-normal ${
                              pos.day_change_value >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {fmtSignedMoney(pos.day_change_value)}
                          </div>
                        )}
                      </td>
                      <td className="money-val tabular-nums text-right text-xs">
                        {pos.unrealized_gain !== null ? (
                          <span
                            className={
                              pos.unrealized_gain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {fmtSignedMoney(pos.unrealized_gain)}
                            {pos.unrealized_gain_pct !== null
                              ? ` (${pos.unrealized_gain_pct >= 0 ? '+' : ''}${pos.unrealized_gain_pct}%)`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="tabular-nums text-right text-xs font-medium">
                        {pos.weight_pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Investment Accounts List */}
        <div className="surface-card h-fit rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4 text-emerald-400" />
            <span>{data.accounts.length} 个证券账户实时净值分布</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {data.accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-xl bg-[var(--surface-elevated)] px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="truncate font-medium">{acc.display_name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <span
                      className={`rounded border px-1.5 py-0.2 text-[10px] ${institutionBadgeClass(
                        acc.institution_name,
                      )}`}
                    >
                      {acc.institution_name}
                    </span>
                    <span className="truncate">{acc.tax_bucket}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="money-val tabular-nums font-semibold">
                    {fmtMoney(acc.current_balance)}
                  </div>
                  <div className="tabular-nums text-[11px] text-muted">
                    {acc.weight_pct}%
                    {acc.live_delta !== undefined && Math.abs(acc.live_delta) >= 1 && (
                      <span
                        className={`ml-1 ${
                          acc.live_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ({acc.live_delta >= 0 ? '+' : ''}
                        {fmtMoney(acc.live_delta, true)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Investment Transactions */}
      <div className="surface-card rounded-2xl p-5">
        <h3 className="text-sm font-semibold">近期券商成交、分红与资金划转记录</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.recent_transactions.slice(0, 16).map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-xl bg-[var(--surface-elevated)] px-3.5 py-2.5 text-xs"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-400">
                    {tx.type}
                  </span>
                  <span className="font-semibold">{tx.ticker}</span>
                  <span className="truncate text-muted">{tx.security_name ?? ''}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {tx.date} · {tx.account_name}
                  {tx.quantity ? ` · ${tx.quantity} 股` : ''}
                </div>
              </div>
              <div
                className={`money-val tabular-nums font-semibold ${
                  tx.amount >= 0 ? 'text-emerald-400' : ''
                }`}
              >
                {fmtSignedMoney(tx.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit Manual Asset Modal */}
      <ModalDialog
        open={assetModalOpen}
        title={editingAsset ? `编辑资产：${editingAsset.name}` : '新增其他实物或数字资产'}
        subtitle="保存在 app.manual_assets，支持绑定 Yahoo / 现货代码自动实时计价并计入总资产"
        onClose={() => setAssetModalOpen(false)}
      >
        <form onSubmit={handleSaveAsset} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ma-name" className="block text-xs font-medium text-muted">
                资产名称
              </label>
              <input
                id="ma-name"
                type="text"
                required
                autoFocus
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="例如：实物金条 / 比特币冷钱包"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ma-type" className="block text-xs font-medium text-muted">
                资产大类
              </label>
              <select
                id="ma-type"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              >
                <option value="precious_metal">贵金属实物 (Gold / Silver)</option>
                <option value="crypto">加密货币 (BTC / ETH / SOL)</option>
                <option value="real_estate">房产不动产</option>
                <option value="collectible">藏品 / 手表 / 其他硬资产</option>
                <option value="other">其他资产</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ma-qty" className="block text-xs font-medium text-muted">
                持有数量
              </label>
              <input
                id="ma-qty"
                type="number"
                step="any"
                required
                value={assetQty}
                onChange={(e) => setAssetQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ma-unit" className="block text-xs font-medium text-muted">
                单位
              </label>
              <input
                id="ma-unit"
                type="text"
                required
                value={assetUnit}
                onChange={(e) => setAssetUnit(e.target.value)}
                placeholder="oz / BTC / 枚"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ma-symbol" className="block text-xs font-medium text-muted">
                实时行情代码 (可选)
              </label>
              <input
                id="ma-symbol"
                type="text"
                value={assetSymbol}
                onChange={(e) => setAssetSymbol(e.target.value)}
                placeholder="GC=F / BTC-USD / ETH-USD"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ma-cost" className="block text-xs font-medium text-muted">
                总购入成本 USD (可选，用于计算浮盈)
              </label>
              <input
                id="ma-cost"
                type="number"
                step="any"
                value={assetCost}
                onChange={(e) => setAssetCost(e.target.value)}
                placeholder="留空则仅展示市值"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ma-manual-price" className="block text-xs font-medium text-muted">
                手动指定单价 USD (无行情代码时使用)
              </label>
              <input
                id="ma-manual-price"
                type="number"
                step="any"
                value={assetManualPrice}
                onChange={(e) => setAssetManualPrice(e.target.value)}
                placeholder="有行情代码时留空即可自动拉取"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ma-notes" className="block text-xs font-medium text-muted">
              存放位置或备注
            </label>
            <input
              id="ma-notes"
              type="text"
              value={assetNotes}
              onChange={(e) => setAssetNotes(e.target.value)}
              placeholder="例如：Costco 1oz x 3 金条 / 硬件钱包冷存储"
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={assetIncludeNw}
              onChange={(e) => setAssetIncludeNw(e.target.checked)}
            />
            统一计入个人总资产 (Total Assets) 与净资产 (Net Worth)
          </label>

          <div className="flex items-center justify-between pt-2">
            {editingAsset ? (
              <button
                type="button"
                onClick={() => void handleDeleteAsset(editingAsset)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除资产
              </button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssetModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingAsset}
                className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {savingAsset ? '保存中…' : '保存并刷新估值'}
              </button>
            </div>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
