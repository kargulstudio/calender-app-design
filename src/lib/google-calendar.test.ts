import { describe, expect, it } from "vitest";
import { fromGoogleEvent, googleIdOf, isGoogleEventId, toGoogleBody, type GoogleEvent } from "./google-calendar";
import type { CalEvent } from "./types";

// Times are built in local time so the tests pass in any time zone.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();

const timed = (extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: "abc",
  summary: "Standup",
  organizer: { self: true },
  start: { dateTime: at(10, 9, 30) },
  end: { dateTime: at(10, 10, 15) },
  htmlLink: "https://calendar.google.com/event?eid=abc",
  ...extra,
});

describe("fromGoogleEvent", () => {
  it("maps a timed event to local day and minutes", () => {
    const [ev] = fromGoogleEvent(timed({ colorId: "11", location: "Room 2" }));
    expect(ev).toMatchObject({
      id: "g:abc",
      title: "Standup",
      date: "2026-11-10",
      start: 570,
      end: 615,
      allDay: false,
      color: "pink",
      location: "Room 2",
      source: "google",
    });
    expect(ev.readOnly).toBeUndefined();
    expect(isGoogleEventId(ev.id)).toBe(true);
    expect(googleIdOf(ev.id)).toBe("abc");
  });

  it("uses blue and a placeholder title when Google has neither", () => {
    const [ev] = fromGoogleEvent(timed({ summary: "  " }));
    expect(ev.title).toBe("(No title)");
    expect(ev.color).toBe("blue");
  });

  it("keeps a single all-day event editable", () => {
    const [ev] = fromGoogleEvent(timed({ start: { date: "2026-11-12" }, end: { date: "2026-11-13" } }));
    expect(ev).toMatchObject({ id: "g:abc", date: "2026-11-12", allDay: true, start: 0, end: 1440 });
    expect(ev.readOnly).toBeUndefined();
  });

  it("splits multi-day all-day events into read-only days", () => {
    const evs = fromGoogleEvent(timed({ start: { date: "2026-11-12" }, end: { date: "2026-11-15" } }));
    expect(evs.map((e) => e.date)).toEqual(["2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(new Set(evs.map((e) => e.id)).size).toBe(3);
    expect(evs.every((e) => e.readOnly)).toBe(true);
  });

  it("allows an event that ends exactly at midnight", () => {
    const [ev] = fromGoogleEvent(timed({ start: { dateTime: at(10, 22) }, end: { dateTime: at(11, 0) } }));
    expect(ev.end).toBe(1440);
    expect(ev.readOnly).toBeUndefined();
  });

  it("cuts events that run past midnight and locks them", () => {
    const [ev] = fromGoogleEvent(timed({ start: { dateTime: at(10, 22) }, end: { dateTime: at(11, 2) } }));
    expect(ev).toMatchObject({ date: "2026-11-10", start: 1320, end: 1440, readOnly: true });
  });

  it("locks invitations and special event types", () => {
    expect(fromGoogleEvent(timed({ organizer: {} }))[0].readOnly).toBe(true);
    expect(fromGoogleEvent(timed({ organizer: {}, guestsCanModify: true }))[0].readOnly).toBeUndefined();
    expect(fromGoogleEvent(timed({ eventType: "fromGmail" }))[0].readOnly).toBe(true);
  });
});

describe("toGoogleBody", () => {
  const base: CalEvent = {
    id: "g:abc",
    title: "Standup",
    date: "2026-11-10",
    start: 570,
    end: 615,
    allDay: false,
    color: "blue",
    source: "google",
  };

  it("sends only what changed", () => {
    expect(toGoogleBody(base, { ...base, title: "Daily standup" })).toEqual({ summary: "Daily standup" });
    expect(toGoogleBody(base, { ...base, color: "green" })).toEqual({ colorId: "10" });
    expect(toGoogleBody(base, base)).toEqual({});
  });

  it("sends local times with the browser time zone when an event moves", () => {
    const body = toGoogleBody(base, { ...base, date: "2026-11-11", start: 600, end: 660 });
    expect(body.start).toMatchObject({ dateTime: at(11, 10), date: null });
    expect(body.end).toMatchObject({ dateTime: at(11, 11) });
    expect((body.start as { timeZone: string }).timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("uses exclusive end dates for all-day events", () => {
    const body = toGoogleBody(base, { ...base, allDay: true, start: 0, end: 1440 });
    expect(body.start).toEqual({ date: "2026-11-10", dateTime: null, timeZone: null });
    expect(body.end).toEqual({ date: "2026-11-11", dateTime: null, timeZone: null });
  });

  it("builds a full body for new events, leaving the default colour to Google", () => {
    const body = toGoogleBody(undefined, { ...base, id: "g:pending", note: "Agenda", location: "" });
    expect(body).toMatchObject({ summary: "Standup", description: "Agenda" });
    expect(body).not.toHaveProperty("colorId");
    expect(body).not.toHaveProperty("location");
    expect(body.start).not.toHaveProperty("date");
  });
});
