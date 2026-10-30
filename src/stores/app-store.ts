"use client";

import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { formatShort, rangeKeys } from "@/lib/dates";
import { isGoogleEventId } from "@/lib/google-calendar";
import { durationLabel, LEAVE_COLORS, WORKDAY_MINUTES, workingDays } from "@/lib/leave";
import { createSeed, STATE_VERSION } from "@/lib/seed";
import type {
  AppNotification,
  AppState,
  Benefit,
  CalEvent,
  DocumentFile,
  Invoice,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Profile,
  Settings,
  TimeEntry,
  WithdrawalMethod,
} from "@/lib/types";
import { useGoogleStore } from "./google-store";

export function uid(prefix = "id"): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export type RequestInput = {
  type: LeaveType;
  from: string;
  to: string;
  allDay: boolean;
  start: number;
  end: number;
  notes: string;
};

type Actions = {
  // workspace
  switchWorkspace: (id: string) => void;
  addWorkspace: (name: string) => void;
  // events
  saveEvent: (event: Omit<CalEvent, "id"> & { id?: string }) => CalEvent;
  moveEvent: (id: string, patch: Pick<CalEvent, "date" | "start" | "end">) => void;
  deleteEvent: (id: string) => void;
  duplicateEvent: (id: string) => void;
  // leave
  measureRequest: (input: RequestInput) => { days: number; label: string };
  submitRequest: (input: RequestInput, existingId?: string) => LeaveRequest;
  setRequestStatus: (id: string, status: LeaveStatus) => void;
  deleteRequest: (id: string) => void;
  addHoliday: (date: string, name: string) => void;
  removeHoliday: (id: string) => void;
  // notifications
  notify: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  // profile & settings
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  // documents
  addDocument: (doc: Omit<DocumentFile, "id" | "uploadedAt">) => void;
  updateDocument: (id: string, patch: Partial<DocumentFile>) => void;
  deleteDocument: (id: string) => void;
  // time tracking
  startTimer: (project: string, task: string) => void;
  stopTimer: () => void;
  updateTimer: (patch: { project?: string; task?: string }) => void;
  saveTimeEntry: (entry: Omit<TimeEntry, "id"> & { id?: string }) => void;
  deleteTimeEntry: (id: string) => void;
  // invoices
  saveInvoice: (invoice: Omit<Invoice, "id"> & { id?: string }) => Invoice;
  setInvoiceStatus: (id: string, status: Invoice["status"]) => void;
  deleteInvoice: (id: string) => void;
  // payouts
  addWithdrawalMethod: (m: Omit<WithdrawalMethod, "id" | "addedAt" | "isDefault">) => void;
  setDefaultWithdrawalMethod: (id: string) => void;
  removeWithdrawalMethod: (id: string) => void;
  // benefits
  toggleBenefit: (id: string) => void;
  claimBenefit: (id: string, amount: number) => void;
  updateBenefit: (id: string, patch: Partial<Benefit>) => void;
  // misc
  resetDemoData: () => void;
  /** Clears the sample records so the app holds only your own data. */
  startFresh: (email?: string) => void;
};

/** True while the profile is still the seed's sample person. */
export const isSampleProfile = (s: AppState) => s.profile.email === createSeed().profile.email;

export type AppStore = AppState & Actions;

const bySubmitted = (a: LeaveRequest, b: LeaveRequest) => b.submittedAt.localeCompare(a.submittedAt);

function eventsForRequest(req: LeaveRequest): CalEvent[] {
  const color = LEAVE_COLORS[req.type];
  const note = req.status === "approved" ? "Approved" : "Pending";
  if (!req.allDay) {
    return [
      {
        id: uid("ev"),
        title: req.type,
        date: req.from,
        start: req.start ?? 540,
        end: req.end ?? 1020,
        allDay: false,
        color,
        note,
        requestId: req.id,
      },
    ];
  }
  return rangeKeys(req.from, req.to).map((date) => ({
    id: uid("ev"),
    title: req.type,
    date,
    start: 0,
    end: 1440,
    allDay: true,
    color,
    requestId: req.id,
  }));
}

