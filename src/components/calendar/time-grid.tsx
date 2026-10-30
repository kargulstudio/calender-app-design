"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WEEKDAYS_SHORT, dayOfWeek, formatTime, formatTimeRange, fromKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CalEvent } from "@/lib/types";
import { useNow, useToday } from "@/hooks/use-today";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay } from "@/stores/overlay-store";
import { AllDayRow } from "./all-day-row";
import { eventStyle } from "./event-colors";
import { TwoLineTitle } from "./two-line-title";
import {
  clamp,
  HOUR_HEIGHT,
  layoutDay,
  MIN_EVENT_MINUTES,
  minutesToPx,
  pxToMinutes,
  snap,
  SNAP_MINUTES,
} from "./layout";

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);
const DRAG_THRESHOLD = 4;
/** Touch: hold this long on an event before it lifts for dragging. */
const LONG_PRESS_MS = 350;
/** Touch: a horizontal flick this long switches to the previous/next period. */
const SWIPE_DISTANCE = 64;
/** Columns never get narrower than this; below it the week scrolls sideways. */
const MIN_COLUMN = 96;

type Drag =
  | { type: "create"; dayIndex: number; anchor: number; current: number; moved: boolean }
  | {
      type: "move" | "resize";
      eventId: string;
      dayIndex: number;
      start: number;
      end: number;
      grabOffset: number;
      moved: boolean;
      locked: boolean;
    };

