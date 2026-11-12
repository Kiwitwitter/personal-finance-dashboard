# Personal Finance OS · Financial Command Center

[English](#english) | [简体中文](#简体中文)

---

<a id="english"></a>

## English

A self-hosted, real-time personal wealth, credit card, and budgeting command center built with **PostgreSQL 16 (Dual-Schema Architecture)**, **FastAPI (Async SQLAlchemy 2.0 + FastMCP)**, and **React 19 + TypeScript + Tailwind CSS v4**.

### Key Highlights

- **Non-Invasive Dual-Schema Isolation (`public.*` Read-Only + `app.*` Read-Write)**
  - Designed to sit cleanly alongside an existing Plaid ledger/holdings sync pipeline without ever mutating upstream `public.*` tables.
  - Custom account aliases, credit card statement/due dates, reward valuations, manual assets, budgets, transaction overrides, and merchant categorization rules live exclusively in `app.*` (with Alembic version tracking pinned to `app.alembic_version`).
- **Five Core Workspaces & Interactive Visual Charts**
  1. **Overview Command Center**: Unified live total assets & net worth KPIs, broad asset allocation donut chart, historical total assets vs. net worth dual-line area chart, 6-month cashflow & net savings bar chart, and upcoming credit card bill queue with miniature card art.
  2. **Credit Cards & Rewards Hub**: Realistic `1.586:1` skeuomorphic SVG card skins (with custom image URL override), collapsible grouping by issuing bank, revolving utilization tracking (`10%` / `30%` thresholds), charge-card detection, due-date inference, liquid cash coverage ratio, and multi-ecosystem **Points & Miles valuation** (`Chase UR`, `Amex MR`, `Bilt`, `Atmos`, `Hilton`, etc.).
  3. **Investments & Alternative Assets**: Real-time market pricing (`60s` auto-refresh + manual refresh) across equities, gold futures (`GC=F`), and spot crypto (`BTC-USD`, etc.), tax-wrapper allocation donut chart, position weight & intraday change mosaic, unrealized PnL diverging bar chart, 7-day sparklines, and CRUD management for physical precious metals & self-custody crypto included in net worth.
  4. **Monthly Budget & Subscriptions**: Timezone-aware (`America/Los_Angeles` default) calendar-month tracking, burn-rate pacing vs. elapsed month %, automatic exclusion of checking-to-credit-card bill payments to prevent double counting, and recurring subscription detection.
  5. **Transactions Workbench**: Multi-dimensional filtering, reactive daily spend pulse & category share charts, non-destructive per-transaction overrides, and one-click permanent merchant categorization rules.
- **Built-In AI CFO & Streamable HTTP MCP Server**
  - Connects to any OpenAI-compatible gateway (e.g., `CLIProxyAPI`) or native Google `GEMINI_API_KEY` for natural-language portfolio, credit card, and budget diagnostics.
  - Exposes a `/mcp` Streamable HTTP endpoint (including a `finance_ai_ro` read-only SQL sandbox tool) so external AI IDEs and agents can query your ledger safely.
- **Global Privacy Blur**: Press `Cmd + H` (`Ctrl + H` on Windows/Linux) or click the header eye toggle to blur all monetary amounts instantly.

### Project Structure

```text
personal-finance-dashboard/
├── backend/                  # FastAPI + Async SQLAlchemy 2.0 + Alembic + FastMCP
│   ├── alembic/              # Migrations isolated under schema "app"
│   └── app/
│       ├── api/              # REST API endpoints (/api/*)
│       ├── core/             # Settings & async PostgreSQL engine
│       ├── models/           # Read-only public.* & read-write app.* ORM models
│       ├── services/         # Ledger aggregation, classification, live quotes & AI CFO
│       └── mcp_server.py     # Streamable HTTP MCP tools (/mcp)
├── frontend/                 # React 19 + TypeScript + Vite + Tailwind CSS v4
│   └── src/
│       ├── components/       # SVG CreditCardArt, interactive Charts, ModalDialog, AI modal
│       └── views/            # Overview, CreditCards, Budget, Transactions, Investments
├── scripts/deploy.sh         # One-command rsync + Docker Compose remote deployment
├── Dockerfile                # Multi-stage Node 22 + Python 3.12 (uv) build
└── docker-compose.yml
```

### Quick Start (Local Development)

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL (plus optional AI_API_BASE_URL / AI_API_KEY)

# 1. Start Backend (FastAPI + Alembic)
cd backend
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 2. Start Frontend (Vite dev server)
cd ../frontend
npm install
npm run dev
```

### Docker Deployment

```bash
cp .env.example .env
# Configure DATABASE_URL and optional AI / MCP environment variables
docker compose up -d --build
```

For automated SSH deployment to a remote Linux host:

```bash
# Set REMOTE_HOST=your-linux-server in your local .env
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async PostgreSQL 16 connection URL |
| `TZ` / `APP_TIMEZONE` | `America/Los_Angeles` | Container & ledger calendar-month timezone |
| `AI_API_BASE_URL` | *(empty)* | Optional OpenAI-compatible `/v1` endpoint (e.g. `CLIProxyAPI`) |
| `AI_API_KEY` | *(empty)* | API key for `AI_API_BASE_URL` |
| `GEMINI_API_KEY` | *(empty)* | Native Google Gemini API key (used if `AI_API_BASE_URL` is unset) |
| `GEMINI_MODEL` | `gemini-3.8-flash-high` | Model identifier for the built-in AI CFO |
| `MCP_BEARER_TOKEN` | *(empty)* | Optional Bearer token protecting `/mcp` |
| `BIND_HOST` / `PORT` | `127.0.0.1` / `8000` | Host interface and port binding for Docker |

---

<a id="简体中文"></a>

## 简体中文

基于 **PostgreSQL 16 双 Schema 架构**、**FastAPI (Async SQLAlchemy 2.0 + FastMCP)** 与 **React 19 + TypeScript + Tailwind CSS v4** 构建的自托管个人全资产、信用卡与预算指挥中心。

### 核心特性

- **双 Schema 无损隔离 (`public.*` 只读 + `app.*` 读写)**
  - 完全兼容上游定时运行的 Plaid 账单/持仓同步管线（`public.*` 严格只读，零侵入）。
  - 所有账户别名、信用卡扩展配置、积分估值、自定义实物/加密资产、月度预算、单笔校准与商户归类规则均独立保存在 `app.*` Schema（Alembic 迁移版本表固定于 `app.alembic_version`）。
- **五大核心视图与交互式图表矩阵**
  1. **总览大盘 (Overview)**：全口径总资产与净资产实时汇总、大类资产环形图、历史资产净值双线面积图、近 6 个月真实收支与净储蓄柱状图、待还信用卡账单优先队列（带缩略卡面）。
  2. **信用卡中心 (Credit Cards)**：拟真 `1.586:1` 矢量卡面渲染（支持自定义卡面图片 URL）、按发卡行分组折叠/平铺切换、循环授信使用率（`10%` / `30%` 双警戒线）、签账卡自动识别、还款日智能推算、流动现金覆盖垫，以及多体系**信用卡积分与里程资产池**（UR / MR / Bilt / Atmos / Hilton 等估值与余额校准）。
  3. **投资与全资产 (Investments & Manual Assets)**：股票、黄金期货（`GC=F`）与加密货币现货（`BTC-USD` 等）**实时行情联动与 60s 自动刷新**、税收属性分层环形图、全仓位权重涨跌热力矩阵、未实现盈亏正负发散图、7 日迷你走势线，并支持添加自持实物贵金属与加密资产统一计入总资产。
  4. **月度预算 (Budget)**：支持自定义时区（默认 `America/Los_Angeles`）自然月统计、日历时间刻度对比（Burn Rate Pacing）、支票还信用卡内部转账自动防重算剔除、周期性订阅雷达。
  5. **账单工作台 (Transactions)**：多维高速检索过滤、筛选联动每日消费脉冲图与分类占比图、单笔无损覆盖校准、一键生成永久商户归类规则。
- **内置 AI 首席财务官 & 远程 MCP 服务**
  - 支持接入本地 OpenAI 兼容网关（如 `CLIProxyAPI`）或原生 `GEMINI_API_KEY` 进行实时账本诊断问答。
  - 内置 Streamable HTTP `/mcp` 端点（含 `finance_ai_ro` 只读 SQL 安全沙箱工具），方便在 AI IDE / Agent 客户端直连查账。
- **全局隐私模式**：按 `Cmd + H`（Windows/Linux `Ctrl + H`）或点击顶部眼睛按钮即可一键模糊所有金额数字。

### 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入 DATABASE_URL 等配置

# 1. 启动后端 (FastAPI + Alembic)
cd backend
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 2. 启动前端 (Vite + React)
cd ../frontend
npm install
npm run dev
```

### Docker 部署

```bash
cp .env.example .env
# 配置 DATABASE_URL，以及可选的 AI_API_BASE_URL / AI_API_KEY / GEMINI_API_KEY
docker compose up -d --build
```

若使用远程 Linux 服务器配合 SSH 一键构建部署：

```bash
# 在本地 .env 中设置 REMOTE_HOST=your-linux-server
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 环境变量说明

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL 16 异步连接串 |
| `TZ` / `APP_TIMEZONE` | `America/Los_Angeles` | 容器与自然月账本统计时区 |
| `AI_API_BASE_URL` | *(空)* | 可选 OpenAI 兼容 `/v1` 接口地址（如 `CLIProxyAPI`） |
| `AI_API_KEY` | *(空)* | 对应 `AI_API_BASE_URL` 的访问密钥 |
| `GEMINI_API_KEY` | *(空)* | 原生 Google Gemini API Key（未配网关时使用） |
| `GEMINI_MODEL` | `gemini-3.8-flash-high` | 内置 AI 财务助手调用的模型名称 |
| `MCP_BEARER_TOKEN` | *(空)* | 可选 `/mcp` 端点鉴权 Token |
| `BIND_HOST` / `PORT` | `127.0.0.1` / `8000` | Docker 宿主机监听地址与端口 |
