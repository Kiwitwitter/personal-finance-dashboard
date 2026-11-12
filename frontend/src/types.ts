export interface SyncStatus {
  latest_run_id: number | null;
  batch: string | null;
  status: string;
  started_at: string | null;
  txn_date_to: string | null;
  hours_since_sync: number | null;
  is_stale: boolean;
  connections_total: number;
  connections_active: number;
  degraded_connections: { institution: string; status: string }[];
  institutions: { id: string; name: string; provider: string; status: string }[];
}

export interface AccountItem {
  id: string;
  institution_name: string;
  class: 'cash' | 'investment' | 'liability' | string;
  type: string | null;
  subtype: string | null;
  mask: string | null;
  raw_name: string | null;
  official_name: string | null;
  display_name: string;
  custom_display_name: string | null;
  currency: string;
  current_balance: number;
  available_balance: number | null;
  is_hidden: boolean;
  include_in_net_worth: boolean;
  notes: string | null;
}

export interface CreditCardSummary {
  card_count: number;
  total_balance: number;
  total_revolving_limit: number;
  overall_utilization_pct: number;
  cards_over_30_pct: number;
  total_annual_fees: number;
  liquid_cash_available: number;
  net_cash_after_all_cards: number;
  cash_coverage_ratio: number;
  due_within_14d_amount: number;
  due_within_14d_count: number;
}

export interface CreditCardItem {
  account_id: string;
  institution_name: string;
  raw_name: string | null;
  official_name?: string | null;
  mask: string | null;
  display_name: string;
  custom_display_name: string | null;
  card_skin?: string | null;
  detected_skin?: string;
  effective_skin?: string;
  card_image_url?: string | null;
  points_program_code?: string;
  points_program_name?: string;
  points_cpp?: number;
  month_points_earned?: number;
  year_points_earned?: number;
  year_points_value_usd?: number;
  earn_rate_summary?: string;
  current_balance: number;
  available_credit: number | null;
  effective_limit: number | null;
  credit_limit_override: number | null;
  is_charge_card: boolean;
  utilization_pct: number | null;
  utilization_status: 'excellent' | 'good' | 'high' | 'charge' | 'unknown';
  month_spend: number;
  month_tx_count: number;
  statement_closing_day: number | null;
  payment_due_day: number | null;
  inferred_due_day: number | null;
  due_date_is_inferred: boolean;
  next_due_date: string | null;
  days_until_due: number | null;
  apr_pct: number | null;
  minimum_payment: number | null;
  annual_fee: number;
  annual_fee_month: number | null;
  autopay_enabled: boolean;
  reward_notes: string | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
}

export interface CreditCardIssuerGroup {
  institution_name: string;
  card_count: number;
  total_balance: number;
  total_revolving_limit: number;
  utilization_pct: number | null;
  month_spend: number;
  annual_fees: number;
  month_points_earned?: number;
  year_points_earned?: number;
  cards: CreditCardItem[];
}

export interface RewardProgramItem {
  program_code: string;
  display_name: string;
  issuer_group: string;
  confirmed_points: number | null;
  estimated_12m_points: number;
  month_points_earned: number;
  effective_points: number;
  is_calibrated: boolean;
  cpp_valuation: number;
  estimated_value_usd: number;
  cards_count: number;
  color: string;
  notes: string | null;
}

export interface RewardsSummary {
  total_estimated_value_usd: number;
  month_points_earned: number;
  year_points_earned: number;
  programs_count: number;
}

export interface CreditCardsDashboard {
  as_of_date: string;
  current_month: string;
  summary: CreditCardSummary;
  cards: CreditCardItem[];
  issuer_groups?: CreditCardIssuerGroup[];
  reward_programs?: RewardProgramItem[];
  rewards_summary?: RewardsSummary;
}

export interface CashflowTrendPoint {
  year_month: string;
  income: number;
  living_expense: number;
  fixed_loans: number;
  net_cashflow: number;
  total_outflow: number;
}

export interface BudgetCategoryItem {
  category_slug: string;
  name_zh: string;
  name_en: string;
  group_name: string;
  color: string;
  icon: string;
  base_monthly_limit: number | null;
  effective_limit: number | null;
  rollover_enabled: boolean;
  rollover_adjustment: number;
  alert_threshold_pct: number;
  spent: number;
  remaining: number | null;
  pct_used: number | null;
  pace_delta_pct: number | null;
  status: 'on_track' | 'watch' | 'over_budget' | 'unbudgeted';
  tx_count: number;
  top_merchants: { merchant: string; amount: number }[];
}

export interface SubscriptionDetected {
  merchant_key: string;
  display_name: string;
  expected_amount: number;
  last_amount: number;
  last_charged_date: string;
  next_expected_date: string | null;
  months_seen: number;
  account_label: string;
}

export interface BudgetDashboard {
  year_month: string;
  available_months: string[];
  days_elapsed: number;
  days_in_month: number;
  month_elapsed_pct: number;
  settings: {
    include_fixed_loans: boolean;
  };
  summary: {
    total_budgeted: number;
    total_budgeted_spent: number;
    unbudgeted_spent: number;
    total_living_spent: number;
    fixed_loans_paid: number;
    cc_payments_excluded: number;
    month_income: number;
    net_savings: number;
    budget_used_pct: number;
    remaining_budget: number;
  };
  categories: BudgetCategoryItem[];
  cashflow_trend: CashflowTrendPoint[];
  subscriptions: SubscriptionDetected[];
}

