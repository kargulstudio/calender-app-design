"use client";

import { useMemo } from "react";
import type { CalEvent } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import { useGoogleStore } from "@/stores/google-store";

// The calendar shows the app's own events (demo data and leave requests)
// together with events synced from Google Calendar.

export function useCalendarEvents(): CalEvent[] {
  const local = useAppStore((s) => s.events);
  const google = useGoogleStore((s) => s.events);
  return useMemo(() => (google.length ? [...local, ...google] : local), [local, google]);
}

export function useCalendarEvent(id: string | undefined): CalEvent | undefined {
  const local = useAppStore((s) => (id ? s.events.find((e) => e.id === id) : undefined));
  const google = useGoogleStore((s) => (id ? s.events.find((e) => e.id === id) : undefined));
  return local ?? google;
}

export function findCalendarEvent(id: string): CalEvent | undefined {
  return (
    useAppStore.getState().events.find((e) => e.id === id) ?? useGoogleStore.getState().events.find((e) => e.id === id)
  );
}
