"use client";

import { useMemo, useState } from "react";
import { CalendarSyncIcon, CheckIcon, PlusIcon, ReceiptIcon } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatLong, formatShort } from "@/lib/dates";
import type { Benefit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ClaimDialog } from "./claim-dialog";
import { CATEGORIES, CategoryTile, formatMoney, type BenefitCategory } from "./shared";

type Filter = "All" | BenefitCategory;

export function BenefitsPage() {
  const benefits = useAppStore((s) => s.benefits);
  const toggleBenefit = useAppStore((s) => s.toggleBenefit);
  const [filter, setFilter] = useState<Filter>("All");
  const [claim, setClaim] = useState<{ open: boolean; session: number; id?: string }>({ open: false, session: 0 });
  const [unenrollId, setUnenrollId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const enrolled = benefits.filter((b) => b.enrolled);
    const budget = enrolled.reduce((n, b) => n + b.budget, 0);
    const used = enrolled.reduce((n, b) => n + b.used, 0);
    return { budget, used, remaining: budget - used, enrolled: enrolled.length };
  }, [benefits]);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["All", benefits.length]]);
    for (const b of benefits) map.set(b.category, (map.get(b.category) ?? 0) + 1);
    return map;
  }, [benefits]);

  const visible = useMemo(
    () => (filter === "All" ? benefits : benefits.filter((b) => b.category === filter)),
    [benefits, filter],
  );

  const claimBenefit = benefits.find((b) => b.id === claim.id);
  const unenrollBenefit = benefits.find((b) => b.id === unenrollId);

  const enroll = (b: Benefit) => {
    toggleBenefit(b.id);
    toast.success(`Enrolled in ${b.name}`, { description: `Active until ${formatLong(b.renewsOn)}` });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin bg-app">
      <header className="sticky top-0 z-10 flex min-h-[68px] shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 py-3 md:h-[68px] md:py-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="t-16 text-fg">Your benefits</h2>
          <p className="t-14 max-w-[62ch] leading-[1.3] text-fg-2 md:truncate md:leading-none" style={{ maxWidth: "35em" }}>
            {summary.enrolled} of {benefits.length} enrolled · budgets reset on renewal
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-hairline bg-surface md:grid-cols-4">
          <SummaryStat label="Total budget" value={formatMoney(summary.budget)} />
          <SummaryStat label="Used" value={formatMoney(summary.used)} />
          <SummaryStat
            label="Remaining"
            value={formatMoney(summary.remaining)}
            extra={
              summary.budget > 0 ? (
                <Progress
                  value={(summary.used / summary.budget) * 100}
                  className="mt-1 h-1 bg-app [&_[data-slot=progress-indicator]]:transition-transform"
                  aria-label="Budget used"
                />
              ) : null
            }
          />
          <SummaryStat label="Enrolled" value={`${summary.enrolled}`} suffix={`of ${benefits.length}`} />
        </dl>

        {/* Phones: one horizontally scrolling chip row that bleeds to the screen edges */}
        <div
          role="toolbar"
          aria-label="Filter by category"
          className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:p-0 [&::-webkit-scrollbar]:hidden"
        >
          {(["All", ...CATEGORIES] as Filter[]).map((c) => {
            const active = filter === c;
            const n = counts.get(c) ?? 0;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(c)}
                className={cn(
                  "press t-14 flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-brand/15 md:h-9 md:px-3",
                  active
                    ? "border-control bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "border-transparent text-fg-2 hover-fine:bg-hover hover-fine:text-fg max-md:border-hairline",
                )}
              >
                {c !== "All" && <CategoryTile category={c} size="sm" />}
                {c}
                <span className="t-12 text-placeholder tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-14 text-center">
            <p className="t-14 text-fg-2">No {filter.toLowerCase()} benefits yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4" role="grid" data-catalog>
            {visible.map((b) => (
              <BenefitCard
                key={b.id}
                benefit={b}
                onEnroll={() => enroll(b)}
                onUnenroll={() => setUnenrollId(b.id)}
                onClaim={() => setClaim((c) => ({ open: true, session: c.session + 1, id: b.id }))}
              />
            ))}
          </div>
        )}
      </div>

      <ClaimDialog
        open={claim.open}
        session={claim.session}
        benefit={claimBenefit}
        onClose={() => setClaim((c) => ({ ...c, open: false }))}
      />

      <AlertDialog open={!!unenrollBenefit} onOpenChange={(v) => !v && setUnenrollId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="t-16">Unenroll from {unenrollBenefit?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="t-14 leading-[1.4]">
              {unenrollBenefit && unenrollBenefit.budget - unenrollBenefit.used > 0
                ? `Your remaining ${formatMoney(unenrollBenefit.budget - unenrollBenefit.used)} won't be available until you enroll again.`
                : "You can enroll again at any time before the next renewal."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay enrolled</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!unenrollBenefit) return;
                toggleBenefit(unenrollBenefit.id);
                toast(`Unenrolled from ${unenrollBenefit.name}`, {
                  action: { label: "Undo", onClick: () => useAppStore.getState().toggleBenefit(unenrollBenefit.id) },
                });
              }}
            >
              Unenroll
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  suffix,
  extra,
}: {
  label: string;
  value: string;
  suffix?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 border-hairline px-4 py-3.5 max-md:odd:border-r max-md:nth-[-n+2]:border-b md:border-r md:last:border-r-0">
      <dt className="t-12 text-fg-2">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-[22px] leading-none font-medium tracking-[-0.44px] text-fg tabular-nums">{value}</span>
        {suffix && <span className="t-14 text-fg-2">{suffix}</span>}
      </dd>
      {extra}
    </div>
  );
}

