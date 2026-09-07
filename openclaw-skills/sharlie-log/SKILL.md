---
name: sharlie-log
description: Append or update SV Sharlie sailing-log entries on Cloudflare R2 for blakesawyer.net/sailing. Use when logging position, place, state, notes, weather, or battery for Sharlie, or when asked to update the sailing log / map without git.
metadata:
  openclaw:
    requires:
      bins: ["python3"]
      env: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    primaryEnv: R2_SECRET_ACCESS_KEY
---

# Sharlie sailing log (R2)

Update the live log that powers https://blakesawyer.net/sailing/ — stored in Cloudflare R2, **not** git.

Public read URL (already wired in the site):

`https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/sailing-log.json`

## Setup (human, once)

1. Cloudflare → **R2** → **Manage R2 API Tokens** → create a token with **Object Read & Write** on the log bucket.
2. Set env vars on the OpenClaw host (or `skills.entries.sharlie-log` / secret store):

```bash
export R2_ACCOUNT_ID="<cloudflare-account-id>"
export R2_ACCESS_KEY_ID="<r2-access-key-id>"
export R2_SECRET_ACCESS_KEY="<r2-secret-access-key>"
export R2_BUCKET="<bucket-name>"          # e.g. sharlie-log
export R2_KEY="sailing-log.json"          # object key in the bucket
export LOG_PUBLIC_URL="https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/sailing-log.json"
```

3. Install deps once: `python3 -m pip install --user boto3`
4. Install this skill:

```bash
openclaw skills install /path/to/homepage/openclaw-skills/sharlie-log --as sharlie-log
# or from a checkout of the homepage repo:
openclaw skills install ./openclaw-skills/sharlie-log --as sharlie-log
```

5. Confirm: `python3 {baseDir}/scripts/update_log.py status`

## When to run

- User asks to log a stop, update position, or refresh the sailing map.
- Periodic automation (cron / heartbeat) that posts the boat’s current lat/lon/place.
- Never commit `sailing/data/log.json` for live updates — always use this skill → R2.

## How to update

Prefer the helper script (it pulls the current JSON, mutates, uploads):

```bash
# Append a new entry (or replace today's entry if --replace-same-day)
python3 {baseDir}/scripts/update_log.py append \
  --lat 10.6834 --lon -61.6373 \
  --place "Chaguaramas, Trinidad & Tobago" \
  --state anchored \
  --note "On the hard — rudder stuffing box." \
  --replace-same-day

# Optional weather / battery / log nm
python3 {baseDir}/scripts/update_log.py append \
  --lat 12.0 --lon -61.75 --place "Grenada" --state anchored \
  --avg-wind-kt 12.5 --max-gust-kt 18 --min-temp-c 26 --max-temp-c 31 \
  --rain-mm 0 --log-nm 14200 --soc-percent 85 --solar-producing \
  --replace-same-day

# Download current log to stdout
python3 {baseDir}/scripts/update_log.py pull

# Show configured endpoints / last entry
python3 {baseDir}/scripts/update_log.py status
```

Valid `--state` values: `anchored`, `marina`, `hauled`, `passage`.

Entry schema must match existing log objects (`date`, `updatedAt`, `state`, `position`, `place`, `logNm`, `note`, `weather`, `battery`, `photos`).

## Rules

- Always `pull` (script does this) before write so you do not clobber concurrent updates.
- Keep entries chronological by `date` (script sorts after append).
- Use `--replace-same-day` for frequent GPS pings so you do not spam one day with dozens of dots.
- Do not print secret keys. Do not put credentials in the skill files or the public log JSON.
- After a successful upload, tell the user the site will refresh on next load (hard-refresh if CDN cached).
