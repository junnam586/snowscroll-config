# snowscroll-config

Remote **Filter Config** for the Snowscroll app, served via GitHub Pages.

- The app fetches `filters/v1.json` on launch and adopts it when its
  `configVersion` is **strictly greater** than what the app currently has.
- To patch a broken selector without an App Store update: edit
  `filters/v1.json`, **bump `configVersion`**, and push. Every install
  self-heals on next launch.

URL: https://junnam586.github.io/snowscroll-config/filters/v1.json
