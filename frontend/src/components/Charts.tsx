import React, { useId, useState } from 'react';
import { fmtMoney } from '../api';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  size = 188,
  valueFormatter = (v) => fmtMoney(v, true),
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue?: string;
  size?: number;
  valueFormatter?: (val: number) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const validSlices = slices.filter((s) => s.value > 0);
  const total = validSlices.reduce((acc, s) => acc + s.value, 0);

  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted">
        暂无可视化分布数据
      </div>
    );
  }

  const radius = 68;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  const active = activeIndex !== null ? validSlices[activeIndex] : null;
  const displayTitle = active ? active.label : centerLabel;
  const displayVal = active
    ? valueFormatter(active.value)
    : centerValue ?? valueFormatter(total);
  const displayPct = active ? `${((active.value / total) * 100).toFixed(1)}%` : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90 overflow-visible">
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="var(--surface-elevated)"
            strokeWidth={strokeWidth}
          />
          {validSlices.map((s, idx) => {
            const frac = s.value / total;
            const dash = Math.max(frac * circumference - 1.5, 0.5);
            const offset = -cumulative * circumference;
            cumulative += frac;
            const isHovered = activeIndex === idx;
            return (
              <circle
                key={s.label}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={isHovered ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={offset}
                className="cursor-pointer transition-all duration-200"
                style={{
                  opacity: activeIndex === null || isHovered ? 1 : 0.45,
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <span className="max-w-[110px] truncate text-[11px] text-muted">{displayTitle}</span>
          <span className="money-val tabular-nums mt-0.5 text-base font-bold">
            {displayVal}
          </span>
          {displayPct && (
            <span className="tabular-nums text-[11px] font-semibold text-sky-400">
              {displayPct}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2 w-full">
        {validSlices.slice(0, 7).map((s, idx) => {
          const pct = ((s.value / total) * 100).toFixed(1);
          const isHovered = activeIndex === idx;
          return (
            <div
              key={s.label}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition ${
                isHovered ? 'bg-[var(--surface-elevated)]' : ''
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate font-medium">{s.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="money-val tabular-nums font-semibold">
                  {valueFormatter(s.value)}
                </span>
                <span className="tabular-nums w-11 text-right text-[11px] text-muted">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sparkline({
  points,
  positive,
  width = 88,
  height = 28,
}: {
  points: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}) {
  const uid = useId().replace(/:/g, '');
  if (!points || points.length < 2) {
    return <span className="text-[11px] text-muted">—</span>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const isUp = positive ?? points[points.length - 1] >= points[0];
  const color = isUp ? '#10b981' : '#f43f5e';

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((p - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${coords.join(' L ')}`;
  const areaPath = `${linePath} L ${width - 2},${height} L 2,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="inline-block overflow-visible"
    >
      <defs>
        <linearGradient id={`spk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spk-${uid})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AreaTrendChart({
  data,
  valueKey,
  secondaryKey,
  primaryColor = '#38bdf8',
  secondaryColor = '#10b981',
  primaryLabel = '主指标',
  secondaryLabel = '次指标',
  height = 195,
}: {
  data: Record<string, unknown>[];
  valueKey: string;
  secondaryKey?: string;
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="py-10 text-center text-xs text-muted">暂无历史趋势数据</div>;
  }

  const pts = data.map((d) => ({
    date: String(d.date ?? ''),
    v1: Number(d[valueKey] ?? 0),
    v2: secondaryKey !== undefined ? Number(d[secondaryKey] ?? 0) : null,
  }));

  const allVals = pts.flatMap((p) => (p.v2 !== null ? [p.v1, p.v2] : [p.v1]));
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const pad = (maxV - minV) * 0.15 || Math.abs(maxV) * 0.05 || 100;
  const lo = minV - pad;
  const hi = maxV + pad;
  const W = 560;
  const H = height;
  const padX = 14;
  const padY = 18;

  const toX = (i: number) =>
    pts.length === 1 ? W / 2 : padX + (i / (pts.length - 1)) * (W - padX * 2);
  const toY = (v: number) => H - padY - ((v - lo) / (hi - lo)) * (H - padY * 2);

  const line1 = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(p.v1).toFixed(1)}`).join(' ');
  const area1 = `${line1} L ${toX(pts.length - 1).toFixed(1)},${H - padY} L ${toX(0).toFixed(1)},${H - padY} Z`;

  const line2 =
    secondaryKey !== undefined
      ? pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(p.v2 ?? 0).toFixed(1)}`)
          .join(' ')
      : null;

  const activePt = hoverIdx !== null ? pts[hoverIdx] : pts[pts.length - 1];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <span className="text-muted">{primaryLabel}:</span>
            <strong className="money-val tabular-nums">{fmtMoney(activePt.v1)}</strong>
          </span>
          {secondaryKey && activePt.v2 !== null && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: secondaryColor }}
              />
              <span className="text-muted">{secondaryLabel}:</span>
              <strong className="money-val tabular-nums">{fmtMoney(activePt.v2)}</strong>
            </span>
          )}
        </div>
        <span className="tabular-nums text-[11px] text-muted">{activePt.date}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[0.2, 0.5, 0.8].map((r) => {
          const gy = padY + r * (H - padY * 2);
          return (
            <line
              key={r}
              x1={padX}
              x2={W - padX}
              y1={gy}
              y2={gy}
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        <path d={area1} fill={`url(#area-${uid})`} />
        {line2 && (
          <path
            d={line2}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}
        <path d={line1} fill="none" stroke={primaryColor} strokeWidth="2.6" strokeLinecap="round" />

        {pts.map((p, i) => {
          const cx = toX(i);
          const cy = toY(p.v1);
          const isHov = hoverIdx === i;
          return (
            <g key={`${p.date}-${i}`}>
              {isHov && (
                <line
                  x1={cx}
                  x2={cx}
                  y1={padY}
                  y2={H - padY}
                  stroke={primaryColor}
                  strokeOpacity="0.45"
                  strokeWidth="1"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isHov ? 5 : 3}
                fill={primaryColor}
                stroke="var(--surface-card)"
                strokeWidth="1.5"
              />
              <rect
                x={cx - W / Math.max(pts.length, 2) / 2}
                y={0}
                width={W / Math.max(pts.length, 2)}
                height={H}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(i)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DivergingBarChart({
  items,
}: {
  items: { label: string; sublabel?: string; value: number; pct?: number | null }[];
}) {
  if (!items.length) {
    return <div className="py-8 text-center text-xs text-muted">暂无持仓成本盈亏数据</div>;
  }
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const isPos = it.value >= 0;
        const widthPct = Math.min((Math.abs(it.value) / maxAbs) * 50, 50);
        return (
          <div key={it.label} className="grid grid-cols-12 items-center gap-2 text-xs">
            <div className="col-span-3 truncate font-semibold" title={it.sublabel ?? it.label}>
              {it.label}
            </div>
            <div className="relative col-span-6 h-5 rounded-md bg-[var(--surface-elevated)]">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border-subtle)]" />
              <div
                style={{
                  width: `${Math.max(widthPct, 1.2)}%`,
                  left: isPos ? '50%' : `${50 - widthPct}%`,
                }}
                className={`absolute top-1 bottom-1 rounded-sm transition-all ${
                  isPos ? 'bg-emerald-500/85' : 'bg-rose-500/85'
                }`}
              />
            </div>
            <div
              className={`money-val tabular-nums col-span-3 text-right font-semibold ${
                isPos ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPos ? '+' : ''}
              {fmtMoney(it.value, true)}
              {it.pct !== undefined && it.pct !== null && (
                <span className="ml-1 text-[10px] opacity-80">
                  ({isPos ? '+' : ''}
                  {it.pct.toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AllocationMosaic({
  items,
}: {
  items: { ticker: string; name: string; value: number; weight_pct: number; day_change_pct: number | null; category: string }[];
}) {
  if (!items.length) return null;

  const palette = (cat: string, chg: number | null) => {
    if (cat === 'crypto') return 'from-amber-500/30 to-orange-600/20 border-amber-500/40';
    if (cat === 'precious_metal') return 'from-yellow-400/30 to-amber-500/20 border-yellow-400/40';
    if (chg !== null && chg >= 0) return 'from-emerald-500/25 to-teal-600/15 border-emerald-500/35';
    if (chg !== null && chg < 0) return 'from-rose-500/25 to-pink-600/15 border-rose-500/35';
    return 'from-sky-500/25 to-indigo-600/15 border-sky-500/35';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const flexBasis = Math.max(it.weight_pct * 2.4, 14);
        return (
          <div
            key={`${it.ticker}-${it.category}`}
            style={{ flexGrow: Math.max(it.weight_pct, 2), flexBasis: `${flexBasis}%` }}
            className={`min-w-[112px] rounded-xl border bg-gradient-to-br p-3 transition hover:scale-[1.01] ${palette(
              it.category,
              it.day_change_pct,
            )}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold tracking-tight text-sm">{it.ticker}</span>
              <span className="tabular-nums text-[11px] font-semibold text-muted">
                {it.weight_pct}%
              </span>
            </div>
            <div className="money-val tabular-nums mt-1 text-sm font-bold">
              {fmtMoney(it.value, true)}
            </div>
            <div
              className={`tabular-nums mt-0.5 text-[11px] font-medium ${
                (it.day_change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {it.day_change_pct !== null
                ? `${it.day_change_pct >= 0 ? '+' : ''}${it.day_change_pct.toFixed(2)}% 1D`
                : '实时计价'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DailyPulseChart({
  series,
}: {
  series: { date: string; expense: number; income: number }[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!series || series.length === 0) {
    return <div className="py-8 text-center text-xs text-muted">当前筛选范围无日常消费脉冲</div>;
  }
  const maxExp = Math.max(...series.map((s) => s.expense), 1);
  const active = hoverIdx !== null ? series[hoverIdx] : series[series.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted">
          日期：<strong className="text-[var(--text-primary)]">{active.date}</strong>
        </span>
        <span className="money-val tabular-nums font-semibold text-sky-400">
          当日消费 {fmtMoney(active.expense)}
        </span>
      </div>
      <div className="flex h-32 items-end gap-1 border-b border-[var(--border-subtle)] pb-1">
        {series.map((pt, idx) => {
          const hPct = Math.max((pt.expense / maxExp) * 100, pt.expense > 0 ? 6 : 2);
          const isHov = hoverIdx === idx;
          return (
            <div
              key={pt.date}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex h-full flex-1 flex-col justify-end cursor-pointer"
              title={`${pt.date}: ${fmtMoney(pt.expense)}`}
            >
              <div
                style={{ height: `${hPct}%` }}
                className={`w-full rounded-t transition-all ${
                  isHov ? 'bg-sky-400' : 'bg-sky-500/75'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted tabular-nums">
        <span>{series[0]?.date.slice(5)}</span>
        <span>{series[Math.floor(series.length / 2)]?.date.slice(5)}</span>
        <span>{series[series.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
