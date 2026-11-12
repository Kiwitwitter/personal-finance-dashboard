import React, { useEffect, useId, useState } from 'react';
import {
  BarChart3,
  Check,
  Filter,
  PieChart,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { api, fmtMoney, fmtSignedMoney, institutionBadgeClass, isImeComposing } from '../api';
import { DailyPulseChart, DonutChart } from '../components/Charts';
import { ModalDialog } from '../components/ModalDialog';
import type {
  CategoryMeta,
  MerchantRuleItem,
  TransactionItem,
  TransactionsResponse,
} from '../types';

interface Props {
  initialYearMonth?: string;
  initialCategorySlug?: string;
  onGlobalRefresh: () => void;
}

export function TransactionsView({
  initialYearMonth = '',
  initialCategorySlug = '',
  onGlobalRefresh,
}: Props) {
  const captionId = useId();
  const searchInputId = useId();

  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [categorySlug, setCategorySlug] = useState(initialCategorySlug);
  const [institution, setInstitution] = useState('');
  const [txKind, setTxKind] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 80;

  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit transaction override modal
  const [editingTx, setEditingTx] = useState<TransactionItem | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editKind, setEditKind] = useState('expense');
  const [editNotes, setEditNotes] = useState('');
  const [createRule, setCreateRule] = useState(false);
  const [rulePattern, setRulePattern] = useState('');
  const [saving, setSaving] = useState(false);

  // Rules manager modal
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<MerchantRuleItem[]>([]);

  useEffect(() => {
    setYearMonth(initialYearMonth);
    setCategorySlug(initialCategorySlug);
    setOffset(0);
  }, [initialYearMonth, initialCategorySlug]);

  useEffect(() => {
    void api.getCategories().then(setCategories);
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.getTransactions({
        year_month: yearMonth || undefined,
        category_slug: categorySlug || undefined,
        institution: institution || undefined,
        tx_kind: txKind,
        pending_only: pendingOnly,
        search: appliedSearch || undefined,
        limit,
        offset,
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [yearMonth, categorySlug, institution, txKind, pendingOnly, appliedSearch, offset]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isImeComposing(e)) return;
      setOffset(0);
      setAppliedSearch(searchDraft);
    }
  };

  const openEditTx = (tx: TransactionItem) => {
    setEditingTx(tx);
    setEditMerchant(tx.display_merchant);
    setEditCat(tx.category_slug);
    setEditKind(tx.tx_kind);
    setEditNotes(tx.notes ?? '');
    setCreateRule(false);
    setRulePattern(tx.raw_merchant ?? tx.raw_name ?? tx.display_merchant);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setSaving(true);
    try {
      await api.patchTransaction(editingTx.id, {
        custom_merchant: editMerchant,
        category_slug: editCat,
        tx_kind: editKind,
        notes: editNotes,
        is_reviewed: true,
        create_rule: createRule,
        rule_pattern: rulePattern,
      });
      setEditingTx(null);
      await loadTransactions();
      onGlobalRefresh();
    } finally {
      setSaving(false);
    }
  };

  const openRulesModal = async () => {
    const list = await api.getRules();
    setRules(list);
    setRulesOpen(true);
  };

  const handleDeleteRule = async (id: number) => {
    await api.deleteRule(id);
    const list = await api.getRules();
    setRules(list);
    await loadTransactions();
    onGlobalRefresh();
  };

  const kindLabel: Record<string, string> = {
    expense: '消费支出',
    income: '收入入账',
    cc_payment: '还信用卡(不计支出)',
    loan_payment: '房贷/车贷',
    internal_transfer: '内部转账',
    ignored: '已忽略',
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="surface-card space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setAppliedSearch(searchDraft);
            }}
            className="flex flex-1 items-center gap-2"
          >
            <label htmlFor={searchInputId} className="sr-only">
              搜索商户、金额、备注或账户
            </label>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
              <input
                id={searchInputId}
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索商户名、原始摘要、金额（支持中文输入法安全回车）…"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-2 pr-3 pl-9 text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-400"
            >
              搜索
            </button>
          </form>

          <button
            type="button"
            onClick={() => void openRulesModal()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-medium hover:border-sky-500/50"
          >
            <Wand2 className="h-3.5 w-3.5 text-violet-400" />
            自动归类规则 ({rules.length || '管理'})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-muted" />
          <input
            type="month"
            aria-label="按月份过滤"
            value={yearMonth}
            onChange={(e) => {
              setOffset(0);
              setYearMonth(e.target.value);
            }}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1.5"
          />

          <select
            aria-label="按机构过滤"
            value={institution}
            onChange={(e) => {
              setOffset(0);
              setInstitution(e.target.value);
            }}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1.5"
          >
            <option value="">全部机构 (7)</option>
            <option value="American Express">American Express</option>
            <option value="Chase">Chase</option>
            <option value="Bank of America">Bank of America</option>
            <option value="Bilt Rewards">Bilt Rewards</option>
            <option value="Charles Schwab">Charles Schwab</option>
            <option value="Fidelity">Fidelity</option>
            <option value="PayPal">PayPal</option>
          </select>

          <select
            aria-label="按分类过滤"
            value={categorySlug}
            onChange={(e) => {
              setOffset(0);
              setCategorySlug(e.target.value);
            }}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1.5"
          >
            <option value="">全部预算分类</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name_zh}
              </option>
            ))}
          </select>

          <select
            aria-label="按交易性质过滤"
            value={txKind}
            onChange={(e) => {
              setOffset(0);
              setTxKind(e.target.value);
            }}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1.5"
          >
            <option value="all">全部性质</option>
            <option value="expense">仅消费支出</option>
            <option value="income">仅收入</option>
            <option value="transfer">信用卡还款 & 内部转账</option>
            <option value="loan_payment">房贷与车贷</option>
          </select>

          <label className="inline-flex items-center gap-1.5 px-1">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => {
                setOffset(0);
                setPendingOnly(e.target.checked);
              }}
            />
            仅看未入账 (Pending)
          </label>

          {(yearMonth || categorySlug || institution || txKind !== 'all' || pendingOnly || appliedSearch) && (
            <button
              type="button"
              onClick={() => {
                setYearMonth('');
                setCategorySlug('');
                setInstitution('');
                setTxKind('all');
                setPendingOnly(false);
                setSearchDraft('');
                setAppliedSearch('');
                setOffset(0);
              }}
              className="text-sky-400 hover:underline"
            >
              重置筛选
            </button>
          )}
        </div>

        {data && (
          <div className="flex flex-wrap items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 text-xs text-muted">
            <span>
              共匹配 <strong className="text-[var(--text-primary)]">{data.total_count}</strong> 笔流水（点击任意行修改分类或创建永久规则）
            </span>
            <div className="flex gap-4">
              <span>
                筛选净消费：<strong className="money-val text-rose-400">{fmtMoney(data.filtered_expense_net)}</strong>
              </span>
              <span>
                筛选总收入：<strong className="money-val text-emerald-400">{fmtMoney(data.filtered_income_total)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live Filtered Charts: Daily Spend Pulse + Category Breakdown */}
      {data &&
        ((data.daily_spend_series && data.daily_spend_series.length > 0) ||
          (data.category_breakdown && data.category_breakdown.length > 0)) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="surface-card rounded-2xl p-4 lg:col-span-7">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <BarChart3 className="h-4 w-4 text-sky-400" />
                <span>当前筛选条件每日消费脉冲图 (Daily Spend Pulse)</span>
              </div>
              <DailyPulseChart series={data.daily_spend_series ?? []} />
            </div>

            <div className="surface-card rounded-2xl p-4 lg:col-span-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <PieChart className="h-4 w-4 text-emerald-400" />
                <span>当前筛选范围分类支出占比</span>
              </div>
              <DonutChart
                size={152}
                slices={(data.category_breakdown ?? []).map((c) => ({
                  label: c.name_zh,
                  value: c.amount,
                  color: c.color || '#38bdf8',
                }))}
                centerLabel="筛选净支出"
                centerValue={fmtMoney(data.filtered_expense_net, true)}
              />
            </div>
          </div>
        )}

      {/* Semantic Responsive Table with Sticky Headers & @container Stacked Fallback */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="table-wrapper"
      >
        <table
          className="fin-table"
          style={
            {
              '--label-2': '"日期"',
              '--label-3': '"账户"',
              '--label-4': '"分类 / 性质"',
              '--label-5': '"金额"',
            } as React.CSSProperties
          }
        >
          <caption id={captionId} className="sr-only">
            银行与信用卡交易流水明细表
          </caption>
          <thead>
            <tr>
              <th>商户 / 摘要</th>
              <th>日期</th>
              <th>所属账户</th>
              <th>分类 & 账本性质</th>
              <th className="text-right">金额 (USD)</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted">
                  正在检索流水…
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted">
                  当前筛选条件下暂无流水记录
                </td>
              </tr>
            ) : (
              data?.items.map((tx) => {
                const isTransfer = tx.tx_kind === 'cc_payment' || tx.tx_kind === 'internal_transfer';
                return (
                  <tr
                    key={tx.id}
                    onClick={() => openEditTx(tx)}
                    className="cursor-pointer"
                  >
                    <th>
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[260px]">{tx.display_merchant}</span>
                        {tx.pending && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            Pending
                          </span>
                        )}
                        {tx.is_overridden && (
                          <span
                            title="已人工校准覆盖"
                            className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400"
                          >
                            已校准
                          </span>
                        )}
                        {tx.matched_rule_id && !tx.is_overridden && (
                          <span
                            title="命中商户规则"
                            className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
                          >
                            规则
                          </span>
                        )}
                      </div>
                      {tx.notes && (
                        <div className="mt-0.5 text-[11px] font-normal text-sky-400">
                          备注：{tx.notes}
                        </div>
                      )}
                    </th>
                    <td className="tabular-nums text-xs text-muted">{tx.date}</td>
                    <td>
                      <span
                        className={`mr-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${institutionBadgeClass(
                          tx.institution_name,
                        )}`}
                      >
                        {tx.institution_name}
                      </span>
                      <span className="text-xs">{tx.account_name}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: tx.category_color }}
                          className="h-2.5 w-2.5 rounded-full"
                        />
                        <span className="text-xs font-medium">{tx.category_name_zh}</span>
                        <span className="text-[11px] text-muted">
                          · {kindLabel[tx.tx_kind] ?? tx.tx_kind}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`money-val tabular-nums text-right font-semibold ${
                        isTransfer
                          ? 'text-muted'
                          : tx.amount > 0
                            ? 'text-emerald-400'
                            : ''
                      }`}
                    >
                      {fmtSignedMoney(tx.amount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total_count > limit && (
        <div className="flex items-center justify-between px-1 text-xs text-muted">
          <span>
            显示第 {offset + 1} – {Math.min(offset + limit, data.total_count)} 笔 / 共 {data.total_count} 笔
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={offset + limit >= data.total_count}
              onClick={() => setOffset(offset + limit)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Override Transaction Modal */}
      <ModalDialog
        open={Boolean(editingTx)}
        title="校准交易分类与商户规则"
        subtitle="写入 app.transaction_overrides，不改动上游同步表 public.transactions"
        onClose={() => setEditingTx(null)}
      >
        {editingTx && (
          <form onSubmit={handleSaveOverride} className="space-y-4 text-sm">
            <div className="rounded-xl bg-[var(--surface-elevated)] p-3 text-xs text-muted">
              <div>
                原始报文：<strong>{editingTx.raw_name}</strong> · 金额{' '}
                <strong className="money-val text-[var(--text-primary)]">
                  {fmtSignedMoney(editingTx.amount)}
                </strong>
              </div>
              <div className="mt-1">
                账户：{editingTx.account_name} · 日期：{editingTx.date} · Plaid 原生分类：
                {editingTx.plaid_category ?? '无'}
              </div>
            </div>

            <div>
              <label htmlFor="tx-merchant-input" className="block text-xs font-medium text-muted">
                净化后展示商户名
              </label>
              <input
                id="tx-merchant-input"
                type="text"
                autoFocus
                value={editMerchant}
                onChange={(e) => setEditMerchant(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tx-cat-select" className="block text-xs font-medium text-muted">
                  归属预算分类
                </label>
                <select
                  id="tx-cat-select"
                  value={editCat}
                  onChange={(e) => setEditCat(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name_zh}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tx-kind-select" className="block text-xs font-medium text-muted">
                  账本计入性质
                </label>
                <select
                  id="tx-kind-select"
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="expense">消费支出 (计入 Budget)</option>
                  <option value="income">收入 (计入现金流收入)</option>
                  <option value="cc_payment">信用卡还款 (防重复计算排除)</option>
                  <option value="loan_payment">房贷/车贷还款</option>
                  <option value="internal_transfer">账户间内部转账 (排除)</option>
                  <option value="ignored">忽略该笔流水 (代付/报销冲抵)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tx-notes-input" className="block text-xs font-medium text-muted">
                个人备注
              </label>
              <input
                id="tx-notes-input"
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="例如：出差机票待报销 / 年度会员"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] p-3">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={createRule}
                  onChange={(e) => setCreateRule(e.target.checked)}
                />
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                同时创建永久自动规则（历史与未来包含该关键字的流水全部自动应用）
              </label>
              {createRule && (
                <div className="mt-2">
                  <label htmlFor="rule-pat-input" className="block text-[11px] text-muted">
                    匹配关键字（不区分大小写）
                  </label>
                  <input
                    id="rule-pat-input"
                    type="text"
                    value={rulePattern}
                    onChange={(e) => setRulePattern(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {saving ? '保存中…' : '保存校准'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Merchant Rules Modal */}
      <ModalDialog
        open={rulesOpen}
        title="自动商户归类规则引擎"
        subtitle="按优先级自动清洗商户名称并映射预算分类"
        onClose={() => setRulesOpen(false)}
      >
        <div className="space-y-2.5 text-xs">
          {rules.length === 0 ? (
            <p className="py-6 text-center text-muted">
              当前还没有自定义规则。点击任意一笔交易并勾选“同时创建永久自动规则”即可添加！
            </p>
          ) : (
            rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-[var(--surface-elevated)] px-3.5 py-2.5"
              >
                <div>
                  <div className="font-semibold">
                    匹配 <code>"{r.match_pattern}"</code> → {r.target_merchant || '保持原名'}
                  </div>
                  <div className="mt-0.5 text-muted">
                    分类：{r.target_category_slug ?? '默认'} · 性质：{r.target_tx_kind ?? '默认'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteRule(r.id)}
                  aria-label={`删除规则 ${r.match_pattern}`}
                  className="rounded p-1.5 text-rose-400 hover:bg-rose-500/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </ModalDialog>
    </div>
  );
}
