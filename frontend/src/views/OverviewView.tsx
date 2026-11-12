import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Coins,
  CreditCard,
  Edit3,
  Landmark,
  PieChart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api, fmtMoney, fmtSignedMoney, institutionBadgeClass } from '../api';
import { AreaTrendChart, DonutChart, Sparkline } from '../components/Charts';
import { CreditCardArt } from '../components/CreditCardArt';
import { ModalDialog } from '../components/ModalDialog';
import type { AccountItem, OverviewDashboard } from '../types';

interface Props {
  data: OverviewDashboard;
  onNavigate: (tab: 'overview' | 'cards' | 'budget' | 'transactions' | 'investments') => void;
  onRefresh: (force?: boolean) => void;
}

export function OverviewView({ data, onNavigate, onRefresh }: Props) {
  const { net_worth: nw, sync, credit_cards_pulse: cc, budget_pulse: bp, cashflow_trend } = data;
  const [editingAccount, setEditingAccount] = useState<AccountItem | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [includeNw, setIncludeNw] = useState(true);
  const [saving, setSaving] = useState(false);

  const openEditAccount = (acc: AccountItem) => {
    setEditingAccount(acc);
    setRenameVal(acc.custom_display_name ?? acc.display_name);
    setIncludeNw(acc.include_in_net_worth);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      await api.patchAccount(editingAccount.id, {
        display_name: renameVal,
        include_in_net_worth: includeNw,
      });
      setEditingAccount(null);
      onRefresh(false);
    } finally {
      setSaving(false);
    }
  };

  const maxBar = Math.max(
    1,
    ...cashflow_trend.map((p) => Math.max(p.income, p.living_expense + p.fixed_loans)),
  );

  const cashAccounts = data.accounts.filter((a) => a.class === 'cash');
  const invAccounts = data.accounts.filter((a) => a.class === 'investment');
  const loanAccounts = data.accounts.filter(
    (a) => a.class === 'liability' && a.subtype !== 'credit card',
  );

  const assetTotal = Math.max(nw.total_assets, 1);
  const cashPct = Math.round((nw.cash_total / assetTotal) * 100);
  const altPct = Math.round(((nw.alternative_total ?? 0) / assetTotal) * 100);
  const invPct = Math.max(0, 100 - cashPct - altPct);

  const allocationSlices =
    data.asset_allocation && data.asset_allocation.length > 0
      ? data.asset_allocation
      : [
          { label: '券商证券资产', value: nw.investment_total, color: '#38bdf8' },
          { label: '比特币 (BTC)', value: nw.crypto_total ?? 0, color: '#f59e0b' },
          { label: '实物金条 (Gold)', value: nw.gold_total ?? 0, color: '#eab308' },
          { label: '流动现金存款', value: nw.cash_total, color: '#10b981' },
        ];

  const dayChg = nw.portfolio_day_change ?? 0;
  const dayChgPct = nw.portfolio_day_change_pct ?? 0;
  const rewardsUsd = nw.rewards_estimated_usd ?? data.rewards_pulse?.total_estimated_value_usd ?? 0;

  return (
    <div className="space-y-6">
      {/* Sync Health & Live Quote Strip */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
              sync.status === 'ok' && !sync.is_stale
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Plaid 同步 {sync.status.toUpperCase()}
          </span>
          <span className="text-muted">
            最近同步：{sync.hours_since_sync !== null ? `${sync.hours_since_sync} 小时前` : '刚刚'} · 流水截至{' '}
            <strong className="text-[var(--text-primary)]">{sync.txn_date_to ?? '最新'}</strong> · 时区{' '}
            <code className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5">{data.timezone}</code>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {sync.institutions.map((inst) => (
            <span
              key={inst.id}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${institutionBadgeClass(inst.name)}`}
            >
              {inst.name}
            </span>
          ))}
          <button
            type="button"
            onClick={() => onRefresh(true)}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-400 hover:bg-sky-500/20"
          >
            <RefreshCw className="h-3 w-3" />
            实时刷新市值
          </button>
        </div>
      </div>

      {/* Top Hero KPI Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('investments')}
          className="surface-card group rounded-2xl p-5 text-left transition hover:border-sky-500/50"
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>全口径总资产 & 净值</span>
            <TrendingUp className="h-4 w-4 text-sky-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold tracking-tight">
            {fmtMoney(nw.total_assets)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className="text-muted">
              净资产 <strong className="money-val text-[var(--text-primary)]">{fmtMoney(nw.net_worth)}</strong>
            </span>
            <span
              className={`money-val tabular-nums font-semibold ${
                dayChg >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              1D {fmtSignedMoney(dayChg)} ({dayChg >= 0 ? '+' : ''}
              {dayChgPct.toFixed(2)}%)
            </span>
          </div>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
            <div style={{ width: `${invPct}%` }} className="bg-sky-500" title={`证券投资 ${invPct}%`} />
            <div style={{ width: `${altPct}%` }} className="bg-amber-400" title={`金条与BTC ${altPct}%`} />
            <div style={{ width: `${cashPct}%` }} className="bg-emerald-400" title={`现金 ${cashPct}%`} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>证券 {fmtMoney(nw.investment_total, true)}</span>
            <span>金条+BTC {fmtMoney(nw.alternative_total ?? 0, true)}</span>
            <span>现金 {fmtMoney(nw.cash_total, true)}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('cards')}
          className="surface-card group rounded-2xl p-5 text-left transition hover:border-sky-500/50"
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>信用卡欠款 & 积分估值 ({cc.card_count} 张)</span>
            <CreditCard className="h-4 w-4 text-amber-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold tracking-tight">
            {fmtMoney(cc.total_balance)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">
              总使用率{' '}
              <strong
                className={
                  cc.overall_utilization_pct >= 30
                    ? 'text-rose-400'
                    : cc.overall_utilization_pct >= 10
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }
              >
                {cc.overall_utilization_pct}%
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-400">
              <Award className="h-3.5 w-3.5" />
              积分估值 ≈ {fmtMoney(rewardsUsd, true)}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
            <div
              style={{ width: `${Math.min(cc.overall_utilization_pct, 100)}%` }}
              className={`h-full ${
                cc.overall_utilization_pct >= 30
                  ? 'bg-rose-500'
                  : cc.overall_utilization_pct >= 10
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>总授信 {fmtMoney(cc.total_revolving_limit, true)}</span>
            <span className="text-sky-400 group-hover:underline">按银行分组 & 积分 →</span>
          </div>
        </button>

        <div className="surface-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>流动现金覆盖垫 (Cash Coverage)</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold tracking-tight">
            {fmtMoney(cc.liquid_cash_available)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">扣减全额卡账后净现金</span>
            <strong
              className={`money-val tabular-nums ${
                cc.net_cash_after_all_cards >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fmtMoney(cc.net_cash_after_all_cards)}
            </strong>
          </div>
          <div className="mt-3 rounded-lg bg-[var(--surface-elevated)] px-3 py-1.5 text-[11px] text-muted">
            覆盖倍数 <strong className="text-[var(--text-primary)]">{cc.cash_coverage_ratio}x</strong> ·
            房贷+车贷余额 <span className="money-val">{fmtMoney(nw.loan_debt, true)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('budget')}
          className="surface-card group rounded-2xl p-5 text-left transition hover:border-sky-500/50"
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>{bp.year_month} 月度预算进度</span>
            <Activity className="h-4 w-4 text-violet-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold tracking-tight">
            {fmtMoney(bp.total_living_spent)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">
              预算已用 <strong>{bp.budget_used_pct}%</strong> (时间过 {bp.month_elapsed_pct}%)
            </span>
            <span className="text-sky-400 group-hover:underline">详情 →</span>
          </div>
          <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
            <div
              style={{ width: `${Math.min(bp.budget_used_pct, 100)}%` }}
              className={`h-full ${
                bp.budget_used_pct > 100
                  ? 'bg-rose-500'
                  : bp.budget_used_pct > bp.month_elapsed_pct + 12
                    ? 'bg-amber-400'
                    : 'bg-violet-500'
              }`}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>总预算 {fmtMoney(bp.total_budgeted, true)}</span>
            <span>已排除信用卡还款 {fmtMoney(bp.cc_payments_excluded, true)}</span>
          </div>
        </button>
      </div>

      {/* Alternative Hard Assets Live Ticker Strip */}
      {data.manual_assets && data.manual_assets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.manual_assets.map((asset) => {
            const isUp = (asset.day_change_pct ?? 0) >= 0;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onNavigate('investments')}
                className="surface-card flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 text-left transition hover:border-amber-400/50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-400" />
                    <span className="font-semibold text-sm">{asset.name}</span>
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                      {asset.quantity} {asset.unit} · 计入总资产
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="money-val tabular-nums">
                      实时单价 {fmtMoney(asset.unit_price)}/{asset.unit}
                    </span>
                    {asset.day_change_pct !== null && (
                      <span
                        className={`tabular-nums font-medium ${
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {asset.day_change_pct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Sparkline points={asset.sparkline} positive={isUp} width={88} height={28} />
                  <div className="text-right">
                    <div className="money-val tabular-nums text-lg font-bold">
                      {fmtMoney(asset.market_value)}
                    </div>
                    <div className="text-[11px] text-sky-400">管理资产 →</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Charts Row 1: Asset Allocation Donut + Total Assets / Net Worth Area Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="surface-card rounded-2xl p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PieChart className="h-4 w-4 text-sky-400" />
                <span>全口径大类资产配置图</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                证券股票 · 加密资产 · 实物贵金属 · 流动现金
              </p>
            </div>
          </div>
          <DonutChart
            slices={allocationSlices}
            centerLabel="总资产"
            centerValue={fmtMoney(nw.total_assets, true)}
          />
        </div>

        <div className="surface-card rounded-2xl p-5 lg:col-span-7">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span>历史总资产与净资产演进曲线</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                基于账户快照叠加实时美股、黄金与 BTC 最新估值
              </p>
            </div>
          </div>
          <AreaTrendChart
            data={data.net_worth_history as unknown as Record<string, unknown>[]}
            valueKey="total_assets"
            secondaryKey="net_worth"
            primaryLabel="总资产"
            secondaryLabel="净资产"
            primaryColor="#38bdf8"
            secondaryColor="#10b981"
          />
        </div>
      </div>

      {/* Charts Row 2: 6-Month Cashflow Chart + Upcoming Credit Card Bills with Card Art */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="surface-card rounded-2xl p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">近 6 个月真实收支与净储蓄柱状图</h3>
              <p className="text-xs text-muted">
                自动剔除信用卡还款内部转账，区分日常消费与房贷/车贷固定支出
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> 收入
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> 日常支出
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" /> 房贷/车贷
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-6 gap-3 pt-2">
            {cashflow_trend.map((pt) => {
              const incH = Math.max(4, Math.round((pt.income / maxBar) * 150));
              const expH = Math.max(
                4,
                Math.round(((pt.living_expense + pt.fixed_loans) / maxBar) * 150),
              );
              const loanRatio =
                pt.living_expense + pt.fixed_loans > 0
                  ? (pt.fixed_loans / (pt.living_expense + pt.fixed_loans)) * 100
                  : 0;
              return (
                <div key={pt.year_month} className="flex flex-col items-center">
                  <div className="flex h-40 w-full items-end justify-center gap-1.5 border-b border-[var(--border-subtle)] pb-1">
                    <div
                      style={{ height: `${incH}px` }}
                      title={`收入: ${fmtMoney(pt.income)}`}
                      className="w-4 rounded-t bg-emerald-500/85 transition-all hover:bg-emerald-400 sm:w-5"
                    />
                    <div
                      style={{ height: `${expH}px` }}
                      title={`日常支出: ${fmtMoney(pt.living_expense)} | 房贷车贷: ${fmtMoney(pt.fixed_loans)}`}
                      className="flex w-4 flex-col overflow-hidden rounded-t bg-sky-500/85 sm:w-5"
                    >
                      <div
                        style={{ height: `${loanRatio}%` }}
                        className="w-full bg-indigo-400"
                      />
                    </div>
                  </div>
                  <span className="mt-2 text-xs font-medium">{pt.year_month.slice(5)}月</span>
                  <span
                    className={`money-val tabular-nums text-[11px] font-medium ${
                      pt.net_cashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {pt.net_cashflow >= 0 ? '+' : ''}
                    {fmtMoney(pt.net_cashflow, true)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Credit Card Dues with Card Art Thumbnails */}
        <div className="surface-card flex flex-col justify-between rounded-2xl p-5">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">待还信用卡账单优先队列</h3>
              <button
                type="button"
                onClick={() => onNavigate('cards')}
                className="text-xs text-sky-400 hover:underline"
              >
                全部 {cc.card_count} 张 →
              </button>
            </div>
            <p className="mt-0.5 text-xs text-muted">按距离还款日紧迫度与当前欠款排序</p>

            <div className="mt-4 space-y-2.5">
              {data.upcoming_cards.map((c) => (
                <div
                  key={c.account_id}
                  className="flex items-center justify-between gap-2.5 rounded-xl bg-[var(--surface-elevated)] px-3 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CreditCardArt
                      institutionName={c.institution_name}
                      displayName={c.display_name}
                      rawName={c.raw_name}
                      officialName={c.official_name}
                      mask={c.mask}
                      skin={c.effective_skin ?? c.card_skin}
                      imageUrl={c.card_image_url}
                      compact
                      className="w-12 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.display_name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        {c.next_due_date ? (
                          <span
                            className={
                              c.days_until_due !== null && c.days_until_due <= 7
                                ? 'font-semibold text-amber-400'
                                : ''
                            }
                          >
                            {c.days_until_due === 0
                              ? '今日到期'
                              : `${c.days_until_due} 天后 (${c.next_due_date.slice(5)})`}
                            {c.due_date_is_inferred ? ' · 推算' : ''}
                          </span>
                        ) : (
                          <span>点击设置还款日</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="money-val tabular-nums font-semibold">
                      {fmtMoney(c.current_balance)}
                    </div>
                    {c.utilization_pct !== null ? (
                      <div className="text-[11px] text-muted">使用率 {c.utilization_pct}%</div>
                    ) : (
                      <div className="text-[11px] text-sky-400">签账卡</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* All 30 Accounts Overview Grid (with inline rename support!) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AccountGroupCard
          title="现金与支票账户 (Cash)"
          icon={<Wallet className="h-4 w-4 text-emerald-400" />}
          total={nw.cash_total}
          accounts={cashAccounts}
          onEdit={openEditAccount}
        />
        <AccountGroupCard
          title="券商与退休投资 (Investments · 实时)"
          icon={<ArrowUpRight className="h-4 w-4 text-sky-400" />}
          total={nw.investment_total}
          accounts={invAccounts}
          onEdit={openEditAccount}
        />
        <AccountGroupCard
          title="长期贷款负债 (Loans)"
          icon={<Landmark className="h-4 w-4 text-rose-400" />}
          total={nw.loan_debt}
          accounts={loanAccounts}
          isLiability
          onEdit={openEditAccount}
        />
      </div>

      <ModalDialog
        open={Boolean(editingAccount)}
        title="自定义账户名称与净值计入规则"
        subtitle="保存在 app.account_preferences，不会被每 6 小时同步覆盖"
        onClose={() => setEditingAccount(null)}
      >
        {editingAccount && (
          <form onSubmit={handleSaveAccount} className="space-y-4">
            <div>
              <label htmlFor="acc-rename-input" className="block text-xs font-medium text-muted">
                显示别名（原名：{editingAccount.raw_name}{' '}
                {editingAccount.mask ? `•••• ${editingAccount.mask}` : ''}）
              </label>
              <input
                id="acc-rename-input"
                type="text"
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                placeholder="例如：Chase 主力支票 / Schwab 个人美股"
                className="mt-1.5 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={includeNw}
                onChange={(e) => setIncludeNw(e.target.checked)}
              />
              计入个人总净值 (Net Worth) 计算
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存设置'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}

function AccountGroupCard({
  title,
  icon,
  total,
  accounts,
  isLiability = false,
  onEdit,
}: {
  title: string;
  icon: React.ReactNode;
  total: number;
  accounts: AccountItem[];
  isLiability?: boolean;
  onEdit: (acc: AccountItem) => void;
}) {
  return (
    <div className="surface-card rounded-2xl p-5">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          <span>{title}</span>
        </div>
        <span
          className={`money-val tabular-nums text-sm font-bold ${
            isLiability ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {fmtMoney(total)}
        </span>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs hover:bg-[var(--surface-elevated)]"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{acc.display_name}</span>
                <button
                  type="button"
                  onClick={() => onEdit(acc)}
                  aria-label={`编辑 ${acc.display_name}`}
                  className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-sky-400"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              </div>
              <div className="text-[11px] text-muted">
                {acc.institution_name} · {acc.subtype ?? acc.class}
                {!acc.include_in_net_worth ? ' · 已排除净值' : ''}
              </div>
            </div>
            <div className="money-val tabular-nums font-semibold">
              {fmtMoney(acc.current_balance)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
