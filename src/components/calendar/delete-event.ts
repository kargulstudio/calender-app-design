"use client";

import { toast } from "sonner";
import { findCalendarEvent } from "@/hooks/use-calendar-events";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay } from "@/stores/overlay-store";

/**
 * Deletes a calendar event from the keyboard or popover. Events that belong
 * to a leave request are managed through the request instead, and read-only
 * Google events in Google Calendar.
 */
export function deleteCalendarEvent(id: string) {
  const event = findCalendarEvent(id);
  if (!event) return;
  useCalendarStore.getState().closePopover();
  if (event.requestId) {
    const requestId = event.requestId;
    toast("This event belongs to a leave request", {
      description: "Cancel or delete the request to remove it.",
      action: { label: "View request", onClick: () => openOverlay({ kind: "request-details", requestId }) },
    });
    return;
  }
  if (event.readOnly) {
    const url = event.url;
    toast("This event can only be changed in Google Calendar", {
      description: event.title,
      action: url ? { label: "Open", onClick: () => window.open(url, "_blank", "noreferrer") } : undefined,
    });
    return;
  }
  useAppStore.getState().deleteEvent(id);
}
