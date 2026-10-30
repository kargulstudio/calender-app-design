"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay } from "@/stores/overlay-store";
import { eventStyle } from "./event-colors";

type Chip = { kind: "event" | "holiday"; id: string; title: string; style: React.CSSProperties };

const CHIP_HEIGHT = 28;
const CHIP_GAP = 4;
const ROW_PADDING = 5.5;

/** The all-day lane above the time grid: holidays first, then all-day events. */
export function AllDayRow({ days }: { days: string[] }) {
  const events = useCalendarEvents();
  const holidays = useAppStore((s) => s.holidays);
  const openPopover = useCalendarStore((s) => s.openPopover);

  const chipsByDay = useMemo(
    () =>
      days.map((day): Chip[] => [
        ...holidays
          .filter((h) => h.date === day)
          .map((h) => ({ kind: "holiday" as const, id: h.id, title: "National holiday", style: eventStyle("purple") })),
        ...events
          .filter((e) => e.allDay && e.date === day)
          .map((e) => ({ kind: "event" as const, id: e.id, title: e.title, style: eventStyle(e.color) })),
      ]),
    [days, events, holidays],
  );

  const most = Math.max(1, ...chipsByDay.map((c) => c.length));
  const height = ROW_PADDING * 2 + most * CHIP_HEIGHT + (most - 1) * CHIP_GAP + 1;

  return (
    <div className="flex w-full shrink-0 items-stretch overflow-hidden border-b border-hairline" style={{ height }}>
      <div className="sticky left-0 z-10 flex w-(--axis) shrink-0 items-center justify-end bg-surface pr-3 max-md:pr-1.5">
        {most > 1 && <span className="t-12 text-placeholder max-md:text-[10px]">All day</span>}
      </div>
      {days.map((day, i) => (
        <div
          key={day}
          role="group"
          aria-label="All-day events"
          onClick={(e) => {
            if (e.target === e.currentTarget) openOverlay({ kind: "event", date: day, allDay: true });
          }}
          className="flex min-w-0 flex-1 cursor-default flex-col justify-center gap-1 overflow-hidden border-l border-hairline px-1 max-md:px-0.5"
        >
          {chipsByDay[i].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={(e) => openPopover(chip.kind, chip.id, e.currentTarget)}
              className={cn(
                "press flex h-7 w-full shrink-0 items-center overflow-hidden rounded-lg px-2 text-left outline-none max-md:rounded-md max-md:px-1",
                "hover-fine:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-brand/60 dark:hover-fine:brightness-110",
              )}
              style={chip.style}
            >
              <span className="t-14 salt min-w-0 flex-1 truncate max-md:text-[11px] max-md:tracking-normal">{chip.title}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
