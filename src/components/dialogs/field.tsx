import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + optional hint/error, the building block of every form. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor} className="t-12 font-medium text-fg-2">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="t-12 w-fit max-w-[35em] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="t-12 w-fit max-w-[35em] leading-[1.35] text-fg-2">{hint}</p>
      ) : null}
    </div>
  );
}

export function DialogSection({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
