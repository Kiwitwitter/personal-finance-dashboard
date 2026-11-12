import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Edit2,
  PieChart,
  Repeat,
  ShieldAlert,
} from 'lucide-react';
import { api, fmtMoney } from '../api';
import { DonutChart } from '../components/Charts';
import { ModalDialog } from '../components/ModalDialog';
import type { BudgetCategoryItem, BudgetDashboard } from '../types';

export function BudgetView({
  onSelectCategoryTransactions,
  onGlobalRefresh,
}: {
  onSelectCategoryTransactions: (yearMonth: string, categorySlug: string) => void;
  onGlobalRefresh: () => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [data, setData] = useState<BudgetDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCat, setEditingCat] = useState<BudgetCategoryItem | null>(null);
  const [limitVal, setLimitVal] = useState('');
  const [rollover, setRollover] = useState(false);
  const [monthOnly, setMonthOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (ym?: string) => {
    setLoading(true);
    try {
      const res = await api.getBudgets(ym || undefined);
      setData(res);
      if (!ym) setSelectedMonth(res.year_month);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(selectedMonth || undefined);
  }, [selectedMonth]);

  const handleToggleFixedLoans = async (checked: boolean) => {
    const res = await api.updateBudgetConfig(checked);
    setData(res);
    onGlobalRefresh();
  };

  const openEditBudget = (item: BudgetCategoryItem) => {
    setEditingCat(item);
    setLimitVal(String(item.effective_limit ?? item.base_monthly_limit ?? 500));
    setRollover(item.rollover_enabled);
    setMonthOnly(false);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !data) return;
    setSaving(true);
    try {
      const res = await api.upsertBudget(editingCat.category_slug, {
        monthly_limit: Number(limitVal),
        rollover_enabled: rollover,
        alert_threshold_pct: editingCat.alert_threshold_pct || 80,
        year_month: data.year_month,
        month_only_override: monthOnly,
      });
      setData(res);
      setEditingCat(null);
      onGlobalRefresh();
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return <div className="py-16 text-center text-sm text-muted">正在计算自然月预算与订阅模型…</div>;
  }
  if (!data) return null;

  const { summary: s } = data;
  const subsMonthlyTotal = data.subscriptions.reduce((acc, item) => acc + item.expected_amount, 0);
  const categorySlices = data.categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .map((c) => ({
      label: c.name_zh,
      value: c.spent,
      color: c.color || '#38bdf8',
    }));
  const maxTrendBar = Math.max(
    1,
    ...data.cashflow_trend.map((p) => Math.max(p.income, p.living_expense + p.fixed_loans)),
  );

  return (
    <div className="space-y-6">
      {/* Month Switcher & Anti-Double-Counting Status Bar */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-sky-400" />
            <label htmlFor="budget-month-select" className="text-xs font-medium text-muted">
              统计自然月 (America/Los_Angeles)：
            </label>
            <select
              id="budget-month-select"
              value={selectedMonth || data.year_month}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold"
            >
              {data.available_months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-muted">
            当月进度：第 <strong>{data.days_elapsed}</strong> / {data.days_in_month} 天（
            <strong>{data.month_elapsed_pct}%</strong>）
          </span>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={data.settings.include_fixed_loans}
            onChange={(e) => void handleToggleFixedLoans(e.target.checked)}
          />
          将房贷与车贷 ({fmtMoney(s.fixed_loans_paid)}) 计入预算总池
        </label>
      </div>

      {/* Budget Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card rounded-2xl p-5">
          <div className="text-xs text-muted">当月预算内消费 vs 总额度</div>
          <div className="money-val tabular-nums mt-2 text-2xl font-bold">
            {fmtMoney(s.total_budgeted_spent)}{' '}
            <span className="text-sm font-normal text-muted">/ {fmtMoney(s.total_budgeted)}</span>
          </div>
          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
            <div
              style={{ left: `${Math.min(data.month_elapsed_pct, 100)}%` }}
              className="absolute top-0 bottom-0 z-10 w-0.5 bg-white/80"
              title={`自然月时间刻度 ${data.month_elapsed_pct}%`}
            />
            <div
              style={{ width: `${Math.min(s.budget_used_pct, 100)}%` }}
              className={`h-full ${
                s.budget_used_pct > 100
                  ? 'bg-rose-500'
                  : s.budget_used_pct > data.month_elapsed_pct + 12
                    ? 'bg-amber-400'
                    : 'bg-emerald-500'
              }`}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            剩余可用额度 <strong className="money-val">{fmtMoney(s.remaining_budget)}</strong>（已用 {s.budget_used_pct}%）
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="text-xs text-muted">当月总收入 vs 净结余</div>
          <div className="money-val tabular-nums mt-2 text-2xl font-bold text-emerald-400">
            {fmtMoney(s.month_income)}
          </div>
          <p className="mt-2 text-xs text-muted">
            扣除日常与贷款后净储蓄：
            <strong
              className={`money-val ml-1 ${
                s.net_savings >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fmtMoney(s.net_savings)}
            </strong>
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="text-xs text-muted">防重算自动拦截（信用卡还款）</div>
          <div className="money-val tabular-nums mt-2 text-2xl font-bold text-sky-400">
            {fmtMoney(s.cc_payments_excluded)}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            支票账户还卡账已识别为内部负债清偿，不重复侵占消费预算
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="text-xs text-muted">固定周期订阅预估 ({data.subscriptions.length} 项)</div>
          <div className="money-val tabular-nums mt-2 text-2xl font-bold text-violet-400">
            {fmtMoney(subsMonthlyTotal)}
            <span className="text-xs font-normal text-muted"> / 月</span>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            房贷+车贷本月已付：<span className="money-val">{fmtMoney(s.fixed_loans_paid)}</span>
          </p>
        </div>
      </div>

      {/* Visual Charts Row: Category Spend Share Donut + 6-Month Cashflow Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="surface-card rounded-2xl p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PieChart className="h-4 w-4 text-sky-400" />
                <span>{data.year_month} 消费结构占比图</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">各预算分类实际消费占当月日常支出权重</p>
            </div>
          </div>
          <DonutChart
            slices={categorySlices}
            centerLabel="日常总消费"
            centerValue={fmtMoney(s.total_living_spent, true)}
          />
        </div>

        <div className="surface-card rounded-2xl p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-emerald-400" />
                <span>近 6 个月月度消费与收入结余对比图</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">点击上方月份选择器可切换查看任意月份预算执行</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> 收入
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> 日常消费
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" /> 贷款固定支出
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-6 gap-3 pt-1">
            {data.cashflow_trend.map((pt) => {
              const incH = Math.max(4, Math.round((pt.income / maxTrendBar) * 136));
              const expH = Math.max(
                4,
                Math.round(((pt.living_expense + pt.fixed_loans) / maxTrendBar) * 136),
              );
              const loanRatio =
                pt.living_expense + pt.fixed_loans > 0
                  ? (pt.fixed_loans / (pt.living_expense + pt.fixed_loans)) * 100
                  : 0;
              const isSelected = pt.year_month === data.year_month;
              return (
                <button
                  key={pt.year_month}
                  type="button"
                  onClick={() => setSelectedMonth(pt.year_month)}
                  className={`flex flex-col items-center rounded-xl p-1.5 transition ${
                    isSelected ? 'bg-sky-500/10 ring-1 ring-sky-500/40' : 'hover:bg-[var(--surface-elevated)]'
                  }`}
                >
                  <div className="flex h-36 w-full items-end justify-center gap-1.5 border-b border-[var(--border-subtle)] pb-1">
                    <div
                      style={{ height: `${incH}px` }}
                      title={`收入: ${fmtMoney(pt.income)}`}
                      className="w-3.5 rounded-t bg-emerald-500/85 sm:w-4"
                    />
                    <div
                      style={{ height: `${expH}px` }}
                      title={`日常: ${fmtMoney(pt.living_expense)} | 房车贷: ${fmtMoney(pt.fixed_loans)}`}
                      className="flex w-3.5 flex-col overflow-hidden rounded-t bg-sky-500/85 sm:w-4"
                    >
                      <div style={{ height: `${loanRatio}%` }} className="w-full bg-indigo-400" />
                    </div>
                  </div>
                  <span className="mt-1.5 text-xs font-semibold">{pt.year_month.slice(5)}月</span>
                  <span className="money-val tabular-nums text-[10px] text-muted">
                    消 {fmtMoney(pt.living_expense, true)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Progress Cards + Subscriptions Radar */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold">
              分类预算执行明细（白色竖线 = 当月时间进度 {data.month_elapsed_pct}%）
            </h3>
            <span className="text-xs text-muted">点击分类名穿透查看对应账单流水</span>
          </div>

          {data.categories.map((cat) => {
            const pct = cat.pct_used ?? 0;
            const barColor =
              cat.status === 'over_budget'
                ? 'bg-rose-500'
                : cat.status === 'watch'
                  ? 'bg-amber-400'
                  : 'bg-emerald-500';

            return (
              <div key={cat.category_slug} className="surface-card rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      style={{ backgroundColor: cat.color }}
                      className="h-3 w-3 rounded-full"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectCategoryTransactions(data.year_month, cat.category_slug)}
                      className="text-sm font-semibold hover:text-sky-400 hover:underline"
                    >
                      {cat.name_zh}
                    </button>
                    <span className="text-xs text-muted">({cat.tx_count} 笔)</span>
                    {cat.status === 'over_budget' && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400">
                        <ShieldAlert className="h-3 w-3" /> 已超支
                      </span>
                    )}
                    {cat.status === 'watch' && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                        <AlertCircle className="h-3 w-3" /> 超时间节奏
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="money-val tabular-nums text-sm">
                      <strong>{fmtMoney(cat.spent)}</strong>
                      {cat.effective_limit !== null ? (
                        <span className="text-muted"> / {fmtMoney(cat.effective_limit)}</span>
                      ) : (
                        <span className="text-xs text-muted">（未设限额）</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditBudget(cat)}
                      aria-label={`修改 ${cat.name_zh} 预算`}
                      className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-elevated)] hover:text-sky-400"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {cat.effective_limit !== null && (
                  <div className="relative mt-2.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                    <div
                      style={{ left: `${Math.min(data.month_elapsed_pct, 100)}%` }}
                      className="absolute top-0 bottom-0 z-10 w-0.5 bg-slate-400"
                      title={`当月时间刻度 ${data.month_elapsed_pct}%`}
                    />
                    <div
                      style={{ width: `${Math.min(pct, 100)}%` }}
                      className={`h-full transition-all ${barColor}`}
                    />
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <div className="truncate">
                    {cat.top_merchants.length > 0 ? (
                      <>
                        主要去向：
                        {cat.top_merchants.map((m, idx) => (
                          <span key={m.merchant}>
                            {idx > 0 ? ' · ' : ''}
                            {m.merchant} (<span className="money-val">{fmtMoney(m.amount)}</span>)
                          </span>
                        ))}
                      </>
                    ) : (
                      '本月暂无该分类支出'
                    )}
                  </div>
                  {cat.remaining !== null && (
                    <span className={cat.remaining < 0 ? 'font-semibold text-rose-400' : ''}>
                      {cat.remaining >= 0
                        ? `剩余 ${fmtMoney(cat.remaining)}`
                        : `超支 ${fmtMoney(Math.abs(cat.remaining))}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Recurring Subscriptions Radar */}
        <div className="surface-card h-fit rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Repeat className="h-4 w-4 text-violet-400" />
            <span>周期性扣费与订阅雷达</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            基于近 5 个月信用卡与银行流水自动识别出的固定月度扣款
          </p>

          <div className="mt-4 space-y-2.5">
            {data.subscriptions.map((sub) => (
              <div
                key={sub.merchant_key}
                className="flex items-center justify-between rounded-xl bg-[var(--surface-elevated)] px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="truncate font-medium">{sub.display_name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    上次 {sub.last_charged_date} · 连续 {sub.months_seen} 个月 · {sub.account_label}
                  </div>
                </div>
                <div className="money-val tabular-nums font-semibold text-violet-400">
                  {fmtMoney(sub.expected_amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Budget Modal */}
      <ModalDialog
        open={Boolean(editingCat)}
        title={`设置分类预算：${editingCat?.name_zh ?? ''}`}
        subtitle="支持设置长期月度额度，或仅临时调整当前月份预算"
        onClose={() => setEditingCat(null)}
      >
        {editingCat && (
          <form onSubmit={handleSaveBudget} className="space-y-4 text-sm">
            <div>
              <label htmlFor="budget-limit-input" className="block text-xs font-medium text-muted">
                月度预算限额 (USD)
              </label>
              <input
                id="budget-limit-input"
                type="number"
                min={0}
                step="10"
                autoFocus
                value={limitVal}
                onChange={(e) => setLimitVal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-medium">
              <input
                type="checkbox"
                checked={monthOnly}
                onChange={(e) => setMonthOnly(e.target.checked)}
              />
              仅针对 {data.year_month} 单月生效（不改动常规月份默认限额）
            </label>

            {!monthOnly && (
              <label className="flex items-center gap-2.5 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={rollover}
                  onChange={(e) => setRollover(e.target.checked)}
                />
                开启结余滚存标记 (Sinking Fund / 年度支出池)
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存预算'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
