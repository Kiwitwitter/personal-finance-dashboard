import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CreditCard,
  Eye,
  EyeOff,
  LayoutDashboard,
  Moon,
  PieChart,
  ReceiptText,
  RefreshCw,
  Sun,
  WalletCards,
} from 'lucide-react';
import { api } from './api';
import { AiCopilotModal } from './components/AiCopilotModal';
import type { OverviewDashboard } from './types';
import { BudgetView } from './views/BudgetView';
import { CreditCardsView } from './views/CreditCardsView';
import { InvestmentsView } from './views/InvestmentsView';
import { OverviewView } from './views/OverviewView';
import { TransactionsView } from './views/TransactionsView';

type TabKey = 'overview' | 'cards' | 'budget' | 'transactions' | 'investments';

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [overview, setOverview] = useState<OverviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('fin_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Drill-down filter state from Budget -> Transactions
  const [txJumpMonth, setTxJumpMonth] = useState('');
  const [txJumpCategory, setTxJumpCategory] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fin_theme', theme);
  }, [theme]);

  // Keyboard shortcut Cmd/Ctrl + H for quick Privacy Blur toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setPrivacyBlur((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchOverview = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOverview(forceRefresh);
      setOverview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const cardsBadgeCount = overview?.credit_cards_pulse.card_count;
  const invBadgeCount =
    overview
      ? overview.accounts.filter((a) => a.class === 'investment').length +
        (overview.manual_assets?.length ?? 0)
      : null;

  const navItems: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: '总览大盘', icon: <LayoutDashboard className="h-4 w-4" /> },
    {
      key: 'cards',
      label: cardsBadgeCount ? `信用卡中心 (${cardsBadgeCount})` : '信用卡中心',
      icon: <CreditCard className="h-4 w-4" />,
    },
    { key: 'budget', label: '月度预算 Budget', icon: <WalletCards className="h-4 w-4" /> },
    { key: 'transactions', label: '账单工作台', icon: <ReceiptText className="h-4 w-4" /> },
    {
      key: 'investments',
      label: invBadgeCount ? `投资与全资产 (${invBadgeCount})` : '投资与全资产',
      icon: <PieChart className="h-4 w-4" />,
    },
  ];

  return (
    <div className={privacyBlur ? 'privacy-blur min-h-screen' : 'min-h-screen'}>
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-black text-white shadow">
              PF
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Personal Finance OS</h1>
              <p className="text-[11px] text-muted">Dual-Schema PostgreSQL · Real-Time Wealth</p>
            </div>
          </div>

          <nav aria-label="主导航" className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    if (item.key !== 'transactions') {
                      setTxJumpMonth('');
                      setTxJumpCategory('');
                    }
                    setActiveTab(item.key);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                    active
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-muted hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium hover:border-sky-500/50"
            >
              <Bot className="h-3.5 w-3.5 text-violet-400" />
              <span>AI / MCP</span>
            </button>

            <button
              type="button"
              onClick={() => setPrivacyBlur((prev) => !prev)}
              title="隐私打码开关 (Cmd/Ctrl + H)"
              aria-label="切换金额隐私模糊"
              className={`rounded-xl p-2 text-xs transition ${
                privacyBlur
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-muted hover:bg-[var(--surface-elevated)]'
              }`}
            >
              {privacyBlur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="切换深浅色主题"
              className="rounded-xl p-2 text-muted hover:bg-[var(--surface-elevated)]"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => void fetchOverview(true)}
              title="刷新实时行情与账本数据"
              aria-label="刷新数据"
              className="rounded-xl p-2 text-muted hover:bg-[var(--surface-elevated)]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-400">
            连接后端失败：{error}
          </div>
        )}

        {!overview && loading ? (
          <div className="py-24 text-center text-sm text-muted">
            正在从 Mac Mini PostgreSQL 加载全资产账本…
          </div>
        ) : (
          overview && (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  data={overview}
                  onNavigate={setActiveTab}
                  onRefresh={(force) => void fetchOverview(Boolean(force))}
                />
              )}
              {activeTab === 'cards' && (
                <CreditCardsView onGlobalRefresh={() => void fetchOverview()} />
              )}
              {activeTab === 'budget' && (
                <BudgetView
                  onSelectCategoryTransactions={(ym, slug) => {
                    setTxJumpMonth(ym);
                    setTxJumpCategory(slug);
                    setActiveTab('transactions');
                  }}
                  onGlobalRefresh={() => void fetchOverview()}
                />
              )}
              {activeTab === 'transactions' && (
                <TransactionsView
                  initialYearMonth={txJumpMonth}
                  initialCategorySlug={txJumpCategory}
                  onGlobalRefresh={() => void fetchOverview()}
                />
              )}
              {activeTab === 'investments' && (
                <InvestmentsView onGlobalRefresh={() => void fetchOverview()} />
              )}
            </>
          )
        )}
      </main>

      <AiCopilotModal
        open={aiModalOpen}
        geminiEnabled={overview?.gemini_enabled ?? false}
        aiProvider={overview?.ai_provider}
        aiModel={overview?.ai_model}
        onClose={() => setAiModalOpen(false)}
      />
    </div>
  );
}
