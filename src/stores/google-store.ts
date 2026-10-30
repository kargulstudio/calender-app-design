"use client";

import { toast } from "sonner";
import { create } from "zustand";
import {
  deleteGoogleEvent,
  fromGoogleEvent,
  GOOGLE_CLIENT_ID,
  GoogleAuthError,
  GoogleCancelledError,
  googleIdOf,
  insertGoogleEvent,
  listGoogleEvents,
  loadGoogleIdentity,
  patchGoogleEvent,
  requestGoogleToken,
  revokeGoogleToken,
  toGoogleBody,
  type GoogleToken,
} from "@/lib/google-calendar";
import { toKey } from "@/lib/dates";
import type { CalEvent } from "@/lib/types";
import { useCalendarStore } from "./calendar-store";

/**
 * - unavailable: no NEXT_PUBLIC_GOOGLE_CLIENT_ID configured
 * - expired: was connected, but the ~1 hour access token ran out
 */
export type GoogleStatus = "unavailable" | "disconnected" | "connecting" | "connected" | "expired";

type GoogleStore = {
  status: GoogleStatus;
  /** The connected Google account's email. */
  account: string | null;
  /** Google events for `range`. Kept in memory only — never in localStorage or undo history. */
  events: CalEvent[];
  range: { from: string; to: string } | null;
  syncing: boolean;
  /** Restores a connection from this browser tab's session. */
  restore: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  load: (from: string, to: string, force?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  save: (event: Omit<CalEvent, "id"> & { id?: string }) => CalEvent;
  move: (id: string, patch: Pick<CalEvent, "date" | "start" | "end">) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
};

// The token lives for this tab session only; the account hint survives so the
// next visit can offer a one-click reconnect.
const TOKEN_KEY = "kargul-google-token";
const ACCOUNT_KEY = "kargul-google-account";

function readJson<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the connection just won't survive a reload.
  }
}

const session = () => sessionStorage;
const local = () => localStorage;

let token: GoogleToken | null = null;
let loadSeq = 0;

/** Replaces `oldId` (and any stale copies of the saved events) with `saved`. */
function replaceEvents(events: CalEvent[], oldId: string, saved: CalEvent[]) {
  const ids = new Set([oldId, ...saved.map((e) => e.id)]);
  return [...events.filter((e) => !ids.has(e.id)), ...saved];
}