export interface ManualAssetItem {
  id: number;
  name: string;
  asset_type: 'precious_metal' | 'crypto' | 'real_estate' | 'collectible' | 'other' | string;
  symbol: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  market_value: number;
  cost_basis_total: number | null;
  manual_unit_price: number | null;
  unrealized_gain: number | null;
  unrealized_gain_pct: number | null;
  day_change_pct: number | null;
  day_change_value: number;
  sparkline: number[];
  quote_source: string;
  quote_updated_at: string | null;
  include_in_net_worth: boolean;
  notes: string | null;
}

export interface OverviewDashboard {
  as_of: string;
  timezone: string;
  gemini_enabled: boolean;
  ai_provider?: string;
  ai_model?: string;
  sync: SyncStatus;
  net_worth: {
    net_worth: number;
    total_assets: number;
    total_liabilities: number;
    cash_total: number;
    investment_total: number;
    alternative_total: number;
    gold_total: number;
    crypto_total: number;
    credit_card_debt: number;
    loan_debt: number;
    liquid_cash_available: number;
    portfolio_day_change?: number;
    portfolio_day_change_pct?: number;
    rewards_estimated_usd?: number;
  };
  asset_allocation?: { label: string; value: number; color: string }[];
  manual_assets?: ManualAssetItem[];
  net_worth_history: {
    date: string;
    cash: number;
    investment: number;
    alternative?: number;
    total_assets?: number;
    liabilities: number;
    net_worth: number;
  }[];
  credit_cards_pulse: CreditCardSummary;
  rewards_pulse?: RewardsSummary;
  upcoming_cards: CreditCardItem[];
  budget_pulse: BudgetDashboard['summary'] & {
    year_month: string;
    month_elapsed_pct: number;
  };
  cashflow_trend: CashflowTrendPoint[];
  accounts: AccountItem[];
}

export interface CategoryMeta {
  slug: string;
  name_zh: string;
  name_en: string;
  group_name: string;
  color: string;
  icon: string;
  is_income: boolean;
  is_transfer: boolean;
}

export interface TransactionItem {
  id: string;
  date: string;
  account_id: string;
  account_name: string;
  institution_name: string;
  account_subtype: string | null;
  source: string;
  amount: number;
  pending: boolean;
  raw_name: string | null;
  raw_merchant: string | null;
  plaid_category: string | null;
  display_merchant: string;
  category_slug: string;
  category_name_zh: string;
  category_color: string;
  tx_kind: 'expense' | 'income' | 'cc_payment' | 'loan_payment' | 'internal_transfer' | 'ignored' | string;
  is_overridden: boolean;
  matched_rule_id: number | null;
  is_reviewed: boolean;
  notes: string | null;
  tags: string[];
}

export interface TransactionsResponse {
  total_count: number;
  limit: number;
  offset: number;
  filtered_expense_net: number;
  filtered_income_total: number;
  daily_spend_series?: { date: string; expense: number; income: number }[];
  category_breakdown?: { slug: string; name_zh: string; color: string; amount: number }[];
  items: TransactionItem[];
}

export interface MerchantRuleItem {
  id: number;
  match_pattern: string;
  match_type: string;
  target_merchant: string | null;
  target_category_slug: string | null;
  target_tx_kind: string | null;
  priority: number;
  is_active: boolean;
}

export interface BroadPositionItem {
  ticker: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  value: number;
  weight_pct: number;
  day_change_pct: number | null;
  day_change_value: number;
  unrealized_gain: number | null;
  unrealized_gain_pct: number | null;
  sparkline: number[];
}

export interface InvestmentsDashboard {
  total_portfolio_value: number;
  brokerage_portfolio_value: number;
  manual_assets_value: number;
  total_day_change: number;
  total_day_change_pct: number;
  quotes_updated_at: string | null;
  holdings_snapshot_date: string | null;
  by_tax_bucket: { bucket: string; value: number; weight_pct: number }[];
  by_institution: { institution: string; value: number; weight_pct: number }[];
  manual_assets: ManualAssetItem[];
  broad_positions: BroadPositionItem[];
  accounts: {
    id: string;
    institution_name: string;
    subtype: string | null;
    tax_bucket: string;
    mask: string | null;
    display_name: string;
    snapshot_balance?: number;
    current_balance: number;
    live_delta?: number;
    weight_pct: number;
  }[];
  consolidated_positions: {
    ticker: string;
    security_name: string;
    security_type: string;
    total_quantity: number;
    price: number;
    snapshot_price?: number;
    day_change_pct: number | null;
    day_change_value: number;
    sparkline: number[];
    quote_source?: string;
    total_value: number;
    total_cost: number;
    has_cost: boolean;
    accounts_count: number;
    weight_pct: number;
    unrealized_gain: number | null;
    unrealized_gain_pct: number | null;
  }[];
  holdings: {
    security_key: string;
    ticker: string;
    security_name: string;
    security_type: string;
    account_id: string;
    account_name: string;
    institution_name: string;
    quantity: number;
    snapshot_price?: number;
    price: number;
    market_value: number;
    day_change_pct?: number | null;
    day_change_value?: number;
    sparkline?: number[];
    cost_basis: number | null;
    unrealized_gain: number | null;
    unrealized_gain_pct: number | null;
  }[];
  recent_transactions: {
    id: string;
    date: string;
    type: string;
    ticker: string;
    security_name: string | null;
    quantity: number | null;
    price: number | null;
    amount: number;
    account_name: string;
    institution_name: string;
  }[];
}
