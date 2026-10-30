# Kargul Calender Design Prototype

A design prototype of **Kargul Workspace**, a people-ops workspace built from the
"Dashboard – calendar" Figma design. Live at https://calender-app-design.vercel.app.

The **Time off** page (`/time-off`, the default route) reproduces the design
pixel-for-pixel; every other page in the sidebar is built in the same visual
language. Everything runs in the browser — there is no backend; data persists
to `localStorage`.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** with design tokens mapped from the Figma variables
- **shadcn/ui** (Radix primitives) themed to the design
- **Zustand** for state (`persist` middleware → `localStorage`)
- **next-themes** for dark mode, **Sonner** for toasts, **cmdk** for the command palette

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. To return to the exact design state, use
**Settings → Data → Reset demo data** (or clear site data).

## What works

- **Calendar** — week / day / month views; drag on empty space to create, drag
  events to move (across days), drag the bottom edge to resize; overlapping
  events lay out side by side; all-day lane with public holidays; live now-line;
  origin-aware details popover.
- **Google Calendar** — optional two-way sync with your Google account's
  primary calendar (see below).
- **Time off** — request dialog that counts working days (skips weekends and
  holidays) and shows the balance after the request; stats computed from your
  requests and allowance; requests table with search, filters, sorting, details,
  edit/cancel/delete, and a manager approve/decline preview.
- **Shell** — workspace switcher, ⌘K search across pages/events/requests/
  documents/invoices, notifications, help menu, dark mode, account menu.
- **Keyboard** — `⌘K` search, `N` new event, `R` request time-off, `T` today,
  `←/→` previous/next, `D/W/M` views, `?` shortcuts.
- **Other pages** — Dashboard, Analytics, Personal details, Documents, Time
  tracking, Benefits, Invoice, Withdrawal methods, Settings.

## Google Calendar

Connect a Gmail / Google account under **Settings → Connections** (or the sync
button next to **Today**). Your Google events then show alongside the app's own;
creating, editing, moving, resizing, duplicating or deleting them updates Google
Calendar. New events go to Google while you're connected.

Sign-in happens entirely in the browser with Google Identity Services, so there
is no server or client secret. Access tokens last about an hour; when one
expires the app asks you to reconnect with a click. Google events are kept in
memory only, never in `localStorage`, and aren't part of ⌘Z undo (deleting one
offers its own Undo).

Some Google events are read-only here and open in Google Calendar instead:
events you were invited to, multi-day all-day events, timed events that run past
midnight, and special types such as birthdays or events from Gmail.

### Setup

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable the **Google Calendar API**.
2. Open **Google Auth Platform** and configure it: an **External** audience, and
   add your Gmail address under **Test users** (while the app is in testing,
   only test users can sign in). Under **Data access**, add the scope
   `https://www.googleapis.com/auth/calendar.events`.
3. Under **Clients**, create an OAuth client of type **Web application**. Add
   every origin you open the app from to **Authorized JavaScript origins**, e.g.
   `http://localhost:3000` and `https://calender-app-design.vercel.app`. No
   redirect URI is needed.
4. Copy the client ID into `.env.local` (start from `.env.example`):

   ```bash
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```

   Restart `npm run dev`. On Vercel, add the same variable under **Settings →
   Environment Variables** and redeploy — it's inlined at build time.

## Project layout

```
src/
  app/                 routes (one folder per sidebar page)
  components/
    ui/                shadcn/ui primitives, themed
    shell/             title bar, sidebar, search, notifications, shortcuts
    calendar/          header, time grid, all-day row, month view, popover
    time-off/          stats panel, requests table, status badge
    dialogs/           app-wide dialogs (request, event, details, holidays…)
    pages/             page bodies for the secondary routes
  stores/              Zustand stores (app data, Google Calendar, calendar view, overlays)
  hooks/               client-only "today"/"now"
  lib/                 types, date helpers, leave rules, Google Calendar API, seed data
```

The seed in `src/lib/seed.ts` is what the design shows: the week of Nov 8–14,
2026 with Tue Nov 10 selected, and allowance figures of 7 available, 2 pending,
3 upcoming.

## License

[MIT](LICENSE) © 2026 Kargul Studio
