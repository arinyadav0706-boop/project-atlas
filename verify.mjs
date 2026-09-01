import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const state = JSON.parse(readFileSync(process.argv[2] ?? "e2e/.auth/aditi_sharma_consint_ai.json", "utf8"));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width === 1920 ? 2 : 1 });
  await ctx.addCookies(state.cookies);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/issues");
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(2500);
  if (vp.width === 1920) await p.screenshot({ path: "/tmp/pw/new-issues-1920.png" });
  if (vp.width === 1280) await p.screenshot({ path: "/tmp/pw/new-issues-1280.png" });

  const m = await p.evaluate(() => {
    const main = document.querySelector("main");
    const mr = main.getBoundingClientRect();
    const inner = main.firstElementChild.getBoundingClientRect();
    const dataRows = [...document.querySelectorAll('[role="rowgroup"] > [role="row"]')];
    const scrollers = [...main.querySelectorAll("*")].filter(
      (e) => e.scrollHeight > e.clientHeight + 20,
    );
    return {
      mainW: Math.round(mr.width),
      contentW: Math.round(inner.width),
      deadGutterEachSide: Math.round((mr.width - inner.width) / 2),
      chromeAboveFirstRow: dataRows[0]
        ? Math.round(dataRows[0].getBoundingClientRect().top)
        : null,
      rowHeights: [...new Set(dataRows.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height)))],
      rowsRendered: dataRows.length,
      documentScrollH: Math.round(document.documentElement.scrollHeight),
      viewportH: window.innerHeight,
      innerScrollers: scrollers.length,
    };
  });
  console.log(String(vp.width).padEnd(5), JSON.stringify(m));
  await ctx.close();
}
await b.close();
