"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarSearchIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { FilterMenu, type FilterGroup } from "@/components/filter-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLong, formatShort } from "@/lib/dates";
import { LEAVE_COLORS, LEAVE_TYPES } from "@/lib/leave";
import type { LeaveRequest, LeaveStatus, LeaveType } from "@/lib/types";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { useCalendarStore } from "@/stores/calendar-store";
import { openOverlay } from "@/stores/overlay-store";
import { StatusBadge } from "./status-badge";

export const ALL_STATUSES: LeaveStatus[] = ["approved", "pending", "declined", "cancelled"];

export type RequestFilters = { statuses: LeaveStatus[]; types: LeaveType[] };
export const DEFAULT_FILTERS: RequestFilters = { statuses: ALL_STATUSES, types: LEAVE_TYPES };

type SortKey = "status" | "type" | "days" | "from" | "to";
type Sort = { key: SortKey; dir: 1 | -1 } | null;

const COLUMNS: { key: SortKey | "notes"; label: string; width?: number }[] = [
  { key: "status", label: "Status", width: 112 },
  { key: "type", label: "Leave type", width: 120 },
  { key: "days", label: "Duration", width: 140 },
  { key: "from", label: "Date from", width: 140 },
  { key: "to", label: "Date to", width: 140 },
  { key: "notes", label: "Notes" },
];

const SORT_OPTIONS: { value: string; label: string; sort: Sort }[] = [
  { value: "recent", label: "Recently submitted", sort: null },
  { value: "from-desc", label: "Newest dates", sort: { key: "from", dir: -1 } },
  { value: "from-asc", label: "Oldest dates", sort: { key: "from", dir: 1 } },
  { value: "days-desc", label: "Longest first", sort: { key: "days", dir: -1 } },
  { value: "status-asc", label: "Status", sort: { key: "status", dir: 1 } },
];

const sortValue = (sort: Sort) => (sort ? `${sort.key}-${sort.dir === 1 ? "asc" : "desc"}` : "recent");

