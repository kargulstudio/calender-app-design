"use client";

import { useEffect, useMemo } from "react";
import { addDays, isWeekend, weekDays } from "@/lib/dates";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAppStore } from "@/stores/app-store";
import { COMPACT_WEEK_DAYS, useCalendarStore } from "@/stores/calendar-store";
import { CalendarHeader } from "./calendar-header";
import { EventPopover } from "./event-popover";
import { MonthView } from "./month-view";
import { TimeGrid } from "./time-grid";

/** `count` consecutive days from `start`, optionally skipping weekends. */
function daysFrom(start: string, count: number, showWeekends: boolean): string[] {
  const out: string[] = [];
  for (let d = start; out.length < count; d = addDays(d, 1)) {
    if (showWeekends || !isWeekend(d)) out.push(d);
  }
  return out;
}

export function Calendar() {
  const view = useCalendarStore((s) => s.view);
  const date = useCalendarStore((s) => s.date);
  const compact = useCalendarStore((s) => s.compact);
  const weekStartsOn = useAppStore((s) => s.settings.weekStartsOn);
  const showWeekends = useAppStore((s) => s.settings.showWeekends);
  const isMobile = useIsMobile();

  // Phones: "Week" is a 3-day window and the arrows step 3 days at a time.
  useEffect(() => {
    useCalendarStore.getState().setCompact(isMobile);
  }, [isMobile]);

  const week = useMemo(() => {
    const all = weekDays(date, weekStartsOn);
    return showWeekends ? all : all.filter((d) => !isWeekend(d));
  }, [date, weekStartsOn, showWeekends]);

  const days = useMemo(() => {
    if (view === "day") return [date];
    return compact ? daysFrom(date, COMPACT_WEEK_DAYS, showWeekends) : week;
  }, [view, date, compact, showWeekends, week]);

  return (
    <section
      aria-label="Calendar"
      data-viz
      data-density="compact"
      role="grid"
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface [--axis:44px] md:[--axis:70px]"
    >
      <CalendarHeader days={days} />
      {view === "month" ? <MonthView /> : <TimeGrid key={view} days={days} strip={view === "day" ? week : undefined} />}
      <EventPopover />
    </section>
  );
}
