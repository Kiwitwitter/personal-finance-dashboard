import React, { useId, useState } from 'react';
import { Bot, Copy, Check, Send, Sparkles, Terminal } from 'lucide-react';
import { api, isImeComposing } from '../api';
import { ModalDialog } from './ModalDialog';

interface Props {
  open: boolean;
  geminiEnabled: boolean;
  aiProvider?: string;
  aiModel?: string;
  onClose: () => void;
}

const PRESETS = [
  '诊断我本月的预算消耗速度和主要超支风险',
  '分析我名下各银行信用卡的使用率、还款压力与积分兑换建议',
  '结合证券持仓、贵金属与加密资产，评估我的全口径资产配置与风险敞口',
];

export function AiCopilotModal({
  open,
  geminiEnabled,
  aiProvider = 'CLIProxyAPI',
  aiModel = 'gemini-3.8-flash-high',
  onClose,
}: Props) {
  const inputId = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const mcpUrl = `${window.location.origin}/mcp`;
  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        'personal-finance': {
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  );

  const submitQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      const res = await api.askAi(trimmed);
      setAnswer(res.answer);
      setUsedModel(res.model ?? aiModel);
    } catch (err) {
      setAnswer(`请求失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isImeComposing(e)) return;
      void submitQuestion(question);
    }
  };

  const copyMcp = async () => {
    await navigator.clipboard.writeText(mcpSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalDialog
      open={open}
      title="AI 财务副驾 & 远程 MCP 接入中心"
      subtitle={`已直连本机 ${aiProvider} (${aiModel}) 实时推理，并暴露 /mcp 供外部 Agent 查账`}
      onClose={onClose}
    >
      <div className="space-y-4 text-xs">
        {/* AI CFO Q&A (Primary Section) */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-sm">
              <Bot className="h-4 w-4 text-violet-400" />
              AI 首席财务官 (Gemini 3.8 Flash)
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                geminiEnabled
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-slate-500/20 text-muted'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {geminiEnabled
                ? `${aiProvider} · ${usedModel ?? aiModel} 在线`
                : '未配置 AI 接口'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuestion(p);
                  void submitQuestion(p);
                }}
                className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-left text-[11px] text-muted transition hover:border-sky-500/50 hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitQuestion(question);
            }}
            className="space-y-2 pt-1"
          >
            <label htmlFor={inputId} className="sr-only">
              输入你的财务问题
            </label>
            <textarea
              id={inputId}
              rows={2}
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题（Enter 发送，Shift+Enter 换行，兼容中文输入法候选词回车）…"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                {loading ? 'Gemini 3.8 Flash 思考分析中…' : '提问'}
              </button>
            </div>
          </form>

          {answer && (
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5 leading-relaxed">
              {answer}
            </div>
          )}
        </div>

        {/* Remote MCP Connection Card */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold text-sky-400">
              <Terminal className="h-3.5 w-3.5" />
              Antigravity 远程 MCP 端点（已就绪）
            </span>
            <button
              type="button"
              onClick={() => void copyMcp()}
              className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-400 hover:bg-sky-500/25"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? '已复制' : '复制 mcp_config.json'}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-2.5 text-[11px] text-slate-200">
            <code>{mcpSnippet}</code>
          </pre>
        </div>
      </div>
    </ModalDialog>
  );
}