const STATUS_LABEL: Record<LeaveStatus, string> = {
  approved: "Approved",
  pending: "Pending",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<LeaveStatus, string> = {
  approved: "success",
  pending: "warning",
  declined: "danger",
  cancelled: "neutral",
};

function compare(a: LeaveRequest, b: LeaveRequest, key: SortKey) {
  if (key === "days") return a.days - b.days;
  return String(a[key]).localeCompare(String(b[key]));
}

export function RequestsTable({
  filters,
  onFiltersChange,
  ref,
}: {
  filters: RequestFilters;
  onFiltersChange: (f: RequestFilters) => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const requests = useAppStore((s) => s.requests);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = requests.filter(
      (r) =>
        filters.statuses.includes(r.status) &&
        filters.types.includes(r.type) &&
        (!q ||
          [r.type, r.status, r.notes, r.duration, formatLong(r.from), formatLong(r.to)].some((v) =>
            v.toLowerCase().includes(q),
          )),
    );
    // Default order: most recently submitted first.
    const ordered = [...filtered].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return sort ? ordered.sort((a, b) => compare(a, b, sort.key) * sort.dir) : ordered;
  }, [requests, filters, query, sort]);

  const statusFiltered = filters.statuses.length !== ALL_STATUSES.length;
  const typeFiltered = filters.types.length !== LEAVE_TYPES.length;
  const activeCount = Number(statusFiltered) + Number(typeFiltered) + Number(sort !== null);

  const groups: FilterGroup[] = [
    {
      id: "status",
      label: "Status",
      type: "multi",
      value: filters.statuses,
      onChange: (v) => onFiltersChange({ ...filters, statuses: v as LeaveStatus[] }),
      options: ALL_STATUSES.map((st) => ({
        value: st,
        label: STATUS_LABEL[st],
        adornment: <span className="size-2 rounded-full" style={{ background: `var(--status-${STATUS_TONE[st]})` }} />,
      })),
    },
    {
      id: "type",
      label: "Leave type",
      type: "multi",
      value: filters.types,
      onChange: (v) => onFiltersChange({ ...filters, types: v as LeaveType[] }),
      options: LEAVE_TYPES.map((t) => ({
        value: t,
        label: t,
        adornment: <span className="size-2 rounded-full" style={{ background: `var(--event-${LEAVE_COLORS[t]}-fg)` }} />,
      })),
    },
    {
      id: "sort",
      label: "Sort by",
      type: "single",
      value: sortValue(sort),
      onChange: (v) => setSort(SORT_OPTIONS.find((o) => o.value === v)?.sort ?? null),
      options: SORT_OPTIONS.map(({ value, label }) => ({ value, label })),
    },
  ];

  const toggleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  return (
    <section
      ref={ref}
      aria-label="Leave and requests"
      className="flex w-full shrink-0 scroll-mt-0 flex-col overflow-hidden border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex w-full shrink-0 flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap overflow-hidden px-4 py-3 md:h-14">
        <h2 className="t-16 salt shrink-0 text-heading">Leave and requests</h2>
        <div className="flex items-center gap-2 max-sm:w-full" data-toolbar>
          <label className="flex h-8 w-60 items-center gap-2 max-sm:w-auto max-sm:flex-1 rounded-lg border border-control bg-surface px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-brand/60 focus-within:ring-3 focus-within:ring-brand/15">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search requests"
              className="text-base sm:text-sm md:t-14 min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="press text-icon hover-fine:text-fg">
                <XIcon className="size-3.5" />
              </button>
            )}
          </label>
          <FilterMenu
            title="Filter requests"
            groups={groups}
            activeCount={activeCount}
            onReset={() => {
              onFiltersChange(DEFAULT_FILTERS);
              setSort(null);
            }}
          />
        </div>
      </div>

      <div className="table-scroll w-full min-w-0 overflow-x-auto scroll-thin max-md:border-t max-md:border-hairline">
        <div role="table" aria-rowcount={rows.length} className="w-full min-w-0 md:min-w-[760px]">
          <div
            role="row"
            className="flex h-10 w-full items-center gap-3 overflow-hidden border-y border-hairline bg-app px-4 max-md:hidden"
          >
            {COLUMNS.map((c) =>
              c.key === "notes" ? (
                <div key={c.key} role="columnheader" className="t-14 min-w-0 flex-1 px-3 text-fg-2">
                  {c.label}
                </div>
              ) : (
                <button
                  key={c.key}
                  type="button"
                  role="columnheader"
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  onClick={() => toggleSort(c.key as SortKey)}
                  className="t-14 group flex h-full shrink-0 items-center gap-1 px-3 text-left text-fg-2 outline-none hover-fine:text-fg focus-visible:text-fg"
                  style={{ width: c.width }}
                >
                  {c.label}
                  {sort?.key === c.key &&
                    (sort.dir === 1 ? <ArrowUpIcon className="size-3 text-fg" /> : <ArrowDownIcon className="size-3 text-fg" />)}
                </button>
              ),
            )}
            <div className="w-12 shrink-0 text-right" aria-hidden />
          </div>

          {rows.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}

          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <SearchXIcon className="size-5 text-icon" />
              <p className="t-14 text-fg">No requests match</p>
              <p className="t-12 text-fg-2">Try a different search or reset the filters.</p>
              <Button
                size="sm"
                className="mt-1"
                onClick={() => {
                  setQuery("");
                  setSort(null);
                  onFiltersChange(DEFAULT_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RequestRow({ request: r }: { request: LeaveRequest }) {
  const router = useRouter();
  const today = useToday();
  const setStatus = useAppStore((s) => s.setRequestStatus);
  const deleteRequest = useAppStore((s) => s.deleteRequest);
  const canCancel = r.status === "pending" || (r.status === "approved" && r.from >= today);

  const showInCalendar = () => {
    useCalendarStore.getState().setDate(r.from);
    router.push("/time-off");
    document.querySelector("[data-page-scroll]")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      role="row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,[role=menuitem]")) return;
        openOverlay({ kind: "request-details", requestId: r.id });
      }}
      className="flex h-14 w-full cursor-pointer items-center gap-3 overflow-hidden border-b border-subtle px-4 transition-colors duration-150 hover-fine:bg-app/70 max-md:h-auto max-md:items-start max-md:gap-3 max-md:py-3 max-md:active:bg-app"
    >
      {/* Phones: a stacked card instead of six columns */}
      <div role="cell" className="grid min-w-0 flex-1 gap-1.5 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={r.status} />
          <span className="t-14 min-w-0 truncate text-table">{r.type}</span>
          <span className="t-12 ml-auto shrink-0 text-fg-2">{r.duration}</span>
        </div>
        <p className="t-14 text-table">
          {r.from === r.to ? formatLong(r.from) : `${formatShort(r.from)} – ${formatShort(r.to)}, ${r.to.slice(0, 4)}`}
        </p>
        <p className="t-12 line-clamp-2 leading-[1.35] text-fg-2">{r.notes}</p>
      </div>
      <div className="contents max-md:hidden">
        <div role="cell" className="flex w-28 shrink-0 items-center overflow-hidden px-3">
          <StatusBadge status={r.status} />
        </div>
        <div role="cell" className="t-14 w-[120px] shrink-0 truncate px-3 text-table">
          {r.type}
        </div>
        <div role="cell" className="t-14 w-[140px] shrink-0 truncate px-3 text-table">
          {r.duration}
        </div>
        <div role="cell" className="t-14 w-[140px] shrink-0 truncate px-3 text-table">
          {formatLong(r.from)}
        </div>
        <div role="cell" className="t-14 w-[140px] shrink-0 truncate px-3 text-table">
          {formatLong(r.to)}
        </div>
        <div role="cell" className="t-14 min-w-0 flex-1 overflow-hidden px-3 text-table">
          <span className="block truncate">{r.notes}</span>
        </div>
      </div>
      <div role="cell" className="flex w-12 shrink-0 items-center justify-end text-right">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label={`Actions for ${r.notes}`} className="border-transparent max-md:-mt-1 max-md:-mr-2 max-md:size-10">
                  <Icon name="more" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Actions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => openOverlay({ kind: "request-details", requestId: r.id })}>
              <EyeIcon /> View details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={showInCalendar}>
              <CalendarSearchIcon /> Show in calendar
            </DropdownMenuItem>
            {r.status === "pending" && (
              <DropdownMenuItem onSelect={() => openOverlay({ kind: "request", requestId: r.id })}>
                <PencilIcon /> Edit request
              </DropdownMenuItem>
            )}
            {canCancel && (
              <DropdownMenuItem onSelect={() => setStatus(r.id, "cancelled")}>
                <XIcon /> Cancel request
              </DropdownMenuItem>
            )}
            {r.status === "pending" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="t-12 text-fg-2">Manager preview</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setStatus(r.id, "approved")}>
                  <CheckIcon /> Approve
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setStatus(r.id, "declined")}>
                  <XIcon /> Decline
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => deleteRequest(r.id)}>
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
