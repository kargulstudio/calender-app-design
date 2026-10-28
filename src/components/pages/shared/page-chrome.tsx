import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared page scaffolding for the secondary pages (dashboard, analytics,
 * personal details, documents, settings). Kept presentational so it works in
 * server and client components alike.
 */

/** Scrollable page root that fills the shell's main area (clears the home indicator on phones). */
export function PageRoot({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-app pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Section header. Desktop/tablet (md+): sticky 68px row — title + secondary
 * line on the left, 30px actions on the right. Phones: it scrolls away with
 * the page (the shell's title bar already names the page), the title and
 * description wrap instead of truncating, actions drop below the title when
 * they don't fit, and action buttons grow to 40px touch targets.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-hairline bg-surface px-4 py-3",
        "md:sticky md:top-0 md:h-[68px] md:flex-nowrap md:py-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-2 md:basis-0">
        <h2 className="t-16 text-pretty text-fg md:truncate">{title}</h2>
        {description ? (
          <p className="t-14 max-w-[62ch] text-pretty text-fg-2 md:truncate" style={{ maxWidth: "35em" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            "[&_[data-slot=button]]:h-9 [&_[data-slot=button][data-size=default]]:px-3.5 [&_[data-slot=button][data-size=icon]]:size-9",
            "max-md:[&_[data-slot=button]]:h-10 max-md:[&_[data-slot=button][data-size=default]]:px-3.5 max-md:[&_[data-slot=button][data-size=icon]]:w-10",
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Surface card with the design's hairline border. */
export function Card({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-hairline bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

/** Card header row: title (+ optional description) with right-aligned actions. Text wraps on phones. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-h-[52px] items-center gap-3 border-b border-subtle px-4 py-3", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="t-14 text-pretty text-fg md:truncate">{title}</h3>
        {description ? (
          <p className="t-12 max-w-[62ch] text-pretty text-fg-2 md:truncate" style={{ maxWidth: "35em" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

/** Calm empty state: icon, one line, one hint, optional action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon ? (
        <span className="mb-1 flex size-9 items-center justify-center rounded-[10px] bg-app text-icon [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <p className="t-14 text-fg">{title}</p>
      {hint ? <p className="t-12 max-w-[280px] leading-[1.4] text-fg-2">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Colored Figma stat glyph (the stat-*.svg files carry their own color). */
export type StatGlyph = "available" | "extra" | "holidays" | "pending" | "per-year" | "upcoming";

export function StatIcon({ name, size = 20, className }: { name: StatGlyph; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-contain bg-center bg-no-repeat", className)}
      style={{ width: size, height: size, backgroundImage: `url(/icons/stat-${name}.svg)` }}
    />
  );
}

/**
 * KPI tile: glyph + label, a large value and a hint. Optionally a link (the
 * whole tile is the tap target; the arrow only appears on real hover). On
 * phones the label and hint wrap to two lines instead of truncating.
 */
export function StatTile({
  icon,
  label,
  value,
  hint,
  href,
}: {
  icon: StatGlyph;
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-start gap-2 md:items-center">
        <StatIcon name={icon} size={16} className="max-md:mt-px" />
        <span className="t-14 min-w-0 flex-1 text-fg-2 max-md:line-clamp-2 md:truncate">{label}</span>
        {href ? (
          <ArrowRightIcon className="hidden size-3.5 shrink-0 text-icon opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:block" />
        ) : null}
      </span>
      <span className="text-[24px] leading-none font-medium tracking-[-0.72px] text-fg md:text-[28px] md:tracking-[-0.84px]">
        {value}
      </span>
      <span className="t-12 text-fg-2 max-md:line-clamp-2 max-md:leading-[1.35] md:truncate">{hint}</span>
    </>
  );
  // Phones: label/value/hint rows are a subgrid, so values line up across a row even when a label wraps.
  const cls =
    "group flex min-w-0 flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 max-md:row-span-3 max-md:grid max-md:grid-rows-subgrid md:p-4";
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        "press outline-none hover-fine:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Row of stat tiles: 2-up on phones and tablets, 4-up from xl. */
export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4", className)}>{children}</div>;
}
