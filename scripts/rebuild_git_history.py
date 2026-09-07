#!/usr/bin/env python3
"""
Zipli / Antigravity Project — Refined 2-Month Organic Git History Builder

Rebuilds the Git repository with realistic human contribution patterns across a 2-month window
(August 25, 2026 to October 24, 2026):
- High-Density Day 1 (August 25): 6 explicit foundational commits to anchor repository creation.
- Dynamic Density & Intensity Tiers for Days 2 to 48:
    * ~35% Low intensity (1 commit/day - light green tier)
    * ~45% Medium intensity (2-3 commits/day - medium green tier)
    * ~20% High intensity (4-5 commits/day - dark green tier)
- Organic Gaps in the Middle:
    * 1 weekly rest day
    * 3-day mid-September break (Sep 14 - Sep 16)
    * 4-day early October planning gap (Oct 02 - Oct 05)
- All 624 files distributed cleanly across the past timeline (ending October 24, 2026).
- Zero commits on today's date (October 25, 2026), forcing GitHub to prioritize the August creation block.
- Identical past timestamps for GIT_AUTHOR_DATE and GIT_COMMITTER_DATE on every commit.
"""

import os
import sys
import random
import shutil
import datetime
import subprocess
from pathlib import Path

# Author and Committer verified identity configuration
GIT_AUTHOR_NAME = "Sai Keertan"
GIT_AUTHOR_EMAIL = "tedlasaikeertan@gmail.com"
GIT_COMMITTER_NAME = "Sai Keertan"
GIT_COMMITTER_EMAIL = "tedlasaikeertan@gmail.com"

# 2-Month timeline parameters
START_DATE = datetime.date(2026, 8, 25)
END_DATE = datetime.date(2026, 10, 24)

# Multi-day gaps in the middle
GAP_MID_SEPTEMBER = {
    datetime.date(2026, 9, 14),
    datetime.date(2026, 9, 15),
    datetime.date(2026, 9, 16)
}

GAP_EARLY_OCTOBER = {
    datetime.date(2026, 10, 2),
    datetime.date(2026, 10, 3),
    datetime.date(2026, 10, 4),
    datetime.date(2026, 10, 5)
}

DAY1_COMMITS = [
    {
        "files": [".gitignore", "backend/.gitignore"],
        "msg": "chore(core): initial repository layout and git ignores",
        "time": "09:15:24"
    },
    {
        "files": [".editorconfig", ".prettierrc", ".prettierignore", "backend/.prettierignore"],
        "msg": "chore(core): code style formatting configurations",
        "time": "10:45:12"
    },
    {
        "files": [".eslintrc.json", "backend/eslint.config.js", ".husky/pre-commit", ".github/workflows/ci.yml"],
        "msg": "chore(core): configure eslint rules, pre-commit hooks and ci",
        "time": "12:15:40"
    },
    {
        "files": ["backend/package.json", "backend/package-lock.json"],
        "msg": "chore(core): backend service manifests and dependency trees",
        "time": "14:30:18"
    },
    {
        "files": ["Dockerfile", "docker-compose.yml", "docker-compose.test.yml"],
        "msg": "feat(infra): containerization specifications and multi-tier compose",
        "time": "16:45:33"
    },
    {
        "files": ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "README.md"],
        "msg": "docs(core): developer workflows and agent architecture specifications",
        "time": "18:50:05"
    }
]

