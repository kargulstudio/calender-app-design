"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, CalendarPlusIcon, FileTextIcon, MoonIcon, PlaneIcon, ReceiptIcon, SunIcon } from "lucide-react";
import { Icon } from "@/components/icon";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { formatLong, formatShort, formatTimeRange } from "@/lib/dates";
import { ALL_PAGES } from "@/lib/nav";
import { useToday } from "@/hooks/use-today";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay, useOverlayStore } from "@/stores/overlay-store";

/** The title-bar search field. Opens a command palette (⌘K / "/"). */
export function GlobalSearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => openOverlay({ kind: "search" })}
      className="press flex h-[30px] w-[30px] items-center justify-center gap-2 rounded-lg border border-control bg-surface text-left outline-none transition-[border-color,box-shadow] duration-150 hover-fine:border-segment focus-visible:ring-3 focus-visible:ring-brand/15 md:w-48 md:justify-start md:px-2.5 xl:w-60"
      aria-label="Search"
      aria-keyshortcuts="Meta+K"
    >
      <Icon name="search" />
      <span className="t-14 hidden min-w-0 flex-1 text-placeholder md:block">Search...</span>
    </button>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const open = useOverlayStore((s) => s.overlay.kind === "search");
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  // Start every search fresh (derived during render, no effect needed).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }
  const close = useOverlayStore((s) => s.close);
  const events = useCalendarEvents();
  const requests = useAppStore((s) => s.requests);
  const documents = useAppStore((s) => s.documents);
  const invoices = useAppStore((s) => s.invoices);
  const timeFormat = useAppStore((s) => s.settings.timeFormat);
  const { resolvedTheme, setTheme } = useTheme();
  const today = useToday();

  // ⌘K / Ctrl+K toggles the palette instantly — no animation for keyboard actions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const { overlay, open: openO, close: closeO } = useOverlayStore.getState();
        if (overlay.kind === "search") closeO();
        else openO({ kind: "search" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start), [events]);

  const run = (fn: () => void) => {
    close();
    fn();
  };

  const showInCalendar = (date: string, eventId?: string) => {
    const cal = useCalendarStore.getState();
    if (eventId) cal.focusEvent(eventId, date);
    else cal.setDate(date);
    router.push("/time-off");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Search"
      description="Search pages, events, requests and documents"
      className="data-open:animate-none data-closed:animate-none sm:max-w-[560px] max-sm:top-2 max-sm:bottom-auto max-sm:left-2 max-sm:w-[calc(100%-1rem)] max-sm:max-h-[70dvh] max-sm:rounded-2xl max-sm:pb-0"
    >
      {/* cmdk needs a <Command> root around its input and list. */}
      <Command>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search events, requests, documents…" />
        <CommandList className="max-h-[380px]">
          <CommandEmpty className="t-14 text-fg-2">No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => openOverlay({ kind: "request" }))}>
              <PlaneIcon /> Request time-off
            </CommandItem>
            <CommandItem onSelect={() => run(() => openOverlay({ kind: "event", date: today }))}>
              <CalendarPlusIcon /> New event
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => showInCalendar(today))}>
              <CalendarDaysIcon /> Go to today
              <CommandShortcut>T</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />} Toggle dark mode
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Pages">
            {ALL_PAGES.map((p) => (
              <CommandItem key={p.href} value={`page ${p.label}`} onSelect={() => run(() => router.push(p.href))}>
                <Icon name={p.icon} /> {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Events">
            {sortedEvents.map((e) => (
              <CommandItem
                key={e.id}
                value={`event ${e.title} ${e.note ?? ""} ${formatLong(e.date)} ${e.id}`}
                onSelect={() => run(() => showInCalendar(e.date, e.id))}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--event-${e.color}-fg)` }} />
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <CommandShortcut className="tracking-normal">
                  {formatShort(e.date)}
                  {!e.allDay && ` · ${formatTimeRange(e.start, e.end, timeFormat)}`}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Leave requests">
            {requests.map((r) => (
              <CommandItem
                key={r.id}
                value={`request ${r.type} ${r.status} ${r.notes} ${formatLong(r.from)} ${r.id}`}
                onSelect={() => run(() => openOverlay({ kind: "request-details", requestId: r.id }))}
              >
                <PlaneIcon />
                <span className="min-w-0 flex-1 truncate">
                  {r.type} · {r.notes}
                </span>
                <CommandShortcut className="tracking-normal capitalize">{r.status}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Documents">
            {documents.map((d) => (
              <CommandItem key={d.id} value={`document ${d.name} ${d.category} ${d.id}`} onSelect={() => run(() => router.push("/documents"))}>
                <FileTextIcon />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <CommandShortcut className="tracking-normal">{d.category}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Invoices">
            {invoices.map((i) => (
              <CommandItem key={i.id} value={`invoice ${i.number} ${i.client} ${i.id}`} onSelect={() => run(() => router.push(`/invoice?open=${i.id}`))}>
                <ReceiptIcon />
                <span className="min-w-0 flex-1 truncate">
                  {i.number} · {i.client}
                </span>
                <CommandShortcut className="tracking-normal capitalize">{i.status}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
