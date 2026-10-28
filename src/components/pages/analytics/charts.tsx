"use client";

import { useState } from "react";
import { ChartColumnIcon, TableIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/pages/shared/page-chrome";

/**
 * Chart colors. Categorical slots are validated (dataviz validate_palette.js)
 * against both the light (#fff) and dark (#181818) surfaces:
 *   slot 1 brand #8965de · slot 2 cyan #2a9fb8 → CVD ΔE 11.3, normal ΔE ≥ 15, contrast ≥ 3:1.
 * Status colors come straight from the app's status tokens.
 */
export const SERIES = {
  one: "var(--brand)",
  two: "#2a9fb8",
} as const;

export type Series = { id: string; label: string; color: string };

/* ------------------------------------------------------------------ scale */

export function niceScale(max: number, count = 4): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}

/* ------------------------------------------------------------------ card */

/** Chart card with a chart/table toggle so every value is reachable without hover. */
export function ChartCard({
  title,
  description,
  legend,
  actions,
  chart,
  table,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  legend?: Series[];
  actions?: React.ReactNode;
  chart: React.ReactNode;
  table: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const showLegend = !!legend && legend.length > 1 && view === "chart";
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <>
            {actions ? <div className="hidden md:contents">{actions}</div> : null}
            <div className="flex items-center rounded-lg bg-app p-0.5" role="group" aria-label="View">
              <ToggleIcon active={view === "chart"} label="Chart view" onClick={() => setView("chart")}>
                <ChartColumnIcon />
              </ToggleIcon>
              <ToggleIcon active={view === "table"} label="Table view" onClick={() => setView("table")}>
                <TableIcon />
              </ToggleIcon>
            </div>
          </>
        }
      />
      {showLegend ? <Legend series={legend} className="px-4 pt-3 max-md:hidden" /> : null}
      {/* Phones: card actions leave the header so the title keeps its width — beside the legend
          for charts that have one, otherwise in a footer row. */}
      {legend && legend.length > 1 && (actions || showLegend) ? (
        <div className="flex min-h-11 items-center gap-3 px-4 pt-3 md:hidden">
          {showLegend ? <Legend series={legend} className="min-w-0 flex-1 gap-x-3 gap-y-1" /> : <span className="flex-1" />}
          {actions}
        </div>
      ) : null}
      <div className="flex-1 p-4">{view === "chart" ? chart : table}</div>
      {actions && !(legend && legend.length > 1) ? (
        <div className="flex justify-end border-t border-subtle px-2 py-1.5 md:hidden">{actions}</div>
      ) : null}
    </Card>
  );
}

