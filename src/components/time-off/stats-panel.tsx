"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { computeLeaveStats, formatDays } from "@/lib/leave";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { openOverlay } from "@/stores/overlay-store";

type Stat = {
  id: string;
  icon: string;
  tint: string;
  value: string;
  caption: React.ReactNode;
  label: string;
  onSelect: () => void;
};

export function StatsPanel({ onShowPending }: { onShowPending: () => void }) {
  const requests = useAppStore((s) => s.requests);
  const settings = useAppStore((s) => s.settings);
  const holidays = useAppStore((s) => s.holidays);
  const today = useToday();
  const s = useMemo(() => computeLeaveStats({ requests, settings, holidays }, today), [requests, settings, holidays, today]);

  const days = (n: number) => `${formatDays(n)} ${n === 1 ? "day" : "days"}`;

  const stats: Stat[] = [
    {
      id: "available",
      icon: "stat-available",
      tint: "var(--category-green-tint)",
      value: `${days(s.available)} available`,
      caption: "To book time off",
      label: "Request time-off",
      onSelect: () => openOverlay({ kind: "request" }),
    },
    {
      id: "pending",
      icon: "stat-pending",
      tint: "var(--category-orange-tint)",
      value: `${s.pendingCount} pending ${s.pendingCount === 1 ? "request" : "requests"}`,
      caption: "Awaiting manager approval",
      label: "Show pending requests",
      onSelect: onShowPending,
    },
    {
      id: "upcoming",
      icon: "stat-upcoming",
      tint: "var(--category-blue-tint)",
      value: `${days(s.upcoming)} upcoming`,
      caption: "Total days taken",
      label: "Leave policy",
      onSelect: () => openOverlay({ kind: "policy" }),
    },
    {
      id: "contract",
      icon: "stat-per-year",
      tint: "var(--category-cyan-tint)",
      value: `${days(s.contract)} per year`,
      caption: "In the contract",
      label: "Leave policy",
      onSelect: () => openOverlay({ kind: "policy" }),
    },
    {
      id: "carryover",
      icon: "stat-extra",
      tint: "var(--category-pink-tint)",
      value: `${days(s.carryover)} extra leave`,
      caption: "From carryover days",
      label: "Leave policy",
      onSelect: () => openOverlay({ kind: "policy" }),
    },
    {
      id: "holidays",
      icon: "stat-holidays",
      tint: "var(--category-purple-tint)",
      value: `${s.holidays} national ${s.holidays === 1 ? "holiday" : "holidays"}`,
      caption: <span className="underline decoration-from-font [text-underline-position:from-font]">See holiday list</span>,
      label: "See holiday list",
      onSelect: () => openOverlay({ kind: "holidays" }),
    },
  ];

  return (
    <aside
      aria-label="Time off stats"
      className="flex w-full shrink-0 flex-col overflow-hidden border-t border-hairline bg-app xl:h-full xl:w-[304px] xl:border-t-0 xl:border-l"
    >
      <div className="flex h-[68px] w-full shrink-0 items-center gap-4 overflow-hidden border-b border-hairline px-4">
        <h2 className="t-16 min-w-0 flex-1 text-fg">Time off stats</h2>
        <Button size="sm" className="text-fg-2" onClick={() => openOverlay({ kind: "policy" })}>
          Learn more
        </Button>
      </div>
      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-x-6 overflow-y-auto px-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:flex xl:flex-col xl:gap-x-0">
        {stats.map((stat) => (
          <button
            key={stat.id}
            type="button"
            onClick={stat.onSelect}
            aria-label={`${stat.value}. ${stat.label}`}
            className="group relative flex w-full min-w-0 shrink-0 items-center gap-3 overflow-hidden rounded-lg px-2 py-3 text-left outline-none before:absolute before:inset-0 before:rounded-lg before:transition-colors before:duration-150 hover-fine:before:bg-hover focus-visible:before:ring-2 focus-visible:before:ring-brand/40"
          >
            <span
              className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
              style={{ background: stat.tint }}
            >
              <Image src={`/icons/${stat.icon}.svg`} alt="" width={20} height={20} unoptimized />
            </span>
            <span className="relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
              <span className="t-16 w-full truncate text-fg">{stat.value}</span>
              <span className={stat.id === "holidays" ? "t-14 salt w-full truncate text-brand" : "t-14 salt w-full truncate text-fg-2"}>
                {stat.caption}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
