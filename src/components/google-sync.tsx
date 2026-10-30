"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { isSampleProfile, useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { useGoogleStore } from "@/stores/google-store";

const REFRESH_MS = 5 * 60_000;

/**
 * Keeps Google Calendar events loaded for the month around the calendar's
 * focused date, and refetches when the tab comes back into view.
 */
export function GoogleSync() {
  const status = useGoogleStore((s) => s.status);
  const account = useGoogleStore((s) => s.account);
  const date = useCalendarStore((s) => s.date);
  const hydrated = useSyncExternalStore(
    useAppStore.persist.onFinishHydration,
    useAppStore.persist.hasHydrated,
    () => false,
  );

  useEffect(() => {
    useGoogleStore.getState().restore();
  }, []);

  // Once a real account is connected, offer to drop the demo's sample data.
  // Waits for saved data, which would otherwise still look like the seed.
  useEffect(() => {
    if (status !== "connected" || !account || !hydrated || !isSampleProfile(useAppStore.getState())) return;
    toast("Your Google Calendar is connected", {
      description: "Clear the sample events and profile so only your own data shows?",
      duration: 15_000,
      action: { label: "Clear samples", onClick: () => useAppStore.getState().startFresh(account) },
    });
  }, [status, account, hydrated]);

  useEffect(() => {
    if (status !== "connected") return;
    // A week of slack on either side covers the month grid and week views at its edges.
    const from = addDays(startOfMonth(date), -7);
    const to = addDays(startOfMonth(addMonths(startOfMonth(date), 1)), 13);
    void useGoogleStore.getState().load(from, to);
  }, [status, date]);

  useEffect(() => {
    if (status !== "connected") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void useGoogleStore.getState().refresh();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [status]);

  return null;
}