function BenefitCard({
  benefit: b,
  onEnroll,
  onUnenroll,
  onClaim,
}: {
  benefit: Benefit;
  onEnroll: () => void;
  onUnenroll: () => void;
  onClaim: () => void;
}) {
  const remaining = Math.max(0, b.budget - b.used);
  const pct = b.budget > 0 ? Math.min(100, (b.used / b.budget) * 100) : 0;
  const nearlyUsed = pct >= 90;

  return (
    <article className="flex flex-col rounded-xl border border-hairline bg-surface" role="row">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <CategoryTile category={b.category} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <h3 className="t-14 truncate text-fg">{b.name}</h3>
            <p className="t-12 text-fg-2">
              {b.provider} · {b.category}
            </p>
          </div>
          {b.enrolled && (
            <span
              className="salt inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[6px] border pr-1.5 pl-1 text-[12px] leading-none tracking-[-0.24px]"
              style={{
                background: "var(--status-success-tint)",
                borderColor: "var(--status-success-border)",
                color: "var(--status-success)",
              }}
            >
              <CheckIcon className="size-3.5" strokeWidth={2.25} /> Enrolled
            </span>
          )}
        </div>
        <p className="t-14 max-w-[62ch] leading-[1.4] text-fg-2" style={{ maxWidth: "35em" }}>{b.description}</p>

        <div className="mt-auto flex flex-col gap-2">
          {b.budget > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-14 text-table tabular-nums">
                  {formatMoney(b.used, true)} <span className="text-fg-2">of {formatMoney(b.budget)} used</span>
                </span>
                <span className={cn("t-12 tabular-nums", nearlyUsed ? "text-warning" : "text-fg-2")}>
                  {formatMoney(remaining)} left
                </span>
              </div>
              <Progress
                value={pct}
                aria-label={`${b.name} budget used`}
                className={cn(
                  "h-1.5 bg-app [&_[data-slot=progress-indicator]]:transition-transform",
                  !b.enrolled && "opacity-50",
                  nearlyUsed && "[&_[data-slot=progress-indicator]]:bg-warning",
                )}
              />
            </>
          ) : (
            <p className="t-14 max-w-[62ch] leading-[1.3] text-fg-2" style={{ maxWidth: "35em" }}>No spending budget — covered in full by the company.</p>
          )}
        </div>
      </div>

      {/* Phones: renewal date on its own line, full-width actions underneath */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3 max-sm:gap-y-3">
        <span className="t-12 flex min-w-0 flex-1 items-center gap-1.5 text-fg-2 max-sm:basis-full">
          <CalendarSyncIcon className="size-3.5 shrink-0 text-icon" />
          <span className="truncate">Renews {formatShort(b.renewsOn)}, {b.renewsOn.slice(0, 4)}</span>
        </span>
        {b.enrolled ? (
          <>
            {b.budget > 0 && (
              <Button
                className="h-9 px-3 max-sm:h-10 max-sm:flex-1"
                disabled={remaining <= 0}
                onClick={onClaim}
                aria-label={`Submit a claim for ${b.name}`}
              >
                <ReceiptIcon className="text-icon" /> Claim
              </Button>
            )}
            <Button variant="ghost" className="h-9 px-3 max-sm:h-10 max-sm:flex-1" onClick={onUnenroll}>
              Unenroll
            </Button>
          </>
        ) : (
          <Button variant="brand" className="h-9 px-3 max-sm:h-10 max-sm:flex-1" onClick={onEnroll}>
            <PlusIcon /> Enroll
          </Button>
        )}
      </div>
    </article>
  );
}
