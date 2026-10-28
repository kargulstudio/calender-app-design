"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightIcon, CheckIcon, Clock3Icon, FilePenLineIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addDays,
  formatDuration,
  formatShort,
  fromKey,
  MONTHS,
  MONTHS_SHORT,
  startOfWeek,
  WEEKDAYS,
} from "@/lib/dates";
import { computeLeaveStats, formatDays, LEAVE_TYPES, plural, workingDays } from "@/lib/leave";
import type { Invoice, InvoiceStatus, LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, PageRoot, StatGrid, StatTile } from "@/components/pages/shared/page-chrome";
import { ChartCard, ColumnChart, DataTable, SERIES, TipRow, type Column, type Series } from "./charts";

const fmtDays = (v: number) => `${formatDays(Math.round(v * 100) / 100)}d`;
const fmtHours = (minutes: number) => (minutes ? formatDuration(Math.round(minutes)) : "0h");

function invoiceTotal(inv: Invoice) {
  return inv.items.reduce((a, it) => a + it.quantity * it.rate, 0);
}

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function AnalyticsPage() {
  const today = useToday();
  const year = today.slice(0, 4);
  return (
    <PageRoot>
      <PageHeader
        title="Overview"
        description={`January 1 – ${MONTHS[fromKey(today).getMonth()]} ${fromKey(today).getDate()}, ${year} · leave, time and revenue at a glance`}
      />
      <div className="grid gap-3 p-4 md:gap-4">
        <KpiRow />
        <div className="grid grid-cols-1 gap-3 md:gap-4 xl:grid-cols-2">
          <LeavePerMonthCard />
          <HoursCard />
          <LeaveByTypeCard />
          <InvoicesCard />
        </div>
      </div>
    </PageRoot>
  );
}

/* ------------------------------------------------------------------ KPIs */

function KpiRow() {
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const settings = useAppStore((s) => s.settings);
  const holidays = useAppStore((s) => s.holidays);
  const timeEntries = useAppStore((s) => s.timeEntries);
  const invoices = useAppStore((s) => s.invoices);

  const kpis = useMemo(() => {
    const year = today.slice(0, 4);
    const stats = computeLeaveStats({ requests, settings, holidays }, today);
    const thisYear = requests.filter((r) => r.from.startsWith(year));
    const approved = thisYear.filter((r) => r.status === "approved").length;
    const declined = thisYear.filter((r) => r.status === "declined").length;
    const decided = approved + declined;

    const since = addDays(today, -29);
    const recent = timeEntries.filter((e) => e.date >= since && e.date <= today);
    const minutes = recent.reduce((a, e) => a + e.minutes, 0);
    const billable = recent.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);

    const currency = invoices[0]?.currency ?? "USD";
    const paid = invoices.filter((i) => i.status === "paid").reduce((a, i) => a + invoiceTotal(i), 0);
    const outstanding = invoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((a, i) => a + invoiceTotal(i), 0);

    return { stats, thisYear, approved, decided, minutes, billable, currency, paid, outstanding };
  }, [requests, settings, holidays, timeEntries, invoices, today]);

  const { stats } = kpis;
  return (
    <StatGrid>
      <StatTile
        icon="holidays"
        label="Days off approved"
        value={formatDays(stats.taken + stats.upcoming)}
        hint={`${formatDays(stats.taken)} taken · ${formatDays(stats.upcoming)} booked ahead`}
      />
      <StatTile
        icon="available"
        label="Approval rate"
        value={kpis.decided ? `${Math.round((kpis.approved / kpis.decided) * 100)}%` : "—"}
        hint={`${plural(kpis.thisYear.length, "request", "requests")} · ${stats.pendingCount} pending`}
      />
      <StatTile
        icon="per-year"
        label="Hours, last 30 days"
        value={fmtHours(kpis.minutes)}
        hint={kpis.minutes ? `${Math.round((kpis.billable / kpis.minutes) * 100)}% billable` : "No time tracked"}
      />
      <StatTile
        icon="upcoming"
        label="Revenue collected"
        value={money(kpis.paid, kpis.currency)}
        hint={`${money(kpis.outstanding, kpis.currency)} outstanding`}
      />
    </StatGrid>
  );
}

