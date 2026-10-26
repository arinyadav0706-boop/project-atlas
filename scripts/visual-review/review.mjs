// One review round of the visual loop (README.md here).
//
//   node scripts/visual-review/review.mjs <round>
//
// 1. Signs in and screenshots /home at the reference's 1536×1024 (plus a tall
//    capture for everything below the fold).
// 2. Sends the reference, both screenshots, the rules and the previous round's
//    review to an OpenAI vision model, which acts as the design reviewer.
// 3. Writes rounds/round-<n>.json (and the PNGs) and prints the instructions.
//
// The API key is never read here: the environment's network proxy adds the
// Authorization header to requests for api.openai.com. OPENAI_API_KEY, if set,
// is used instead — for running this outside the cloud environment.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const ROUNDS = path.join(HERE, "rounds");
const STATE = path.join(HERE, ".state", "session.json");
const REFERENCE = path.join(ROOT, "docs/05_UI/reference/home-reference.webp");
const BASE_URL = process.env.REVIEW_BASE_URL ?? "http://localhost:3000";
const LOGIN = {
  email: process.env.REVIEW_EMAIL ?? "arin.yadav2021a@vitalumn.ac.in",
  password: process.env.REVIEW_PASSWORD ?? "VerusDemo!2026",
};
// Newest first. The first one the account offers that accepts images wins.
const MODELS = (process.env.REVIEW_MODELS ?? "gpt-6.1-sol,gpt-6-sol,gpt-5.5-pro,gpt-5.5,gpt-5.4,gpt-5")
  .split(",")
  .map((m) => m.trim());

const round = Number(process.argv[2] ?? "1");
if (!Number.isInteger(round) || round < 1) throw new Error("usage: review.mjs <round number>");
fs.mkdirSync(ROUNDS, { recursive: true });
fs.mkdirSync(path.dirname(STATE), { recursive: true });

// ── 1. Capture ──────────────────────────────────────────────────────────────
async function capture() {
  const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
  const browser = await chromium.launch({ executablePath });
  const shots = {};
  for (const [name, height] of [["viewport", 1024], ["full", 2000]]) {
    const ctx = await browser.newContext({
      viewport: { width: 1536, height },
      ...(fs.existsSync(STATE) ? { storageState: STATE } : {}),
    });
    const page = await ctx.newPage();
    if (!fs.existsSync(STATE)) {
      await page.goto(`${BASE_URL}/sign-in`, { timeout: 120_000 });
      await page.locator("#email").fill(LOGIN.email);
      await page.locator("#password").fill(LOGIN.password);
      await page.getByRole("button", { name: /sign in with email/i }).click();
      await page.waitForURL(/\/home/, { timeout: 120_000 });
      await ctx.storageState({ path: STATE });
    }
    await page.goto(`${BASE_URL}/home`, { waitUntil: "networkidle", timeout: 180_000 });
    if (!page.url().includes("/home")) throw new Error(`Not signed in — landed on ${page.url()}`);
    await page.waitForTimeout(1500);
    const file = path.join(ROUNDS, `round-${round}-${name}.png`);
    await page.screenshot({ path: file });
    shots[name] = file;
    await ctx.close();
  }
  await browser.close();
  return shots;
}

