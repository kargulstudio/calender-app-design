Sources for the Open Graph image, `src/app/opengraph-image.png`.

The PNG is committed as a static file so the app can also be built as a static
export (`STATIC_EXPORT=1 npm run build`, e.g. for Azure Static Web Apps), which
doesn't support generated image routes. To change it, edit `opengraph-image.tsx`,
move it to `src/app/` (replacing the PNG), run `npm run build`, copy
`.next/server/app/opengraph-image.body` back to `src/app/opengraph-image.png`, and
move the `.tsx` back here.

- `Geist-Medium.ttf`, `Geist-SemiBold.ttf` — Geist by Vercel, licensed under the SIL Open Font License 1.1.
- `app.png` — screenshot of the Time off page.
- `icon.png` — the app icon.
