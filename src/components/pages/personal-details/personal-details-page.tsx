"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseIcon, CakeIcon, MailIcon, MapPinIcon, PhoneIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/dialogs/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fromKey, MONTHS } from "@/lib/dates";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { Card, CardHeader, PageHeader, PageRoot } from "@/components/pages/shared/page-chrome";

/** Phones: 40px fields with 16px text, so iOS doesn't zoom in on focus. */
const TOUCH_FIELD = "max-md:h-10 max-md:text-[16px]";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIO_MAX = 280;

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function tenure(start: string, today: string) {
  if (!start || start > today) return null;
  const a = fromKey(start);
  const b = fromKey(today);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y && !m) return "Less than a month";
  return [y ? `${y} ${y === 1 ? "year" : "years"}` : "", m ? `${m} ${m === 1 ? "month" : "months"}` : ""]
    .filter(Boolean)
    .join(" ");
}

function validate(p: Profile): Partial<Record<keyof Profile, string>> {
  const errors: Partial<Record<keyof Profile, string>> = {};
  if (!p.name.trim()) errors.name = "Your name is required.";
  if (!p.email.trim()) errors.email = "An email address is required.";
  else if (!EMAIL_RE.test(p.email.trim())) errors.email = "Enter a valid email address.";
  if (!p.initials.trim()) errors.initials = "Add 1–3 initials.";
  if (p.bio.length > BIO_MAX) errors.bio = `Keep it under ${BIO_MAX} characters.`;
  if (p.startDate && p.birthday && p.birthday >= p.startDate) errors.birthday = "Birthday must be before your start date.";
  return errors;
}