// ── 2. Review ───────────────────────────────────────────────────────────────
const RULES = `You are the design reviewer for EAGLES, an enterprise work-management app.
A coding agent implements your instructions; you never write code yourself.

GOAL: make the rendered Home page (screenshots 2 and 3) match the REFERENCE
(image 1) as closely as possible in layout, proportion, hierarchy, density,
colour, typography and polish — while keeping every real feature and real data.

HARD RULES — never instruct anything that breaks them:
1. Presentation only. Allowed: React components, CSS/Tailwind classes, design
   tokens, layout, spacing, sizes, colours, icons, copy labels, and how many
   items a panel SHOWS (trim with a "View all" link; the full list stays one
   click away). Forbidden: database, schema, migrations, API routes, services,
   repositories, DTO/validation types, the API spec, auth, permissions.
2. Real data only. Never ask for sample values, invented events, people,
   meetings, goals, trend arrows or alerts that the data does not provide.
   Elements in the reference with no real data behind them (trend deltas,
   "Today's goal" ring, meetings, Quick Actions, Focus mode, system alerts)
   are OUT OF SCOPE — do not ask for them or placeholders of them.
3. Accessibility: text contrast ≥ 4.5:1 for body text, nothing below 11px,
   no colour-only meaning. Prefer the reference unless it fails these.
4. Balance: panels side by side should end at about the same height; trim
   list lengths rather than leaving one panel far taller than its neighbour.
5. Do not ask for new pages, new features or new data. Do not redesign the
   sidebar navigation's set of destinations.

HOW TO REVIEW: compare region by region (sidebar, top bar, greeting, KPI row,
My work, Needs your attention, Projects, Recent activity, Workload, right rail).
Give at most 8 instructions, most visible first. Each must be concrete enough
to implement without guessing: name the element and the exact change (sizes in
px, colours as hex or "token X", counts, alignment). Note what the previous
round fixed. Approve ("verdict":"approve") only when the remaining differences
are minor or out of scope under the rules above.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "fidelity_score", "summary", "resolved_since_last_round", "instructions"],
  properties: {
    verdict: { type: "string", enum: ["approve", "revise"] },
    fidelity_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    resolved_since_last_round: { type: "array", items: { type: "string" } },
    instructions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "priority", "region", "observation", "instruction", "acceptance"],
        properties: {
          id: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          region: { type: "string" },
          observation: { type: "string" },
          instruction: { type: "string" },
          acceptance: { type: "string" },
        },
      },
    },
  },
};

function dataUrl(file) {
  const ext = path.extname(file).slice(1).replace("jpg", "jpeg");
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

async function callModel(model, shots, previous) {
  const content = [
    { type: "input_text", text: "Image 1: the approved REFERENCE (1536×1024)." },
    { type: "input_image", image_url: dataUrl(REFERENCE), detail: "high" },
    { type: "input_text", text: `Image 2: the CURRENT Home at 1536×1024, round ${round}.` },
    { type: "input_image", image_url: dataUrl(shots.viewport), detail: "high" },
    { type: "input_text", text: "Image 3: the CURRENT Home captured 2000px tall (below-the-fold content)." },
    { type: "input_image", image_url: dataUrl(shots.full), detail: "high" },
    {
      type: "input_text",
      text: previous
        ? `Previous round's review, and the coding agent's notes on what it changed or declined:\n${previous}`
        : "This is the first round.",
    },
  ];
  const body = {
    model,
    instructions: RULES,
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: "home_review", schema: SCHEMA, strict: true } },
    reasoning: { effort: "high" },
  };
  const headers = { "Content-Type": "application/json" };
  if (process.env.OPENAI_API_KEY) headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, status: res.status, error: json.error?.message ?? JSON.stringify(json) };
  const text = (json.output ?? [])
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("");
  return { ok: true, review: JSON.parse(text), usage: json.usage };
}

const shots = await capture();
const prevFile = path.join(ROUNDS, `round-${round - 1}.json`);
const notesFile = path.join(ROUNDS, `round-${round - 1}-notes.md`);
const previous = fs.existsSync(prevFile)
  ? JSON.stringify(JSON.parse(fs.readFileSync(prevFile, "utf8")).review, null, 1) +
    (fs.existsSync(notesFile) ? `\n\nCoding agent's notes:\n${fs.readFileSync(notesFile, "utf8")}` : "")
  : null;

let result;
for (const model of MODELS) {
  result = await callModel(model, shots, previous);
  if (result.ok) {
    result.model = model;
    break;
  }
  console.error(`model ${model} unavailable (${result.status}): ${result.error}`);
  // Billing and auth failures are the account's, not the model's — trying the
  // next model would only repeat them.
  if (result.status === 401 || /credits|quota|billing/i.test(result.error)) break;
}
if (!result?.ok) throw new Error("No reviewer model accepted the request.");

fs.writeFileSync(path.join(ROUNDS, `round-${round}.json`), JSON.stringify({ round, ...result, shots }, null, 2));
const r = result.review;
console.log(`ROUND ${round} — ${result.model} — verdict: ${r.verdict}, fidelity ${r.fidelity_score}/100`);
console.log(r.summary);
for (const i of r.instructions) {
  console.log(`\n[${i.id}] ${i.priority.toUpperCase()} · ${i.region}\n  saw: ${i.observation}\n  do:  ${i.instruction}\n  done when: ${i.acceptance}`);
}
