"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLineIcon, CalendarClockIcon, CheckIcon, PlusIcon, StarIcon, Trash2Icon, WalletCardsIcon } from "lucide-react";
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
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { diffDays, formatLong, formatShort, formatWeekday } from "@/lib/dates";
import type { WithdrawalMethod } from "@/lib/types";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { AddMethodDialog } from "./add-method-dialog";
import { KIND_META, KindTile, lastWorkingDay, masked, nextPayoutDate } from "./shared";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

export function WithdrawalMethodsPage() {
  const today = useToday();
  const methods = useAppStore((s) => s.withdrawalMethods);
  const invoices = useAppStore((s) => s.invoices);
  const holidays = useAppStore((s) => s.holidays);
  const setDefault = useAppStore((s) => s.setDefaultWithdrawalMethod);
  const removeMethod = useAppStore((s) => s.removeWithdrawalMethod);
  const [adding, setAdding] = useState({ open: false, session: 0 });
  const [removeId, setRemoveId] = useState<string | null>(null);

  const defaultMethod = methods.find((m) => m.isDefault);
  const toRemove = methods.find((m) => m.id === removeId);
  const nextPayout = nextPayoutDate(today, holidays);
  const daysToPayout = diffDays(today, nextPayout);

  const payouts = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "paid")
        .map((i) => ({
          id: i.id,
          number: i.number,
          client: i.client,
          currency: i.currency,
          amount: i.items.reduce((n, it) => n + it.quantity * it.rate, 0),
          date: lastWorkingDay(i.dueDate, holidays),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, holidays],
  );

  const makeDefault = (m: WithdrawalMethod) => {
    setDefault(m.id);
    toast.success("Default method updated", { description: `Payouts now go to ${m.label}` });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin bg-app">
      <header className="sticky top-0 z-10 flex min-h-[68px] shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 py-3 md:h-[68px] md:py-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="t-16 text-fg">Withdrawal methods</h2>
          <p className="t-14 max-w-[62ch] leading-[1.3] text-fg-2 md:truncate md:leading-none" style={{ maxWidth: "35em" }}>Where your invoice payments are paid out</p>
        </div>
        {/* Phones: icon-only, so the title keeps the room */}
        <Button
          variant="brand"
          className="h-9 px-3.5 max-md:size-10 max-md:p-0"
          onClick={() => setAdding((a) => ({ open: true, session: a.session + 1 }))}
        >
          <PlusIcon className="max-md:size-4" /> <span className="max-md:sr-only">Add method</span>
        </Button>
      </header>

      {/* Below lg the side cards drop under the list (side by side on tablets) */}
      <div className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="flex h-12 items-center justify-between border-b border-hairline px-4">
            <h3 className="t-14 text-fg">Methods</h3>
            <span className="t-12 text-fg-2">{methods.length} saved</span>
          </div>
          {methods.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-app">
                <WalletCardsIcon className="size-4 text-icon" />
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="t-14 text-fg">No withdrawal methods</p>
                <p className="t-14 text-fg-2">Add one so we know where to send your payouts.</p>
              </div>
              <Button className="h-9 px-3.5" onClick={() => setAdding((a) => ({ open: true, session: a.session + 1 }))}>
                <PlusIcon /> Add method
              </Button>
            </div>
          ) : (
            <ul>
              {methods.map((m) => (
                <li
                  key={m.id}
                  className="flex h-[68px] items-center gap-3 border-b border-subtle px-4 last:border-b-0 max-md:pr-1.5"
                >
                  <KindTile kind={m.kind} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center gap-2">
                      <span className="t-14 truncate text-fg">{m.label}</span>
                      {m.isDefault && (
                        <span className="t-12 shrink-0 rounded-md bg-brand-tint px-1.5 py-1 text-brand">Default</span>
                      )}
                    </span>
                    <span className="t-12 truncate text-fg-2 max-md:hidden">
                      {KIND_META[m.kind].label} · {m.holder}
                    </span>
                    {/* Phones fold the number and currency columns into the second line */}
                    <span className="t-12 truncate text-fg-2 tabular-nums md:hidden">
                      {[masked(m.last4) || m.holder, m.currency].join(" · ")}
                    </span>
                  </div>
                  <span className="t-14 w-24 shrink-0 text-right text-table tabular-nums max-md:hidden">
                    {masked(m.last4) || <span className="text-placeholder">—</span>}
                  </span>
                  <span className="t-12 w-12 shrink-0 rounded-md border border-control py-1 text-center text-fg-2 max-md:hidden">
                    {m.currency}
                  </span>
                  <MethodMenu method={m} onMakeDefault={() => makeDefault(m)} onRemove={() => setRemoveId(m.id)} />
                  <div className="flex w-[132px] shrink-0 items-center justify-end gap-0.5 max-md:hidden">
                    {!m.isDefault && (
                      <Button className="h-9 px-3" onClick={() => makeDefault(m)}>
                        Set default
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-9" aria-label={`Remove ${m.label}`} onClick={() => setRemoveId(m.id)}>
                          <Trash2Icon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove</TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-1" role="figure">
          <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
            <div className="flex h-12 items-center gap-3.5 border-b border-hairline px-4">
              <CalendarClockIcon className="size-4 shrink-0 text-icon" />
              <h3 className="t-14 text-fg">Payout schedule</h3>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center gap-3">
                <span className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-md bg-[var(--event-purple-bg)] py-1.5 text-[var(--event-purple-fg)]">
                  <span className="t-12 leading-none font-medium tracking-wide uppercase">{formatShort(nextPayout).slice(0, 3)}</span>
                  <span className="t-16">{Number(nextPayout.slice(8))}</span>
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="t-14 text-fg">
                    Next payout {daysToPayout === 0 ? "today" : daysToPayout === 1 ? "tomorrow" : `in ${daysToPayout} days`}
                  </span>
                  <span className="t-12 text-fg-2">
                    {formatWeekday(nextPayout)}, {formatLong(nextPayout)}
                  </span>
                </div>
              </div>
              <dl className="grid gap-3 border-t border-hairline pt-4">
                <Row label="Frequency" value="Monthly" />
                <Row label="Pay day" value="Last working day" />
                <Row
                  label="Destination"
                  value={
                    defaultMethod
                      ? [defaultMethod.label, masked(defaultMethod.last4)].filter(Boolean).join(" ")
                      : "No method yet"
                  }
                  muted={!defaultMethod}
                />
              </dl>
              <p className="t-12 leading-[1.4] text-fg-2">
                Weekends and public holidays move the payout to the working day before.
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
            <div className="flex h-12 items-center gap-3.5 border-b border-hairline px-4">
              <ArrowDownToLineIcon className="size-4 shrink-0 text-icon" />
              <h3 className="t-14 flex-1 text-fg">Recent payouts</h3>
              <span className="t-12 text-fg-2">From paid invoices</span>
            </div>
            {payouts.length === 0 ? (
              <p className="t-14 px-4 py-8 text-center text-fg-2">Paid invoices will show up here.</p>
            ) : (
              <ul>
                {payouts.map((p) => {
                  const done = p.date <= today;
                  return (
                    <li key={p.id} className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="t-14 truncate text-fg">{p.client}</span>
                        <span className="t-12 truncate text-fg-2">
                          {p.number} · {formatShort(p.date)}, {p.date.slice(0, 4)}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="t-14 text-table tabular-nums">{money(p.amount, p.currency)}</span>
                        <span
                          className="t-12 flex items-center gap-1"
                          style={{ color: done ? "var(--status-success)" : "var(--status-warning)" }}
                        >
                          {done && <CheckIcon className="size-3" strokeWidth={2.5} />}
                          {done ? "Paid out" : "Scheduled"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AddMethodDialog
        open={adding.open}
        session={adding.session}
        onClose={() => setAdding((a) => ({ ...a, open: false }))}
      />

      <AlertDialog open={!!toRemove} onOpenChange={(v) => !v && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="t-16">Remove {toRemove?.label}?</AlertDialogTitle>
            <AlertDialogDescription className="t-14 leading-[1.4]">
              {toRemove?.isDefault && methods.length > 1
                ? "This is your default method. Future payouts will go to your next saved method."
                : toRemove?.isDefault
                  ? "This is your only method — payouts will be held until you add a new one."
                  : "Payouts won't be sent here any more. You can add it again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!toRemove) return;
                removeMethod(toRemove.id);
                toast(`${toRemove.label} removed`);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="t-14 text-fg-2">{label}</dt>
      <dd className={muted ? "t-14 truncate text-placeholder" : "t-14 truncate text-right text-table"}>{value}</dd>
    </div>
  );
}

/** Phone row actions: the desktop row's "Set default" and remove buttons. */
function MethodMenu({
  method,
  onMakeDefault,
  onRemove,
}: {
  method: WithdrawalMethod;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 md:hidden" aria-label={`Actions for ${method.label}`}>
          <Icon name="more" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 [&_[role^=menuitem]]:min-h-10">
        <DropdownMenuItem disabled={method.isDefault} onSelect={onMakeDefault}>
          <StarIcon /> {method.isDefault ? "Default method" : "Set as default"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2Icon /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
