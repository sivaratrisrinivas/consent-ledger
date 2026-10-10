# Consent Ledger

Holds the first charge on a phone signup until every disclosure that the GoGoGrandparent Terms of Service (effective Sep 21, 2026) require is found in the call transcript, each with a word-for-word quote and timestamp. Supervisor override and audit log included. Node.js, TypeScript, MySQL, REST and GraphQL.

**Live demo:** https://consent-ledger-75gt.onrender.com (free tier, first load can take about a minute) · **Video (70 s):** [demo.mp4](https://consent-ledger-75gt.onrender.com/demo.mp4) ([repo copy](public/demo.mp4))

## Run it (about 2 minutes, no keys, no database server)

```bash
npm ci && npm run demo      # six calls, ledgers, gate results, one override, audit log
npm run dev                 # web page and API on http://localhost:3000
npm test                    # 19 tests; MYSQL_TEST=1 npm test adds a run against real MySQL
```

## Checklist (from the public Terms, [gogograndparent.com/terms](https://www.gogograndparent.com/terms), checked Oct 10, 2026)

| ID | Clause | Check |
|---|---|---|
| P1-P6 | Phone Registration, items (i) to (vi): service, fee and billing frequency, auto-renewal, how to cancel, toll-free number and email, arbitration and class action waiver | P2 must match the plan record; P5 must include 1 (855) 464-6872 and the email |
| A1 | Phone Registration, express oral authorization | caller must give a clear yes |
| F1-F4 | Section 4.2(h) Verbal Acknowledgment (i) to (iv), only when a family member signs someone up | detected from the call |

Items marked "needs a clear yes" (P2, P3, A1, F1, F2) are unclear when the only reply is "uh-huh" or "yeah", following the FTC's [Telemarketing Sales Rule guide](https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule). Full list: [disclosures.yaml](disclosures.yaml).

## The six synthetic calls

| Call | What happens | First charge |
|---|---|---|
| 1 Clean self-signup | all 7 items found | 200 |
| 2 Daughter signs up her mother | family signup detected, 11 items found | 200 |
| 3 "about twenty a month" vs $34.00 plan | P2 mismatch at 01:42 | 409 |
| 4 Toll-free number never said | P5 missing (email was said) | 409, then 200 after override |
| 5 Only "uh-huh" to auto-renewal | P3 unclear | 409 |
| 6 Renewal said in plain words | model step finds it, quote verified | 200 (rules-only mode: 409) |

## API

| Method | Path | |
|---|---|---|
| POST | `/calls` | transcript JSON `{plan_code, member_name, segments:[{speaker,start,end,text}]}` → ledger |
| GET | `/calls/:id` · `/calls/:id/evidence-pack` | ledger and transcript · markdown with timestamped quotes |
| POST | `/registrations/:id/first-charge` | 200 charged (mock) or 409 `{missing:[...]}` |
| POST | `/registrations/:id/override` | `{supervisor_id, reason}`, logged |
| GET | `/registrations/:id/audit` · `/checklist` | audit log · checklist |
| POST | `/graphql` | `calls`, `call(id)`, `checklist`, `attemptFirstCharge`, `override` |

Writes need `x-api-key` (demo: `demo-key`).

## How detection works

1. Deterministic rules on every call: fee and frequency against the plan row, toll-free number and email, arbitration plus class action waiver, family signup, plain phrasings.
2. One structured model call (free tier: `GROQ_API_KEY` or a Gemini key) for items the rules missed. Every quote it returns must appear word for word in the transcript or the item becomes unclear. The model cannot clear the fee or contact checks.
3. Caller acknowledgment is read from the reply right after the quoted line.

With no key, the demo uses saved model replies in `fixtures/model-cache/` (keyed by transcript hash), and plain rules for any new transcript. `DETECTOR=rules|cached|live`.

## Real vs simulated

Real: the API, gate, override, audit log, evidence pack, rules, the quote check, and MySQL support (tests pass on MySQL 9.7). Simulated: the calls (written by hand, no real call content), plan prices, the payment processor (mock charge), supervisor identity, and speech to text (input is a transcript). The live demo runs on Render's free tier with **embedded SQLite** (no free MySQL host without a browser signup); set `DATABASE_URL=mysql://...` to use MySQL, the production target. Data resets on restart.

Built only from public Terms text and synthetic calls. Not affiliated with GoGoGrandparent. Not legal advice. Next step: a pilot on 50 real registration recordings to measure false flags. See [MEMO.md](MEMO.md).
