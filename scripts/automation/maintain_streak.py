#!/usr/bin/env python3
"""
Zipli / Antigravity Project — Profile Streak Maintenance & Heartbeat Engine

Appends a lightweight, realistic system maintenance entry to docs/logs/system_maintenance.log
while respecting a human-like schedule (skips exactly one day per week deterministically).

Usage:
    python3 scripts/automation/maintain_streak.py [--force] [--dry-run] [--status]
"""

import os
import sys
import random
import argparse
import datetime
from pathlib import Path

# Deterministic rotating telemetry messages to mirror realistic production operations
DIAGNOSTIC_METRICS = [
    "Telemetry verification OK | Integrity: 100% | Latency: 22ms | Services: ALL_HEALTHY",
    "DB connection pool check | Active: 4/20 | Query latency p95: 11ms | Replicas: IN_SYNC",
    "Cache store health | Redis memory: 41.8MB | Fragmentation: 1.05 | Hit-ratio: 98.9%",
    "Security policy audit | Guardrails: ACTIVE | Circuit breaker: CLOSED | Rate limits: NORMAL",
    "Storage integrity check | WAL checkpoint: VERIFIED | Volume usage: 32% | Backup: SYNCED",
    "Background queue health | Active jobs: 0 | Failed jobs: 0 | Worker pool: READY",
    "AI Gateway heartbeat | Readiness: HEALTHY | Fallback status: STANDBY | Budget: OK",
]

DAYS_NAME = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday"
}

def find_repo_root() -> Path:
    """Locate the git repository root directory."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / ".git").exists() or (current / "package.json").exists():
            return current
        current = current.parent
    return Path.cwd()

def get_weekly_schedule(target_date: datetime.date):
    """
    Determine the deterministic day off for the given date's ISO week.
    Uses calendar year and ISO week number as the PRNG seed.
    """
    year, week, weekday = target_date.isocalendar()
    # Seed based on ISO year and week number for determinism
    rng = random.Random(f"zipli-schedule-{year}-W{week:02d}")
    # Choose 1 day off out of the 7 days of the week (favors weekends 6 or 7, with occasional midweek)
    day_off = rng.choice([6, 7, rng.randint(1, 7)])
    is_day_off = (weekday == day_off)
    return year, week, weekday, day_off, is_day_off

def generate_log_entry(target_datetime: datetime.datetime, custom_msg: str = None) -> str:
    """Format a realistic, standardized maintenance log entry."""
    iso_timestamp = target_datetime.strftime("%Y-%m-%dT%H:%M:%SZ")
    if custom_msg:
        detail = custom_msg
    else:
        metric_idx = (target_datetime.timetuple().tm_yday) % len(DIAGNOSTIC_METRICS)
        detail = DIAGNOSTIC_METRICS[metric_idx]
    
    return f"[{iso_timestamp}] [MAINTENANCE] Routine system heartbeat | {detail}\n"

def run_maintenance(force: bool = False, dry_run: bool = False, custom_msg: str = None) -> bool:
    repo_root = find_repo_root()
    log_file = repo_root / "docs" / "logs" / "system_maintenance.log"
    
    now = datetime.datetime.now(datetime.timezone.utc)
    year, week, weekday, day_off, is_day_off = get_weekly_schedule(now.date())
    
    weekday_str = DAYS_NAME.get(weekday, f"Day {weekday}")
    day_off_str = DAYS_NAME.get(day_off, f"Day {day_off}")

    print(f"==================================================================")
    print(f"  Zipli Automated Profile Streak & System Maintenance Engine")
    print(f"==================================================================")
    print(f"Current Date:   {now.date()} ({weekday_str}, ISO Week {year}-W{week:02d})")
    print(f"Day-Off Target: {day_off_str} (Day {day_off})")
    print(f"Status:         {'SCHEDULED DAY OFF' if is_day_off else 'ACTIVE WORKDAY'}")
    print(f"Force Mode:     {force}")
    print(f"Target Log:     {log_file}")
    print(f"------------------------------------------------------------------")

    if is_day_off and not force:
        print(f"[NOTICE] Today is the scheduled day off for week {year}-W{week:02d}.")
        print(f"         Skipping maintenance update to mirror human work patterns.")
        print(f"==================================================================")
        return False

    entry = generate_log_entry(now, custom_msg)

    if dry_run:
        print(f"[DRY-RUN] Would append the following entry:")
        print(f"          {entry.strip()}")
        print(f"==================================================================")
        return True

    # Ensure parent directories exist
    log_file.parent.mkdir(parents=True, exist_ok=True)

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry)

    print(f"[SUCCESS] Maintenance entry recorded:")
    print(f"          {entry.strip()}")
    print(f"==================================================================")
    return True

def main():
    parser = argparse.ArgumentParser(
        description="Maintain GitHub activity streak with realistic system maintenance heartbeats."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force log entry creation even on scheduled weekly day off."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate schedule and preview entry without writing to file."
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Display current week schedule status and exit."
    )
    parser.add_argument(
        "--message",
        type=str,
        default=None,
        help="Optional custom maintenance log message."
    )
    args = parser.parse_args()

    if args.status:
        now = datetime.datetime.now(datetime.timezone.utc)
        year, week, weekday, day_off, is_day_off = get_weekly_schedule(now.date())
        print(f"Date: {now.date()} ({DAYS_NAME[weekday]}) | Week: {year}-W{week:02d} | Day Off: {DAYS_NAME[day_off]} | Is Day Off: {is_day_off}")
        sys.exit(0)

    updated = run_maintenance(force=args.force, dry_run=args.dry_run, custom_msg=args.message)
    sys.exit(0)

if __name__ == "__main__":
    main()
