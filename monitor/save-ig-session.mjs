// Run this LOCALLY, ONCE, from your normal home/residential connection to capture a logged-in
// Instagram session for the BURNER account. IG won't checkpoint a manual login from your real
// home IP. The monitor then reuses this session in CI instead of logging in fresh (which IG
// blocks from datacenter IPs).
//
//   cd monitor
//   npm install
//   npx playwright install chromium
//   node save-ig-session.mjs
//
// A browser opens -> log into the burner account, clear any "was this you?"/2FA, get to your
// feed -> come back to the terminal and press Enter. It prints a base64 blob. Paste that into
// the repo secret IG_STORAGE_STATE (Settings -> Secrets and variables -> Actions).
//
// Refresh it whenever the IG checks start skipping (sessions expire / get invalidated).

import { chromium, devices } from "playwright";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ ...devices["iPhone 13"], locale: "en-US" });
const page = await context.newPage();
await page.goto("https://www.instagram.com/accounts/login/");

console.log("\n>>> Log into the BURNER Instagram in the browser window.");
console.log(">>> Clear any checkpoint / 2FA, land on your logged-in feed,");
console.log(">>> then return here and press Enter.\n");
process.stdin.resume();
await new Promise((r) => process.stdin.once("data", r));

const state = await context.storageState();
const b64 = Buffer.from(JSON.stringify(state)).toString("base64");
console.log("\n==================== IG_STORAGE_STATE ====================");
console.log("Paste everything between the lines into the repo secret IG_STORAGE_STATE:\n");
console.log(b64);
console.log("\n=========================================================\n");

await browser.close();
process.exit(0);