// localStorage throws when the ~5MB quota is full (e.g. large uploaded
// documents). Keep the app working in memory and say so once.
let warnedQuota = false;
const safeLocalStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  removeItem: (name: string) => localStorage.removeItem(name),
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
      warnedQuota = false;
    } catch {
      if (warnedQuota) return;
      warnedQuota = true;
      toast.error("Browser storage is full", {
        description: "Your latest changes won't survive a reload. Remove some uploaded documents to free space.",
      });
    }
  },
};

const whenLabel = (from: string, to: string) =>
  from === to ? formatShort(from) : `${formatShort(from)} – ${formatShort(to)}`;

// ------------------------------------------------------------------
// Undo / redo history
// Every change to user data records a snapshot of the previous data, so
// ⌘Z / Ctrl+Z can step back through any edit. Notifications, the running
// timer and rehydration from storage are not recorded.
// ------------------------------------------------------------------
const TRACKED = [
  "workspaceId",
  "workspaces",
  "events",
  "requests",
  "holidays",
  "profile",
  "settings",
  "documents",
  "timeEntries",
  "invoices",
  "withdrawalMethods",
  "benefits",
] as const satisfies readonly (keyof AppState)[];
type TrackedKey = (typeof TRACKED)[number];
type Snapshot = Pick<AppState, TrackedKey>;
type HistoryEntry = { snapshot: Snapshot; label: string };

const HISTORY_LIMIT = 100;
const past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];

const KEY_LABELS: Record<TrackedKey, string> = {
  workspaceId: "Workspace",
  workspaces: "Workspace",
  events: "Calendar",
  requests: "Leave request",
  holidays: "Holidays",
  profile: "Profile",
  settings: "Settings",
  documents: "Documents",
  timeEntries: "Time tracking",
  invoices: "Invoices",
  withdrawalMethods: "Payout methods",
  benefits: "Benefits",
};

function snapshotOf(state: AppState): Snapshot {
  const snap = {} as Record<TrackedKey, unknown>;
  for (const key of TRACKED) snap[key] = state[key];
  return snap as Snapshot;
}

function labelFor(keys: TrackedKey[]): string {
  // Leave requests also touch events; name the more specific thing.
  if (keys.includes("requests")) return KEY_LABELS.requests;
  return [...new Set(keys.map((k) => KEY_LABELS[k]))].join(" & ");
}

/** Reverts the last recorded change. Returns what was undone, or null. */
export function undo(): string | null {
  const entry = past.pop();
  if (!entry) return null;
  future.push({ snapshot: snapshotOf(useAppStore.getState()), label: entry.label });
  useAppStore.setState(entry.snapshot);
  return entry.label;
}

/** Re-applies the last undone change. Returns what was redone, or null. */
export function redo(): string | null {
  const entry = future.pop();
  if (!entry) return null;
  past.push({ snapshot: snapshotOf(useAppStore.getState()), label: entry.label });
  useAppStore.setState(entry.snapshot);
  return entry.label;
}

