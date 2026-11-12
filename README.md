# Personal Finance OS · Financial Command Center

基于 **PostgreSQL 16 双 Schema 架构**、**FastAPI (Async SQLAlchemy 2.0)** 与 **React 19 + TypeScript + Tailwind CSS v4** 构建的自托管个人全资产与预算工作台。

## 核心特性

- **双 Schema 无损隔离 (`public.*` 只读 + `app.*` 读写)**
  - 完全兼容上游定时运行的 Plaid 账单/持仓同步管线（`public.*` 严格只读，零侵入）。
  - 所有账户别名、信用卡扩展配置、积分估值、自定义实物/加密资产、月度预算与商户归类规则均独立保存在 `app.*` Schema（Alembic 迁移版本表固定于 `app.alembic_version`）。
- **五大核心视图与交互式图表矩阵**
  1. **总览大盘 (Overview)**：全口径总资产与净资产实时汇总、大类资产环形图、历史资产净值双线面积图、近 6 个月真实收支与净储蓄柱状图、待还信用卡账单优先队列（带缩略卡面）。
  2. **信用卡中心 (Credit Cards)**：拟真 `1.586:1` 矢量卡面渲染（支持自定义卡面图片）、按发卡行分组折叠/平铺切换、循环授信使用率（10% / 30% 警戒线）、签账卡自动识别、还款日智能推算、流动现金覆盖垫，以及多体系**信用卡积分与里程资产池**（UR / MR / Bilt / Atmos / Hilton 等估值与余额校准）。
  3. **投资与全资产 (Investments & Manual Assets)**：股票、黄金期货（`GC=F`）与加密货币现货（`BTC-USD` 等）**实时行情联动与 60s 自动刷新**、税收属性分层环形图、全仓位权重涨跌热力矩阵、未实现盈亏正负发散图、7 日迷你走势线，并支持添加自持实物贵金属/加密资产统一计入总资产。
  4. **月度预算 (Budget)**：可配置时区（默认 `America/Los_Angeles`）自然月统计、日历时间刻度对比（Burn Rate Pacing）、支票还信用卡内部转账自动防重算剔除、周期性订阅雷达。
  5. **账单工作台 (Transactions)**：多维高速检索过滤、筛选联动每日消费脉冲图与分类占比图、单笔无损覆盖校准、一键生成永久商户归类规则。
- **AI 首席财务官 & 远程 MCP 服务**
  - 支持接入本地 OpenAI 兼容网关（如 `CLIProxyAPI`）或原生 `GEMINI_API_KEY` 进行实时账本诊断问答。
  - 内置 Streamable HTTP `/mcp` 端点（含 `finance_ai_ro` 只读 SQL 安全沙箱工具），方便在 AI IDE / Agent 客户端直连查账。
- **全局隐私模式**：按 `Cmd + H`（Windows/Linux `Ctrl + H`）或点击顶部眼睛按钮一键模糊所有金额数字。

---

## 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入你的 DATABASE_URL 等配置

# 启动后端 (FastAPI + Alembic)
cd backend
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 启动前端 (Vite + React)
cd ../frontend
npm install
npm run dev
```

---

## Docker 部署

```bash
cp .env.example .env
# 配置 DATABASE_URL，以及可选的 AI_API_BASE_URL / AI_API_KEY / GEMINI_API_KEY
docker compose up -d --build
```

若使用远程 Linux 服务器配合 SSH 免密部署：

```bash
# 在本地 .env 中设置 REMOTE_HOST=your-linux-server
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```
