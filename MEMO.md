# Memo: Consent Ledger

**Requirement (from the Backend Engineer post):** senior Node/TypeScript ownership across payments, third-party integrations and AI phone agents, with reliability.

**What I built:** a service that turns GoGoGrandparent's Sep 21, 2026 phone-registration terms into a machine-checked list, checks each item against a call transcript with word-for-word, timestamped quotes, and gates the first charge (200 or 409), with supervisor override and an audit log. Node 20, TypeScript, Fastify, MySQL (embedded SQLite fallback for the free demo), REST and GraphQL, one structured model call, offline demo mode.

**Design choices**
- Rules first. Fee, frequency, toll-free number and email are checked against records, not judged by a model.
- The model only adds items the rules missed, and only when its quote is found word for word. Otherwise the item is unclear.
- "Uh-huh" is not a yes for items that need consent.
- One first charge per registration, enforced by a row lock and a unique key (tested with two concurrent attempts on MySQL).
- L2 autonomy: it flags and holds. A person decides, overrides and refunds. It never cancels, refunds or contacts a member.

**Trade-offs:** transcripts, not audio; no accuracy claim on real calls; synthetic prices; mock payment processor.

**Next:** a pilot on 50 real registration recordings to measure false flags; wire it to the existing speech-to-text; report disclosure coverage as a guardrail metric on script tests; the written-confirmation payload (cut from this 1-day build).

**Questions I'd ask:** how long a call review takes today; which item gets dropped most on busy days; whether a hold fits the ops flow or it should only flag; how much of registration is handled by voice agents today.