export const useAppStore = create<AppStore>()(
  persist(
    (rawSet, get) => {
      // Records history for any update that changes tracked data.
      const set = ((partial: unknown, replace?: boolean) => {
        const state = get();
        const next = (typeof partial === "function" ? partial(state) : partial) as Partial<AppState> | null;
        const changed = TRACKED.filter((k) => next && k in next && next[k] !== state[k]);
        if (changed.length) {
          past.push({ snapshot: snapshotOf(state), label: labelFor(changed) });
          if (past.length > HISTORY_LIMIT) past.shift();
          future = [];
        }
        (rawSet as (p: unknown, r?: boolean) => void)(next, replace);
      }) as typeof rawSet;

      return {
      ...createSeed(),

      // ------------------------------------------------------------ workspace
      switchWorkspace: (id) => set({ workspaceId: id }),
      addWorkspace: (name) => {
        const ws = { id: uid("ws"), name };
        set((s) => ({ workspaces: [...s.workspaces, ws], workspaceId: ws.id }));
        toast.success(`Switched to ${name}`);
      },

      // ------------------------------------------------------------ events
      // Google events (and new events while Google is connected) go to Google
      // Calendar instead; they aren't part of this store or its undo history.
      saveEvent: (event) => {
        const google = useGoogleStore.getState();
        if (isGoogleEventId(event.id) || (!event.id && google.status === "connected")) return google.save(event);
        const saved: CalEvent = { ...event, id: event.id ?? uid("ev") };
        set((s) => ({
          events: s.events.some((e) => e.id === saved.id)
            ? s.events.map((e) => (e.id === saved.id ? saved : e))
            : [...s.events, saved],
        }));
        return saved;
      },
      moveEvent: (id, patch) => {
        if (isGoogleEventId(id)) return useGoogleStore.getState().move(id, patch);
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
      },
      deleteEvent: (id) => {
        if (isGoogleEventId(id)) return useGoogleStore.getState().remove(id);
        const removed = get().events.find((e) => e.id === id);
        if (!removed) return;
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        toast("Event deleted", {
          description: removed.title,
          action: { label: "Undo", onClick: () => set((s) => ({ events: [...s.events, removed] })) },
        });
      },
      duplicateEvent: (id) => {
        if (isGoogleEventId(id)) return useGoogleStore.getState().duplicate(id);
        const ev = get().events.find((e) => e.id === id);
        if (!ev) return;
        const copy = { ...ev, id: uid("ev"), title: `${ev.title} (copy)`, requestId: undefined };
        set((s) => ({ events: [...s.events, copy] }));
        toast.success("Event duplicated", { description: copy.title });
      },

      // ------------------------------------------------------------ leave
      measureRequest: (input) => {
        if (!input.allDay) {
          const minutes = Math.max(0, input.end - input.start);
          const hours = Math.round((minutes / 60) * 10) / 10;
          return { days: minutes / WORKDAY_MINUTES, label: durationLabel(0, hours) };
        }
        const n = workingDays(input.from, input.to, get().holidays).length;
        return { days: n, label: durationLabel(n, 0) };
      },
      submitRequest: (input, existingId) => {
        const m = get().measureRequest(input);
        const req: LeaveRequest = {
          id: existingId ?? uid("rq"),
          status: "pending",
          type: input.type,
          duration: m.label,
          days: m.days,
          from: input.from,
          to: input.allDay ? input.to : input.from,
          allDay: input.allDay,
          start: input.allDay ? undefined : input.start,
          end: input.allDay ? undefined : input.end,
          notes: input.notes.trim() || input.type,
          submittedAt: new Date().toISOString(),
        };
        set((s) => ({
          requests: existingId ? s.requests.map((r) => (r.id === existingId ? req : r)) : [req, ...s.requests],
          events: [...s.events.filter((e) => e.requestId !== req.id), ...eventsForRequest(req)],
        }));
        const when = whenLabel(req.from, req.to);
        toast.success(existingId ? "Request updated" : "Request submitted", {
          description: `${req.type} · ${when} is awaiting approval`,
        });
        get().notify({
          title: `${req.type} request submitted`,
          body: `${when} · ${req.duration}. Your manager has been notified.`,
          href: "/time-off",
        });
        return req;
      },
      setRequestStatus: (id, status) => {
        const req = get().requests.find((r) => r.id === id);
        if (!req) return;
        set((s) => {
          const keep = status === "approved" || status === "pending";
          const note = status === "approved" ? "Approved" : "Pending";
          return {
            requests: s.requests.map((r) => (r.id === id ? { ...r, status } : r)),
            events: keep
              ? s.events.map((e) => (e.requestId === id && !e.allDay ? { ...e, note } : e))
              : s.events.filter((e) => e.requestId !== id),
          };
        });
        const verb = { approved: "approved", declined: "declined", cancelled: "cancelled", pending: "reopened" }[status];
        const message = `Request ${verb}`;
        const description = `${req.type} · ${formatShort(req.from)}`;
        if (status === "approved") toast.success(message, { description });
        else if (status === "declined") toast.error(message, { description });
        else toast(message, { description });
        if (status === "approved" || status === "declined") {
          get().notify({
            title: `${req.type} ${verb}`,
            body: `Your request for ${whenLabel(req.from, req.to)} was ${verb}.`,
            href: "/time-off",
          });
        }
      },
      deleteRequest: (id) => {
        const s0 = get();
        const req = s0.requests.find((r) => r.id === id);
        if (!req) return;
        const events = s0.events.filter((e) => e.requestId === id);
        set((s) => ({
          requests: s.requests.filter((r) => r.id !== id),
          events: s.events.filter((e) => e.requestId !== id),
        }));
        toast("Request deleted", {
          description: req.notes,
          action: {
            label: "Undo",
            onClick: () =>
              set((s) => ({ requests: [...s.requests, req].sort(bySubmitted), events: [...s.events, ...events] })),
          },
        });
      },
      addHoliday: (date, name) => {
        set((s) => ({
          holidays: [...s.holidays, { id: uid("ho"), date, name }].sort((a, b) => a.date.localeCompare(b.date)),
        }));
        toast.success("Holiday added", { description: `${name} · ${formatShort(date)}` });
      },
      removeHoliday: (id) => set((s) => ({ holidays: s.holidays.filter((h) => h.id !== id) })),

      // ------------------------------------------------------------ notifications
      notify: (n) =>
        set((s) => ({
          notifications: [{ ...n, id: uid("no"), createdAt: new Date().toISOString(), read: false }, ...s.notifications],
        })),
      markNotificationRead: (id) =>
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),

      // ------------------------------------------------------------ profile & settings
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      // ------------------------------------------------------------ documents
      addDocument: (doc) =>
        set((s) => ({ documents: [{ ...doc, id: uid("doc"), uploadedAt: new Date().toISOString() }, ...s.documents] })),
      updateDocument: (id, patch) =>
        set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
      deleteDocument: (id) => {
        const doc = get().documents.find((d) => d.id === id);
        if (!doc) return;
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
        toast("Document deleted", {
          description: doc.name,
          action: { label: "Undo", onClick: () => set((s) => ({ documents: [doc, ...s.documents] })) },
        });
      },

      // ------------------------------------------------------------ time tracking
      startTimer: (project, task) => set({ timer: { running: true, startedAt: Date.now(), project, task } }),
      stopTimer: () => {
        const { timer } = get();
        if (!timer.running || !timer.startedAt) return;
        const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000));
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        set((s) => ({
          timer: { ...s.timer, running: false, startedAt: null },
          timeEntries: [
            { id: uid("te"), date, project: timer.project, task: timer.task || "Untitled task", minutes, billable: true },
            ...s.timeEntries,
          ],
        }));
        toast.success("Time logged", { description: `${minutes} min · ${timer.project}` });
      },
      updateTimer: (patch) => set((s) => ({ timer: { ...s.timer, ...patch } })),
      saveTimeEntry: (entry) => {
        const saved = { ...entry, id: entry.id ?? uid("te") };
        set((s) => ({
          timeEntries: s.timeEntries.some((e) => e.id === saved.id)
            ? s.timeEntries.map((e) => (e.id === saved.id ? saved : e))
            : [saved, ...s.timeEntries],
        }));
      },
      deleteTimeEntry: (id) => {
        const entry = get().timeEntries.find((e) => e.id === id);
        if (!entry) return;
        set((s) => ({ timeEntries: s.timeEntries.filter((e) => e.id !== id) }));
        toast("Entry deleted", {
          description: entry.task,
          action: { label: "Undo", onClick: () => set((s) => ({ timeEntries: [entry, ...s.timeEntries] })) },
        });
      },

      // ------------------------------------------------------------ invoices
      saveInvoice: (invoice) => {
        const saved: Invoice = { ...invoice, id: invoice.id ?? uid("in") };
        set((s) => ({
          invoices: s.invoices.some((i) => i.id === saved.id)
            ? s.invoices.map((i) => (i.id === saved.id ? saved : i))
            : [saved, ...s.invoices],
        }));
        return saved;
      },
      setInvoiceStatus: (id, status) =>
        set((s) => ({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, status } : i)) })),
      deleteInvoice: (id) => {
        const inv = get().invoices.find((i) => i.id === id);
        if (!inv) return;
        set((s) => ({ invoices: s.invoices.filter((i) => i.id !== id) }));
        toast("Invoice deleted", {
          description: inv.number,
          action: { label: "Undo", onClick: () => set((s) => ({ invoices: [inv, ...s.invoices] })) },
        });
      },

      // ------------------------------------------------------------ payouts
      addWithdrawalMethod: (m) =>
        set((s) => ({
          withdrawalMethods: [
            ...s.withdrawalMethods,
            { ...m, id: uid("wm"), addedAt: new Date().toISOString(), isDefault: s.withdrawalMethods.length === 0 },
          ],
        })),
      setDefaultWithdrawalMethod: (id) =>
        set((s) => ({ withdrawalMethods: s.withdrawalMethods.map((m) => ({ ...m, isDefault: m.id === id })) })),
      removeWithdrawalMethod: (id) =>
        set((s) => {
          const remaining = s.withdrawalMethods.filter((m) => m.id !== id);
          if (remaining.length && !remaining.some((m) => m.isDefault)) remaining[0] = { ...remaining[0], isDefault: true };
          return { withdrawalMethods: remaining };
        }),

      // ------------------------------------------------------------ benefits
      toggleBenefit: (id) => set((s) => ({ benefits: s.benefits.map((b) => (b.id === id ? { ...b, enrolled: !b.enrolled } : b)) })),
      claimBenefit: (id, amount) =>
        set((s) => ({
          benefits: s.benefits.map((b) => (b.id === id ? { ...b, used: Math.min(b.budget, b.used + amount) } : b)),
        })),
      updateBenefit: (id, patch) => set((s) => ({ benefits: s.benefits.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),

      // ------------------------------------------------------------ misc
      resetDemoData: () => {
        set(createSeed());
        toast.success("Demo data restored");
      },
      // Keeps workspaces, holidays and settings; everything personal starts empty.
      startFresh: (email) => {
        const name = email?.split("@")[0] || "Me";
        set({
          events: [],
          requests: [],
          notifications: [],
          documents: [],
          timeEntries: [],
          timer: { running: false, startedAt: null, project: "", task: "" },
          invoices: [],
          withdrawalMethods: [],
          benefits: [],
          profile: {
            name,
            email: email ?? "",
            initials: name.slice(0, 2).toUpperCase(),
            phone: "",
            jobTitle: "",
            department: "",
            manager: "",
            location: "",
            startDate: "",
            birthday: "",
            address: "",
            emergencyContact: "",
            bio: "",
          },
        });
        toast.success("Sample data cleared", { action: { label: "Undo", onClick: () => undo() } });
      },
    };
    },
    {
      name: "calendar-app:state",
      version: STATE_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      // Hydrate after mount so the server-rendered markup (the seed) matches.
      skipHydration: true,
      migrate: (persisted, version) => {
        const s = persisted as AppState;
        // v3: the main workspace is "Kargul Workspace" (was "Workspace", then "Kargul").
        if (version < 3) {
          s.workspaces = s.workspaces.map((w) =>
            w.id === "ws-main" && (w.name === "Workspace" || w.name === "Kargul") ? { ...w, name: "Kargul Workspace" } : w,
          );
        }
        return { ...s, version: STATE_VERSION };
      },
      partialize: (s) => {
        const data: Partial<AppStore> = {};
        for (const [k, v] of Object.entries(s)) if (typeof v !== "function") (data as Record<string, unknown>)[k] = v;
        return data as AppState;
      },
    },
  ),
);

/** Read-only selector for the active workspace name. */
export const selectWorkspaceName = (s: AppStore) =>
  s.workspaces.find((w) => w.id === s.workspaceId)?.name ?? "Kargul Workspace";
