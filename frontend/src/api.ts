import type {
  AccountItem,
  BudgetDashboard,
  CategoryMeta,
  CreditCardsDashboard,
  InvestmentsDashboard,
  MerchantRuleItem,
  OverviewDashboard,
  TransactionsResponse,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getOverview: (refresh = false) =>
    request<OverviewDashboard>(`/api/overview${refresh ? '?refresh=true' : ''}`),
  getAccounts: () => request<AccountItem[]>('/api/accounts'),
  patchAccount: (accountId: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getCreditCards: () => request<CreditCardsDashboard>('/api/credit-cards'),
  patchCreditCard: (accountId: string, body: Record<string, unknown>) =>
    request<CreditCardsDashboard>(`/api/credit-cards/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  patchRewardProgram: (programCode: string, body: Record<string, unknown>) =>
    request<CreditCardsDashboard>(`/api/reward-programs/${encodeURIComponent(programCode)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getCategories: () => request<CategoryMeta[]>('/api/categories'),
  getBudgets: (yearMonth?: string) =>
    request<BudgetDashboard>(
      `/api/budgets${yearMonth ? `?year_month=${encodeURIComponent(yearMonth)}` : ''}`,
    ),
  upsertBudget: (categorySlug: string, body: Record<string, unknown>) =>
    request<BudgetDashboard>(`/api/budgets/${encodeURIComponent(categorySlug)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updateBudgetConfig: (includeFixedLoans: boolean) =>
    request<BudgetDashboard>('/api/budgets/settings/config', {
      method: 'PUT',
      body: JSON.stringify({ include_fixed_loans: includeFixedLoans }),
    }),
  getTransactions: (params: Record<string, string | number | boolean | undefined>) => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== false) {
        usp.set(k, String(v));
      }
    }
    return request<TransactionsResponse>(`/api/transactions?${usp.toString()}`);
  },
  patchTransaction: (txId: string, body: Record<string, unknown>) =>
    request<{ ok: boolean; created_rule_id: number | null }>(`/api/transactions/${txId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getRules: () => request<MerchantRuleItem[]>('/api/rules'),
  deleteRule: (ruleId: number) =>
    request<{ ok: boolean }>(`/api/rules/${ruleId}`, { method: 'DELETE' }),
  getInvestments: (refresh = false) =>
    request<InvestmentsDashboard>(`/api/investments${refresh ? '?refresh=true' : ''}`),
  createManualAsset: (body: Record<string, unknown>) =>
    request<InvestmentsDashboard>('/api/manual-assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateManualAsset: (assetId: number, body: Record<string, unknown>) =>
    request<InvestmentsDashboard>(`/api/manual-assets/${assetId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteManualAsset: (assetId: number) =>
    request<InvestmentsDashboard>(`/api/manual-assets/${assetId}`, {
      method: 'DELETE',
    }),
  askAi: (question: string, yearMonth?: string) =>
    request<{ enabled: boolean; answer: string; model?: string }>('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, year_month: yearMonth }),
    }),
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function fmtMoney(val: number | null | undefined, compact = false): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return compact ? usdCompactFormatter.format(val) : usdFormatter.format(val);
}

export function fmtSignedMoney(val: number): string {
  if (val > 0) return `+${usdFormatter.format(val)}`;
  return usdFormatter.format(val);
}

export function institutionBadgeClass(inst: string): string {
  const s = inst.toLowerCase();
  if (s.includes('american express') || s.includes('amex'))
    return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  if (s.includes('chase'))
    return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (s.includes('bank of america'))
    return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  if (s.includes('bilt'))
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  if (s.includes('schwab'))
    return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
  if (s.includes('fidelity'))
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (s.includes('paypal'))
    return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
}

export function isImeComposing(e: React.KeyboardEvent): boolean {
  // Catch IME candidate confirmation across Chromium, Firefox, and Safari WebKit bug 165004
  return e.nativeEvent.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229;
}
