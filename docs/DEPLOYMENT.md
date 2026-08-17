# Deployment

The app is hosted on GitHub Pages, served straight from the repository root of `corinneby-hub/fitflow` on the `main` branch.

**Live URL:** https://corinneby-hub.github.io/fitflow/

---

## Publishing a change

The project folder is a Git repository connected to GitHub, so publishing is a normal commit and push:

```bash
git add -A
git commit -m "Describe the change"
git push origin main
```

GitHub Pages rebuilds automatically. The new files are usually live within 30–90 seconds. To confirm what's actually being served:

```bash
curl -s "https://corinneby-hub.github.io/fitflow/js/app.js?cb=$(date +%s)" | grep -o 'APP_VERSION = "[^"]*"'
```

The cache-busting query string matters — without it you may be reading a cached copy rather than what the server now has.

There is no build step. What's in the repository is exactly what runs.

---

## Version numbers — bump both

Every release must update **two** values together:

| File | Constant | Purpose |
|---|---|---|
| `js/app.js` | `APP_VERSION` | Shown in Settings, so the phone can be identified |
| `sw.js` | `CACHE` | Names the cache; a new name discards the old one |

If they drift apart, Settings will claim a version the device isn't really running. Keep them equal (`v17` ↔ `fitflow-v17`).

---

## How updates reach the phone

The service worker is network-first, so an online device gets new files on the next load. On top of that, `app.js` calls `registration.update()` at every launch and hourly while open, and reloads once when a new worker takes control. In practice: publish, then open the app, and it updates itself.

If it doesn't:

1. **Fully close the app** — swipe it away from recent apps, don't just press home — and reopen it. Twice if needed.
2. **Settings → Force refresh now.** Unregisters the worker, clears the file cache, reloads. It does not touch history, settings, or the API key.
3. **Open the URL in Chrome itself** (not the installed icon) and pull to refresh. Chrome and the installed app share the same registration.

Check Settings afterwards: if the version matches what was published, the device is current.

---

## Things that have gone wrong before

**The site returned 404 everywhere.** The repository had been switched to private. GitHub Pages only serves from public repositories on a free account, and making it public again does **not** re-enable Pages automatically — go to **Settings → Pages** and re-select `main` / `/ (root)`.

The app kept working on the phone while this was happening, because the service worker was serving its cache offline — which made it look like an update problem rather than an outage.

**Files uploaded to the wrong place.** Dragging `app.js`, `api.js`, and `storage.js` individually into GitHub's web uploader put them in the repository root, while `index.html` loads them from `js/`. The strays were harmless but confusing; they've since been deleted. Drag the **folder**, not the files, if you ever upload through the website.

**Updates arriving late.** The original service worker was cache-first, which meant the phone could keep serving an old build. It's network-first as of v11.

---

## Repository layout

Published (served by GitHub Pages):

```
index.html  css/  js/  icons/  sw.js  manifest.webmanifest
```

Not published, ignored by Git (`.gitignore`):

```
.claude/          local tooling config
deploy/           obsolete copy from the manual-upload era
dev-server.ps1    local development server
```

Documentation lives in `docs/` and is committed, but isn't part of the running app.

---

## Privacy

`index.html` carries `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`, which keeps the page out of search results. A `robots.txt` wouldn't work for a project page — crawlers only read it from the domain root, which belongs to the account-level site.

The repository is public, which is required for free GitHub Pages. It contains no credentials: the API key lives only in the browser's local storage on the device, and workout history never leaves the phone except through a manual export.
