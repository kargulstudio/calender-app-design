import { addDays, fromKey, rangeKeys, toKey } from "@/lib/dates";
import type { CalEvent, EventColor } from "@/lib/types";

// ------------------------------------------------------------------
// Google Calendar, straight from the browser.
// Sign-in uses Google Identity Services' token flow: a popup returns a
// short-lived (~1 hour) access token and no client secret or server is
// involved. Events are read and written on the user's primary calendar.
// ------------------------------------------------------------------

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GIS_SRC = "https://accounts.google.com/gsi/client";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };

type TokenClient = { requestAccessToken: (options?: { prompt?: string; login_hint?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => TokenClient;
          hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

/** Thrown when the access token is missing, expired or revoked. */
export class GoogleAuthError extends Error {}

/** The user closed the sign-in popup or it was blocked. */
export class GoogleCancelledError extends Error {}

let scriptPromise: Promise<void> | null = null;

/** Loads the Google Identity Services script once. */
export function loadGoogleIdentity(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type GoogleToken = { token: string; expiresAt: number };

/**
 * Opens Google's consent popup. Call it straight from a click handler (after
 * `loadGoogleIdentity` has resolved) so the browser doesn't block the popup.
 */
export function requestGoogleToken(loginHint?: string): Promise<GoogleToken> {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.reject(new Error("Google sign-in hasn't loaded yet. Try again in a moment."));
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Google sign-in failed"));
        } else if (!oauth2.hasGrantedAllScopes(response, SCOPE)) {
          reject(new Error("Allow access to your calendar events to sync them."));
        } else {
          resolve({ token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 });
        }
      },
      error_callback: (error) =>
        reject(
          error.type === "popup_closed" || error.type === "popup_failed_to_open"
            ? new GoogleCancelledError(error.message ?? error.type)
            : new Error(error.message ?? "Google sign-in failed"),
        ),
    });
    client.requestAccessToken(loginHint ? { prompt: "", login_hint: loginHint } : { prompt: "consent" });
  });
}

export function revokeGoogleToken(token: string) {
  window.google?.accounts?.oauth2?.revoke(token);
}

// ------------------------------------------------------------------ API

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  htmlLink?: string;
  eventType?: string;
  guestsCanModify?: boolean;
  organizer?: { self?: boolean };
  start: GoogleTime;
  end: GoogleTime;
};

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) throw new GoogleAuthError("Your Google sign-in expired");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Google Calendar returned ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Events overlapping the local days `from`–`to` (inclusive), plus the calendar's name (the account email). */
export async function listGoogleEvents(token: string, from: string, to: string) {
  const events: GoogleEvent[] = [];
  let account = "";
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      timeMin: fromKey(from).toISOString(),
      timeMax: fromKey(addDays(to, 1)).toISOString(),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await call<{ summary?: string; items?: GoogleEvent[]; nextPageToken?: string }>(
      token,
      `${EVENTS_URL}?${params}`,
    );
    account ||= page.summary ?? "";
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { account, events };
}

export function insertGoogleEvent(token: string, body: object) {
  return call<GoogleEvent>(token, EVENTS_URL, { method: "POST", body: JSON.stringify(body) });
}

