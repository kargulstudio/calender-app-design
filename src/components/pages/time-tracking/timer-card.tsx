"use client";

import { useEffect, useState } from "react";
import { PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { formatClock, formatHours } from "./shared";

/** The phone bar submits the card's form from outside it via the `form` attribute. */
const FORM_ID = "tt-timer-form";

/** Ticks once a second while the timer runs; `useNow()` only refreshes every 30s. */
function useElapsed(running: boolean, startedAt: number | null): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [running]);
  if (!running || !startedAt || !now) return 0;
  return Math.max(0, now - startedAt);
}

export function TimerCard({ projects, todayMinutes }: { projects: string[]; todayMinutes: number }) {
  const timer = useAppStore((s) => s.timer);
  const startTimer = useAppStore((s) => s.startTimer);
  const stopTimer = useAppStore((s) => s.stopTimer);
  const updateTimer = useAppStore((s) => s.updateTimer);

  const start = () => startTimer(timer.project.trim() || "General", timer.task.trim());

  return (
    <section
      aria-label="Timer"
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-surface p-3 transition-[border-color] duration-200 ease-(--ease-out)",
        timer.running ? "border-brand/40" : "border-hairline",
      )}
    >
      <form
        id={FORM_ID}
        className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.running) stopTimer();
          else start();
        }}
      >
        <Input
          aria-label="Project"
          placeholder="Project"
          list="tt-projects"
          className="h-10 text-[16px] md:h-9 md:w-52 md:text-[14px]"
          value={timer.project}
          onChange={(e) => updateTimer({ project: e.target.value })}
        />
        <Input
          aria-label="Task"
          placeholder="What are you working on?"
          className="h-10 min-w-0 text-[16px] md:h-9 md:flex-1 md:text-[14px]"
          value={timer.task}
          onChange={(e) => updateTimer({ task: e.target.value })}
        />
        <datalist id="tt-projects">
          {projects.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {/* Phones get the clock and Start/Stop in the sticky bottom bar instead */}
        <TimerControls todayMinutes={todayMinutes} className="max-md:hidden" />
      </form>
    </section>
  );
}

/** Sticky bottom bar on phones: elapsed time and Start/Stop within thumb reach. */
export function TimerBar({ todayMinutes }: { todayMinutes: number }) {
  return (
    <div className="relative shrink-0 border-t border-hairline bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <TimerControls todayMinutes={todayMinutes} variant="bar" />
    </div>
  );
}

function TimerControls({
  todayMinutes,
  variant = "card",
  className,
}: {
  todayMinutes: number;
  variant?: "card" | "bar";
  className?: string;
}) {
  const timer = useAppStore((s) => s.timer);
  const elapsed = useElapsed(timer.running, timer.startedAt);
  const bar = variant === "bar";
  const label = [timer.project.trim(), timer.task.trim()].filter(Boolean).join(" · ");

  return (
    <div className={cn("flex shrink-0 items-center gap-3", bar ? "w-full" : "pl-2", className)}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", bar ? "flex-1 items-start" : "items-end")}>
        <span
          className={cn(
            "text-[22px] leading-none font-medium tracking-[-0.44px] tabular-nums",
            timer.running ? "text-fg" : "text-placeholder",
          )}
          role={bar ? undefined : "timer"}
          aria-live="off"
        >
          {formatClock(elapsed)}
        </span>
        <span className="t-12 flex max-w-full min-w-0 items-center gap-1.5 text-fg-2">
          {timer.running ? (
            <>
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
              <span className="truncate">{bar && label ? label : "Recording"}</span>
            </>
          ) : (
            <>Today · {formatHours(todayMinutes)}</>
          )}
        </span>
      </div>
      {timer.running ? (
        <Button type="submit" form={FORM_ID} variant="destructive" className={bar ? "h-10 w-[104px]" : "h-9 w-[84px]"}>
          <SquareIcon className="fill-current" /> Stop
        </Button>
      ) : (
        <Button type="submit" form={FORM_ID} variant="brand" className={bar ? "h-10 w-[104px]" : "h-9 w-[84px]"}>
          <PlayIcon className="fill-current" /> Start
        </Button>
      )}
    </div>
  );
}