/* ------------------------------------------------------------------ leave per month */

function LeavePerMonthCard() {
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const holidays = useAppStore((s) => s.holidays);
  const year = today.slice(0, 4);
  const month = fromKey(today).getMonth();

  const perMonth = useMemo(() => {
    const out = Array.from({ length: 12 }, () => 0);
    for (const r of requests) {
      if (r.status !== "approved") continue;
      // Spread a request's days over the working days it covers (so a trip
      // across a month boundary lands in both months).
      const days = workingDays(r.from, r.to, holidays).filter((d) => d.startsWith(year));
      if (days.length) {
        for (const d of days) out[Number(d.slice(5, 7)) - 1] += r.days / days.length;
      } else if (r.from.startsWith(year)) {
        out[Number(r.from.slice(5, 7)) - 1] += r.days;
      }
    }
    return out;
  }, [requests, holidays, year]);

  const series: Series[] = [{ id: "approved", label: "Approved days", color: SERIES.one }];
  const columns: Column[] = perMonth.map((v, i) => ({
    key: String(i),
    label: MONTHS_SHORT[i],
    title: `${MONTHS[i]} ${year}`,
    values: [v],
    emphasis: i === month,
  }));
  const total = perMonth.reduce((a, v) => a + v, 0);

  return (
    <ChartCard
      title="Leave taken per month"
      description={`${plural(Math.round(total * 100) / 100, "approved day", "approved days")} in ${year}`}
      chart={<ColumnChart columns={columns} series={series} format={fmtDays} formatTick={(v) => formatDays(v)} compactLabelEvery={2} />}
      table={
        <DataTable
          head={["Month", "Approved days"]}
          rows={perMonth.map((v, i) => [MONTHS[i], formatDays(Math.round(v * 100) / 100)])}
          foot={["Total", formatDays(Math.round(total * 100) / 100)]}
        />
      }
    />
  );
}

/* ------------------------------------------------------------------ hours */

