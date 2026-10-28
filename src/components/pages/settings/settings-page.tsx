"use client";

import { useTheme } from "next-themes";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  BellIcon,
  CalendarDaysIcon,
  CheckIcon,
  DatabaseIcon,
  DownloadIcon,
  MinusIcon,
  PaletteIcon,
  PlusIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTime } from "@/lib/dates";
import { computeLeaveStats, formatDays } from "@/lib/leave";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { openOverlay } from "@/stores/overlay-store";
import { Card, PageHeader, PageRoot } from "@/components/pages/shared/page-chrome";

const TABS = [
  { value: "general", label: "General", icon: SlidersHorizontalIcon },
  { value: "time-off", label: "Time off", icon: CalendarDaysIcon },
  { value: "notifications", label: "Notifications", icon: BellIcon },
  { value: "appearance", label: "Appearance", icon: PaletteIcon },
  { value: "data", label: "Data", icon: DatabaseIcon },
] as const;

const noopSubscribe = () => () => {};

function useSettings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);
  return [settings, set] as const;
}

export function SettingsPage() {
  const [tab, setTab] = useState<string>("general");
  return (
    <PageRoot>
      <PageHeader title="Settings" description="Changes are saved automatically" />
      {/* md+: vertical tab rail beside the panel. Phones: a sticky, horizontally scrolling tab bar above it. */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="mx-auto w-full max-w-[960px] flex-col gap-4 p-4 md:flex-row md:items-start md:gap-6"
      >
        <TabsList
          className={cn(
            "h-fit shrink-0 gap-0.5 bg-transparent p-0 md:sticky md:top-[84px] md:w-[200px]",
            "max-md:sticky max-md:top-0 max-md:z-10 max-md:-mx-4 max-md:-mt-4 max-md:w-auto max-md:flex-row! max-md:justify-start max-md:gap-1 max-md:overflow-x-auto max-md:overscroll-x-contain max-md:rounded-none max-md:border-b max-md:border-hairline max-md:bg-app max-md:px-4 max-md:py-2",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {TABS.map(({ value, label, icon: Glyph }) => (
            <TabsTrigger
              key={value}
              value={value}
              // Keep a tapped, half-hidden tab fully in view.
              onClick={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
              className={cn(
                "t-14 salt h-9 w-full flex-none justify-start gap-2 rounded-lg border-0 px-2 text-[14px] text-fg-2 after:hidden",
                "max-md:h-10 max-md:w-auto! max-md:px-3",
                "hover-fine:bg-hover hover-fine:text-fg data-active:bg-selected data-active:text-fg data-active:shadow-none",
                "dark:data-active:border-transparent dark:data-active:bg-selected",
                "focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                "[&_svg]:size-3.5! [&_svg]:text-icon",
              )}
            >
              <Glyph /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 md:flex-1">
          <TabsContent value="general">
            <GeneralTab />
          </TabsContent>
          <TabsContent value="time-off">
            <TimeOffTab />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceTab />
          </TabsContent>
          <TabsContent value="data">
            <DataTab />
          </TabsContent>
        </div>
      </Tabs>
    </PageRoot>
  );
}

/* ------------------------------------------------------------------ building blocks */

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 px-1">
        <h3 className="t-16 text-fg">{title}</h3>
        <p className="t-14 max-w-[62ch] text-fg-2" style={{ maxWidth: "35em" }}>{description}</p>
      </div>
      <Card className="divide-y divide-subtle">{children}</Card>
    </div>
  );
}

/** Phones: selects and buttons grow to 40px touch targets (and fill the row when stacked). */
const TOUCH_CONTROL = "max-md:h-10!";

function Row({
  title,
  description,
  htmlFor,
  stack = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  /** Put the control under the label on phones (selects, steppers, buttons); switches stay inline. */
  stack?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-density="compact"
      className={cn(
        "flex min-h-[68px] items-center gap-4 px-4 py-3 sm:gap-6",
        stack && "max-sm:flex-col max-sm:items-stretch max-sm:gap-3 max-sm:py-3.5",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-1.5">
        <label htmlFor={htmlFor} className="t-14 text-fg">
          {title}
        </label>
        {description ? <p className="t-12 max-w-[62ch] leading-[1.4] text-fg-2" style={{ maxWidth: "35em" }}>{description}</p> : null}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          stack && "max-sm:*:flex-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ general */

function GeneralTab() {
  const [settings, set] = useSettings();
  return (
    <Panel title="General" description="How dates and times appear across your calendar.">
      <Row title="Week starts on" description="First column in week and month views" htmlFor="st-week" stack>
        <Select
          value={String(settings.weekStartsOn)}
          onValueChange={(v) => set("weekStartsOn", Number(v) as 0 | 1)}
        >
          <SelectTrigger id="st-week" className={cn("w-40", TOUCH_CONTROL)} style={{ minHeight: "36px", height: "36px" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sunday</SelectItem>
            <SelectItem value="1">Monday</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row title="Time format" description="Used for events, requests and time entries" htmlFor="st-time" stack>
        <Select value={settings.timeFormat} onValueChange={(v) => set("timeFormat", v as Settings["timeFormat"])}>
          <SelectTrigger id="st-time" className={cn("w-40", TOUCH_CONTROL)} style={{ minHeight: "36px", height: "36px" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">24-hour · 14:30</SelectItem>
            <SelectItem value="12h">12-hour · 2:30 PM</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row title="Calendar day starts at" description="Day and week views scroll to this hour" htmlFor="st-start" stack>
        <Select value={String(settings.dayStartHour)} onValueChange={(v) => set("dayStartHour", Number(v))}>
          <SelectTrigger id="st-start" className={cn("w-40", TOUCH_CONTROL)} style={{ minHeight: "36px", height: "36px" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {Array.from({ length: 13 }, (_, h) => (
              <SelectItem key={h} value={String(h)}>
                {formatTime(h * 60, settings.timeFormat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row title="Show weekends" description="Hide Saturday and Sunday to focus on the work week" htmlFor="st-weekends">
        <Switch
          id="st-weekends"
          className="after:hidden"
          style={{ minHeight: "28px", minWidth: "44px", height: "28px", width: "44px" }}
          checked={settings.showWeekends}
          onCheckedChange={(v) => set("showWeekends", v)}
        />
      </Row>
    </Panel>
  );
}

/* ------------------------------------------------------------------ time off */

function Stepper({
  id,
  value,
  min,
  max,
  onChange,
  label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  // Local text only while typing; otherwise the store value is shown.
  const [text, setText] = useState<string | null>(null);
  const commit = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v))));
  const invalid = text !== null && (text.trim() === "" || Number.isNaN(Number(text)) || Number(text) < min || Number(text) > max);

  return (
    <div className="flex items-center gap-1 max-sm:w-full">
      <Button size="icon" className="size-9 max-md:size-10" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => commit(value - 1)}>
        <MinusIcon className="text-icon" />
      </Button>
      <Input
        id={id}
        inputMode="numeric"
        className="h-9 w-14 text-center tabular-nums max-md:h-10 max-md:text-[16px] max-sm:flex-1"
        value={text ?? String(value)}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d]/g, "");
          setText(t);
          const n = Number(t);
          if (t !== "" && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commit(value + 1);
            setText(null);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commit(value - 1);
            setText(null);
          }
        }}
      />
      <Button size="icon" className="size-9 max-md:size-10" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => commit(value + 1)}>
        <PlusIcon className="text-icon" />
      </Button>
    </div>
  );
}

function TimeOffTab() {
  const [settings, set] = useSettings();
  const today = useToday();
  const requests = useAppStore((s) => s.requests);
  const holidays = useAppStore((s) => s.holidays);
  const stats = useMemo(() => computeLeaveStats({ requests, settings, holidays }, today), [requests, settings, holidays, today]);
  const total = settings.contractDays + settings.carryoverDays;

  return (
    <div className="grid gap-4">
      <Panel title="Time off" description="Your yearly allowance. Balances everywhere update instantly.">
        <Row title="Contract days" description="Paid days off per calendar year (0–60)" htmlFor="st-contract" stack>
          <Stepper
            id="st-contract"
            label="contract days"
            value={settings.contractDays}
            min={0}
            max={60}
            onChange={(v) => set("contractDays", v)}
          />
        </Row>
        <Row title="Carryover days" description="Unused days brought over from last year (0–30)" htmlFor="st-carryover" stack>
          <Stepper
            id="st-carryover"
            label="carryover days"
            value={settings.carryoverDays}
            min={0}
            max={30}
            onChange={(v) => set("carryoverDays", v)}
          />
        </Row>
      </Panel>
      <div className="flex items-center gap-4 rounded-xl border border-hairline bg-app px-4 py-3.5 max-sm:flex-wrap max-sm:gap-3">
        <div className="grid flex-1 gap-1.5 max-sm:basis-full">
          <span className="t-14 text-fg">
            {formatDays(total)} days this year · {formatDays(stats.available)} available
          </span>
          <span className="t-12 text-fg-2">
            {formatDays(stats.taken + stats.upcoming)} approved · {formatDays(stats.pendingDays)} pending ·{" "}
            {stats.holidays} public holidays never count
          </span>
        </div>
        <Button className="max-md:h-10 max-sm:flex-1" onClick={() => openOverlay({ kind: "holidays" })}>
          Holidays
        </Button>
        <Button className="max-md:h-10 max-sm:flex-1" onClick={() => openOverlay({ kind: "policy" })}>
          View policy
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ notifications */

function NotificationsTab() {
  const [settings, set] = useSettings();
  const email = useAppStore((s) => s.profile.email);
  return (
    <Panel title="Notifications" description="Choose how you hear about approvals and reminders.">
      <Row title="Email" description={`Approvals, declines and reminders to ${email}`} htmlFor="st-email">
        <Switch
          id="st-email"
          className="after:hidden"
          style={{ minHeight: "28px", minWidth: "44px", height: "28px", width: "44px" }}
          checked={settings.emailNotifications}
          onCheckedChange={(v) => set("emailNotifications", v)}
        />
      </Row>
      <Row title="Push" description="Instant alerts in this browser" htmlFor="st-push">
        <Switch
          id="st-push"
          className="after:hidden"
          style={{ minHeight: "28px", minWidth: "44px", height: "28px", width: "44px" }}
          checked={settings.pushNotifications}
          onCheckedChange={(v) => set("pushNotifications", v)}
        />
      </Row>
      <Row title="Weekly digest" description="A Monday summary of your week ahead and leave balance" htmlFor="st-digest">
        <Switch
          id="st-digest"
          className="after:hidden"
          style={{ minHeight: "28px", minWidth: "44px", height: "28px", width: "44px" }}
          checked={settings.weeklyDigest}
          onCheckedChange={(v) => set("weeklyDigest", v)}
        />
      </Row>
    </Panel>
  );
}

/* ------------------------------------------------------------------ appearance */

// A preview has to show a theme other than the active one, so it pins the
// relevant tokens locally (globals.css only scopes dark, via [data-theme=dark]).
const PREVIEW_TOKENS: Record<"light" | "dark", React.CSSProperties> = {
  light: {
    "--bg-app": "#f8f8f8",
    "--bg-surface": "#ffffff",
    "--bg-selected": "#eaeae6",
    "--bg-hover": "#f1f1ee",
    "--border-hairline": "#e5e7e1",
    "--text-primary": "#1d1d1d",
    "--event-green-bg": "#bde7db",
    "--event-purple-bg": "#e3daf7",
    "--event-blue-bg": "#c5e2f9",
  } as React.CSSProperties,
  dark: {
    "--bg-app": "#121212",
    "--bg-surface": "#181818",
    "--bg-selected": "#262624",
    "--bg-hover": "#232321",
    "--border-hairline": "#2a2a28",
    "--text-primary": "#ededed",
    "--event-green-bg": "#123d31",
    "--event-purple-bg": "#2d2547",
    "--event-blue-bg": "#17324a",
  } as React.CSSProperties,
};

function ThemePreview({ theme }: { theme: "light" | "dark" }) {
  return (
    <div style={PREVIEW_TOKENS[theme]} className="flex h-24 overflow-hidden rounded-lg border border-hairline bg-app" aria-hidden>
      <div className="flex w-1/3 flex-col gap-1.5 border-r border-hairline p-2">
        <span className="h-1.5 w-3/4 rounded-full bg-selected" />
        <span className="h-1.5 w-1/2 rounded-full bg-hover" />
        <span className="h-1.5 w-2/3 rounded-full bg-hover" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 bg-surface p-2">
        <span className="h-1.5 w-1/2 rounded-full bg-[var(--text-primary)] opacity-80" />
        <div className="mt-1 grid flex-1 grid-cols-3 gap-1">
          <span className="rounded-[4px] bg-[var(--event-green-bg)]" />
          <span className="rounded-[4px] bg-[var(--event-purple-bg)]" />
          <span className="rounded-[4px] bg-[var(--event-blue-bg)]" />
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const current = mounted ? (resolvedTheme === "dark" ? "dark" : "light") : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 px-1">
        <h3 className="t-16 text-fg">Appearance</h3>
        <p className="t-14 max-w-[62ch] text-fg-2" style={{ maxWidth: "35em" }}>Pick a theme for this browser. You can also toggle it from the sidebar.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4" role="radiogroup" aria-label="Theme">
        {(["light", "dark"] as const).map((t) => {
          const active = current === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(t)}
              className={cn(
                "press grid gap-3 rounded-xl border bg-surface p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                active ? "border-brand ring-1 ring-brand" : "border-hairline hover-fine:border-segment",
              )}
            >
              <ThemePreview theme={t} />
              <span className="flex items-center gap-2 px-0.5">
                <span className="t-14 flex-1 text-fg">{t === "light" ? "Light" : "Dark"}</span>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border transition-colors duration-150",
                    active ? "border-brand bg-brand text-white" : "border-control",
                  )}
                >
                  {active ? <CheckIcon className="size-2.5" strokeWidth={3} /> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ data */

function DataTab() {
  const today = useToday();
  const counts = useAppStore(selectCountsLabel);
  const resetDemoData = useAppStore((s) => s.resetDemoData);

  const exportJson = () => {
    const state = useAppStore.getState();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) if (typeof v !== "function") data[k] = v;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace-export-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Export ready", { description: `workspace-export-${today}.json · ${formatBytes(blob.size)}` });
  };

  return (
    <Panel title="Data" description="Everything lives in this browser’s local storage.">
      <Row title="Export data" description={counts} stack>
        <Button onClick={exportJson} className={cn("h-9 px-3.5", TOUCH_CONTROL)}>
          <DownloadIcon className="text-icon" /> Export JSON
        </Button>
      </Row>
      <Row
        title="Reset demo data"
        description="Restore the original sample events, requests and documents. This replaces your changes."
        stack
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className={cn("h-9 px-3.5", TOUCH_CONTROL)}>
              <RotateCcwIcon /> Reset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="t-16">Reset all demo data?</AlertDialogTitle>
              <AlertDialogDescription className="t-14 leading-[1.4]">
                Your events, requests, documents, profile and settings will be replaced with the original sample data. Export
                first if you want to keep a copy.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="max-sm:h-10">Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" className="max-sm:h-10" onClick={() => resetDemoData()}>
                Reset data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Row>
    </Panel>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Selector returning a primitive string, so it is stable across renders. */
function selectCountsLabel(s: ReturnType<typeof useAppStore.getState>) {
  const parts = [
    [s.events.length, "event", "events"],
    [s.requests.length, "request", "requests"],
    [s.documents.length, "document", "documents"],
    [s.timeEntries.length, "time entry", "time entries"],
    [s.invoices.length, "invoice", "invoices"],
  ] as const;
  return `Download ${parts.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(", ")} as JSON`;
}
