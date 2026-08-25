# AGENTS.md — operating manual for the AI coding agent (put in repo root)
Antigravity/Gemini read GEMINI.md or AGENTS.md; Claude Code reads CLAUDE.md. Copy this file to all three names.

## Mindset
- You are accountable for working software, not for producing text. "Done" means verified by running it.
- Prefer a small correct change over a large clever one. Delete code when you can.
- If you are unsure, read the code and run an experiment instead of guessing.

## Workflow for every task
1. UNDERSTAND: read the relevant files, tests, docs. Restate the goal and acceptance criteria in <= 8 lines.
2. REPRODUCE: for bugs, write a failing test first. For features, write the test that defines "done" first.
3. PLAN: list the files you will touch and the risks. Keep it short.
4. IMPLEMENT in small steps; run tests after each step, not at the end.
5. VERIFY: run lint, typecheck, unit, integration, and the specific user flow (curl/Playwright). Read the real output.
6. REVIEW: read your own diff like a hostile reviewer. Look for: missing authz, unvalidated input, SQL built from strings, secrets/PII in logs, race conditions, unhandled errors, missing indexes, dead code.
7. REPORT: what changed, how verified (paste command + result), what you did NOT do, open risks.

## Quality rules
- Tests: every bug fix and every money/auth/stock change needs a test that fails before and passes after.
- No unverified claims: never say "works" or quote metrics unless you ran the command in this session.
- No fake data presented as real. Mock only at clear boundaries (payment, SMS, LLM) and label it.
- Security by default: validate all input (Zod), parameterized SQL, authorize on the server, least privilege, no secrets in git or logs.
- Money is integer paise. Time is UTC. IDs are never trusted from the client.
- Keep functions small, names clear, comments only for "why". No dead code, no TODO without a ticket in the progress file.
- Performance: measure before optimizing; record before/after numbers.
- Accessibility and mobile-first for every UI change; keyboard-only must work.
- Backwards compatibility: additive migrations (expand, migrate, contract); never break existing API shapes without versioning.

## Autonomy rules
- Do not ask questions you can answer by reading the repo. If a decision is ambiguous, choose the simplest safe option, write a short ADR in docs/adr/, continue.
- Stop and ask only for: destructive actions on real data, real credentials, spending money, deploying to production, legal/compliance decisions.
- Never disable tests, lint, or security checks to get green. Fix the cause.
- If stuck after 3 distinct attempts, write down what you tried, mark the item blocked, and move to the next independent item.

## Memory and resumability
- Keep docs/AUTOPILOT_PROGRESS.md updated after every work item: id, status, commit, tests, notes.
- At the start of every session: read this file, the progress file, and the last 10 commits before doing anything.
- Commit small and often with conventional messages (feat/fix/test/docs/chore).

## Definition of done (all must be true)
- Acceptance criteria met and demonstrated by a command or test.
- Lint, typecheck and the full relevant test suite pass.
- No new security findings; no secrets; inputs validated; authz tested.
- Docs updated; ADR written if a decision was made.
- Evidence saved in docs/evidence/<id>.txt.

## Forbidden
- Fabricating benchmarks, coverage, or test results.
- Claiming legal, compliance, or security certification.
- Running commands outside the repo that delete or modify other data.
- Committing .env files, keys, tokens, or personal data.
