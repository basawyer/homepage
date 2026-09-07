#!/usr/bin/env python3
"""Pull / append / upload SV Sharlie sailing-log.json on Cloudflare R2."""

from __future__ import annotations

import argparse
import json
import os
import sys
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:
    boto3 = None  # type: ignore


DEFAULT_PUBLIC_URL = (
    "https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/sailing-log.json"
)
VALID_STATES = ("anchored", "marina", "hauled", "passage")

EMPTY_WEATHER = {
    "avgWindKt": None,
    "maxGustKt": None,
    "minTempC": None,
    "maxTempC": None,
    "rainMm": None,
    "notable": None,
}
EMPTY_BATTERY = {"socPercent": None, "solarProducing": None}


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def env(name: str, default: str | None = None) -> str:
    val = os.environ.get(name, default)
    if val is None or val == "":
        die(f"Missing required env var: {name}")
    return val


def public_url() -> str:
    return os.environ.get("LOG_PUBLIC_URL", DEFAULT_PUBLIC_URL)


def today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pull_log() -> dict[str, Any]:
    url = public_url()
    req = Request(url, headers={"User-Agent": "sharlie-log/1.0", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except HTTPError as e:
        die(f"Failed to pull log ({e.code}): {url}")
    except URLError as e:
        die(f"Failed to pull log: {e.reason}")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        die("Public log URL did not return valid JSON")
    if not isinstance(data, dict) or "entries" not in data:
        die("Log JSON missing top-level entries[]")
    return data


def r2_client():
    if boto3 is None:
        die("boto3 is required. Install with: python3 -m pip install --user boto3")
    account = env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def upload_log(data: dict[str, Any]) -> None:
    bucket = env("R2_BUCKET")
    key = os.environ.get("R2_KEY", "sailing-log.json")
    body = (json.dumps(data, indent=2) + "\n").encode("utf-8")
    client = r2_client()
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
            CacheControl="no-cache",
        )
    except (BotoCoreError, ClientError) as e:
        die(f"R2 upload failed: {e}")
    print(f"Uploaded {len(data.get('entries', []))} entries → s3://{bucket}/{key}")


def make_entry(args: argparse.Namespace) -> dict[str, Any]:
    if args.state not in VALID_STATES:
        die(f"Invalid state {args.state!r}; use one of {', '.join(VALID_STATES)}")
    weather = deepcopy(EMPTY_WEATHER)
    if args.avg_wind_kt is not None:
        weather["avgWindKt"] = args.avg_wind_kt
    if args.max_gust_kt is not None:
        weather["maxGustKt"] = args.max_gust_kt
    if args.min_temp_c is not None:
        weather["minTempC"] = args.min_temp_c
    if args.max_temp_c is not None:
        weather["maxTempC"] = args.max_temp_c
    if args.rain_mm is not None:
        weather["rainMm"] = args.rain_mm
    if args.notable:
        weather["notable"] = args.notable

    battery = deepcopy(EMPTY_BATTERY)
    if args.soc_percent is not None:
        battery["socPercent"] = args.soc_percent
    if args.solar_producing:
        battery["solarProducing"] = True
    elif args.no_solar:
        battery["solarProducing"] = False

    date = args.date or today_utc()
    return {
        "date": date,
        "updatedAt": now_iso(),
        "state": args.state,
        "position": {"lat": args.lat, "lon": args.lon},
        "place": args.place,
        "logNm": args.log_nm,
        "note": args.note or "",
        "weather": weather,
        "battery": battery,
        "photos": [],
    }


def cmd_pull(_: argparse.Namespace) -> None:
    data = pull_log()
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


def cmd_status(_: argparse.Namespace) -> None:
    print(f"LOG_PUBLIC_URL={public_url()}")
    print(f"R2_BUCKET={os.environ.get('R2_BUCKET', '(unset)')}")
    print(f"R2_KEY={os.environ.get('R2_KEY', 'sailing-log.json')}")
    print(f"R2_ACCOUNT_ID={'set' if os.environ.get('R2_ACCOUNT_ID') else 'unset'}")
    print(f"boto3={'yes' if boto3 else 'NO — pip install boto3'}")
    data = pull_log()
    entries = data.get("entries") or []
    print(f"entries={len(entries)}")
    if entries:
        last = entries[-1]
        print(
            f"latest={last.get('date')} {last.get('place')} "
            f"{last.get('state')} ({last.get('position')})"
        )


def cmd_append(args: argparse.Namespace) -> None:
    data = pull_log()
    entries: list[dict[str, Any]] = list(data.get("entries") or [])
    entry = make_entry(args)
    date = entry["date"]

    if args.replace_same_day:
        kept = [e for e in entries if e.get("date") != date]
        if len(kept) != len(entries):
            print(f"Replacing existing entry for {date}")
        entries = kept

    entries.append(entry)
    entries.sort(key=lambda e: e.get("date") or "")
    data["vessel"] = data.get("vessel") or "SV Sharlie"
    data["entries"] = entries
    upload_log(data)
    print(f"Logged {date} @ {entry['place']} ({entry['state']})")


def cmd_upload(args: argparse.Namespace) -> None:
    path = args.file
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except OSError as e:
        die(f"Cannot read {path}: {e}")
    except json.JSONDecodeError:
        die(f"{path} is not valid JSON")
    if "entries" not in data:
        die(f"{path} missing entries[]")
    upload_log(data)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("pull", help="Download current log JSON to stdout")
    sub.add_parser("status", help="Show config and latest entry")

    up = sub.add_parser("upload", help="Upload a local log JSON file as-is")
    up.add_argument("file", help="Path to sailing-log.json")

    ap = sub.add_parser("append", help="Pull, append (or replace same day), upload")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--place", required=True)
    ap.add_argument("--state", default="anchored", choices=VALID_STATES)
    ap.add_argument("--date", help="YYYY-MM-DD (default: today UTC)")
    ap.add_argument("--note", default="")
    ap.add_argument("--log-nm", type=float, default=None)
    ap.add_argument("--avg-wind-kt", type=float, default=None)
    ap.add_argument("--max-gust-kt", type=float, default=None)
    ap.add_argument("--min-temp-c", type=float, default=None)
    ap.add_argument("--max-temp-c", type=float, default=None)
    ap.add_argument("--rain-mm", type=float, default=None)
    ap.add_argument("--notable", default=None)
    ap.add_argument("--soc-percent", type=int, default=None)
    ap.add_argument("--solar-producing", action="store_true")
    ap.add_argument("--no-solar", action="store_true")
    ap.add_argument(
        "--replace-same-day",
        action="store_true",
        help="Replace any existing entry with the same date instead of appending",
    )
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.cmd == "pull":
        cmd_pull(args)
    elif args.cmd == "status":
        cmd_status(args)
    elif args.cmd == "append":
        cmd_append(args)
    elif args.cmd == "upload":
        cmd_upload(args)
    else:
        parser.error(f"unknown command {args.cmd}")


if __name__ == "__main__":
    main()
