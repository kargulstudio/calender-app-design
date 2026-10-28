"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowRightIcon,
  BellOffIcon,
  CalendarPlusIcon,
  CalendarX2Icon,
  FileUpIcon,
  PlusIcon,
  SettingsIcon,
  TimerIcon,
  UserRoundIcon,
} from "lucide-react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { eventStyle } from "@/components/calendar/event-colors";
import {
  diffDays,
  formatDuration,
  formatShort,
  formatTimeRange,
  formatWeekday,
  fromKey,
  MONTHS_SHORT,
  relativeTime,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  weekDays,
} from "@/lib/dates";
import { computeLeaveStats, formatDays, plural } from "@/lib/leave";
import type { CalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow, useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { openOverlay } from "@/stores/overlay-store";
import { Card, CardHeader, EmptyState, PageHeader, PageRoot, StatGrid, StatTile } from "@/components/pages/shared/page-chrome";

function greetingFor(now: number) {
  if (!now) return "Welcome back";
  const h = new Date(now).getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function dayLabel(today: string, date: string) {
  const n = diffDays(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 1 && n < 7) return formatWeekday(date);
  return formatShort(date);
}

export function DashboardPage() {
  const today = useToday();
  const now = useNow();
  const profile = useAppStore((s) => s.profile);
  const firstName = profile.name.trim().split(/\s+/)[0] || "there";
  const d = fromKey(today);

  return (
    <PageRoot>
      <PageHeader
        title={`${greetingFor(now)}, ${firstName}`}
        description={`${WEEKDAYS[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()} · Here’s what’s coming up`}
        actions={
          <>
            <Button className="h-9 px-3.5" onClick={() => openOverlay({ kind: "event", date: today })}>
              <PlusIcon className="text-icon" /> New event
            </Button>
            {/* Phones reach the calendar from the nav and the Upcoming card. */}
            <Button asChild className="h-9 px-3.5 max-md:hidden">
              <Link href="/time-off">
                <Icon name="nav-calendar" /> Open calendar
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-3 p-4 md:gap-4">
        <StatRow />
        <div className="grid grid-cols-1 items-start gap-3 md:gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-3 md:gap-4">
            <UpcomingCard />
            <WeekHoursCard />
          </div>
          <div className="grid min-w-0 gap-3 md:gap-4">
            <BalanceCard />
            <QuickActionsCard />
            <NotificationsCard />
          </div>
        </div>
      </div>
    </PageRoot>
  );
}

/* ------------------------------------------------------------------ stats */

function StatRow() {
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const settings = useAppStore((s) => s.settings);
  const holidays = useAppStore((s) => s.holidays);
  const timeEntries = useAppStore((s) => s.timeEntries);

  const stats = useMemo(() => computeLeaveStats({ requests, settings, holidays }, today), [requests, settings, holidays, today]);

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const pendingDays = pending.reduce((a, r) => a + r.days, 0);

  const week = useMemo(() => {
    const days = new Set(weekDays(today, settings.weekStartsOn));
    const list = timeEntries.filter((e) => days.has(e.date));
    const total = list.reduce((a, e) => a + e.minutes, 0);
    const billable = list.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
    return { total, billable };
  }, [timeEntries, today, settings.weekStartsOn]);

  const nextLeave = useMemo(
    () =>
      requests
        .filter((r) => (r.status === "approved" || r.status === "pending") && r.to >= today)
        .sort((a, b) => a.from.localeCompare(b.from))[0],
    [requests, today],
  );

  const total = stats.contract + stats.carryover;
  const inDays = nextLeave ? diffDays(today, nextLeave.from) : 0;

  return (
    <StatGrid>
      <StatTile
        icon="available"
        label="Available days"
        value={formatDays(stats.available)}
        hint={`of ${plural(total, "day", "days")} this year`}
        href="/time-off"
      />
      <StatTile
        icon="pending"
        label="Pending requests"
        value={pending.length}
        hint={pending.length ? `${plural(pendingDays, "day", "days")} awaiting approval` : "Nothing waiting on approval"}
        href="/time-off"
      />
      <StatTile
        icon="per-year"
        label="Tracked this week"
        value={formatDuration(week.total)}
        hint={
          week.total
            ? `${Math.round((week.billable / week.total) * 100)}% billable · ${formatDuration(week.billable)}`
            : "No time logged yet"
        }
        href="/time-tracking"
      />
      <StatTile
        icon="upcoming"
        label="Next time off"
        value={nextLeave ? formatShort(nextLeave.from) : "—"}
        hint={
          nextLeave
            ? `${inDays <= 0 ? "In progress" : inDays === 1 ? "Tomorrow" : `In ${inDays} days`} · ${nextLeave.type}${nextLeave.status === "pending" ? " (pending)" : ""}`
            : "Nothing booked yet"
        }
        href="/time-off"
      />
    </StatGrid>
  );
}

/* ------------------------------------------------------------------ upcoming */

function UpcomingCard() {
  const today = useToday();
  const now = useNow();
  const events = useAppStore((s) => s.events);
  const timeFormat = useAppStore((s) => s.settings.timeFormat);

  const nowMinutes = now ? new Date(now).getHours() * 60 + new Date(now).getMinutes() : 0;
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.date > today || (e.date === today && (e.allDay || e.end > nowMinutes)))
        .sort((a, b) => a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start - b.start)
        .slice(0, 6),
    [events, today, nowMinutes],
  );

  const open = (e: CalEvent) =>
    e.requestId
      ? openOverlay({ kind: "request-details", requestId: e.requestId })
      : openOverlay({ kind: "event", eventId: e.id });

  return (
    <Card>
      <CardHeader
        title="Upcoming"
        description="Your next events and time off"
        actions={
          <Button variant="ghost" size="sm" asChild className="h-9 px-3 max-md:h-9">
            <Link href="/time-off">
              View calendar <ArrowRightIcon />
            </Link>
          </Button>
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarX2Icon />}
          title="Your calendar is clear"
          hint="Nothing scheduled from today onward."
          action={
            <Button className="h-9 px-3.5" onClick={() => openOverlay({ kind: "event", date: today })}>
              <PlusIcon className="text-icon" /> New event
            </Button>
          }
        />
      ) : (
        <ul className="grid p-1.5">
          {upcoming.map((e) => {
            const dd = fromKey(e.date);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => open(e)}
                  className="flex h-14 w-full items-center gap-3 rounded-lg px-2.5 text-left outline-none transition-colors duration-150 hover-fine:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span
                    className="flex w-10 shrink-0 flex-col items-center gap-1 rounded-md py-1.5"
                    style={eventStyle(e.color)}
                  >
                    <span className="t-12 leading-none font-medium tracking-wide uppercase">{MONTHS_SHORT[dd.getMonth()]}</span>
                    <span className="t-14">{dd.getDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="t-14 truncate text-fg">{e.title}</span>
                    <span className="t-12 truncate text-fg-2">
                      {dayLabel(today, e.date)} · {e.allDay ? "All day" : formatTimeRange(e.start, e.end, timeFormat)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </span>
                  {e.note ? (
                    <span className="t-12 max-w-24 shrink-0 truncate rounded-md bg-app px-1.5 py-1 text-fg-2 sm:max-w-[160px]">{e.note}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ hours */

function WeekHoursCard() {
  const today = useToday();
  const timeEntries = useAppStore((s) => s.timeEntries);
  const weekStartsOn = useAppStore((s) => s.settings.weekStartsOn);

  const days = useMemo(() => {
    return weekDays(today, weekStartsOn).map((date) => {
      const list = timeEntries.filter((e) => e.date === date);
      const minutes = list.reduce((a, e) => a + e.minutes, 0);
      const billable = list.filter((e) => e.billable).reduce((a, e) => a + e.minutes, 0);
      return { date, minutes, billable };
    });
  }, [timeEntries, today, weekStartsOn]);

  const total = days.reduce((a, d) => a + d.minutes, 0);
  // Scale to at least a full 8h day so a light week doesn't look maxed out.
  const max = Math.max(480, ...days.map((d) => d.minutes));
  const PLOT = 120;

  return (
    <Card>
      <CardHeader
        title="Hours this week"
        description={total ? `${formatDuration(total)} tracked` : "No time tracked yet this week"}
        actions={
          <Button variant="ghost" size="sm" asChild className="h-9 px-3 max-md:h-9">
            <Link href="/time-tracking">
              <TimerIcon /> Time tracking
            </Link>
          </Button>
        }
      />
      <div className="px-4 pt-5 pb-4">
        <div className="relative" style={{ height: PLOT }}>
          {/* 8h reference line */}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-subtle"
            style={{ bottom: (480 / max) * PLOT }}
            aria-hidden
          >
            <span className="t-12 absolute -top-2 right-0 bg-surface pl-1.5 text-placeholder">8h</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 border-t border-hairline" aria-hidden />
          <div className="relative grid h-full grid-cols-7 gap-2 pr-8">
            {days.map((d) => {
              const h = d.minutes ? Math.max(4, (d.minutes / max) * PLOT) : 0;
              const isToday = d.date === today;
              return (
                <Tooltip key={d.date}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${formatWeekday(d.date)}: ${d.minutes ? formatDuration(d.minutes) : "no time"} tracked`}
                      className="group flex h-full flex-col items-center justify-end gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      {/* Touch has no hover tooltip: label the bars directly on phones. */}
                      {d.minutes ? (
                        <span className={cn("t-12-tight tabular-nums md:hidden", isToday ? "text-brand" : "text-fg-2")}>
                          {Math.round(d.minutes / 6) / 10}h
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "w-full max-w-6 rounded-t-[4px] transition-opacity duration-150 group-hover:opacity-80",
                          isToday ? "bg-brand" : "bg-[var(--event-purple-bg)]",
                        )}
                        style={{ height: h }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex-col items-start gap-1">
                    <span className="font-medium">{d.minutes ? formatDuration(d.minutes) : "0h"}</span>
                    <span className="opacity-70">
                      {formatWeekday(d.date)}, {formatShort(d.date)}
                      {d.minutes ? ` · ${formatDuration(d.billable)} billable` : ""}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2 pr-8">
          {days.map((d) => (
            <span
              key={d.date}
              className={cn("t-12-tight salt text-center", d.date === today ? "text-brand" : "text-placeholder")}
            >
              {WEEKDAYS_SHORT[fromKey(d.date).getDay()]}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ balance */

function BalanceCard() {
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const settings = useAppStore((s) => s.settings);
  const holidays = useAppStore((s) => s.holidays);
  const stats = useMemo(() => computeLeaveStats({ requests, settings, holidays }, today), [requests, settings, holidays, today]);

  const total = stats.contract + stats.carryover;
  const used = stats.taken + stats.upcoming;
  const pct = (n: number) => (total ? Math.min(100, (n / total) * 100) : 0);

  const rows: { label: string; value: number; dot?: string }[] = [
    { label: "Taken", value: stats.taken, dot: "bg-success" },
    { label: "Booked ahead", value: stats.upcoming, dot: "bg-[var(--event-green-bg)]" },
    { label: "Pending approval", value: stats.pendingDays, dot: "bg-warning" },
    { label: "Available", value: stats.available, dot: "bg-hairline" },
  ];

  return (
    <Card>
      <CardHeader
        title="Leave balance"
        description={`${stats.contract} contract + ${stats.carryover} carryover days`}
        actions={
          <Button variant="ghost" size="sm" className="h-9 px-3 max-md:h-9" onClick={() => openOverlay({ kind: "policy" })}>
            Policy
          </Button>
        }
      />
      <div className="grid gap-4 p-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] leading-none font-medium tracking-[-0.84px] text-fg">{formatDays(stats.available)}</span>
          <span className="t-14 text-fg-2">of {formatDays(total)} days left</span>
        </div>
        <div
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`${formatDays(used)} used, ${formatDays(stats.pendingDays)} pending, ${formatDays(stats.available)} available`}
        >
          {stats.taken > 0 && <span className="h-full rounded-l-full bg-success" style={{ width: `${pct(stats.taken)}%` }} />}
          {stats.upcoming > 0 && <span className="h-full bg-[var(--event-green-bg)]" style={{ width: `${pct(stats.upcoming)}%` }} />}
          {stats.pendingDays > 0 && <span className="h-full bg-warning" style={{ width: `${pct(stats.pendingDays)}%` }} />}
          <span className="h-full flex-1 rounded-r-full bg-hairline" />
        </div>
        <ul className="grid gap-2.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", r.dot)} aria-hidden />
              <span className="t-14 flex-1 text-fg-2">{r.label}</span>
              <span className="t-14 text-fg tabular-nums">{plural(r.value, "day", "days")}</span>
            </li>
          ))}
        </ul>
        <Button variant="brand" className="w-full h-9 px-3.5 max-md:h-10" onClick={() => openOverlay({ kind: "request" })}>
          <Icon name="request-time-off" className="text-white" /> Request time-off
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ quick actions */

function QuickActionsCard() {
  const today = useToday();
  const actions: { label: string; icon: React.ReactNode; href?: string; onClick?: () => void }[] = [
    { label: "New event", icon: <CalendarPlusIcon />, onClick: () => openOverlay({ kind: "event", date: today }) },
    { label: "Holidays", icon: <Icon name="nav-calendar" />, onClick: () => openOverlay({ kind: "holidays" }) },
    { label: "Upload file", icon: <FileUpIcon />, href: "/documents" },
    { label: "Log time", icon: <TimerIcon />, href: "/time-tracking" },
    { label: "Edit profile", icon: <UserRoundIcon />, href: "/personal-details" },
    { label: "Settings", icon: <SettingsIcon />, href: "/settings" },
  ];
  const cls =
    "press flex h-10 items-center gap-2 md:h-9 rounded-lg border border-control bg-surface px-2.5 text-left outline-none transition-colors duration-150 hover-fine:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-icon";
  return (
    <Card>
      <CardHeader title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 p-3">
        {actions.map((a) =>
          a.href ? (
            <Link key={a.label} href={a.href} className={cls}>
              {a.icon}
              <span className="t-14 salt truncate text-fg">{a.label}</span>
            </Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={cls}>
              {a.icon}
              <span className="t-14 salt truncate text-fg">{a.label}</span>
            </button>
          ),
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ notifications */

function NotificationsCard() {
  const router = useRouter();
  const now = useNow();
  const notifications = useAppStore((s) => s.notifications);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAll = useAppStore((s) => s.markAllNotificationsRead);
  const recent = notifications.slice(0, 4);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Card>
      <CardHeader
        title="Recent notifications"
        description={unread ? `${unread} unread` : "You’re all caught up"}
        actions={
          unread ? (
            <Button variant="ghost" size="sm" onClick={markAll} className="t-12 h-9 px-3 max-md:h-9">
              Mark all read
            </Button>
          ) : null
        }
      />
      {recent.length === 0 ? (
        <EmptyState icon={<BellOffIcon />} title="No notifications" hint="Approvals and reminders will show up here." />
      ) : (
        <ul className="grid p-1.5">
          {recent.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  markRead(n.id);
                  if (n.href) router.push(n.href);
                }}
                className="flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left outline-none transition-colors duration-150 hover-fine:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline gap-2">
                    <span className="t-14 min-w-0 flex-1 truncate text-fg">{n.title}</span>
                    <span className="t-12 shrink-0 text-placeholder">{now ? relativeTime(n.createdAt, now) : ""}</span>
                  </span>
                  <span className="t-12 line-clamp-2 leading-[1.35] text-fg-2">{n.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
