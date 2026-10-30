"use client";

import { useMemo } from "react";
import { CalendarHeartIcon, CopyIcon, ExternalLinkIcon, MapPinIcon, PencilIcon, PlaneIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/time-off/status-badge";
import { formatLong, formatTimeRange, formatWeekday } from "@/lib/dates";
import { formatDuration } from "@/lib/dates";
import { useCalendarEvent } from "@/hooks/use-calendar-events";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay } from "@/stores/overlay-store";
import { deleteCalendarEvent } from "./delete-event";

/** Details card for an event or holiday, anchored to whatever was clicked. */
export function EventPopover() {
  const target = useCalendarStore((s) => s.popover);
  const close = useCalendarStore((s) => s.closePopover);
  const event = useCalendarEvent(target?.kind === "event" ? target.id : undefined);
  const holiday = useAppStore((s) => (target?.kind === "holiday" ? s.holidays.find((h) => h.id === target.id) : undefined));
  const request = useAppStore((s) => (event?.requestId ? s.requests.find((r) => r.id === event.requestId) : undefined));
  const timeFormat = useAppStore((s) => s.settings.timeFormat);
  const duplicateEvent = useAppStore((s) => s.duplicateEvent);

  const isMobile = useIsMobile();
  const rect = target?.rect;
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          rect ? DOMRect.fromRect(rect) : DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 }),
      },
    }),
    [rect],
  );

  const open = Boolean(target && (event || holiday));

  return (
    <Popover open={open} onOpenChange={(v) => !v && close()}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side={isMobile ? "bottom" : "right"}
        align={isMobile ? "center" : "start"}
        sideOffset={8}
        collisionPadding={12}
        className="w-[300px] max-w-[calc(100vw-24px)] gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {event && (
          <>
            <div className="flex gap-3 p-4">
              <span className="mt-0.5 size-3 shrink-0 rounded-[4px]" style={{ background: `var(--event-${event.color}-fg)` }} />
              <div className="grid min-w-0 flex-1 gap-2">
                <h3 className="t-16 leading-[1.25] break-words text-fg">{event.title}</h3>
                <p className="t-14 salt text-fg-2">
                  {formatWeekday(event.date)}, {formatLong(event.date)}
                </p>
                <p className="t-14 salt text-fg-2">
                  {event.allDay
                    ? "All day"
                    : `${formatTimeRange(event.start, event.end, timeFormat)} · ${formatDuration(event.end - event.start)}`}
                </p>
                {event.location && (
                  <p className="t-14 flex items-center gap-1.5 text-fg-2">
                    <MapPinIcon className="size-3.5 text-icon" /> <span className="truncate">{event.location}</span>
                  </p>
                )}
                {event.note && !request && <p className="t-14 leading-[1.4] text-fg">{event.note}</p>}
                {request && (
                  <div className="flex items-center gap-2 pt-1">
                    <StatusBadge status={request.status} />
                    <span className="t-12 truncate text-fg-2">{request.duration}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 border-t border-hairline bg-app px-2 py-2">
              {request ? (
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    openOverlay({ kind: "request-details", requestId: request.id });
                  }}
                >
                  <PlaneIcon /> View request
                </Button>
              ) : event.readOnly && event.url ? (
                <Button size="sm" asChild>
                  <a href={event.url} target="_blank" rel="noreferrer" onClick={close}>
                    <ExternalLinkIcon /> Open in Google
                  </a>
                </Button>
              ) : event.readOnly ? null : (
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    openOverlay({ kind: "event", eventId: event.id });
                  }}
                >
                  <PencilIcon /> Edit
                </Button>
              )}
              <span className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Duplicate"
                    onClick={() => {
                      duplicateEvent(event.id);
                      close();
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicate</TooltipContent>
              </Tooltip>
              {!request && !event.readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete"
                      onClick={() => deleteCalendarEvent(event.id)}
                    >
                      <Trash2Icon className="text-danger" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Delete <kbd className="ml-1 font-sans opacity-70">⌫</kbd>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
        {holiday && (
          <>
            <div className="flex gap-3 p-4">
              <span className="mt-0.5 size-3 shrink-0 rounded-[4px] bg-[var(--event-purple-fg)]" />
              <div className="grid min-w-0 flex-1 gap-2">
                <h3 className="t-16 text-fg">{holiday.name}</h3>
                <p className="t-14 salt text-fg-2">
                  {formatWeekday(holiday.date)}, {formatLong(holiday.date)}
                </p>
                <p className="t-14 salt text-fg-2">National holiday · not counted against your allowance</p>
              </div>
            </div>
            <div className="flex items-center border-t border-hairline bg-app px-2 py-2">
              <Button
                size="sm"
                onClick={() => {
                  close();
                  openOverlay({ kind: "holidays" });
                }}
              >
                <CalendarHeartIcon /> See holiday list
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
