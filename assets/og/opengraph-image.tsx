import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Kargul — calendar for your team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered once at build time from vendored assets (no network at build).
// Paths are literal so only assets/og is traced into the output.
const [geistMedium, geistSemiBold, screenshot, icon] = await Promise.all([
  readFile(join(process.cwd(), "assets/og/Geist-Medium.ttf")),
  readFile(join(process.cwd(), "assets/og/Geist-SemiBold.ttf")),
  readFile(join(process.cwd(), "assets/og/app.png")),
  readFile(join(process.cwd(), "assets/og/icon.png")),
]);

const dataUri = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "#f8f8f8",
          fontFamily: "Geist",
          color: "#1d1d1d",
          padding: "60px 72px 0",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={dataUri(icon)} width={44} height={44} alt="" style={{ borderRadius: 11 }} />
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8 }}>Kargul</div>
          <div
            style={{
              marginLeft: 8,
              fontSize: 17,
              color: "#8965de",
              background: "rgba(137,101,222,0.12)",
              borderRadius: 999,
              padding: "6px 14px",
            }}
          >
            Design prototype
          </div>
        </div>

        <div style={{ marginTop: 34, fontSize: 56, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>
          Calendar for your team
        </div>
        <div style={{ marginTop: 16, fontSize: 26, color: "#757575", letterSpacing: -0.5 }}>
          Plan leave, track requests and balances — in one calm workspace.
        </div>

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 284,
            width: 1128,
            height: 509,
            display: "flex",
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #e5e7e1",
            boxShadow: "0 24px 64px -16px rgba(20,20,18,0.22), 0 4px 14px rgba(20,20,18,0.06)",
            background: "#ffffff",
          }}
        >
          <img src={dataUri(screenshot)} width={1128} height={509} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: geistMedium, weight: 500, style: "normal" },
        { name: "Geist", data: geistSemiBold, weight: 600, style: "normal" },
      ],
    },
  );
}
