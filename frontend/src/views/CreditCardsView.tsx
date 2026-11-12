import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  CreditCard,
  LayoutGrid,
  Layers,
  Pencil,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { api, fmtMoney } from '../api';
import { DonutChart } from '../components/Charts';
import {
  BankBrandMark,
  CARD_SKIN_OPTIONS,
  CreditCardArt,
} from '../components/CreditCardArt';
import { ModalDialog } from '../components/ModalDialog';
import type {
  CreditCardIssuerGroup,
  CreditCardItem,
  CreditCardsDashboard,
  RewardProgramItem,
} from '../types';

const fmtPts = (n: number | undefined | null) =>
  new Intl.NumberFormat('en-US').format(Math.round(n ?? 0));

export function CreditCardsView({ onGlobalRefresh }: { onGlobalRefresh: () => void }) {
  const [data, setData] = useState<CreditCardsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'balance' | 'due' | 'points'>('balance');
  const [collapsedBanks, setCollapsedBanks] = useState<Record<string, boolean>>({});

  // Card profile modal state
  const [selectedCard, setSelectedCard] = useState<CreditCardItem | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [cardSkin, setCardSkin] = useState('auto');
  const [cardImageUrl, setCardImageUrl] = useState('');
  const [pointsProgramCode, setPointsProgramCode] = useState('auto');
  const [isChargeCard, setIsChargeCard] = useState(false);
  const [limitOverride, setLimitOverride] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [aprPct, setAprPct] = useState('');
  const [autopay, setAutopay] = useState(false);
  const [rewardNotes, setRewardNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reward Program calibration modal state
  const [selectedProgram, setSelectedProgram] = useState<RewardProgramItem | null>(null);
  const [progConfirmedPts, setProgConfirmedPts] = useState('');
  const [progCpp, setProgCpp] = useState('');
  const [progNotes, setProgNotes] = useState('');
  const [savingProg, setSavingProg] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getCreditCards();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEditor = (card: CreditCardItem) => {
    setSelectedCard(card);
    setDisplayName(card.custom_display_name ?? card.display_name);
    setCardSkin(card.card_skin ?? 'auto');
    setCardImageUrl(card.card_image_url ?? '');
    setPointsProgramCode(card.points_program_code ?? 'auto');
    setIsChargeCard(card.is_charge_card);
    setLimitOverride(
      card.credit_limit_override !== null ? String(card.credit_limit_override) : '',
    );
    setClosingDay(card.statement_closing_day !== null ? String(card.statement_closing_day) : '');
    setDueDay(
      card.payment_due_day !== null
        ? String(card.payment_due_day)
        : card.inferred_due_day !== null
          ? String(card.inferred_due_day)
          : '',
    );
    setAnnualFee(String(card.annual_fee ?? 0));
    setAprPct(card.apr_pct !== null ? String(card.apr_pct) : '');
    setAutopay(card.autopay_enabled);
    setRewardNotes(card.reward_notes ?? '');
  };

  const openProgramEditor = (rp: RewardProgramItem) => {
    setSelectedProgram(rp);
    setProgConfirmedPts(rp.confirmed_points !== null ? String(rp.confirmed_points) : '');
    setProgCpp(String(rp.cpp_valuation));
    setProgNotes(rp.notes ?? '');
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) return;
    setSaving(true);
    try {
      const updated = await api.patchCreditCard(selectedCard.account_id, {
        display_name: displayName,
        card_skin: cardSkin,
        card_image_url: cardImageUrl,
        points_program_code: pointsProgramCode,
        is_charge_card: isChargeCard,
        credit_limit_override: limitOverride.trim() ? Number(limitOverride) : null,
        clear_limit_override: !limitOverride.trim(),
        statement_closing_day: closingDay.trim() ? Number(closingDay) : null,
        payment_due_day: dueDay.trim() ? Number(dueDay) : null,
        annual_fee: annualFee.trim() ? Number(annualFee) : 0,
        apr_override: aprPct.trim() ? Number(aprPct) : null,
        autopay_enabled: autopay,
        reward_notes: rewardNotes,
      });
      setData(updated);
      setSelectedCard(null);
      onGlobalRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram) return;
    setSavingProg(true);
    try {
      const hasPts = progConfirmedPts.trim() !== '';
      const updated = await api.patchRewardProgram(selectedProgram.program_code, {
        confirmed_points: hasPts ? Number(progConfirmedPts) : null,
        clear_confirmed_points: !hasPts,
        cpp_valuation: progCpp.trim() ? Number(progCpp) : selectedProgram.cpp_valuation,
        notes: progNotes,
      });
      setData(updated);
      setSelectedProgram(null);
      onGlobalRefresh();
    } finally {
      setSavingProg(false);
    }
  };

  const sortCards = (list: CreditCardItem[]) => {
    const copy = [...list];
    if (sortBy === 'due') {
      copy.sort(
        (a, b) =>
          (a.days_until_due ?? 999) - (b.days_until_due ?? 999) ||
          b.current_balance - a.current_balance,
      );
    } else if (sortBy === 'points') {
      copy.sort((a, b) => (b.year_points_earned ?? 0) - (a.year_points_earned ?? 0));
    } else {
      copy.sort((a, b) => b.current_balance - a.current_balance);
    }
    return copy;
  };

  const groups: CreditCardIssuerGroup[] = useMemo(() => {
    if (!data) return [];
    if (data.issuer_groups && data.issuer_groups.length > 0) {
      return data.issuer_groups;
    }
    const map = new Map<string, CreditCardItem[]>();
    for (const c of data.cards) {
      const arr = map.get(c.institution_name) ?? [];
      arr.push(c);
      map.set(c.institution_name, arr);
    }
    return Array.from(map.entries()).map(([inst, list]) => ({
      institution_name: inst,
      card_count: list.length,
      total_balance: list.reduce((a, b) => a + b.current_balance, 0),
      total_revolving_limit: list.reduce(
        (a, b) => a + (!b.is_charge_card && b.effective_limit ? b.effective_limit : 0),
        0,
      ),
      utilization_pct: null,
      month_spend: list.reduce((a, b) => a + b.month_spend, 0),
      annual_fees: list.reduce((a, b) => a + b.annual_fee, 0),
      cards: list,
    }));
  }, [data]);

  if (loading && !data) {
    return <div className="py-16 text-center text-sm text-muted">正在加载信用卡矩阵、卡面与积分数据…</div>;
  }
  if (!data) return null;

  const { summary: s, cards, reward_programs = [], rewards_summary } = data;
  const filteredGroups =
    bankFilter === 'ALL' ? groups : groups.filter((g) => g.institution_name === bankFilter);
  const filteredFlatCards = sortCards(
    bankFilter === 'ALL' ? cards : cards.filter((c) => c.institution_name === bankFilter),
  );

  const maxCardPts = Math.max(...cards.map((c) => c.year_points_earned ?? 0), 1);
  const maxBankLimit = Math.max(...groups.map((g) => g.total_revolving_limit || g.total_balance), 1);

  const renderCardArticle = (card: CreditCardItem) => {
    const isCreditBalance = card.current_balance < 0;
    const utilColor =
      card.utilization_status === 'high'
        ? 'bg-rose-500 text-rose-400'
        : card.utilization_status === 'good'
          ? 'bg-amber-400 text-amber-400'
          : 'bg-emerald-400 text-emerald-400';

    return (
      <article
        key={card.account_id}
        className="cc-card surface-card transition hover:border-sky-500/45"
      >
        {/* Region 1: Media (<svg> or <img> directly as first child per modern-web-guidance card guide) */}
        <CreditCardArt
          institutionName={card.institution_name}
          displayName={card.display_name}
          rawName={card.raw_name}
          officialName={card.official_name}
          mask={card.mask}
          skin={card.effective_skin ?? card.card_skin}
          imageUrl={card.card_image_url}
          isChargeCard={card.is_charge_card}
        />

        {/* Region 2: Header */}
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {card.autopay_enabled && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  AutoPay
                </span>
              )}
              {card.is_charge_card && (
                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                  签账卡
                </span>
              )}
              {card.points_program_name && (
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                  {card.points_program_name.split(' (')[0]}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 truncate text-base font-semibold" title={card.display_name}>
              {card.display_name}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => openEditor(card)}
            aria-label={`配置 ${card.display_name}`}
            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-[var(--surface-elevated)] hover:text-sky-400"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </header>

        {/* Region 3: Content (single wrapper div for multi-element body) */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] text-muted">
                {isCreditBalance ? '溢缴款结余 (Credit)' : '当前欠款 (Balance)'}
              </div>
              <div
                className={`money-val tabular-nums text-2xl font-bold ${
                  isCreditBalance ? 'text-emerald-400' : ''
                }`}
              >
                {fmtMoney(card.current_balance)}
              </div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>本月刷卡 ({card.month_tx_count} 笔)</div>
              <div className="money-val tabular-nums font-semibold text-[var(--text-primary)]">
                {fmtMoney(card.month_spend)}
              </div>
            </div>
          </div>

          {card.is_charge_card ? (
            <div className="rounded-lg bg-[var(--surface-elevated)] px-3 py-1.5 text-[11px] text-muted">
              无预设固定额度上限（不计入循环授信分母）
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">
                  使用率{' '}
                  <strong className={utilColor.split(' ')[1]}>
                    {card.utilization_pct !== null ? `${card.utilization_pct}%` : '—'}
                  </strong>
                </span>
                <span className="money-val tabular-nums text-[11px] text-muted">
                  总额 {fmtMoney(card.effective_limit, true)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                <div
                  style={{ width: `${Math.min(card.utilization_pct ?? 0, 100)}%` }}
                  className={`h-full ${utilColor.split(' ')[0]}`}
                />
              </div>
            </div>
          )}

          {/* Per-Card Points & Rewards Strip */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                <Coins className="h-3.5 w-3.5" />
                本月 +{fmtPts(card.month_points_earned)} pts
              </span>
              <span className="tabular-nums text-[11px] text-muted">
                近12月 <strong className="text-[var(--text-primary)]">{fmtPts(card.year_points_earned)}</strong> pts
                {card.year_points_value_usd ? (
                  <span className="money-val ml-1 text-emerald-400">
                    (≈{fmtMoney(card.year_points_value_usd, true)})
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted">
              {card.reward_notes || card.earn_rate_summary}
            </div>
          </div>
        </div>

        {/* Region 4: Footer */}
        <footer className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {card.next_due_date ? (
              <span>
                还款日 <strong>{card.next_due_date}</strong>
                {card.due_date_is_inferred ? ' (推算)' : ''}
              </span>
            ) : (
              <span>未设还款日</span>
            )}
          </span>
          {card.days_until_due !== null && card.current_balance > 0 ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                card.days_until_due <= 5
                  ? 'bg-rose-500/15 text-rose-400'
                  : card.days_until_due <= 14
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-slate-500/15 text-muted'
              }`}
            >
              剩 {card.days_until_due} 天
            </span>
          ) : (
            <span className="text-[11px] text-emerald-400">无待还压力</span>
          )}
        </footer>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>全部信用卡当前总余额 ({s.card_count} 张 · {groups.length} 家银行)</span>
            <CreditCard className="h-4 w-4 text-sky-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold">
            {fmtMoney(s.total_balance)}
          </div>
          <p className="mt-2 text-xs text-muted">
            未来 14 天内待还：<strong className="money-val text-amber-400">{fmtMoney(s.due_within_14d_amount)}</strong>（{s.due_within_14d_count} 张）
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>总授信额度使用率 (Utilization)</span>
            {s.overall_utilization_pct >= 30 ? (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <div className="tabular-nums mt-2 text-3xl font-bold">
            {s.overall_utilization_pct}%
          </div>
          <div className="relative mt-2.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
            <div className="absolute top-0 bottom-0 left-[10%] w-px bg-emerald-400/60" title="10% 极佳线" />
            <div className="absolute top-0 bottom-0 left-[30%] w-px bg-rose-400/80" title="30% 警戒线" />
            <div
              style={{ width: `${Math.min(s.overall_utilization_pct, 100)}%` }}
              className={`h-full ${
                s.overall_utilization_pct >= 30
                  ? 'bg-rose-500'
                  : s.overall_utilization_pct >= 10
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            循环授信总额 <span className="money-val">{fmtMoney(s.total_revolving_limit, true)}</span> · 10% 极佳 / 30% 警戒
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>信用卡积分资产总估值 (Points & Miles)</span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold text-amber-300">
            {fmtMoney(rewards_summary?.total_estimated_value_usd ?? 0)}
          </div>
          <p className="mt-2 text-xs text-muted">
            本月攒点 <strong className="text-emerald-400">+{fmtPts(rewards_summary?.month_points_earned)}</strong> · 近12月{' '}
            <strong>{fmtPts(rewards_summary?.year_points_earned)} pts</strong>
          </p>
        </div>

        <div className="surface-card rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>流动现金还款覆盖 & 持卡年费</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="money-val tabular-nums mt-2 text-3xl font-bold text-emerald-400">
            {s.cash_coverage_ratio}x
          </div>
          <p className="mt-2 text-xs text-muted">
            可用现金 <span className="money-val">{fmtMoney(s.liquid_cash_available, true)}</span> · 年费合计{' '}
            <span className="money-val">{fmtMoney(s.total_annual_fees, true)}/yr</span>
          </p>
        </div>
      </div>

      {/* Rich Visual Charts Section: Points Ecosystem + Bank Comparison + Top Earning Cards */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Points Valuation Donut + Calibratable Ledger */}
        <div className="surface-card rounded-2xl p-5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">积分与里程资产池估值分布</h3>
              <p className="text-xs text-muted">自动统计刷卡攒点，点击任一积分池可校准真实账户余额</p>
            </div>
            <Coins className="h-4 w-4 text-amber-400" />
          </div>

          <div className="mt-4">
            <DonutChart
              centerLabel="积分总估值"
              size={172}
              slices={reward_programs.map((rp) => ({
                label: rp.display_name.split(' (')[0],
                value: rp.estimated_value_usd,
                color: rp.color,
              }))}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {reward_programs.slice(0, 6).map((rp) => (
              <button
                key={rp.program_code}
                type="button"
                onClick={() => openProgramEditor(rp)}
                className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 px-3 py-2 text-left text-xs transition hover:border-amber-400/50"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: rp.color }}
                    />
                    <span className="truncate font-semibold">
                      {rp.display_name.split(' (')[0]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {fmtPts(rp.effective_points)} pts · {rp.cpp_valuation}¢/pt{' '}
                    {rp.is_calibrated ? (
                      <span className="text-emerald-400">(已校准)</span>
                    ) : (
                      <span>(刷卡预估)</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="money-val tabular-nums font-bold text-amber-300">
                    {fmtMoney(rp.estimated_value_usd, true)}
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-sky-400">
                    <Pencil className="h-2.5 w-2.5" /> 校准
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Issuer Exposure & Utilization Comparison Chart */}
        <div className="surface-card rounded-2xl p-5 xl:col-span-4">
          <h3 className="text-sm font-semibold">各发卡行授信规模与欠款对比</h3>
          <p className="text-xs text-muted">按银行汇总授信敞口、当前账单及额度占用率</p>

          <div className="mt-4 space-y-4">
            {groups.map((g) => {
              const limPct = Math.max((g.total_revolving_limit / maxBankLimit) * 100, 8);
              const balPct =
                g.total_revolving_limit > 0
                  ? Math.min((Math.max(g.total_balance, 0) / g.total_revolving_limit) * 100, 100)
                  : 0;
              return (
                <div key={g.institution_name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold">
                      <span>{g.institution_name}</span>
                      <span className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] text-muted">
                        {g.card_count} 张
                      </span>
                    </div>
                    <div className="money-val tabular-nums text-xs">
                      <strong>{fmtMoney(g.total_balance, true)}</strong>
                      <span className="text-muted">
                        {' '}
                        / {fmtMoney(g.total_revolving_limit, true)}
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full rounded-full bg-[var(--surface-elevated)] p-0.5">
                    <div
                      style={{ width: `${limPct}%` }}
                      className="relative h-full overflow-hidden rounded-full bg-sky-500/20"
                      title={`总授信 ${fmtMoney(g.total_revolving_limit)}`}
                    >
                      <div
                        style={{ width: `${balPct}%` }}
                        className="h-full rounded-full bg-sky-400"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>
                      本行使用率{' '}
                      <strong className="text-emerald-400">
                        {g.utilization_pct !== null ? `${g.utilization_pct}%` : '签账为主'}
                      </strong>
                    </span>
                    <span>本月刷卡 {fmtMoney(g.month_spend, true)} · +{fmtPts(g.month_points_earned)} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-Card 12-Month Points Contribution Chart */}
        <div className="surface-card rounded-2xl p-5 xl:col-span-3">
          <h3 className="text-sm font-semibold">主力卡近 12 月攒点排行</h3>
          <p className="text-xs text-muted">基于真实刷卡商户与多倍返点规则自动测算</p>

          <div className="mt-4 space-y-3">
            {[...cards]
              .sort((a, b) => (b.year_points_earned ?? 0) - (a.year_points_earned ?? 0))
              .slice(0, 6)
              .map((c) => {
                const pts = c.year_points_earned ?? 0;
                const w = Math.max((pts / maxCardPts) * 100, 4);
                return (
                  <div key={c.account_id} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium" title={c.display_name}>
                        {c.display_name}
                      </span>
                      <span className="tabular-nums shrink-0 font-semibold text-amber-300">
                        {fmtPts(pts)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                      <div
                        style={{ width: `${w}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-sky-400"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* View Mode & Bank Filter Toolbar */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBankFilter('ALL')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              bankFilter === 'ALL'
                ? 'bg-sky-500 text-white'
                : 'bg-[var(--surface-elevated)] text-muted hover:text-[var(--text-primary)]'
            }`}
          >
            全部银行 ({s.card_count})
          </button>
          {groups.map((g) => (
            <button
              key={g.institution_name}
              type="button"
              onClick={() =>
                setBankFilter(
                  bankFilter === g.institution_name ? 'ALL' : g.institution_name,
                )
              }
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                bankFilter === g.institution_name
                  ? 'bg-sky-500 text-white'
                  : 'bg-[var(--surface-elevated)] text-muted hover:text-[var(--text-primary)]'
              }`}
            >
              {g.institution_name} ({g.card_count})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="卡片排序方式"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'balance' | 'due' | 'points')}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium"
          >
            <option value="balance">按欠款从高到低</option>
            <option value="due">按还款日紧迫度</option>
            <option value="points">按攒点贡献排序</option>
          </select>

          <div className="inline-flex rounded-xl bg-[var(--surface-elevated)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
                viewMode === 'grouped' ? 'bg-sky-500 text-white' : 'text-muted'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              按银行分组
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
                viewMode === 'flat' ? 'bg-sky-500 text-white' : 'text-muted'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              全部平铺
            </button>
          </div>
        </div>
      </div>

      {/* Cards Display: Grouped by Bank (default) or Flat Grid */}
      {viewMode === 'grouped' ? (
        <div className="space-y-6">
          {filteredGroups.map((group) => {
            const isCollapsed = Boolean(collapsedBanks[group.institution_name]);
            const sortedGroupCards = sortCards(group.cards);
            return (
              <section key={group.institution_name} className="space-y-3.5">
                <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedBanks((prev) => ({
                        ...prev,
                        [group.institution_name]: !prev[group.institution_name],
                      }))
                    }
                    className="flex items-center gap-3 text-left"
                  >
                    <BankBrandMark institution={group.institution_name} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold">{group.institution_name}</h2>
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
                          {group.card_count} 张卡
                        </span>
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted" />
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        近 12 个月本行刷卡累计攒点{' '}
                        <strong className="text-amber-300">
                          {fmtPts(group.year_points_earned)} pts
                        </strong>
                      </p>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div>
                      <div className="text-muted">本行总欠款</div>
                      <div className="money-val tabular-nums text-base font-bold">
                        {fmtMoney(group.total_balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted">循环总授信</div>
                      <div className="money-val tabular-nums text-base font-semibold">
                        {fmtMoney(group.total_revolving_limit, true)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted">本行使用率</div>
                      <div className="tabular-nums text-base font-semibold text-emerald-400">
                        {group.utilization_pct !== null ? `${group.utilization_pct}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted">本月消费</div>
                      <div className="money-val tabular-nums text-base font-semibold">
                        {fmtMoney(group.month_spend)}
                      </div>
                    </div>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedGroupCards.map(renderCardArticle)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredFlatCards.map(renderCardArticle)}
        </div>
      )}

      {/* Native <dialog> Modal for Editing Credit Card Profile + Live Card Artwork Preview */}
      <ModalDialog
        open={Boolean(selectedCard)}
        title={`配置卡片：${selectedCard?.display_name ?? ''}`}
        subtitle="自定义卡片名称、卡面皮肤、积分池绑定及账单还款日（无损存储于 app.card_profiles）"
        onClose={() => setSelectedCard(null)}
      >
        {selectedCard && (
          <form onSubmit={handleSaveCard} className="space-y-4 text-sm">
            <div className="mx-auto max-w-[260px]">
              <CreditCardArt
                institutionName={selectedCard.institution_name}
                displayName={displayName || selectedCard.display_name}
                rawName={selectedCard.raw_name}
                officialName={selectedCard.official_name}
                mask={selectedCard.mask}
                skin={cardSkin === 'auto' ? selectedCard.detected_skin : cardSkin}
                imageUrl={cardImageUrl}
                compact
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cc-name" className="block text-xs font-medium text-muted">
                  卡片显示名称
                </label>
                <input
                  id="cc-name"
                  type="text"
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="cc-skin" className="block text-xs font-medium text-muted">
                  卡面主题皮肤 (Card Art)
                </label>
                <select
                  id="cc-skin"
                  value={cardSkin}
                  onChange={(e) => setCardSkin(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                >
                  {CARD_SKIN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cc-prog" className="block text-xs font-medium text-muted">
                  归属积分体系 (Points Program)
                </label>
                <select
                  id="cc-prog"
                  value={pointsProgramCode}
                  onChange={(e) => setPointsProgramCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="auto">✨ 自动匹配积分池</option>
                  {reward_programs.map((rp) => (
                    <option key={rp.program_code} value={rp.program_code}>
                      {rp.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cc-img" className="block text-xs font-medium text-muted">
                  自定义卡面图片 URL（可选，留空使用矢量卡面）
                </label>
                <input
                  id="cc-img"
                  type="url"
                  value={cardImageUrl}
                  onChange={(e) => setCardImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cc-closing" className="block text-xs font-medium text-muted">
                  每月账单日 (1-31)
                </label>
                <input
                  id="cc-closing"
                  type="number"
                  min={1}
                  max={31}
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                  placeholder="例如 18"
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="cc-due" className="block text-xs font-medium text-muted">
                  每月还款日 (1-31)
                </label>
                <input
                  id="cc-due"
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  placeholder="例如 15"
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="cc-limit" className="block text-xs font-medium text-muted">
                  自定义额度 ($)
                </label>
                <input
                  id="cc-limit"
                  type="number"
                  min={0}
                  step="100"
                  value={limitOverride}
                  onChange={(e) => setLimitOverride(e.target.value)}
                  placeholder="留空自动计算"
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="cc-fee" className="block text-xs font-medium text-muted">
                  年费 ($/年)
                </label>
                <input
                  id="cc-fee"
                  type="number"
                  min={0}
                  step="1"
                  value={annualFee}
                  onChange={(e) => setAnnualFee(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="cc-apr" className="block text-xs font-medium text-muted">
                  APR 利率 (%)
                </label>
                <input
                  id="cc-apr"
                  type="number"
                  min={0}
                  max={99}
                  step="0.01"
                  value={aprPct}
                  onChange={(e) => setAprPct(e.target.value)}
                  placeholder="24.99"
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={autopay}
                  onChange={(e) => setAutopay(e.target.checked)}
                />
                已开启银行自动还款 (AutoPay)
              </label>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={isChargeCard}
                  onChange={(e) => setIsChargeCard(e.target.checked)}
                />
                签账卡 / 无固定额度上限
              </label>
            </div>

            <div>
              <label htmlFor="cc-rewards" className="block text-xs font-medium text-muted">
                刷卡返点备忘（留空则展示默认多倍积分策略）
              </label>
              <input
                id="cc-rewards"
                type="text"
                value={rewardNotes}
                onChange={(e) => setRewardNotes(e.target.value)}
                placeholder="例如：餐饮 3x · 航空酒店转点主力卡"
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存卡片档案'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Native <dialog> Modal for Calibrating Points & Miles Pool Balance */}
      <ModalDialog
        open={Boolean(selectedProgram)}
        title={`校准积分池：${selectedProgram?.display_name ?? ''}`}
        subtitle="输入银行 App 中的当前真实积分余额，或留空以自动采用近 12 个月刷卡预估积分"
        onClose={() => setSelectedProgram(null)}
      >
        {selectedProgram && (
          <form onSubmit={handleSaveProgram} className="space-y-4 text-sm">
            <div className="rounded-xl bg-[var(--surface-elevated)] p-3 text-xs text-muted">
              系统根据近 12 个月刷卡流水自动测算攒点：
              <strong className="ml-1 text-[var(--text-primary)]">
                {fmtPts(selectedProgram.estimated_12m_points)} pts
              </strong>
              （本月 +{fmtPts(selectedProgram.month_points_earned)} pts）
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rp-pts" className="block text-xs font-medium text-muted">
                  当前账户实际积分余额（留空使用预估）
                </label>
                <input
                  id="rp-pts"
                  type="number"
                  min={0}
                  step="1"
                  autoFocus
                  value={progConfirmedPts}
                  onChange={(e) => setProgConfirmedPts(e.target.value)}
                  placeholder={`预估 ${selectedProgram.estimated_12m_points}`}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="rp-cpp" className="block text-xs font-medium text-muted">
                  每分估值 (cents / point)
                </label>
                <input
                  id="rp-cpp"
                  type="number"
                  min={0.1}
                  max={20}
                  step="0.05"
                  value={progCpp}
                  onChange={(e) => setProgCpp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rp-notes" className="block text-xs font-medium text-muted">
                转点伙伴与兑换策略备忘
              </label>
              <input
                id="rp-notes"
                type="text"
                value={progNotes}
                onChange={(e) => setProgNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedProgram(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted hover:bg-[var(--surface-elevated)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingProg}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {savingProg ? '保存中…' : '保存积分估值'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