export function DayHeaders({ days }: { days: string[] }) {
  const selected = useCalendarStore((s) => s.date);
  const setDate = useCalendarStore((s) => s.setDate);
  const setView = useCalendarStore((s) => s.setView);
  const compact = useCalendarStore((s) => s.compact);
  const today = useToday();

  return (
    <div className="flex h-14 w-full shrink-0 items-start overflow-hidden border-b border-hairline">
      <div className="sticky left-0 z-10 h-full w-(--axis) shrink-0 bg-surface" />
      {days.map((d) => {
        const isSelected = d === selected;
        const isToday = d === today;
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              if (compact || isSelected) {
                setDate(d);
                setView("day");
              } else setDate(d);
            }}
            aria-label={`${fromKey(d).toDateString()}${isSelected ? ", selected — open day view" : ""}`}
            aria-pressed={isSelected}
            className="group flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden border-l border-hairline px-3 text-left outline-none focus-visible:bg-hover max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-0"
          >
            <span className="t-14 shrink-0 text-center whitespace-nowrap text-dayname max-md:text-[11px] max-md:tracking-normal">
              {WEEKDAYS_SHORT[dayOfWeek(d)]}
            </span>
            <span
              className={cn(
                "t-16 flex h-6 min-w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg px-1 whitespace-nowrap transition-[background-color,color] duration-150",
                isSelected
                  ? "accent-badge font-semibold"
                  : isToday
                    ? "text-brand group-hover:bg-brand-tint"
                    : "text-fg group-hover:bg-hover",
              )}
            >
              {fromKey(d).getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Phones in day view: a 7-day strip to hop between days of the week. */
function WeekStrip({ days }: { days: string[] }) {
  const selected = useCalendarStore((s) => s.date);
  const setDate = useCalendarStore((s) => s.setDate);
  const today = useToday();

  return (
    <div className="flex h-16 w-full shrink-0 items-center gap-1 border-b border-hairline px-2 md:hidden" role="tablist" aria-label="Days of the week">
      {days.map((d) => {
        const isSelected = d === selected;
        const isToday = d === today;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => setDate(d)}
            className="press flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="text-[11px] leading-none text-dayname">{WEEKDAYS_SHORT[dayOfWeek(d)]}</span>
            <span
              className={cn(
                "t-16 flex size-7 items-center justify-center rounded-lg transition-[background-color,color] duration-150",
                isSelected ? "accent-badge font-semibold" : isToday ? "text-brand" : "text-fg",
              )}
            >
              {fromKey(d).getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TimeGrid({ days, strip }: { days: string[]; strip?: string[] }) {
  const events = useCalendarEvents();
  const timeFormat = useAppStore((s) => s.settings.timeFormat);
  const dayStartHour = useAppStore((s) => s.settings.dayStartHour);
  const moveEvent = useAppStore((s) => s.moveEvent);
  const focusEventId = useCalendarStore((s) => s.focusEventId);
  const clearFocus = useCalendarStore((s) => s.clearFocus);
  const openPopover = useCalendarStore((s) => s.openPopover);
  const selectedEventId = useCalendarStore((s) => (s.popover?.kind === "event" ? s.popover.id : null));
  const today = useToday();
  const now = useNow();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const step = useCalendarStore((s) => s.step);
  // Touch gesture state: long-press to lift an event, flick to change period.
  const touch = useRef<{
    x: number;
    y: number;
    t: number;
    timer: ReturnType<typeof setTimeout> | null;
    eventEl: HTMLElement | null;
    lifted: boolean;
  } | null>(null);
  const dragActive = useRef(false);

  // While an event is lifted, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragActive.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Open on the working day, like the design (06:00 at the top edge).
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = dayStartHour * HOUR_HEIGHT;
  }, [dayStartHour]);

  // When the week is wider than the screen, keep the selected day in view.
  const selectedDate = useCalendarStore((s) => s.date);
  const didScrollX = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const index = days.indexOf(selectedDate);
    if (index < 0) return;
    const axis = parseFloat(getComputedStyle(el).getPropertyValue("--axis")) || 0;
    const col = (el.scrollWidth - axis) / days.length;
    const visible = el.clientWidth - axis;
    const left = index * col;
    if (left >= el.scrollLeft && left + col <= el.scrollLeft + visible) return;
    el.scrollTo({ left: Math.max(0, left - (visible - col) / 2), behavior: didScrollX.current ? "smooth" : "auto" });
    didScrollX.current = true;
  }, [days, selectedDate]);

  // Scroll a searched-for event into view and pulse it once.
  useEffect(() => {
    if (!focusEventId) return;
    const ev = events.find((e) => e.id === focusEventId);
    if (ev && !ev.allDay && scrollRef.current) {
      scrollRef.current.scrollTo({ top: Math.max(0, minutesToPx(ev.start) - HOUR_HEIGHT), behavior: "smooth" });
    }
    const raf = requestAnimationFrame(() => {
      setHighlightId(focusEventId);
      clearFocus();
    });
    const t = setTimeout(() => setHighlightId(null), 1400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [focusEventId, events, clearFocus]);

  // Apply the in-flight drag as a preview so the layout reflows live.
  const columns = useMemo(() => {
    const preview =
      drag && drag.type !== "create" && drag.moved && !drag.locked
        ? { id: drag.eventId, date: days[drag.dayIndex], start: drag.start, end: drag.end }
        : null;
    return days.map((day) => {
      const dayEvents = events
        .map((e) => (preview && e.id === preview.id ? { ...e, ...preview } : e))
        .filter((e) => !e.allDay && e.date === day);
      return layoutDay(dayEvents);
    });
  }, [days, events, drag]);

  function pointToSlot(clientX: number, clientY: number) {
    const rect = bodyRef.current!.getBoundingClientRect();
    const colWidth = rect.width / days.length;
    return {
      dayIndex: clamp(Math.floor((clientX - rect.left) / colWidth), 0, days.length - 1),
      minutes: clamp(pxToMinutes(clientY - rect.top), 0, 1440),
    };
  }

  function startDrag(eventEl: HTMLElement, minutes: number, resizing: boolean) {
    const ev = events.find((x) => x.id === eventEl.dataset.eventId);
    if (!ev) return;
    setDrag({
      type: resizing ? "resize" : "move",
      eventId: ev.id,
      dayIndex: days.indexOf(ev.date),
      start: ev.start,
      end: ev.end,
      grabOffset: minutes - ev.start,
      moved: false,
      locked: Boolean(ev.requestId || ev.readOnly),
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const eventEl = target.closest<HTMLElement>("[data-event-id]");
    const { dayIndex, minutes } = pointToSlot(e.clientX, e.clientY);
    pointerStart.current = { x: e.clientX, y: e.clientY, target: eventEl };

    if (e.pointerType === "touch") {
      // Touch: scrolling wins by default. Tap opens/creates, long-press lifts an event.
      const state: NonNullable<typeof touch.current> = {
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        timer: null,
        eventEl,
        lifted: false,
      };
      if (eventEl && !eventEl.dataset.locked) {
        state.timer = setTimeout(() => {
          state.lifted = true;
          dragActive.current = true;
          navigator.vibrate?.(8);
          startDrag(eventEl, minutes, false);
        }, LONG_PRESS_MS);
      }
      touch.current = state;
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (eventEl) {
      startDrag(eventEl, minutes, Boolean(target.closest("[data-resize]")));
    } else {
      const m = snap(minutes - SNAP_MINUTES / 2);
      setDrag({ type: "create", dayIndex, anchor: m, current: m, moved: false });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const t = touch.current;
    if (t && !t.lifted && t.timer && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) {
      clearTimeout(t.timer);
      t.timer = null;
    }
    if (!drag || !pointerStart.current) return;
    const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
    const moved = drag.moved || dist > DRAG_THRESHOLD;
    if (!moved) return;
    const { dayIndex, minutes } = pointToSlot(e.clientX, e.clientY);

    if (drag.type === "create") {
      setDrag({ ...drag, moved, current: snap(minutes) });
    } else if (drag.locked) {
      setDrag({ ...drag, moved });
    } else if (drag.type === "move") {
      const length = drag.end - drag.start;
      const start = clamp(snap(minutes - drag.grabOffset), 0, 1440 - length);
      setDrag({ ...drag, moved, dayIndex, start, end: start + length });
    } else {
      const end = clamp(snap(minutes), drag.start + MIN_EVENT_MINUTES, 1440);
      setDrag({ ...drag, moved, end });
    }
  }

  function endTouch(e: React.PointerEvent<HTMLDivElement>): boolean {
    const t = touch.current;
    if (!t) return false;
    touch.current = null;
    if (t.timer) clearTimeout(t.timer);
    if (t.lifted) return false; // a lifted event finishes like a mouse drag below
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (days.length <= 3 && Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dy) < Math.abs(dx) * 0.6 && e.timeStamp - t.t < 600) {
      step(dx < 0 ? 1 : -1);
    } else if (Math.hypot(dx, dy) < 8) {
      if (t.eventEl) {
        openPopover("event", t.eventEl.dataset.eventId!, t.eventEl);
      } else {
        const { dayIndex, minutes } = pointToSlot(t.x, t.y);
        const s = clamp(Math.floor(minutes / 30) * 30, 0, 1380);
        openOverlay({ kind: "event", date: days[dayIndex], start: s, end: s + 60 });
      }
    }
    return true;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragActive.current = false;
    if (endTouch(e)) return;
    const d = drag;
    const start = pointerStart.current;
    setDrag(null);
    pointerStart.current = null;
    if (!d) return;

    if (d.type === "create") {
      const day = days[d.dayIndex];
      if (!d.moved) {
        const s = clamp(Math.floor(d.anchor / 30) * 30, 0, 1380);
        openOverlay({ kind: "event", date: day, start: s, end: s + 60 });
      } else {
        const s = Math.min(d.anchor, d.current);
        const en = Math.max(d.anchor, d.current, s + MIN_EVENT_MINUTES);
        openOverlay({ kind: "event", date: day, start: s, end: en });
      }
      return;
    }
    if (!d.moved || d.locked) {
      if (start?.target) openPopover("event", d.eventId, start.target);
      return;
    }
    const ev = events.find((x) => x.id === d.eventId);
    const date = days[d.dayIndex];
    if (ev && (ev.date !== date || ev.start !== d.start || ev.end !== d.end)) {
      moveEvent(d.eventId, { date, start: d.start, end: d.end });
    }
  }

  const nowMinutes = now ? (now - fromKey(today).getTime()) / 60000 : -1;
  const todayIndex = days.indexOf(today);
  const createGhost =
    drag?.type === "create"
      ? {
          dayIndex: drag.dayIndex,
          start: drag.moved ? Math.min(drag.anchor, drag.current) : clamp(Math.floor(drag.anchor / 30) * 30, 0, 1380),
          end: drag.moved
            ? Math.max(drag.anchor, drag.current, Math.min(drag.anchor, drag.current) + MIN_EVENT_MINUTES)
            : clamp(Math.floor(drag.anchor / 30) * 30, 0, 1380) + 60,
        }
      : null;

  return (
    <>
      {strip && <WeekStrip days={strip} />}
      {/* One scroller for both axes: day headers stick to the top, the time axis to the left. */}
      <div
        ref={scrollRef}
        onScroll={() => useCalendarStore.getState().popover && useCalendarStore.getState().closePopover()}
        className="relative min-h-0 w-full flex-1 overflow-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="relative flex min-w-full flex-col"
          style={{ width: `max(100%, calc(var(--axis) + ${days.length * MIN_COLUMN}px))` }}
        >
          <div className="sticky top-0 z-40 bg-surface">
            <div className={strip ? "max-md:hidden" : undefined}>
              <DayHeaders days={days} />
            </div>
            <AllDayRow days={days} />
            {/* Masks the line/label that sits exactly on the header edge when scrolled to an hour. */}
            <div className="pointer-events-none absolute inset-x-0 top-full h-2" aria-hidden>
              <div className="absolute inset-x-0 top-0 h-px bg-surface" />
              <div className="sticky left-0 h-2 w-(--axis) bg-surface" />
            </div>
          </div>

          <div className="relative flex w-full" style={{ height: 24 * HOUR_HEIGHT }}>
            {/* Hour lines */}
            <div className="pointer-events-none absolute inset-y-0 right-0 left-(--axis)" aria-hidden>
              {HOURS.map((h) => (
                <div key={h} className="absolute inset-x-0 h-px bg-hairline" style={{ top: h * HOUR_HEIGHT }} />
              ))}
            </div>

            {/* Time axis */}
            <div className="sticky left-0 z-20 h-full w-(--axis) shrink-0 bg-surface select-none" aria-hidden>
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="t-14 absolute right-3 whitespace-nowrap text-fg-2 max-md:right-1.5 max-md:text-[11px] max-md:tracking-normal"
                  style={{ top: h * HOUR_HEIGHT - 7 }}
                >
                  {formatTime(h * 60, timeFormat).replace(":00 ", " ")}
                </span>
              ))}
            </div>

            {/* Day columns */}
            <div
              ref={bodyRef}
              className={cn(
                "relative flex h-full min-w-0 flex-1 select-none",
                // Day and 3-day views pan vertically only, so a sideways flick changes the period.
                days.length <= 3 ? "touch-pan-y" : "touch-manipulation",
                drag?.moved && drag.type === "move" && !drag.locked && "cursor-grabbing",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                if (touch.current?.timer) clearTimeout(touch.current.timer);
                touch.current = null;
                dragActive.current = false;
                setDrag(null);
              }}
            >
              {days.map((day, i) => (
                <div
                  key={day}
                  className="relative h-full min-w-0 flex-1 border-l border-hairline"
                  aria-label={`${fromKey(day).toDateString()} schedule`}
                  role="group"
                >
                  {columns[i].map(({ event, column, columns: count }) => (
                    <EventBlock
                      key={event.id}
                      event={event}
                      column={column}
                      count={count}
                      timeFormat={timeFormat}
                      dragging={Boolean(drag && drag.type !== "create" && drag.eventId === event.id && drag.moved && !drag.locked)}
                      highlighted={highlightId === event.id}
                      selected={selectedEventId === event.id}
                      onOpen={(el) => openPopover("event", event.id, el)}
                    />
                  ))}

                  {createGhost?.dayIndex === i && (
                    <div
                      className="pointer-events-none absolute z-20 flex flex-col gap-0.5 overflow-hidden rounded-lg border border-dashed border-brand/60 bg-brand-tint p-2 text-brand"
                      style={{
                        top: minutesToPx(createGhost.start) + 1,
                        height: Math.max(minutesToPx(createGhost.end - createGhost.start) - 2, 14),
                        left: 2,
                        right: 3,
                      }}
                    >
                      <span className="t-12 salt">{formatTimeRange(createGhost.start, createGhost.end, timeFormat)}</span>
                    </div>
                  )}

                  {i === todayIndex && nowMinutes >= 0 && nowMinutes <= 1440 && (
                    <div
                      className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
                      style={{ top: minutesToPx(nowMinutes) - 4 }}
                      aria-label={`Now, ${formatTime(Math.floor(nowMinutes), timeFormat)}`}
                    >
                      <span className="-ml-1 size-2 rounded-full bg-brand" />
                      <span className="h-[1.5px] flex-1 bg-brand" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EventBlock({
  event,
  column,
  count,
  timeFormat,
  dragging,
  highlighted,
  selected,
  onOpen,
}: {
  event: CalEvent;
  column: number;
  count: number;
  timeFormat: "24h" | "12h";
  dragging: boolean;
  highlighted: boolean;
  selected: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const height = minutesToPx(event.end - event.start) - 2;
  const compact = height < 44;
  const locked = Boolean(event.requestId || event.readOnly);
  const time = formatTimeRange(event.start, event.end, timeFormat);

  return (
    <div
      data-event-id={event.id}
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${time}${event.note ? `, ${event.note}` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(e.currentTarget);
        }
        // Delete / Backspace are handled globally (see keyboard-shortcuts).
      }}
      data-locked={locked || undefined}
      className={cn(
        "group/event @container absolute overflow-hidden rounded-lg font-medium outline-none",
        "transition-[box-shadow,filter,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-brand/60",
        "hover-fine:brightness-[0.97] dark:hover-fine:brightness-110",
        locked ? "cursor-pointer" : "cursor-grab",
        dragging && "z-30 opacity-95 shadow-[0_8px_24px_-6px_rgba(15,15,15,0.28)]",
        selected && "ring-2 ring-brand/70 ring-offset-1 ring-offset-surface",
        highlighted && "animate-[event-pulse_1.4s_var(--ease-out)]",
      )}
      style={{
        ...eventStyle(event.color),
        top: minutesToPx(event.start) + 1,
        height: Math.max(height, 14),
        left: `calc((100% - 5px) * ${column / count} + 2px)`,
        width: `calc((100% - 5px) / ${count} - ${count > 1 ? 2 : 0}px)`,
        zIndex: dragging ? 30 : 10 + column,
        ["--lines" as string]: Math.max(1, Math.floor((height - 6) / 13)),
      }}
    >
      {compact ? (
        <div className="flex h-full w-full items-center px-2 @max-[84px]:px-1">
          <p className="t-14 salt min-w-0 flex-1 truncate @max-[84px]:text-[11px] @max-[84px]:tracking-normal">
            {event.title}
            {height >= 28 ? null : <span className="t-12 ml-1 opacity-80 @max-[84px]:hidden">{formatTime(event.start, timeFormat)}</span>}
          </p>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col gap-0.5 p-2 @max-[84px]:p-1">
          {/* Regular columns: the design's title / time / note stack */}
          <div className="contents @max-[84px]:hidden">
            {height >= 60 ? (
              <TwoLineTitle text={event.title} className="t-14 salt w-full shrink-0 overflow-hidden" />
            ) : (
              <p className="t-14 salt w-full shrink-0 truncate">{event.title}</p>
            )}
            <p className="t-12 salt w-full shrink-0 truncate">{time}</p>
            {event.note && <p className="t-12 salt w-full shrink-0 truncate">{event.note}</p>}
          </div>
          {/* Narrow columns (phone week view, side-by-side overlaps): title only, wrapping anywhere */}
          <p className="hidden text-[11px] leading-[13px] break-words hyphens-auto @max-[84px]:line-clamp-(--lines)">{event.title}</p>
        </div>
      )}
      {!locked && (
        <span
          data-resize
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize pointer-coarse:hidden"
        />
      )}
    </div>
  );
}