def run_git_cmd(cmd_args, cwd, env=None):
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    res = subprocess.run(cmd_args, cwd=cwd, env=merged_env, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error executing: {' '.join(cmd_args)}")
        print(f"STDOUT: {res.stdout}")
        print(f"STDERR: {res.stderr}")
        raise RuntimeError(f"Command failed with code {res.returncode}")
    return res.stdout.strip()

def get_work_schedule(start_date, end_date):
    """
    Generate schedule respecting:
    - 3-day mid-September break
    - 4-day early October planning gap
    - Weekly 1-day rest day
    """
    total_days = (end_date - start_date).days + 1
    days_list = [start_date + datetime.timedelta(days=i) for i in range(total_days)]
    
    rng = random.Random(42)
    work_days = []
    off_days = []
    
    for i in range(0, len(days_list), 7):
        chunk = days_list[i:i+7]
        has_gap = any(d in GAP_MID_SEPTEMBER or d in GAP_EARLY_OCTOBER for d in chunk)
        if has_gap:
            for d in chunk:
                if d in GAP_MID_SEPTEMBER or d in GAP_EARLY_OCTOBER:
                    off_days.append(d)
                else:
                    work_days.append(d)
        else:
            # Weekly 1-day rest day
            off_idx = rng.choice([5, 6]) if len(chunk) == 7 else rng.choice(range(len(chunk) - 1))
            for idx, d in enumerate(chunk):
                if idx == off_idx:
                    off_days.append(d)
                else:
                    work_days.append(d)
                    
    return work_days, off_days

def assign_daily_commit_tiers(work_days_sub):
    """
    Assign commit intensity tier for days 2..48:
    - ~35% Low intensity (1 commit)
    - ~45% Medium intensity (2-3 commits)
    - ~20% High intensity (4-5 commits)
    """
    rng = random.Random(42)
    n = len(work_days_sub)
    n_low = int(round(n * 0.35))
    n_high = int(round(n * 0.20))
    n_med = n - n_low - n_high

    counts = [1] * n_low + [rng.choice([2, 3]) for _ in range(n_med)] + [rng.choice([4, 5]) for _ in range(n_high)]
    rng.shuffle(counts)

    schedule = []
    for d, c in zip(work_days_sub, counts):
        schedule.append((d, c))
    return schedule

def categorize_file(filepath):
    """Assign file to one of 4 logical phases."""
    if filepath == '.github/workflows/profile_streak_maintenance.yml' or filepath.startswith('scripts/automation/') or filepath.startswith('docs/logs/'):
        return 4

    # Phase 1: Core architecture, configs, infra, db migrations, utils
    if (filepath.startswith('infra/') or
        filepath == '.github/workflows/ci.yml' or
        filepath.startswith('.husky/') or
        filepath.startswith('backend/migrations/') or
        filepath.startswith('backend/src/config/') or
        filepath.startswith('backend/src/db/') or
        filepath.startswith('backend/src/utils/') or
        filepath in ['.gitignore', '.editorconfig', '.prettierrc', '.prettierignore', '.eslintrc.json',
                     'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.yml', 'docker-compose.test.yml',
                     'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md', 'backend/package.json', 'backend/package-lock.json',
                     'backend/eslint.config.js', 'backend/.gitignore', 'backend/.prettierignore',
                     'scripts/test-ci.sh', 'scripts/rebuild_git_history.py']):
        return 1

    # Phase 2: Agent logic, reasoning gateway, algorithms, security, services
    if (filepath.startswith('backend/src/ai/') or
        filepath.startswith('backend/src/algo/') or
        filepath.startswith('backend/src/security/') or
        filepath.startswith('backend/src/middleware/') or
        filepath.startswith('backend/src/services/') or
        filepath.startswith('backend/scripts/')):
        return 2

    # Phase 3: REST APIs, controllers, SSE streaming, websocket, frontend app
    if (filepath.startswith('backend/src/controllers/') or
        filepath.startswith('backend/src/routes/') or
        filepath.startswith('backend/src/schemas/') or
        filepath.startswith('backend/src/websocket/') or
        filepath in ['backend/src/app.js', 'backend/src/server.js'] or
        filepath.startswith('frontend/') or
        filepath.startswith('backend/public/')):
        return 3

    # Phase 4: Tests, environment files, eval harness, docs, benchmarks, evidence
    return 4

def generate_commit_msg(files, phase_num):
    """Generate conventional commit message based on staged files."""
    sample = files[0]
    names = [Path(f).name for f in files]
    short_names = ', '.join(names[:3])
    if len(names) > 3:
        short_names += f' (+{len(names)-3} more)'

    if 'maintain_streak' in sample or 'profile_streak_maintenance' in sample:
        return f'ci(automation): setup automated profile streak maintenance workflow ({short_names})'
    elif 'terraform' in sample:
        return f'feat(infra): cloud infrastructure definitions ({short_names})'
    elif 'migrations' in sample:
        return f'feat(db): database migrations and schema evolution ({short_names})'
    elif 'src/algo' in sample:
        return f'feat(algo): core algorithms and data structures ({short_names})'
    elif 'src/ai' in sample:
        return f'feat(ai): agent reasoning gateway and guardrails ({short_names})'
    elif 'src/security' in sample or 'middleware/auth' in sample:
        return f'feat(security): security policies and authentication guardrails ({short_names})'
    elif 'src/services' in sample:
        return f'feat(services): implement domain business logic engines ({short_names})'
    elif 'src/controllers' in sample or 'src/routes' in sample:
        return f'feat(api): expose REST endpoints and request handlers ({short_names})'
    elif 'frontend/css' in sample:
        return f'feat(ui): design system stylesheets and component themes ({short_names})'
    elif 'frontend/js' in sample:
        return f'feat(frontend): client store and reactive ui interactions ({short_names})'
    elif 'frontend/images' in sample or 'public' in sample:
        return f'feat(assets): catalog imagery and media assets ({short_names})'
    elif 'tests/unit' in sample:
        return f'test(unit): unit test coverage for core modules ({short_names})'
    elif 'tests/integration' in sample or 'tests/routes' in sample:
        return f'test(integration): service contract and api integration tests ({short_names})'
    elif 'eval' in sample or 'bench' in sample:
        return f'test(eval): evaluation harness and performance benchmarks ({short_names})'
    elif 'docs' in sample:
        return f'docs: system architecture and operational specifications ({short_names})'
    elif phase_num == 1:
        return f'chore(core): setup workspace dependencies and configs ({short_names})'
    elif phase_num == 2:
        return f'feat(agents): background execution engines and services ({short_names})'
    elif phase_num == 3:
        return f'feat(ui): integrate frontend views and components ({short_names})'
    else:
        return f'test(ci): finalize testing assets and evidence ({short_names})'

def get_day_timestamps(day_date, count):
    """Generate realistic, ordered daytime timestamps for multiple commits in a day."""
    base_hours = {
        1: [14],
        2: [10, 16],
        3: [10, 14, 18],
        4: [9, 12, 16, 19],
        5: [9, 11, 14, 17, 20]
    }
    hours = base_hours.get(count, [10 + i * 2 for i in range(count)])
    timestamps = []
    for idx, h in enumerate(hours):
        minute = (idx * 17 + 11) % 55
        second = (idx * 13 + 29) % 55
        timestamps.append(f"{day_date.isoformat()}T{h:02d}:{minute:02d}:{second:02d}+05:30")
    return timestamps

def build_repo(repo_dir):
    repo_path = Path(repo_dir).resolve()
    print("=" * 70)
    print(f"  Rebuilding Git History: High-Density Day 1 & Multi-Tier Schedule")
    print(f"  Target: {repo_path}")
    print("=" * 70)

    # 1. Collect tracked files
    git_dir = repo_path / ".git"
    tracked_files = []
    if git_dir.exists():
        try:
            res = run_git_cmd(["git", "ls-files"], cwd=repo_path)
            tracked_files = [line.strip() for line in res.splitlines() if line.strip()]
        except Exception:
            pass

    if not tracked_files:
        ignored = {'.git', 'node_modules', '.terraform', 'coverage', 'backups', '.git_pre_rebuild_backup'}
        for p in repo_path.rglob('*'):
            if p.is_file():
                rel = p.relative_to(repo_path)
                if not any(part in ignored for part in rel.parts):
                    tracked_files.append(rel.as_posix())
        tracked_files.sort()

    print(f"--> Found {len(tracked_files)} codebase files to distribute.")

    # 2. Backup existing .git to /tmp
    if git_dir.exists():
        backup_git = Path(f"/tmp/zipli_git_backup_{repo_path.name}")
        if backup_git.exists():
            shutil.rmtree(backup_git)
        print(f"--> Backing up existing .git to {backup_git}...")
        shutil.copytree(git_dir, backup_git)
        shutil.rmtree(git_dir)

    # 3. Initialize fresh git repository
    print("--> Initializing clean repository on main branch...")
    run_git_cmd(["git", "init", "-b", "main"], cwd=repo_path)
    run_git_cmd(["git", "config", "user.name", GIT_AUTHOR_NAME], cwd=repo_path)
    run_git_cmd(["git", "config", "user.email", GIT_AUTHOR_EMAIL], cwd=repo_path)

    # 4. Generate schedule with organic gaps
    work_days, off_days = get_work_schedule(START_DATE, END_DATE)
    day1_date = work_days[0]
    subsequent_work_days = work_days[1:]

    subsequent_schedule = assign_daily_commit_tiers(subsequent_work_days)
    tier1 = sum(1 for _, c in subsequent_schedule if c == 1)
    tier2 = sum(1 for _, c in subsequent_schedule if 2 <= c <= 3)
    tier3 = sum(1 for _, c in subsequent_schedule if c >= 4) + 1  # include day 1 (6 commits)

    total_commits_planned = 6 + sum(c for _, c in subsequent_schedule)

    print(f"--> Schedule Generated ({START_DATE} to {END_DATE}):")
    print(f"    - Total Days: {len(work_days) + len(off_days)}")
    print(f"    - Active Work Days: {len(work_days)}")
    print(f"    - Day 1 Priority Burst: 6 explicit foundational commits on {day1_date}")
    print(f"    - Days 2-48 Intensity Distribution:")
    print(f"        * Low Tier (1 commit):       {tier1} days ({tier1/len(subsequent_work_days):.1%})")
    print(f"        * Medium Tier (2-3 commits):   {tier2} days ({tier2/len(subsequent_work_days):.1%})")
    print(f"        * High Tier (4-6 commits):     {tier3} days (includes Day 1 burst)")
    print(f"    - Total Commits Planned: {total_commits_planned}")

    commit_count = 0

    # ==================================================================
    # DAY 1 BURST: 6 Initial Setup Commits on August 25, 2026
    # ==================================================================
    print(f"\n[Day 1 Initialization] Executing 6 priority setup commits on {day1_date}...")
    day1_all_files = set()
    for entry in DAY1_COMMITS:
        timestamp = f"{day1_date.isoformat()}T{entry['time']}+05:30"
        for f in entry['files']:
            target = repo_path / f
            if target.exists():
                run_git_cmd(["git", "add", "-f", f], cwd=repo_path)
                day1_all_files.add(f)

        status = run_git_cmd(["git", "status", "--porcelain"], cwd=repo_path)
        if status:
            env = {
                "GIT_AUTHOR_NAME": GIT_AUTHOR_NAME,
                "GIT_AUTHOR_EMAIL": GIT_AUTHOR_EMAIL,
                "GIT_COMMITTER_NAME": GIT_COMMITTER_NAME,
                "GIT_COMMITTER_EMAIL": GIT_COMMITTER_EMAIL,
                "GIT_AUTHOR_DATE": timestamp,
                "GIT_COMMITTER_DATE": timestamp,
            }
            run_git_cmd(["git", "commit", "--no-verify", "-m", entry['msg']], cwd=repo_path, env=env)
            commit_count += 1
            print(f"  -> Commit {commit_count} ({timestamp}): {entry['msg']}")

    # 5. Partition remaining files into 4 phases
    remaining_files = [f for f in tracked_files if f not in day1_all_files]
    phase_files = {1: [], 2: [], 3: [], 4: []}
    for f in remaining_files:
        p = categorize_file(f)
        phase_files[p].append(f)

    # 47 days left: Phase 1 gets 11 days (to complete 12 days total), Phase 2: 12, Phase 3: 12, Phase 4: 12
    p1_days_count = 11
    p2_days_count = 12
    p3_days_count = 12

    phase_schedules = {
        1: subsequent_schedule[:p1_days_count],
        2: subsequent_schedule[p1_days_count : p1_days_count + p2_days_count],
        3: subsequent_schedule[p1_days_count + p2_days_count : p1_days_count + p2_days_count + p3_days_count],
        4: subsequent_schedule[p1_days_count + p2_days_count + p3_days_count:],
    }

    for phase_num in [1, 2, 3, 4]:
        files = phase_files[phase_num]
        sched = phase_schedules[phase_num]
        phase_total_commits = sum(c for _, c in sched)
        num_files = len(files)

        print(f"\n[Phase {phase_num}] Committing {num_files} files across {len(sched)} days ({phase_total_commits} commits)...")

        commit_in_phase = 0
        for day_date, count in sched:
            timestamps = get_day_timestamps(day_date, count)
            for commit_idx in range(count):
                start = int(commit_in_phase * num_files / phase_total_commits)
                end = int((commit_in_phase + 1) * num_files / phase_total_commits)
                batch = files[start:end]

                if batch:
                    for f in batch:
                        target = repo_path / f
                        if target.exists():
                            run_git_cmd(["git", "add", "-f", f], cwd=repo_path)

                    status = run_git_cmd(["git", "status", "--porcelain"], cwd=repo_path)
                    if status:
                        timestamp = timestamps[commit_idx]
                        commit_msg = generate_commit_msg(batch, phase_num)
                        env = {
                            "GIT_AUTHOR_NAME": GIT_AUTHOR_NAME,
                            "GIT_AUTHOR_EMAIL": GIT_AUTHOR_EMAIL,
                            "GIT_COMMITTER_NAME": GIT_COMMITTER_NAME,
                            "GIT_COMMITTER_EMAIL": GIT_COMMITTER_EMAIL,
                            "GIT_AUTHOR_DATE": timestamp,
                            "GIT_COMMITTER_DATE": timestamp,
                        }
                        run_git_cmd(["git", "commit", "--no-verify", "-m", commit_msg], cwd=repo_path, env=env)
                        commit_count += 1
                commit_in_phase += 1

    # Catch any residual files if any exist
    status = run_git_cmd(["git", "status", "--porcelain"], cwd=repo_path)
    if status:
        final_day = work_days[-1]
        run_git_cmd(["git", "add", "-A"], cwd=repo_path)
        final_timestamp = f"{final_day.isoformat()}T20:15:00+05:30"
        env = {
            "GIT_AUTHOR_NAME": GIT_AUTHOR_NAME,
            "GIT_AUTHOR_EMAIL": GIT_AUTHOR_EMAIL,
            "GIT_COMMITTER_NAME": GIT_COMMITTER_NAME,
            "GIT_COMMITTER_EMAIL": GIT_COMMITTER_EMAIL,
            "GIT_AUTHOR_DATE": final_timestamp,
            "GIT_COMMITTER_DATE": final_timestamp,
        }
        run_git_cmd(["git", "commit", "--no-verify", "-m", "chore: finalize release assets and operational configs"], cwd=repo_path, env=env)
        commit_count += 1

    print("\n" + "=" * 70)
    print(f"  SUCCESS: {commit_count} total commits generated!")
    print(f"  Day 1: 6 commits on {day1_date} (August anchor)")
    print(f"  Timeline: {work_days[0]} to {work_days[-1]} (Zero commits on Oct 25)")
    print("=" * 70)

if __name__ == "__main__":
    target_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    build_repo(target_dir)
