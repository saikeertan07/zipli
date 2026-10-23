# ZIPLI PRODUCTION PROMPT PACK — HOW TO USE

This pack is split into 9 files instead of one giant prompt. A single 5000-line
prompt overflows what an AI coding agent can hold and follow; modular files work
better. Total pack is ~5000 lines.

## Order
00 README (this)            how to run the pack
01 Master context & rules   ALWAYS paste first, in every session
02 Product & features       what to build (user stories + acceptance criteria)
03 Architecture & data      services, schema, APIs, events, scaling
04 Security & compliance    threat model, controls, India law (DPDP, PCI, FSSAI)
05 Payments, orders, logistics   money, ledger, GST, refunds, delivery ops
06 Frontend, UX, mobile     design system, PWA, a11y, i18n, performance
07 AI features              real LLM features with guardrails
08 DevOps, QA, launch       infra, CI/CD, observability, load tests, go-live

## How to run it with Claude Code (or any coding agent)
1. Attach your repo. Paste file 01 first. Say: "Read 01. Confirm you understand."
2. For each work package (WP) listed in a file, say:
   "Implement WP-<id> from file <n>. Plan first, then code, then tests, then summary."
3. Review each WP. Reply with short corrections. Commit after each WP.
4. Never paste more than ONE numbered file plus file 01 at a time.
5. After every 5 WPs, run: tests, lint, security scan, load test, and update docs.

## Honest scope note (read this)
- "Better than Swiggy / Zomato / BigBasket / Amazon" is not achievable by code
  alone: those companies run on supply chains, thousands of engineers, licences
  and capital. What IS achievable: a production-quality, secure, fast, honest
  product for a real niche (one city, one campus, a handful of stores) that you
  can run with real users. This pack targets exactly that.
- Real-world launch needs non-code items: business registration, GST, FSSAI
  (for food), payment gateway KYC, privacy policy, terms, refund policy. They are
  listed in file 08 as the LAUNCH GATES. Code cannot replace them.
- Never store card numbers. Use a PCI-compliant gateway (Razorpay/Cashfree/
  Stripe). Your system only handles tokens and webhooks.
- Never claim features or numbers you have not measured.

## Naming
- WP = work package. Each has an ID like WP-SEC-04. AC = acceptance criteria.
- "MUST" = required for launch. "SHOULD" = strongly recommended. "COULD" = later.
