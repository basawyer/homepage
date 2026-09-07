# homepage

Blake Sawyer's personal site. Restored from a Wayback Machine snapshot, then redesigned.

## Run it locally

```bash
python3 -m http.server 8088
```

Then open http://127.0.0.1:8088/

## Structure

- `index.html` — single scrolling page: Abstract, Research, Distractions, Contact
- `sailing/` — separate page for SV Sharlie (Blake's sailboat), kept up to date automatically
- `assets/css/style.css` — all styles, no framework
- `assets/js/main.js` — small vanilla JS (scroll-reveal, nav highlighting)
- `assets/img/` — project photos
- `assets/files/` — CV PDF, two presentation decks, one project video

## Deploy

Hosted on Cloudflare Pages at blakesawyer.net, built from the `main` branch of this repo.
There is no build step — build command is empty, output directory is `/`. Pushing `main`
deploys the site.

The sailing log itself is **not** served from Pages anymore. Live data lives in Cloudflare R2:

- Log (map track): `https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/sailing-log.json`
- Status (left panel): `https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/boat-status.json`

`assets/js/sailing.js` fetches both. Local seeds/backups live in `sailing/data/`.

OpenClaw skill to append/upload log entries: `openclaw-skills/sharlie-log/` — install with
`openclaw skills install ./openclaw-skills/sharlie-log --as sharlie-log` after setting the
R2 env vars documented in that skill's `SKILL.md`.

If the map or status panel fails to load, the R2 bucket likely needs a CORS rule allowing
GET from `https://blakesawyer.net` and `http://127.0.0.1:8088`.

## Map tiles

The sailing map uses CARTO's `dark_all` basemap, which needs a key or CARTO writes
"API KEY REQUIRED" across the tiles. Keys are free from https://carto.com/basemaps/apikey/
(no account, 5M tiles/month) — drop yours into `CARTO_KEY` at the top of
`assets/js/sailing.js`. CARTO and OpenStreetMap attribution must stay visible.

Like any browser map key this one ships in the page, so it is public by design. It is not
currently bound to a referer — the same key serves clean tiles from any domain — so if the
monthly quota ever gets burned by someone else, ask CARTO for a domain-restricted key.

## Design

Dark background, single accent color, one scrolling page. Nav bar is sticky; most links
anchor-scroll within the page, "Sailing" and "Download CV" are the two that go elsewhere
(a separate page, and a file, respectively).

## Content provenance

The site content — text, project write-ups, images — is restored from Wayback Machine
captures of the original blakesawyer.net (primary snapshot: 20250212074749), with several
project photos re-fetched from their original 2012–2014 upload paths after the final site's
HTML turned out to reference a 2016 path that Wayback never actually crawled.

## Next up

The `/sailing` page is a placeholder — structure and nav are in place, live data from the
boat's onboard SignalK feed (position, conditions, log) is coming next.