function HoursCard() {
  const today = useToday();
  const timeEntries = useAppStore((s) => s.timeEntries);
  const weekStartsOn = useAppStore((s) => s.settings.weekStartsOn);
  const [mode, setMode] = useState<"day" | "week">("day");

  const buckets = useMemo(() => {
    const sum = (from: string, to: string) => {
      let billable = 0;
      let other = 0;
      for (const e of timeEntries) {
        if (e.date < from || e.date > to) continue;
        if (e.billable) billable += e.minutes;
        else other += e.minutes;
      }
      return [billable, other];
    };
    if (mode === "day") {
      return Array.from({ length: 14 }, (_, i) => {
        const date = addDays(today, i - 13);
        const d = fromKey(date);
        return {
          key: date,
          label: String(d.getDate()),
          title: `${WEEKDAYS[d.getDay()]}, ${formatShort(date)}`,
          short: formatShort(date),
          values: sum(date, date),
          emphasis: date === today,
        };
      });
    }
    const current = startOfWeek(today, weekStartsOn);
    return Array.from({ length: 12 }, (_, i) => {
      const from = addDays(current, (i - 11) * 7);
      const to = addDays(from, 6);
      return {
        key: from,
        label: formatShort(from),
        title: `Week of ${formatShort(from)}`,
        short: formatShort(from),
        values: sum(from, to),
        emphasis: from === current,
      };
    });
  }, [timeEntries, today, weekStartsOn, mode]);

  const series: Series[] = [
    { id: "billable", label: "Billable", color: SERIES.one },
    { id: "non-billable", label: "Non-billable", color: SERIES.two },
  ];
  const billable = buckets.reduce((a, b) => a + b.values[0], 0);
  const other = buckets.reduce((a, b) => a + b.values[1], 0);
  const tickHours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10}h`;

  return (
    <ChartCard
      title="Hours tracked"
      description={`${fmtHours(billable + other)} in the last ${mode === "day" ? "14 days" : "12 weeks"} · ${fmtHours(billable)} billable`}
      legend={series}
      actions={
        <div className="flex items-center rounded-lg bg-app p-0.5 md:mr-1" role="group" aria-label="Group by">
          {(["day", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "t-12 h-9 rounded-md px-3.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 md:h-9 md:px-3",
                mode === m ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-fg-2 hover-fine:text-fg",
              )}
            >
              {m === "day" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      }
      chart={
        <ColumnChart
          columns={buckets}
          series={series}
          format={fmtHours}
          formatTick={tickHours}
          unit={60}
          labelEvery={mode === "week" ? 2 : 1}
          compactLabelEvery={mode === "week" ? 3 : 2}
        />
      }
      table={
        <DataTable
          head={[mode === "day" ? "Day" : "Week", "Billable", "Non-billable", "Total"]}
          rows={buckets.map((b) => [
            // Short dates on phones keep all four columns in view.
            <>
              <span className="md:hidden">{b.short}</span>
              <span className="max-md:hidden">{b.title}</span>
            </>,
            fmtHours(b.values[0]),
            fmtHours(b.values[1]),
            fmtHours(b.values[0] + b.values[1]),
          ])}
          foot={["Total", fmtHours(billable), fmtHours(other), fmtHours(billable + other)]}
        />
      }
    />
  );
}

/* ------------------------------------------------------------------ leave by type */

function LeaveByTypeCard() {
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const year = today.slice(0, 4);

  const rows = useMemo(() => {
    const map = new Map<LeaveType, { approved: number; pending: number; count: number }>(
      LEAVE_TYPES.map((t) => [t, { approved: 0, pending: 0, count: 0 }]),
    );
    for (const r of requests) {
      if (!r.from.startsWith(year)) continue;
      const row = map.get(r.type);
      if (!row) continue;
      row.count += 1;
      if (r.status === "approved") row.approved += r.days;
      if (r.status === "pending") row.pending += r.days;
    }
    return [...map.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.approved - a.approved);
  }, [requests, year]);

  const max = Math.max(0, ...rows.map((r) => r.approved));
  const total = rows.reduce((a, r) => a + r.approved, 0);

  return (
    <ChartCard
      title="Leave by type"
      description={`Approved days in ${year}, by leave type`}
      chart={
        <ul className="grid gap-1 pt-1">
          {rows.map((r) => {
            const pct = max ? (r.approved / max) * 100 : 0;
            return (
              <li key={r.type}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${r.type}: ${plural(r.approved, "approved day", "approved days")}, ${plural(r.pending, "pending day", "pending days")}`}
                      className="group grid h-9 w-full grid-cols-[112px_minmax(0,1fr)] items-center gap-3 rounded-md px-1 text-left outline-none focus-visible:bg-hover"
                    >
                      <span className="t-14 truncate text-fg-2">{r.type}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        {r.approved > 0 ? (
                          <span
                            className="h-5 rounded-r-[4px] transition-opacity duration-150 group-hover:opacity-80"
                            style={{ width: `calc(${pct}% - 48px)`, minWidth: 3, background: SERIES.one }}
                          />
                        ) : (
                          <span className="h-5 w-px bg-hairline" />
                        )}
                        <span className="t-12 shrink-0 text-fg-2 tabular-nums">{fmtDays(r.approved)}</span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex-col items-start gap-1.5 py-2">
                    <span className="opacity-70">{r.type}</span>
                    <TipRow color={SERIES.one} value={fmtDays(r.approved)} label="Approved" />
                    <TipRow value={fmtDays(r.pending)} label="Pending" />
                    <TipRow value={r.count} label={r.count === 1 ? "Request" : "Requests"} />
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      }
      table={
        <DataTable
          head={["Type", "Requests", "Approved", "Pending"]}
          rows={rows.map((r) => [r.type, r.count, fmtDays(r.approved), fmtDays(r.pending)])}
          foot={["Total", rows.reduce((a, r) => a + r.count, 0), fmtDays(total), fmtDays(rows.reduce((a, r) => a + r.pending, 0))]}
        />
      }
    />
  );
}

