"use client";

import { CalendarSyncIcon } from "lucide-react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addDays,
  formatRange,
  formatShort,
  formatWeekday,
  fromKey,
  isoWeek,
  monthName,
  startOfMonth,
  daysInMonth,
  weekDays,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore, type CalendarView } from "@/stores/calendar-store";
import { useGoogleStore } from "@/stores/google-store";

// Fixed segment geometry from the Figma so the active pill can slide.
const VIEWS: { id: CalendarView; label: string; left: number; width: number; key: string }[] = [
  { id: "day", label: "Day", left: 1, width: 45, key: "D" },
  { id: "week", label: "Week", left: 48, width: 51, key: "W" },
  { id: "month", label: "Month", left: 101, width: 61, key: "M" },
];

function useRangeLabel(visible: string[]) {
  const view = useCalendarStore((s) => s.view);
  const date = useCalendarStore((s) => s.date);
  const compact = useCalendarStore((s) => s.compact);
  const weekStartsOn = useAppStore((s) => s.settings.weekStartsOn);
  const year = fromKey(date).getFullYear();
  const title = `${monthName(date)}, ${year}`;

  if (view === "month") {
    const first = startOfMonth(date);
    return { title, subtitle: formatRange(first, addDays(first, daysInMonth(date) - 1)) };
  }
  const days = weekDays(date, weekStartsOn);
  // ISO weeks start on Monday; for Sunday-first weeks use that Monday.
  const week = isoWeek(weekStartsOn === 0 ? days[1] : days[0]);
  if (view === "day") return { title, subtitle: `Week ${isoWeek(date)} · ${formatWeekday(date)}, ${formatShort(date)}` };
  if (compact) {
    const first = visible[0];
    const last = visible[visible.length - 1];
    return { title: `${monthName(first)}, ${fromKey(first).getFullYear()}`, subtitle: `Week ${isoWeek(first)} · ${formatRange(first, last)}` };
  }
  return { title, subtitle: `Week ${week} · ${formatRange(days[0], days[6])}` };
}

/** Connects Google Calendar, or refreshes it once connected. Hidden when no client ID is configured. */
function GoogleSyncButton() {
  const status = useGoogleStore((s) => s.status);
  const syncing = useGoogleStore((s) => s.syncing);
  const account = useGoogleStore((s) => s.account);
  if (status === "unavailable") return null;

  const label =
    status === "connected"
      ? syncing
        ? "Syncing Google Calendar…"
        : `Synced with ${account ?? "Google Calendar"} — refresh`
      : status === "expired"
        ? "Reconnect Google Calendar"
        : status === "connecting"
          ? "Connecting to Google…"
          : "Connect Google Calendar";
  const dot = status === "connected" ? "bg-success" : status === "expired" ? "bg-danger" : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          aria-label={label}
          disabled={status === "connecting"}
          onClick={() => {
            const google = useGoogleStore.getState();
            void (status === "connected" ? google.refresh() : google.connect());
          }}
          className="relative shrink-0 max-md:size-8"
        >
          <CalendarSyncIcon className={cn("text-icon", syncing && "animate-pulse")} />
          {dot && <span aria-hidden className={cn("absolute top-1 right-1 size-1.5 rounded-full", dot)} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CalendarHeader({ days }: { days: string[] }) {
  const view = useCalendarStore((s) => s.view);
  const setView = useCalendarStore((s) => s.setView);
  const setDate = useCalendarStore((s) => s.setDate);
  const step = useCalendarStore((s) => s.step);
  const today = useToday();
  const compact = useCalendarStore((s) => s.compact);
  const { title, subtitle } = useRangeLabel(days);
  const active = VIEWS.find((v) => v.id === view)!;
  const unit = view === "day" ? "day" : view === "week" ? (compact ? "3 days" : "week") : "month";

  const activeIndex = VIEWS.indexOf(active);

  return (
    // Phones: two rows (range + navigation, then a full-width view switcher).
    // md+: the single 68px row from the design.
    <div className="flex w-full shrink-0 flex-col gap-3 overflow-hidden border-b border-hairline px-4 py-3 md:h-[68px] md:flex-row md:items-center md:gap-2 md:py-0">
      <div className="flex min-w-0 items-center gap-2 md:contents">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 overflow-hidden whitespace-nowrap">
          <h2 className="t-16 max-w-full truncate text-fg">{title}</h2>
          <p className="t-14 salt max-w-full truncate text-fg-2">{subtitle}</p>
        </div>

        <GoogleSyncButton />

        <Button size="sm" className="shrink-0 max-md:h-8" onClick={() => setDate(today)} aria-keyshortcuts="T">
          Today
        </Button>

        <div className="flex h-[30px] shrink-0 items-center overflow-hidden rounded-lg border border-control bg-surface max-md:h-8">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={`Previous ${unit}`}
                className="press flex h-full w-[29px] items-center justify-center outline-none hover-fine:bg-hover focus-visible:bg-hover max-md:w-9"
              >
                <Icon name="arrow-left" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Previous {unit}</TooltipContent>
          </Tooltip>
          <span className="h-full w-px bg-control" aria-hidden />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={`Next ${unit}`}
                className="press flex h-full w-[29px] items-center justify-center outline-none hover-fine:bg-hover focus-visible:bg-hover max-md:w-9"
              >
                <Icon name="arrow-right" className="-scale-x-100" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Next {unit}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Calendar view"
        className="relative flex h-[34px] w-full items-center gap-0.5 overflow-hidden rounded-lg bg-app p-px md:h-[30px] md:w-[163px]"
        style={{ "--w": `${active.width}px`, "--x": `${active.left}px`, "--i": activeIndex } as React.CSSProperties}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-px left-0 h-8 rounded-lg border border-segment bg-surface transition-[translate,width] duration-200 ease-(--ease-out) md:h-7",
            // Equal thirds on phones; the design's exact segment geometry from md up.
            "w-[calc((100%-6px)/3)] translate-x-[calc(var(--i)*(100%+2px)+1px)] md:w-(--w) md:translate-x-(--x)",
          )}
        />
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-keyshortcuts={v.key}
            onClick={() => setView(v.id)}
            style={{ "--seg": `${v.width}px` } as React.CSSProperties}
            className={cn(
              "t-14 salt relative z-10 flex h-8 flex-1 items-center justify-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 md:h-7 md:w-(--seg) md:flex-none md:shrink-0",
              view === v.id ? "text-fg" : "text-fg-2 hover-fine:text-fg",
            )}
          >
            {v.id === "week" ? (
              <>
                <span className="md:hidden">3 days</span>
                <span className="max-md:hidden">{v.label}</span>
              </>
            ) : (
              v.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
