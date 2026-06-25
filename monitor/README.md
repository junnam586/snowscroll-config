# Filter-health monitor

Proactive early-warning for when Instagram / YouTube / TikTok change their DOM and a
selector in `filters/v1.json` stops matching (= a feed starts leaking). Runs in GitHub
Actions on a schedule; you don't run anything yourself.

## How it works
`check.mjs` opens the live **mobile** web (real Chromium, iPhone UA — the same surface your
app loads), and for each entry in `checks.json` runs `querySelectorAll` on the config's
plain-CSS **anchor** selectors. If every anchor for a surface matches **0** elements, the DOM
probably changed and that filter is likely broken → the run fails.

It only checks **plain-CSS anchors** (e.g. `ytm-reel-shelf-renderer`, `[data-e2e='video-card']`).
The app's `js:` / `text=` / `@scope` / `<<` DSL is interpreted by the app engine, not here —
but plain-CSS anchors are exactly where DOM-change breakage shows up first.

## How you get notified
When an anchor breaks, the Action:
1. **Opens (or comments on) a GitHub issue** titled "Filter health: an anchor selector broke," with the broken surfaces + the run log → you get a GitHub notification/email.
2. **Fails the workflow run** → you also get GitHub's workflow-failure email (enable Actions email notifications in your GitHub settings).
3. **Optionally pings Slack/Discord** if you set an `ALERT_WEBHOOK` secret.

## Coverage & honest limits
- **Reliable, no login:** YouTube Shorts, TikTok feed. These run logged-out from CI and are your strongest signal (YouTube is the free tier, so it matters most).
- **Login-gated (Instagram, and later FB/LinkedIn):** set `IG_USERNAME` / `IG_PASSWORD` repo Secrets to enable the Instagram checks.
  - **Use a BURNER Instagram account, never your personal one.** Automated logins trip Instagram's checkpoints — the exact detection your app is built around.
  - CI logins from datacenter IPs **frequently get checkpointed**; when that happens the IG checks just **skip** (they don't false-alarm). So treat IG-logged-in monitoring as best-effort, and lean on the in-app "report" button + a weekly manual check for those surfaces.
- A "skipped" result (consent wall, load error, login checkpoint) is **not** a breakage — only "0 matches on a page that loaded fine" fails the run.

## Setup (one-time)
1. Push this repo to GitHub (it already has a remote).
2. **Settings → Actions → General →** allow Actions to run.
3. (Optional) **Settings → Secrets and variables → Actions →** add `IG_USERNAME`, `IG_PASSWORD` (burner), and/or `ALERT_WEBHOOK`.
4. **Actions tab → filter-health → Run workflow** to try it once. After that it runs every 6h.

## When it fires
Validate on a device, patch the selector in `filters/v1.json`, bump `configVersion`
(`scripts/bump-config-version.py`), and push. Users adopt the fix on their next launch — no
App Store update. Then close the issue.

## Tuning
- Add/adjust surfaces in `checks.json` (each entry = a URL + the anchor selectors to expect).
- Change the cadence in `.github/workflows/filter-health.yml` (`cron`).