export function PersonalDetailsPage() {
  const today = useToday();
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);

  // Only the fields the user touched are kept locally; everything else reads
  // through to the store, so a late store hydration never clobbers the form.
  const [edits, setEdits] = useState<Partial<Profile>>({});
  const [showErrors, setShowErrors] = useState(false);

  const draft = useMemo(() => ({ ...profile, ...edits }), [profile, edits]);
  const changed = useMemo(
    () => (Object.keys(edits) as (keyof Profile)[]).filter((k) => edits[k] !== profile[k]),
    [edits, profile],
  );
  const dirty = changed.length > 0;
  const errors = useMemo(() => validate(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setEdits((e) => {
      const next = { ...e, [key]: value };
      if (value === profile[key]) delete next[key];
      return next;
    });

  const reset = () => {
    setEdits({});
    setShowErrors(false);
  };

  const save = () => {
    if (!dirty) return;
    if (hasErrors) {
      setShowErrors(true);
      toast.error("Check the highlighted fields", { description: "Some details need fixing before saving." });
      return;
    }
    const patch: Partial<Profile> = {};
    for (const k of changed) (patch as Record<string, string>)[k] = (draft[k] as string).trim();
    if (patch.initials) patch.initials = patch.initials.toUpperCase();
    updateProfile(patch);
    setEdits({});
    setShowErrors(false);
    toast.success("Profile saved", {
      description: `${changed.length} ${changed.length === 1 ? "field" : "fields"} updated`,
    });
  };

  // ⌘S / Ctrl+S saves; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        document.getElementById("profile-save")?.click();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  // Errors show once a field has been edited, or for every field after a failed save.
  const err = (k: keyof Profile) => ((showErrors || k in edits) && errors[k]) || null;
  const input = (k: keyof Profile, { className, ...props }: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`pd-${k}`}
      value={draft[k]}
      onChange={(e) => set(k, e.target.value)}
      aria-invalid={err(k) ? true : undefined}
      className={cn(TOUCH_FIELD, className)}
      {...props}
    />
  );

  const t = tenure(draft.startDate, today);
  const birthday = draft.birthday ? fromKey(draft.birthday) : null;

  return (
    <PageRoot>
      <PageHeader
        title="Your profile"
        description={
          dirty ? (
            <>
              {changed.length} unsaved {changed.length === 1 ? "change" : "changes"}
              <span className="max-md:hidden"> · ⌘S to save</span>
            </>
          ) : (
            "Shared with your manager and People Ops"
          )
        }
        actions={
          // Phones get a sticky save bar at the bottom instead (see below).
          <div className="hidden items-center gap-2 md:flex">
            <Button onClick={reset} disabled={!dirty}>
              <RotateCcwIcon className="text-icon" /> Reset
            </Button>
            <Button id="profile-save" type="submit" form="profile-form" variant="brand" disabled={!dirty}>
              Save changes
            </Button>
          </div>
        }
      />
      <form
        id="profile-form"
        className="mx-auto grid w-full max-w-[1040px] grid-cols-1 items-start gap-3 p-4 md:gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        {/* Summary */}
        <Card className="lg:sticky lg:top-[84px]">
          {/* Below lg the summary is a compact horizontal header; the sidebar card from lg. */}
          <div className="flex items-center gap-3.5 p-4 lg:flex-col lg:gap-3 lg:px-4 lg:pt-6 lg:pb-5 lg:text-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-brand-tint lg:size-16 lg:rounded-[18px]">
              <span className="font-inter text-[20px] leading-none font-semibold tracking-[-0.3px] text-brand lg:text-[22px] lg:tracking-[-0.33px]">
                {draft.initials.toUpperCase() || "?"}
              </span>
            </span>
            <div className="grid min-w-0 gap-2">
              <p className="t-16 text-fg">{draft.name || "Your name"}</p>
              <p className="t-14 text-fg-2">
                {[draft.jobTitle, draft.department].filter(Boolean).join(" · ") || "Add a job title"}
              </p>
            </div>
          </div>
          <ul className="grid gap-x-4 gap-y-3 border-t border-subtle px-4 py-4 sm:grid-cols-2 lg:grid-cols-1" data-catalog>
            <SummaryRow icon={<MailIcon />}>{draft.email || "—"}</SummaryRow>
            <SummaryRow icon={<PhoneIcon />}>{draft.phone || "—"}</SummaryRow>
            <SummaryRow icon={<MapPinIcon />}>{draft.location || "—"}</SummaryRow>
            <SummaryRow icon={<BriefcaseIcon />}>
              {draft.startDate ? `Joined ${MONTHS[fromKey(draft.startDate).getMonth()].slice(0, 3)} ${draft.startDate.slice(0, 4)}` : "—"}
              {t ? <span className="text-placeholder"> · {t}</span> : null}
            </SummaryRow>
            <SummaryRow icon={<CakeIcon />} className="sm:col-span-2 lg:col-span-1">
              {birthday ? `${MONTHS[birthday.getMonth()]} ${birthday.getDate()}` : "—"}
            </SummaryRow>
          </ul>
        </Card>

        <div className="grid min-w-0 gap-4">
          <Section title="Basic information" description="How you appear across the workspace">
            <div className="grid grid-cols-[minmax(0,1fr)_88px] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:gap-4">
              <Field label="Full name" htmlFor="pd-name" error={err("name")}>
                {input("name", { autoComplete: "name", required: true })}
              </Field>
              <Field label="Initials" htmlFor="pd-initials" error={err("initials")}>
                {input("initials", {
                  maxLength: 3,
                  className: "uppercase",
                  onChange: (e) => set("initials", e.target.value.toUpperCase().replace(/[^A-Z]/g, "")),
                })}
              </Field>
            </div>
            {initialsFrom(draft.name) && initialsFrom(draft.name) !== draft.initials ? (
              <button
                type="button"
                onClick={() => set("initials", initialsFrom(draft.name))}
                className="t-12 -mt-2 inline-flex min-h-[36px] w-fit items-center text-brand outline-none hover-fine:text-brand-strong focus-visible:underline"
              >
                Use “{initialsFrom(draft.name)}” from your name
              </button>
            ) : null}
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="pd-email" error={err("email")}>
                {input("email", { type: "email", autoComplete: "email", required: true })}
              </Field>
              <Field label="Phone" htmlFor="pd-phone">
                {input("phone", { type: "tel", autoComplete: "tel", placeholder: "+44 20 0000 0000" })}
              </Field>
            </div>
          </Section>

          <Section title="Work" description="Your role and reporting line">
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Field label="Job title" htmlFor="pd-jobTitle">
                {input("jobTitle", { autoComplete: "organization-title" })}
              </Field>
              <Field label="Department" htmlFor="pd-department">
                {input("department")}
              </Field>
              <Field label="Manager" htmlFor="pd-manager">
                {input("manager")}
              </Field>
              <Field label="Location" htmlFor="pd-location">
                {input("location", { placeholder: "City, Country" })}
              </Field>
              <Field label="Start date" htmlFor="pd-startDate" hint={t ? `${t} at the company` : undefined} className="sm:col-span-2">
                {input("startDate", { type: "date", max: today })}
              </Field>
            </div>
          </Section>

          <Section title="Personal" description="Only visible to People Ops">
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Field label="Birthday" htmlFor="pd-birthday" error={err("birthday")}>
                {input("birthday", { type: "date", max: today })}
              </Field>
              <Field label="Emergency contact" htmlFor="pd-emergencyContact" hint="Name and phone number">
                {input("emergencyContact", { placeholder: "Name · phone" })}
              </Field>
              <Field label="Home address" htmlFor="pd-address" className="sm:col-span-2">
                {input("address", { autoComplete: "street-address" })}
              </Field>
            </div>
          </Section>

          <Section title="About" description="A short intro for your teammates">
            <Field
              label="Bio"
              htmlFor="pd-bio"
              error={err("bio")}
              hint={
                <span className={cn("tabular-nums", draft.bio.length > BIO_MAX * 0.9 && "text-warning")}>
                  {draft.bio.length}/{BIO_MAX}
                </span>
              }
            >
              <Textarea
                id="pd-bio"
                className="max-md:text-[16px]"
                rows={3}
                value={draft.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="What you work on, what you love…"
                aria-invalid={err("bio") ? true : undefined}
              />
            </Field>
          </Section>
        </div>
      </form>

      {/* Phones: unsaved edits surface a save bar pinned above the home indicator. */}
      {dirty ? (
        <div className="sticky bottom-0 z-10 mt-auto flex gap-2 border-t border-hairline bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] duration-200 ease-(--ease-out) animate-in fade-in-0 slide-in-from-bottom-4 md:hidden">
          <Button className="h-10 px-3.5" onClick={reset}>
            <RotateCcwIcon className="text-icon" /> Reset
          </Button>
          <Button type="submit" form="profile-form" variant="brand" className="h-10 flex-1">
            Save {changed.length === 1 ? "change" : `${changed.length} changes`}
          </Button>
        </div>
      ) : null}
    </PageRoot>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid gap-4 p-4">{children}</div>
    </Card>
  );
}

function SummaryRow({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <li className={cn("flex items-center gap-2.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-icon", className)}>
      {icon}
      <span className="t-14 min-w-0 flex-1 truncate text-fg-2">{children}</span>
    </li>
  );
}