export function patchGoogleEvent(token: string, id: string, body: object) {
  return call<GoogleEvent>(token, `${EVENTS_URL}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteGoogleEvent(token: string, id: string) {
  return call<void>(token, `${EVENTS_URL}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ------------------------------------------------------------------ mapping

const ID_PREFIX = "g:";

export const isGoogleEventId = (id: string | undefined) => Boolean(id?.startsWith(ID_PREFIX));

/** The Google event id behind an app event id. */
export const googleIdOf = (id: string) => id.slice(ID_PREFIX.length);

// Google's 11 event colours, folded onto the app's six.
const COLOR_FROM_GOOGLE: Record<string, EventColor> = {
  "1": "purple",
  "2": "green",
  "3": "purple",
  "4": "pink",
  "5": "orange",
  "6": "orange",
  "7": "cyan",
  "8": "blue",
  "9": "blue",
  "10": "green",
  "11": "pink",
};
const COLOR_TO_GOOGLE: Record<EventColor, string> = {
  green: "10",
  purple: "3",
  cyan: "7",
  orange: "6",
  pink: "4",
  blue: "9",
};
/** Events without a colour use the calendar's own, shown as blue. */
const DEFAULT_COLOR: EventColor = "blue";

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * A Google event as app events. Multi-day all-day events become one read-only
 * chip per day; timed events that run past midnight are cut at midnight.
 */
export function fromGoogleEvent(g: GoogleEvent): CalEvent[] {
  const editable = (!g.organizer || g.organizer.self || g.guestsCanModify) && (!g.eventType || g.eventType === "default");
  const base = {
    title: g.summary?.trim() || "(No title)",
    color: (g.colorId && COLOR_FROM_GOOGLE[g.colorId]) || DEFAULT_COLOR,
    note: g.description || undefined,
    location: g.location || undefined,
    source: "google" as const,
    url: g.htmlLink,
  };

  if (g.start.date) {
    const days = rangeKeys(g.start.date, addDays(g.end.date ?? g.start.date, -1));
    if (days.length <= 1) {
      return [{ ...base, id: ID_PREFIX + g.id, date: g.start.date, start: 0, end: 1440, allDay: true, readOnly: !editable || undefined }];
    }
    return days.map((date) => ({ ...base, id: `${ID_PREFIX}${g.id}~${date}`, date, start: 0, end: 1440, allDay: true, readOnly: true }));
  }

  const start = new Date(g.start.dateTime!);
  const end = new Date(g.end.dateTime ?? g.start.dateTime!);
  const date = toKey(start);
  const startMin = minutesOf(start);
  const endKey = toKey(end);
  const endsAtMidnight = endKey === addDays(date, 1) && minutesOf(end) === 0;
  const sameDay = endKey === date;
  let endMin = sameDay ? minutesOf(end) : 1440;
  // Zero-length events still need something to click on.
  if (endMin <= startMin) endMin = Math.min(1440, startMin + 15);
  return [
    {
      ...base,
      id: ID_PREFIX + g.id,
      date,
      start: startMin,
      end: endMin,
      allDay: false,
      readOnly: !editable || !(sameDay || endsAtMidnight) || undefined,
    },
  ];
}

/** Google expects an absolute instant; local day + minutes, in this browser's time zone. */
function localDateTime(date: string, minutes: number) {
  const d = fromKey(date);
  d.setMinutes(minutes);
  return d.toISOString();
}

/**
 * The request body that turns `prev` into `next` (a full body when `prev` is
 * missing). Only changed fields are sent, so details the app doesn't model —
 * guests, reminders, the exact Google colour — are left alone.
 */
export function toGoogleBody(prev: CalEvent | undefined, next: CalEvent): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!prev || prev.title !== next.title) body.summary = next.title;
  if ((prev?.note ?? "") !== (next.note ?? "")) body.description = next.note ?? "";
  if ((prev?.location ?? "") !== (next.location ?? "")) body.location = next.location ?? "";
  if (prev ? prev.color !== next.color : next.color !== DEFAULT_COLOR) body.colorId = COLOR_TO_GOOGLE[next.color];

  const timeChanged =
    !prev || prev.date !== next.date || prev.start !== next.start || prev.end !== next.end || prev.allDay !== next.allDay;
  if (timeChanged) {
    if (next.allDay) {
      // Clear the other kind of time explicitly, in case the event was timed before.
      const clear = prev ? { dateTime: null, timeZone: null } : {};
      body.start = { date: next.date, ...clear };
      body.end = { date: addDays(next.date, 1), ...clear };
    } else {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const clear = prev ? { date: null } : {};
      body.start = { dateTime: localDateTime(next.date, next.start), timeZone, ...clear };
      body.end = { dateTime: localDateTime(next.date, next.end), timeZone, ...clear };
    }
  }
  return body;
}