/* ------------------------------------------------------------------ invoices */

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  paid: { label: "Paid", tone: "success", icon: <CheckIcon /> },
  sent: { label: "Awaiting payment", tone: "warning", icon: <Clock3Icon /> },
  overdue: { label: "Overdue", tone: "danger", icon: <TriangleAlertIcon /> },
  draft: { label: "Draft", tone: "neutral", icon: <FilePenLineIcon /> },
};
const STATUS_ORDER: InvoiceStatus[] = ["paid", "sent", "overdue", "draft"];

function InvoicesCard() {
  const invoices = useAppStore((s) => s.invoices);
  const currency = invoices[0]?.currency ?? "USD";

  const rows = useMemo(
    () =>
      STATUS_ORDER.map((status) => {
        const list = invoices.filter((i) => i.status === status);
        return { status, count: list.length, amount: list.reduce((a, i) => a + invoiceTotal(i), 0) };
      }),
    [invoices],
  );
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const visible = rows.filter((r) => r.amount > 0);

  return (
    <ChartCard
      title="Invoice revenue by status"
      description={`${money(total, currency)} invoiced across ${plural(invoices.length, "invoice", "invoices")}`}
      actions={
        <Button variant="ghost" size="sm" asChild className="h-9 px-3 max-md:h-9 md:mr-1">
          <Link href="/invoice">
            Invoices <ArrowRightIcon />
          </Link>
        </Button>
      }
      chart={
        <div className="grid min-w-0 gap-5 pt-1">
          <div className="flex h-3 gap-[2px]" role="img" aria-label="Share of invoiced revenue by status">
            {visible.length === 0 ? <span className="h-full flex-1 rounded-[4px] bg-hairline" /> : null}
            {visible.map((r, i) => (
              <Tooltip key={r.status}>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className={cn(
                      "h-full outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand/40",
                      i === 0 && "rounded-l-[4px]",
                      i === visible.length - 1 && "rounded-r-[4px]",
                    )}
                    style={{ flexGrow: r.amount, flexBasis: 0, background: `var(--status-${INVOICE_STATUS[r.status].tone})` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="flex-col items-start gap-1.5 py-2">
                  <span className="opacity-70">{INVOICE_STATUS[r.status].label}</span>
                  <TipRow
                    color={`var(--status-${INVOICE_STATUS[r.status].tone})`}
                    value={money(r.amount, currency)}
                    label={`${Math.round((r.amount / total) * 100)}% of total`}
                  />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <ul className="grid">
            {rows.map((r) => {
              const s = INVOICE_STATUS[r.status];
              return (
                <li
                  key={r.status}
                  className="flex items-center gap-3 border-b border-subtle py-2.5 last:border-b-0 md:h-11 md:py-0"
                >
                  {/* Phones: badge over count on the left, amount over share on the right. */}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-3">
                    <span
                      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[6px] border pr-1.5 pl-1 [&_svg]:size-3.5"
                      style={{
                        background: `var(--status-${s.tone}-tint)`,
                        borderColor: `var(--status-${s.tone}-border)`,
                        color: `var(--status-${s.tone})`,
                      }}
                    >
                      {s.icon}
                      <span className="salt text-[12px] leading-none tracking-[-0.24px] whitespace-nowrap">{s.label}</span>
                    </span>
                    <span className="t-12 text-fg-2 md:flex-1">{plural(r.count, "invoice", "invoices")}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-3">
                    <span className="t-12 text-right text-placeholder tabular-nums max-md:order-last md:w-10">
                      {total ? `${Math.round((r.amount / total) * 100)}%` : "—"}
                    </span>
                    <span className="t-14 text-right text-fg tabular-nums md:w-24">{money(r.amount, currency)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      }
      table={
        <DataTable
          head={["Status", "Invoices", "Amount", "Share"]}
          rows={rows.map((r) => [
            INVOICE_STATUS[r.status].label,
            r.count,
            money(r.amount, currency),
            total ? `${Math.round((r.amount / total) * 100)}%` : "—",
          ])}
          foot={["Total", invoices.length, money(total, currency), total ? "100%" : "—"]}
        />
      }
    />
  );
}