function ToggleIcon({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "flex size-9 items-center justify-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 md:size-9 [&_svg]:size-3.5",
            active ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-icon hover-fine:text-fg",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-4", className)}>
      {series.map((s) => (
        <li key={s.id} className="t-12 flex items-center gap-1.5 text-fg-2">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip row: short line key, strong value, secondary label. */
export function TipRow({ color, value, label }: { color?: string; value: React.ReactNode; label: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {color ? <span className="h-0.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden /> : null}
      <span className="font-medium tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ columns */

export type Column = {
  key: string;
  /** x-axis label */
  label: string;
  /** Long label for the tooltip/aria */
  title: string;
  /** One value per series, in series order */
  values: number[];
  emphasis?: boolean;
};

/**
 * Vertical (optionally stacked) column chart in HTML/CSS: hairline grid,
 * ≤24px columns with 4px rounded data-ends, 2px surface gaps between stacked
 * segments, a per-column tooltip on hover/focus and a direct label on the peak.
 */
export function ColumnChart({
  columns,
  series,
  format,
  formatTick = format,
  height = 180,
  labelEvery = 1,
  compactLabelEvery = labelEvery,
  unit = 1,
}: {
  columns: Column[];
  series: Series[];
  format: (v: number) => string;
  formatTick?: (v: number) => string;
  height?: number;
  labelEvery?: number;
  /** Label stride below md, counted from the emphasized column so it always keeps its label. */
  compactLabelEvery?: number;
  /** Ticks are rounded in this unit (e.g. 60 to get whole hours from minutes). */
  unit?: number;
}) {
  const totals = columns.map((c) => c.values.reduce((a, v) => a + v, 0));
  const max = Math.max(0, ...totals);
  const scaled = niceScale(max / unit);
  const top = scaled.top * unit;
  const ticks = scaled.ticks.map((t) => t * unit);
  const peak = max > 0 ? totals.indexOf(max) : -1;
  const y = (v: number) => (v / top) * height;
  const emphasized = columns.findLastIndex((c) => c.emphasis);
  const anchor = emphasized >= 0 ? emphasized : columns.length - 1;

  return (
    <div className="flex gap-2 pt-4" data-density="compact">
      {/* y axis */}
      <div className="relative w-8 shrink-0" style={{ height }} aria-hidden>
        {ticks.map((t) => (
          <span
            key={t}
            className="t-12 absolute right-0 translate-y-1/2 text-placeholder tabular-nums"
            style={{ bottom: y(t) }}
          >
            {formatTick(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn("pointer-events-none absolute inset-x-0 border-t", t === 0 ? "border-hairline" : "border-subtle")}
              style={{ bottom: y(t) }}
            />
          ))}
          <div
            className="relative grid h-full"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((c, i) => {
              const total = totals[i];
              const topIndex = c.values.reduce((acc, v, idx) => (v > 0 ? idx : acc), -1);
              return (
                <Tooltip key={c.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${c.title}: ${series.map((s, si) => `${s.label} ${format(c.values[si])}`).join(", ")}`}
                      className="group relative flex h-full flex-col items-center justify-end rounded-md px-0.5 outline-none focus-visible:bg-hover"
                    >
                      {i === peak ? (
                        <span
                          className="t-12 absolute left-1/2 -translate-x-1/2 text-fg-2 tabular-nums whitespace-nowrap"
                          style={{ bottom: y(total) + 6 }}
                        >
                          {format(total)}
                        </span>
                      ) : null}
                      <span className="flex w-full max-w-6 flex-col-reverse gap-[2px] transition-opacity duration-150 group-hover:opacity-80">
                        {c.values.map((v, si) =>
                          v > 0 ? (
                            <span
                              key={series[si].id}
                              className={cn("w-full", si === topIndex && "rounded-t-[4px]")}
                              style={{
                                height: Math.max(2, y(v) - (si === topIndex ? 0 : 2)),
                                background: series[si].color,
                              }}
                            />
                          ) : null,
                        )}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex-col items-start gap-1.5 py-2">
                    <span className="opacity-70">{c.title}</span>
                    {series.length > 1 ? (
                      <>
                        {series.map((s, si) => (
                          <TipRow key={s.id} color={s.color} value={format(c.values[si])} label={s.label} />
                        ))}
                        <TipRow value={format(total)} label="Total" />
                      </>
                    ) : (
                      <TipRow value={format(total)} label={series[0].label} />
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div
          className="mt-2 grid"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {columns.map((c, i) => {
            const wide = (columns.length - 1 - i) % labelEvery === 0;
            const compact = Math.abs(i - anchor) % compactLabelEvery === 0;
            return (
              <span key={c.key} className="flex min-w-0 justify-center">
                <span
                  className={cn(
                    "t-12-tight salt text-center whitespace-nowrap md:min-w-0 md:truncate",
                    c.emphasis ? "text-fg" : "text-placeholder",
                    wide && !compact && "max-md:invisible",
                    !wide && compact && "md:invisible",
                  )}
                >
                  {wide || compact ? c.label : ""}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ table */

export function DataTable({
  head,
  rows,
  foot,
}: {
  head: string[];
  rows: React.ReactNode[][];
  foot?: React.ReactNode[];
}) {
  return (
    <div className="scroll-thin max-h-[260px] overflow-auto rounded-lg border border-hairline">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-app">
          <tr className="h-10">
            {head.map((h, i) => (
              <th key={h} className={cn("t-14 px-2 font-medium whitespace-nowrap text-fg-2 md:px-3", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="h-10 border-t border-subtle">
              {r.map((cell, i) => (
                <td key={i} className={cn("t-14 px-2 whitespace-nowrap text-table md:px-3", i === 0 ? "text-left" : "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot ? (
          <tfoot>
            <tr className="h-10 border-t border-hairline bg-app">
              {foot.map((cell, i) => (
                <td key={i} className={cn("t-14 px-2 whitespace-nowrap text-fg md:px-3", i === 0 ? "text-left" : "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