export const useGoogleStore = create<GoogleStore>()((set, get) => {
  function liveToken(): string {
    if (!token || token.expiresAt - 60_000 < Date.now()) throw new GoogleAuthError("Your Google sign-in expired");
    return token.token;
  }

  function report(err: unknown, title: string) {
    if (err instanceof GoogleAuthError) {
      token = null;
      write(session, TOKEN_KEY, null);
      if (get().status !== "expired") {
        set({ status: "expired" });
        toast.error("Google Calendar needs you to sign in again", {
          description: "Changes you make now won't reach Google until you reconnect.",
          action: { label: "Reconnect", onClick: () => void get().connect() },
        });
      }
      return;
    }
    toast.error(title, { description: err instanceof Error ? err.message : String(err) });
  }

  return {
    status: GOOGLE_CLIENT_ID ? "disconnected" : "unavailable",
    account: null,
    events: [],
    range: null,
    syncing: false,

    restore: () => {
      if (!GOOGLE_CLIENT_ID) return;
      // Preload so the Connect click can open the popup without waiting.
      void loadGoogleIdentity().catch(() => {});
      const saved = readJson<GoogleToken & { account: string | null }>(session, TOKEN_KEY);
      const account = readJson<string>(local, ACCOUNT_KEY);
      if (saved && saved.expiresAt - 60_000 > Date.now()) {
        token = { token: saved.token, expiresAt: saved.expiresAt };
        set({ status: "connected", account: saved.account ?? account });
        useCalendarStore.getState().setDate(toKey(new Date()));
      } else if (account) {
        set({ status: "expired", account });
      }
    },

    connect: async () => {
      const previous = get().status;
      if (previous === "unavailable" || previous === "connecting") return;
      set({ status: "connecting" });
      try {
        await loadGoogleIdentity();
        token = await requestGoogleToken(get().account ?? undefined);
        write(session, TOKEN_KEY, { ...token, account: get().account });
        set({ status: "connected", range: null });
        // Real data lives around today, not the demo's design date.
        useCalendarStore.getState().setDate(toKey(new Date()));
      } catch (err) {
        set({ status: previous });
        if (!(err instanceof GoogleCancelledError)) report(err, "Couldn't connect Google Calendar");
      }
    },

    disconnect: () => {
      if (token) revokeGoogleToken(token.token);
      token = null;
      loadSeq++;
      write(session, TOKEN_KEY, null);
      write(local, ACCOUNT_KEY, null);
      set({ status: GOOGLE_CLIENT_ID ? "disconnected" : "unavailable", account: null, events: [], range: null, syncing: false });
    },

    load: async (from, to, force = false) => {
      const { status, range } = get();
      if (status !== "connected") return;
      if (!force && range && range.from <= from && range.to >= to) return;
      const seq = ++loadSeq;
      set({ syncing: true });
      try {
        const { account, events } = await listGoogleEvents(liveToken(), from, to);
        if (seq !== loadSeq) return;
        const mapped = events
          .filter((g) => g.status !== "cancelled" && g.eventType !== "workingLocation")
          .flatMap(fromGoogleEvent);
        set({ events: mapped, range: { from, to }, account: account || get().account, syncing: false });
        if (account) {
          write(local, ACCOUNT_KEY, account);
          if (token) write(session, TOKEN_KEY, { ...token, account });
        }
      } catch (err) {
        if (seq !== loadSeq) return;
        set({ syncing: false });
        report(err, "Couldn't load Google Calendar");
      }
    },

    refresh: async () => {
      const { range } = get();
      if (range) await get().load(range.from, range.to, true);
    },

    save: (input) => {
      const prev = input.id ? get().events.find((e) => e.id === input.id) : undefined;
      if (prev?.readOnly) return prev;
      // New events stay locked until Google gives them a real id.
      const tempId = prev?.id ?? `g:pending-${crypto.randomUUID().slice(0, 8)}`;
      const optimistic: CalEvent = { ...input, id: tempId, source: "google", readOnly: prev ? undefined : true };
      set((s) => ({ events: replaceEvents(s.events, tempId, [optimistic]) }));

      void (async () => {
        try {
          const body = toGoogleBody(prev, optimistic);
          const g = prev
            ? await patchGoogleEvent(liveToken(), googleIdOf(prev.id), body)
            : await insertGoogleEvent(liveToken(), body);
          set((s) => ({ events: replaceEvents(s.events, tempId, fromGoogleEvent(g)) }));
        } catch (err) {
          set((s) => ({ events: prev ? replaceEvents(s.events, tempId, [prev]) : s.events.filter((e) => e.id !== tempId) }));
          report(err, prev ? "Couldn't update the Google event" : "Couldn't add the event to Google");
        }
      })();
      return optimistic;
    },

    move: (id, patch) => {
      const prev = get().events.find((e) => e.id === id);
      if (prev) get().save({ ...prev, ...patch });
    },

    remove: (id) => {
      const removed = get().events.find((e) => e.id === id);
      if (!removed || removed.readOnly) return;
      set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
      void (async () => {
        try {
          await deleteGoogleEvent(liveToken(), googleIdOf(id));
          toast("Event deleted from Google Calendar", {
            description: removed.title,
            action: {
              label: "Undo",
              onClick: () => get().save({ ...removed, id: undefined, readOnly: undefined, url: undefined }),
            },
          });
        } catch (err) {
          set((s) => ({ events: [...s.events, removed] }));
          report(err, "Couldn't delete the Google event");
        }
      })();
    },

    duplicate: (id) => {
      const ev = get().events.find((e) => e.id === id);
      if (!ev) return;
      const copy = get().save({ ...ev, id: undefined, title: `${ev.title} (copy)`, readOnly: undefined, url: undefined });
      toast.success("Event duplicated", { description: copy.title });
    },
  };
});
