// Filter-health monitor. Loads the same mobile web your app loads, checks whether the
// config's plain-CSS anchor selectors still MATCH something, and fails (non-zero exit) when
// an anchor that should be present matches 0 elements - i.e. the DOM changed and a feed is
// probably leaking. Pair it with the GitHub Action, which turns a failure into an issue + alert.
//
// It can ONLY meaningfully check the plain-CSS anchors (querySelectorAll). The app's js:/text=/
// @scope/<< DSL is interpreted by the app engine, not here. That's fine: plain-CSS anchors are
// where DOM-change breakage shows up first.
//
// Mobile UA + viewport, because your app loads the MOBILE web (ytm-*, etc. are mobile-only).
//
// Optional login (Instagram/Facebook/LinkedIn surfaces) via env creds - see README. Use a
// BURNER account; CI logins get checkpointed. Logged-out YouTube/TikTok is the reliable signal.

import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const checks = JSON.parse(readFileSync(new URL("./checks.json", import.meta.url)));
const IG_USER = process.env.IG_USERNAME, IG_PASS = process.env.IG_PASSWORD;
const IG_STATE = process.env.IG_STORAGE_STATE;   // base64 Playwright storageState (PREFERRED for IG)

const results = { broken: [], ok: [], skipped: [] };

async function dismissConsent(page) {
  // Best-effort: tap through cookie/consent/bot walls that datacenter IPs often get.
  for (const t of ["Accept all", "Accept", "I agree", "Allow all", "Not now", "Reject all"]) {
    try {
      const b = page.getByRole("button", { name: t }).first();
      if (await b.isVisible({ timeout: 800 })) { await b.click({ timeout: 1500 }); await page.waitForTimeout(500); }
    } catch {}
  }
}

async function igLogin(context) {
  if (!IG_USER || !IG_PASS) return false;
  const page = await context.newPage();
  try {
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await dismissConsent(page);
    await page.fill("input[name='username']", IG_USER, { timeout: 15000 });
    await page.fill("input[name='password']", IG_PASS);
    await page.click("button[type='submit']");
    await page.waitForTimeout(6000);
    // If a checkpoint / 2FA / "suspicious login" page shows, we can't proceed - treat as no-auth.
    const url = page.url();
    const ok = !/challenge|two_factor|checkpoint|login/.test(url);
    await page.close();
    return ok;
  } catch { await page.close().catch(() => {}); return false; }
}

// Verify a REUSED session (from IG_STORAGE_STATE) is still logged in. No login flow happens,
// so there's nothing for IG to checkpoint - it just loads the feed with existing cookies.
async function igVerifySession(context) {
  const page = await context.newPage();
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    const onLogin = /accounts\/login/.test(page.url());
    const markers = await page.locator("svg[aria-label='Home'], [aria-label='Home'], a[href*='/direct/']").count();
    await page.close();
    return !onLogin && markers > 0;   // logged in iff not bounced to login AND a feed chrome marker exists
  } catch { await page.close().catch(() => {}); return false; }
}

async function run() {
  const browser = await chromium.launch();
  const ctxOpts = { ...devices["iPhone 13"], locale: "en-US" };
  if (IG_STATE) {
    try { ctxOpts.storageState = JSON.parse(Buffer.from(IG_STATE, "base64").toString("utf8")); }
    catch { console.log("IG_STORAGE_STATE set but not valid base64 JSON - ignoring it."); }
  }
  const context = await browser.newContext(ctxOpts);

  // Media-blocking: drop images/video/fonts - we only need the DOM structure (does a selector
  // match?), not the pixels. Cuts bandwidth ~80% and speeds every run, which is what keeps
  // residential/home-IP routing cheap if you ever need it. CSS/JS still load, so the DOM is intact.
  await context.route("**/*", (route) =>
    ["image", "media", "font"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue());

  let igAuthed = false;
  if (checks.some((c) => c.auth === "instagram")) {
    // Prefer reusing a saved session (no checkpoint). Fresh login is the fallback, but IG
    // usually blocks it from CI IPs - which is the whole reason for the storageState path.
    igAuthed = ctxOpts.storageState ? await igVerifySession(context) : await igLogin(context);
  }

  for (const c of checks) {
    if (c.auth === "instagram" && !igAuthed) {
      results.skipped.push({ ...c, why: IG_USER ? "ig login checkpointed/failed" : "no IG creds" });
      continue;
    }
    const page = await context.newPage();
    try {
      const resp = await page.goto(c.url, { waitUntil: "networkidle", timeout: 45000 });
      await dismissConsent(page);
      await page.waitForTimeout(c.settleMs ?? 3500);

      if (!resp || resp.status() >= 400) {
        results.skipped.push({ ...c, why: `page load ${resp ? resp.status() : "no-response"}` });
        await page.close(); continue;
      }
      // Count matches for each anchor; the feature is "present" if ANY anchor matches.
      const counts = await page.evaluate(
        (sels) => sels.map((s) => { try { return document.querySelectorAll(s).length; } catch { return -1; } }),
        c.selectors
      );
      const total = counts.filter((n) => n > 0).reduce((a) => a + 1, 0);
      const detail = c.selectors.map((s, i) => `${counts[i]}× ${s}`);
      if (total === 0) results.broken.push({ ...c, detail });
      else results.ok.push({ ...c, detail });
    } catch (e) {
      results.skipped.push({ ...c, why: `error: ${String(e).slice(0, 120)}` });
    } finally {
      await page.close();
    }
  }
  await browser.close();
}

await run();

// ---- Report -------------------------------------------------------------------------------
const line = (c) => `  [${c.platform}] ${c.label}`;
console.log(`\n=== snowscroll filter-health ===`);
console.log(`OK: ${results.ok.length}   BROKEN: ${results.broken.length}   skipped: ${results.skipped.length}\n`);
if (results.ok.length) { console.log("✅ matching:"); results.ok.forEach((c) => console.log(line(c) + "  (" + c.detail.join(", ") + ")")); }
if (results.skipped.length) { console.log("\n⚠️  skipped (couldn't check - NOT necessarily broken):"); results.skipped.forEach((c) => console.log(line(c) + "  - " + c.why)); }
if (results.broken.length) {
  console.log("\n🔴 LIKELY BROKEN (anchor matched 0 - DOM probably changed, feed may be leaking):");
  results.broken.forEach((c) => console.log(line(c) + "  [" + c.detail.join(", ") + "]"));
}

// Emit a compact summary for the GitHub Action to drop into an issue/alert.
const summary = results.broken.length
  ? "BROKEN: " + results.broken.map((c) => `${c.platform}/${c.label}`).join(", ")
  : "All anchors matching.";
console.log(`\n::summary::${summary}`);

process.exit(results.broken.length ? 1 : 0);
