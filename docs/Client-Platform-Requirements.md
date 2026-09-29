PRODUCT REQUIREMENTS  /  BUILD SPECIFICATION

# Client Platform — Functional & Non-Functional Requirements

## Eight Pillars, from first conversation to collected cash

> **NORTH-STAR QUESTION**  Do we have the right clients, moving through the right stages, priced from what delivery will actually cost, on the right commercial terms, delivering the right outcomes, to protect and grow revenue now and next?

| | |
|---|---|
| **DOCUMENT PURPOSE** | State the testable functional and non-functional requirements, and the feature set, for the client platform |
| **PRIMARY AUDIENCE** | Product, engineering, design, sales, delivery, finance, partnerships, and leadership |
| **REVIEW MODE** | Build specification — every requirement is either implemented, partially implemented, or scoped as new work |
| **SUPERSEDES** | Nothing. Derives from and makes testable the two architecture documents named below |
| **PREPARED** | 24 August 2026 |

`CLIENT > PIPELINE > PARTNER > PRICING > CONTRACT > DELIVERY > REVENUE > INTELLIGENCE`

---

# Section 0 — Context and how to read this

## Where this comes from

Two architecture documents define the product intent:

- [Client Management Platform — Seven Pillars](./Client-Management-Platform-Seven-Pillars.md) — Client, Pipeline, Partner, Contract, Delivery, Revenue, Client Intelligence.
- [Engagement Pricing & Quotation Desk](./Engagement-Pricing-and-Quotation-Desk.md) — Catalog, Sizing, Cost, Feasibility, Price, Decision, Quotation.

Both are architecture narratives. They describe what should be true, not what can be built and tested. This document converts them into requirements.

The second document was written as a **separate employee-platform product**, deliberately fenced off from the client platform so that salary-derived cost rates and named staff availability could never cross. **That decision is reversed here.** The pricing desk becomes **Pillar 4** of a single client platform. What was a platform boundary becomes a field-level permission boundary — see [Decision D-1](#d-1--the-pricing-desk-is-absorbed-not-integrated) and the security requirements that pay for it.

The current implementation is described in [CRM-OVERVIEW.md](./CRM-OVERVIEW.md). Every requirement below is tagged against it.

## The eight pillars

Pricing inserts at position 4 — the point where an opportunity becomes a promise — leaving the source numbering of Pillars 1 to 3 intact.

```
   ┌─ 1 CLIENT ──────────── who they are
   │
   ├─ 2 PIPELINE ────────── what is in play
   │        │
   │        ├─ 3 PARTNER ── who brought it
   │        │
   │        ▼
   ├─ 4 PRICING ─────────── what it costs, what we charge, what we send
   │        │
   │        ▼
   ├─ 5 CONTRACT ────────── what we agreed
   │        │
   │        ▼
   ├─ 6 DELIVERY ────────── what we delivered
   │        │
   │        ▼
   ├─ 7 REVENUE ─────────── what we earned and collected
   │
   └─ 8 INTELLIGENCE ────── what needs attention, and who acts
```

## Status tags

Every functional requirement carries one:

| Tag | Meaning |
|---|---|
| **EXISTS** | Implemented and working today. Listed so the specification is complete, and so nobody rebuilds it |
| **PARTIAL** | Something is there, but it does not meet the requirement as stated. The gap is named in the row |
| **NEW** | No implementation. Net new build |
| **WITHDRAWN** | Proposed in the initial draft and cut during review. The row is kept, struck through, with the reason and the date. It is not built |

## Requirement identifiers

- `FR-P<pillar>-<nn>` — functional requirement owned by a pillar.
- `FR-X-<nn>` — cross-cutting functional requirement, owned by the platform rather than a pillar.
- `NFR-<GROUP>-<nn>` — non-functional requirement.

Identifiers are permanent. If a requirement is dropped, its number is retired rather than reused.

## Revision history

The initial draft was derived from the two source documents plus an audit of the codebase, with no business input. It is being reviewed pillar by pillar. Each row records what changed and on whose decision.

| Date | Scope | Decisions taken |
|---|---|---|
| 24 Aug 2026 | Initial draft | 188 functional and 56 non-functional requirements authored from the source documents and a codebase audit. Unvalidated |
| 25 Aug 2026 | **Review paused after Pillar 5** | Pillars 1–5 reviewed and agreed. **Pillars 6, 7, 8 and Section C remain UNREVIEWED** and are marked as such in place. Work moved to building the Pillar 4 cost engine. Outstanding reconciliation: FR-P5-07 now permits milestone-triggered billing, which FR-P6-04 and FR-P7-05 must support |
| 24 Aug 2026 | **Pillar 1 reviewed** | Client group structure cut — reporting is per legal entity (**Q-5 closed**). Merge built for both contacts and companies; duplicate detection stays contacts-only. All four contact relationship fields kept, with relationship strength specified as computed rather than manual. Domain enrichment cut. Data-quality worklist cut. Structured client profile added to feed Pillar 4 sizing |
| 25 Aug 2026 | **Pillar 5 reviewed** | Contract stays **one-per-opportunity** — FR-P5-01 withdrawn; a renewal is a new opportunity, and amendments and change orders attach as child records. Document upload with versioning confirmed; no e-signature. Billing schedule supports **both date-based and milestone-triggered** instalments. Added FR-P5-16 for GSTIN, place of supply, SAC code, billing address and invoicing contact, none of which exist anywhere in the schema. Added FR-P5-17 to record payments against instalments. Contract access goes to super admins and holders of the financial permission — not deal owners or delivery leads |
| 25 Aug 2026 | **Pillar 4 reviewed** | **Costing model corrected from role-hours to resource-weeks.** Cost builds per resource per week as base + seat + support, summed over the team and their weeks, plus non-labour, then uplifted by GNR (gross non-recoverable) on the total. Every input pre-filled and editable, with custom cost variables allowed (FR-P4-55, FR-P4-56). Added FR-P4-54 for a delivery-role taxonomy, which nothing in the platform has and which everything else here depends on. Target margin is guidance — cost sets the floor, the market sets the price. Effort capture by role, stage and week confirmed in scope, making calibration real. **Q-1 closed:** the financial permission is granted per user, not per role |
| 25 Aug 2026 | **Pillar 3 reviewed** | Formal referral registration, attribution windows, credit types and shared-credit splits all cut — attribution stays informal, one partner per deal (**Q-2 closed**). Partner agreements kept with an optional fee basis, since some partners are paid and some are reciprocal. Fee obligations and settlement kept for paid partners. Partner-facing access rejected; co-sell reduced to an internal view. Added FR-P3-16 to resolve the two competing partner foreign keys on `deals`. Tiers and coverage flagged as thin |
| 25 Aug 2026 | **Pillar 2 reviewed** | Nothing cut — every requirement traces to the source document. Qualification is six named fields with no scoring or gating. Stage criteria **warn without blocking** and record the incomplete move. Forecast gets a dedicated page, plus commit / best-case / pipeline categories and targets with a coverage ratio. Win/loss reasons become a controlled list with the competitor and their price. Correction: FR-P2-05 and FR-P2-13 were described in the review plan as invented; both are named in the source document |

## Reading a requirement row

| Column | Meaning |
|---|---|
| **ID** | Permanent identifier |
| **Requirement** | What the system must do, stated so that it can be shown to be true or false |
| **Acceptance** | The observable condition that settles it |
| **Status** | EXISTS / PARTIAL / NEW, with the gap named where partial |
| **Lands in** | The existing file or the new module the work belongs to |

---

# Section A — The pillar model

## What each pillar owns

> **ARCHITECTURE PRINCIPLE**  Each pillar owns a distinct business truth. Other pillars may consume and enrich that truth, but must not create a competing version of it.

| # | Pillar | Owns | Explicitly does not own |
|---|---|---|---|
| 1 | **Client** | Account and contact identity, group structure, segmentation, lifecycle status, billing entity designation | Opportunity state, contract terms, revenue |
| 2 | **Pipeline** | Opportunities, stages, qualification evidence, forecast, and the complete interaction record | Signed commercial terms, price basis |
| 3 | **Partner** | Partner relationships, agreements, tiers, referral registration, attribution and fee obligations | The client relationship, the revenue record |
| 4 | **Pricing** | Effort catalog, sizing drivers, cost rates, delivery cost, feasibility verdict, price, margin, bid decision, quotation document | The signed agreement, the delivered work, the collected cash |
| 5 | **Contract** | Documents, negotiated value, contracted scope, terms, billing schedule, amendments, renewals | The quoted price basis, the delivery execution |
| 6 | **Delivery** | Engagement record, delivery stages, milestones, deliverables, outcomes, schedule variance | Who is staffed and how their time is spent; billing |
| 7 | **Revenue** | Contracted / invoiced / recognized / collected value, receivables, margin realization, LTV | The commitment that created it, the work that earned it |
| 8 | **Intelligence** | Cross-pillar KPI semantics, health, exceptions, decisions, action trail | Any source commercial truth of its own |

## The value chain — five numbers that must never collapse into one

This is the single most important structural requirement in the document. Five distinct money figures exist for one engagement, and each must be retrievable independently at any point in time:

| Number | Owned by | Created when |
|---|---|---|
| **Estimated cost** | Pillar 4 | The cost engine runs against sized effort |
| **Quoted value** | Pillar 4 | The quotation is approved and sent |
| **Contracted value** | Pillar 5 | The SOW is signed, with a variance reason against the quote |
| **Invoiced / recognized value** | Pillar 7 | A billing event fires from a contract schedule or a delivery milestone |
| **Collected value** | Pillar 7 | Payment is received against an invoice |

> **IMPORTANT CONTROL**  No number in this chain may silently overwrite the one before it. Retain the value, the approver, the date, and the variance reason at every transition. The differences between these five numbers are the most useful measures in the platform; collapsing them destroys the only evidence that the estimates, the pricing, or the collections are going wrong.

The current implementation gets the first half of this right and the second half not at all. `deals_with_value.effective_value` correctly coalesces the negotiated onboarding amount over the sales estimate, preserving both. There is nothing beyond it — no invoiced, recognized, or collected state exists in the database.

## Contract-to-cash, routed through Pillar 4

1. **Qualify.** Pillar 2 records scoped services, qualification evidence, and interaction history. No price yet.
2. **Register the channel.** If a partner sourced or influenced the opportunity, Pillar 3 registers the referral and its attribution basis **before** the deal closes.
3. **Estimate and price.** Pillar 4 selects a catalog baseline, applies sizing drivers, computes delivery cost, tests capacity feasibility, prices to a target margin, and records a bid decision.
4. **Quote.** Pillar 4 generates the quotation from the approved basis — price, delivery window, milestones, scope, exclusions, validity period — and freezes the estimate.
5. **Win and hand over.** Pillar 2 closes the opportunity with a win reason. The deal is won but **not yet committed**.
6. **Contract and fund.** Pillar 5 tracks documents to signature, records the negotiated value with its variance reason against the quote, captures payment terms and the purchase order, and only then opens the kickoff readiness gate.
7. **Deliver.** Pillar 6 executes against contracted scope and dates, recording milestone completion, deliverable acceptance, delays with attributed reasons, and the eventual audit or certification outcome.
8. **Bill and collect.** Milestone completion and the contract schedule together trigger billing events in Pillar 7. Invoiced, recognized, and collected are tracked separately with unbilled visible throughout.
9. **Settle and learn.** Partner fees settle against collected revenue in Pillar 3. Delivered effort is compared against the frozen estimate in Pillar 4, correcting the catalog. Quoted-to-contracted-to-realized variance revises targets and floors.

## The four feedback loops, and where each one lives

| Loop | Reads | Writes back into |
|---|---|---|
| **Qualification** | Win/loss reasons, delivered outcomes | Ideal-client profile and qualification criteria (P1, P2) |
| **Commercial** | Quoted vs contracted vs realized variance | Scoping, target margins, discount floors (P2, P4) |
| **Attribution** | Closed, delivered and collected revenue | Partner credit, tiering, channel investment (P3) |
| **Retention** | Delivery outcomes, certification, payment behaviour | Renewal probability, expansion, churn risk (P1, P7, P8) |
| **Calibration** | Delivered effort by role and stage vs the frozen estimate | Catalog baselines and confidence bands (P4) |

---

# Section B — Functional requirements

## Pillar 1 — Client & Account Intelligence

*Who are our clients and prospects, and who do we deal with inside them?*

The most mature pillar in the current build. The gaps are structural rather than functional: there is no way to express that two companies are one client group, and no way to merge a duplicate once detected.

### Accounts and contacts

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P1-01 | Maintain account master records with legal name, trading name, domain, industry, sub-industry, size band, geography, and client type | An account can be created, edited, searched and soft-deleted with all listed attributes | **EXISTS** | [companies.ts](../src/server/db/schema/companies.ts), [company.service.ts](../src/server/services/company.service.ts) |
| FR-P1-02 | Enforce domain uniqueness among live accounts without blocking reuse of a domain from a deleted account | Partial unique index on domain scoped to `deleted_at IS NULL` | **EXISTS** | `idx_companies_domain` |
| FR-P1-03 | Maintain contact records with name, title, email, phone, source, status and owner | Contact CRUD with all listed attributes, searchable and filterable | **EXISTS** | [contacts.ts](../src/server/db/schema/contacts.ts) |
| FR-P1-04 | Record each contact's role in a buying decision — decision maker, champion, influencer, stakeholder, blocker | Role is recorded per contact per opportunity, not globally on the contact | **EXISTS** | `deal_contacts.role` |
| FR-P1-05 | Record seniority, decision authority and communication preference on a contact | The three fields are stored, editable, and visible on the contact detail page | **NEW** — none of the three exist | Extend `contacts` |
| FR-P1-17 | Derive relationship strength from activity recency and frequency, manually overridable | Strength is recomputed on the nightly schedule alongside lead score; a manual override is retained and marked as overridden until cleared | **NEW** — reviewed 24 Aug: kept, but specified as computed rather than a free-standing manual field, which would go stale | `contacts` + [automation.service.ts](../src/server/services/automation.service.ts) |
| FR-P1-06 | Recalculate contact lead score on a schedule from activity recency and engagement | Nightly job updates `leadScore`; the calculation is inspectable | **EXISTS** | `recalculateLeadScores` in [automation.service.ts](../src/server/services/automation.service.ts) |
| FR-P1-07 | Maintain contact lifecycle status through new, contacted, qualified, nurturing, converted, unqualified, lost, archived | Status transitions are recorded and reportable | **EXISTS** | `ContactStatus` |

### Identity resolution and merge

> **REVIEW DECISION, 24 Aug 2026 (closes Q-5)**  Client group structure is cut. Revenue, health and all reporting are computed **per legal entity**. Multi-entity clients are handled by hand until there is evidence they are common enough to model. This removes FR-P1-08, FR-P1-09 and FR-P1-10.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| ~~FR-P1-08~~ | ~~Model parent, subsidiary and affiliate relationships between accounts~~ | — | **WITHDRAWN** 24 Aug — reporting is per legal entity | — |
| ~~FR-P1-09~~ | ~~Present a client group whole or as separate legal entities~~ | — | **WITHDRAWN** 24 Aug — no group concept to present | — |
| ~~FR-P1-10~~ | ~~Designate which entity in a group is the billing entity~~ | — | **WITHDRAWN** 24 Aug — one entity per client, so nothing to nominate. Billing address and tax registration are still required and are raised against Pillar 5 | — |
| FR-P1-11 | Detect probable duplicate contacts on creation | Detection matches on exact email, normalised phone, or name similarity above 0.85 combined with the same company, and raises a notification linking to the candidate | **EXISTS** — reviewed 24 Aug: contacts-only detection accepted as sufficient; company duplicates are largely prevented by the unique domain index | [automation.service.ts:456](../src/server/services/automation.service.ts) |
| FR-P1-12 | Merge two contacts **or two accounts**, preserving all history from both | After merge: one surviving record; all activities, opportunities, contracts, tasks and tags from both are attached to it; field-level survivor selection where the two disagree; the merge is recorded in the audit log and reversible | **NEW** — no merge path of any kind exists, so every duplicate detected since launch is still there | New merge service |
| ~~FR-P1-13~~ | ~~Monitor data quality and surface coverage gaps~~ | — | **WITHDRAWN** 24 Aug — a report nobody opens; problems surface through the work itself | — |

### Segmentation

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P1-14 | Segment accounts by industry vertical, size band, geography, regulatory exposure and framework interest | All five are filterable and usable as a report dimension | **PARTIAL** — industry, size and geography exist as columns; regulatory exposure and framework interest exist only as free tags | `companies` + [tags.ts](../src/server/db/schema/tags.ts) |
| ~~FR-P1-15~~ | ~~Enrich an account from its domain — size, industry, technology signals~~ | — | **WITHDRAWN** 24 Aug — needs a paid subscription and an integration; neither source document asks for it, and leads arriving via Apollo exports and referrals already carry the data | — |
| FR-P1-16 | Record referral source and partner relationship context on an account and a contact | `referredByPartnerId` and `referralDate` are set and readable by Pillar 3 | **EXISTS** | `contacts.referredByPartnerId`, `contacts.referralDate` |
| FR-P1-18 | Hold a **structured client profile** carrying the facts Pillar 4 prices from: headcount band, number of cloud environments, number of physical locations, prior certification history, count of in-scope systems, and frameworks running in parallel | Each is a discrete typed field, not a tag, and is readable by the sizing model without interpretation. Values captured during scoping write back here | **NEW** — only headcount exists, as `companySize`. The rest exist nowhere, or as free tags that cannot be computed against | `companies` + P4 sizing |

> **CONCRETE EXAMPLE**  Northwind Analytics is a 180-person SaaS company in Bengaluru with regulatory exposure to SOC 2 and DPDP. The account holds three contacts: a CTO who is the economic buyer, a security lead who is the technical champion, and a finance controller who owns purchase orders. A second record created later from a website form is detected as a duplicate and merged, preserving both contact histories.

### Features — Pillar 1

Account list with saved views and column control · account detail with Overview, Activity, Contacts, Prospects, Projects, Contracts, Demos, Tasks · contact list and detail with five tabs · CSV import wizard with column mapping · Excel-safe CSV export · tagging with categories · duplicate notification with a link to the candidate · **merge wizard for contacts and accounts, with field-level survivor selection (new)** · **client profile panel holding the sizing facts Pillar 4 prices from (new)** · **computed relationship strength on the contact record (new)**.

---

## Pillar 2 — Sales Pipeline & Opportunity Management

*What is in play, where is it, and what will it close at?*

Also mature. The gap is that stages carry probabilities but not criteria, so a stage means whatever the owner thinks it means — which is exactly what makes a forecast an opinion.

### Opportunity records

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P2-01 | Maintain opportunity records with scoped services, expected value, currency, probability, expected close date, owner and competitive context | All listed attributes are stored and editable. Competitive context is the competitor's name and, where known, their price | **PARTIAL** — everything but competitive context exists; no competitor field of any kind | [deals.ts](../src/server/db/schema/deals.ts) |
| FR-P2-02 | Support configurable pipelines and stages per sales motion, as data rather than code | Pipelines and stages are created, reordered, coloured and given default probabilities from Settings without a deploy | **EXISTS** | [pipelines.ts](../src/server/db/schema/pipelines.ts), `/settings/pipelines` |
| FR-P2-03 | Record every stage move as append-only history with entry and exit timestamps | Time-in-stage is derivable per opportunity per stage for any historic period | **EXISTS** | `deal_stage_history` |
| FR-P2-04 | Define entry and exit criteria per stage, show which are unmet on a stage move, and **warn without blocking** | The move proceeds regardless, and the fact that it was made with criteria unmet is recorded against the stage-history row so it can be reported on | **NEW** — reviewed 25 Aug: warn, do not block. `pipeline_stages.automation_config` is an existing JSONB column that is declared and never read anywhere; criteria belong there | `pipeline_stages.automationConfig`, `deal_stage_history` |
| FR-P2-05 | Capture six named qualification fields on an opportunity: need, authority, budget, timing, regulatory driver, and decision path | Each is a discrete field; completeness is reportable as a count answered out of six. **No scoring and no gating** | **NEW** — reviewed 25 Aug: structured fields without a scoring methodology | New `opportunity_qualification` table |
| FR-P2-06 | Maintain a wider contact list per opportunity with buying roles | Multiple contacts attach to an opportunity, each with a role | **EXISTS** | `deal_contacts` |
| FR-P2-07 | Maintain an opportunity team, and use team membership to grant record visibility | A user on the deal team can see the opportunity even without full visibility | **EXISTS** | `deal_team_members`, [visibility-filters.ts](../src/server/lib/visibility-filters.ts) |

### Interaction record

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P2-08 | Record every interaction — call, email, meeting, demo, discovery, proposal, note, chat — on one timeline, linkable to contact, account and opportunity | An interaction can be logged from any module and appears on all linked records | **EXISTS** | [activities.ts](../src/server/db/schema/activities.ts) |
| FR-P2-09 | Capture structured demo and discovery outcomes: attendees, requirements, pain points, objections, next action | Demo records exist as structured data, not notes | **EXISTS** | [demo-records.ts](../src/server/db/schema/demo-records.ts) |
| FR-P2-10 | Record follow-up commitments with an owner and a due date, and surface them when due | Open follow-ups appear on the Command Center and in the daily digest | **EXISTS** | `deal_tasks`, [reminder-digest.service.ts](../src/server/services/reminder-digest.service.ts) |
| FR-P2-11 | Allow interaction logging from outside the CRM through chat | `/add`, `/note`, `/log`, `/find`, `/today`, `/mytasks` work on Telegram, WhatsApp and Teams | **EXISTS** | [bot-commands.service.ts](../src/server/services/bot-commands.service.ts) |

### Forecast and health

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P2-12 | Produce a **dedicated forecast view** built on effective probability, broken down by period, owner and service line | Weighted value = effective value × probability, with the stage default used when no explicit probability is set, surfaced as its own page rather than a figure inside a personal report | **PARTIAL** — the calculation already exists at [report.service.ts:542](../src/server/services/report.service.ts) and at [executive-overview.service.ts:60](../src/server/services/executive-overview.service.ts); no forecast page consumes it | New forecast page over `deals_with_value` |
| FR-P2-13 | Produce a **committed** forecast distinct from the weighted forecast | An owner marks each opportunity commit / best-case / pipeline; the three roll up separately and alongside the weighted figure, never summed into one number | **NEW** | Extend `deals` |
| FR-P2-14 | Detect stalled opportunities against a computed benchmark rather than a fixed threshold | An opportunity exceeding the pipeline's average time-in-stage is flagged, and the benchmark is recomputed nightly | **EXISTS** | `pipeline_benchmarks`, `isVelocitySlow` |
| FR-P2-15 | Detect opportunities with no recent engagement and alert the owner | Stale-lead alerting with a configurable inactivity threshold, cooldown and pipeline scope | **EXISTS** | [deal-inactivity.service.ts](../src/server/services/deal-inactivity.service.ts) |
| FR-P2-16 | Capture win and loss reasons from a controlled list, with the competitor named and their price where known | Reason is a selectable value from a list the business defines, not free text, and loss reasons are countable by reason, by service line and by period | **PARTIAL** — `wonReason` and `lostReason` are `text` columns, so losses cannot be counted by cause | Extend `deals` |
| FR-P2-17 | Expose coverage — pipeline value against target, by owner and by period | A revenue target is set per owner per period, and coverage is reported as a multiple of that target | **NEW** — no target model exists anywhere; shared with FR-P8-08, which needs the same table | New `targets` table, shared with P8 |
| FR-P2-18 | Pass scoped services and quoted value to Pillar 4 for pricing, and receive back the approved price and delivery window | An opportunity shows its linked estimate and quotation, and its amount is set from the approved quote rather than typed | **NEW** | P2 ↔ P4 link |

> **CONCRETE EXAMPLE**  A SOC 2 Type II opportunity at Northwind is quoted at INR 18,00,000 and sits at Proposal with 70% probability, expected to close 30 September. Qualification records the CTO as economic buyer, the enterprise procurement deadline as the urgency driver, and confirmed budget. Six interactions are attached. The deal has not moved in 21 days, so it is flagged stalled while remaining in the forecast.

### Features — Pillar 2

Kanban board with drag-and-drop and preserved position · table view with saved views · filter by status and service · CSV import · deal↔contact backfill repair wizard · six-tab detail page · stage history timeline · **six-field qualification panel with a completeness count (new)** · **stage criteria checklist that warns on an incomplete move and records it (new)** · **forecast page: weighted, commit, best-case and pipeline, by period, owner and service (new)** · **targets and coverage ratio (new)** · **structured win/loss capture with competitor and their price (new)**.

---

## Pillar 3 — Partner & Channel Ecosystem

*Who brings us business, and what is that channel actually worth?*

Currently a read-model over a single foreign key. Attribution works only in the simplest case — one partner, unambiguously sourced, never contested. Everything the source document describes as the hard part is missing.

### Partner relationship

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P3-01 | Maintain partner organizations distinguishable from clients | `companyType = 'partner'` filters the partner list | **EXISTS** | [partner.router.ts](../src/server/trpc/routers/partner.router.ts) |
| FR-P3-02 | Hold a partner agreement carrying a **fee basis that may be nil**, with effective and expiry dates | Some partners are paid a percentage, some are reciprocal and paid nothing. The agreement records which, so "do we owe this partner anything" is answerable without asking someone | **NEW** — reviewed 25 Aug: mixed model, fee basis optional | New `partner_agreements` table |
| FR-P3-03 | Assign partners to tiers, with tier movement driven by measured contribution | Tier is stored, its criteria are stated, and movement is recorded with a date and reason | **NEW** — *thin justification after the 25 Aug simplifications; see the note below this table* | New `partner_tiers` |
| FR-P3-04 | Record partner coverage by service line and geography | Coverage is stored and used to filter which partners suit an opportunity | **NEW** — *thin justification after the 25 Aug simplifications; see the note below this table* | `partner_agreements` |

### Attribution

> **REVIEW DECISION, 25 Aug 2026 (closes Q-2)**  Formal referral registration is cut. Partners introduce clients informally and attribution is recorded when it becomes known, as today. A deal carries **one partner or none** — no credit types, no splits, no attribution window, no expiry. This removes FR-P3-05 to FR-P3-09. If contested claims ever become common, revisit; nothing here forecloses adding them.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| ~~FR-P3-05~~ | ~~Register a referral before the opportunity closes, with an attribution window~~ | — | **WITHDRAWN** 25 Aug — too formal for how partners actually approach the business | — |
| ~~FR-P3-06~~ | ~~Detect and handle conflict between a new referral and existing pipeline~~ | — | **WITHDRAWN** 25 Aug — no registration, so no conflict to detect | — |
| ~~FR-P3-07~~ | ~~Distinguish sourced, influenced and co-sold credit~~ | — | **WITHDRAWN** 25 Aug — a single credit type is sufficient | — |
| ~~FR-P3-08~~ | ~~Apply a shared-credit rule when more than one partner claims an opportunity~~ | — | **WITHDRAWN** 25 Aug — partners rarely overlap; no splits | — |
| ~~FR-P3-09~~ | ~~Expire attribution automatically when the window lapses~~ | — | **WITHDRAWN** 25 Aug — no window to expire | — |
| FR-P3-16 | Resolve the two competing partner foreign keys on an opportunity into one | `deals` today carries both `partnerCompanyId` and `referredByPartnerId` against the same table with no documented distinction, and attribution reads only the second. One is kept, the other migrated and dropped | **NEW** — raised during review 25 Aug; a data-model ambiguity, not a feature | [deals.ts](../src/server/db/schema/deals.ts) + migration |
| FR-P3-10 | Report referred leads, open and won opportunities, and won revenue per partner | The partner page shows all four | **EXISTS** | [partner.router.ts](../src/server/trpc/routers/partner.router.ts) |
| FR-P3-11 | Suppress partner revenue figures from roles not entitled to see money | Analyst role sees partner attribution with revenue nulled | **EXISTS** | `partner.router.ts` |

### Co-sell and settlement

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P3-12 | Show joint activity and commitments against a partner **internally** | The partner page shows the opportunities and contacts attributed to that partner together with recent joint activity. **No partner-facing surface** | **PARTIAL** — reviewed 25 Aug: partner-facing half cut. `dealsByPartner` and `contactsByPartner` already provide most of this; joint activity does not appear | [partner.router.ts](../src/server/trpc/routers/partner.router.ts) |
| FR-P3-13 | Trigger a fee obligation on the event named in the partner agreement, for partners whose agreement carries a fee | When the trigger event fires in Pillar 7, an obligation is created with an amount and a due date. Partners on a nil fee basis generate nothing | **NEW** | P3 ↔ P7 |
| FR-P3-14 | Settle fee obligations against collected revenue and track what is outstanding | An obligation moves accrued → due → settled, each with a date, and outstanding obligations are reportable | **NEW** | New `partner_fee_obligations` |
| FR-P3-15 | Measure partner performance: referral volume, conversion rate, revenue contribution, and average deal size | A partner scorecard shows all four over a selectable period | **PARTIAL** — volume and revenue exist; conversion rate and trend do not | `partner.router.ts` |

> **CONCRETE EXAMPLE**  A virtual-CISO firm registers Northwind as a referral with a 90-day attribution window. The opportunity converts inside the window, so the partner is credited as sourced. On collection of the first invoice a 10% referral fee obligation is triggered. Across the year the partner has produced eleven referrals, a 45% conversion rate, and INR 94,00,000 in collected revenue — moving it into the top tier.

### Features — Pillar 3

Partner list with attribution stats · attach an existing deal to a partner retroactively · create a deal against a partner · referred leads and deals per partner · revenue masked for Analysts · **partner agreement with an optional fee basis (new)** · **fee obligation ledger with settlement (new)** · **partner scorecard with conversion rate and trend (new)**.

> **NOTE ON FR-P3-03 AND FR-P3-04**  Tiers and coverage survived the 25 Aug review only because they were not asked about. With registration, credit types and partner access all cut, both are now thin: tiers were justified by measured contribution driving investment decisions, and coverage by routing referrals — neither of which this pillar now does. They are worth an explicit keep-or-cut before Phase 6.

---

## Pillar 4 — Engagement Pricing & Quotation

*What will it cost us, can we staff it, what do we charge, and what do we send them?*

Almost entirely new. This pillar absorbs all seven capabilities of the [Engagement Pricing & Quotation Desk](./Engagement-Pricing-and-Quotation-Desk.md). It is the largest single body of work in the document and the one that changes the commercial character of the platform most.

> **ARCHITECTURE PRINCIPLE**  A quotation is three claims bundled into one number: a price, a delivery window, and an implied margin. All three must be provable before the quote is sent, and each is proven independently.

> **REVIEW DECISION, 25 Aug 2026 — the costing model.**  The initial draft priced in **role-hours**. That was wrong. The business estimates in **resource-weeks**: a team of named employees, each carrying a role, each on the engagement for a number of weeks. Cost builds up per resource per week and the whole engagement is uplifted at the end.
>
> ```
> PER RESOURCE, PER WEEK
>     base cost          (salary-derived)
>   + seat cost          (laptop, infra)
>   + support cost       (HR, admin, internal functions)
>   ─────────────────────────────────────────
>   = loaded weekly cost
>
> ENGAGEMENT
>     Σ (loaded weekly cost × weeks on engagement)
>   + non-labour         (external auditor fee, tooling, travel)
>   ─────────────────────────────────────────
>   × (1 + GNR %)        gross non-recoverable: bench time, rework, unbilled travel
>   = TOTAL DELIVERY COST
> ```
>
> **Every figure is pre-filled with a recommended default and remains editable**, and estimators can add their own cost variables. This is a standing principle across the pillar, not a feature of one screen — see FR-P4-55 and FR-P4-56.

### 4.1 Service & effort catalog

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-54 | Hold a **delivery-role taxonomy** distinct from permission roles | Lead consultant, security analyst, compliance analyst, QA and reviewer exist as delivery roles. [users.ts](../src/server/db/schema/users.ts) `roleId` points at *permission* roles and cannot serve this purpose. An employee carries a delivery role independent of what they may do in the CRM | **NEW** — foundational; nothing in the platform expresses a delivery role, so nothing else in this pillar can be built first | New `delivery_roles` + extend `users` |
| FR-P4-01 | Hold effort baselines per service line as a **team shape over weeks**, broken down by delivery stage | A baseline for SOC 2 Type I/II, ISO 27001, DPDP, VAPT, CSPM, CERT-IN and AI governance states how many resources of each delivery role, for how many weeks, across which stages | **NEW** — reviewed 25 Aug: resource-weeks, not role-hours | New `effort_baselines` table |
| FR-P4-02 | Carry a confidence band per baseline derived from sample size and observed variance | Each baseline shows High / Medium / Low with the supporting engagement count and observed spread. **Until completed engagements exist, every baseline is Low and declared as judgement-based** | **NEW** — no completed-engagement effort data exists to derive a band from; see the dependency note above | `effort_baselines.confidence` |
| FR-P4-03 | Version every baseline change, dated and attributed | Editing a baseline creates a new version; the prior version remains readable | **NEW** | `effort_baseline_versions` |
| FR-P4-04 | Record on every estimate the exact baseline version it was built from | An estimate names its baseline version; changing the baseline later does not alter the estimate | **NEW** | `estimates.baseline_version_id` |
| FR-P4-05 | Hold non-labour cost templates: external auditor fee ranges, tooling and evidence platforms, travel | Templates are selectable when building an estimate and carry a default amount and a pass-through flag | **NEW** | New `non_labour_templates` |
| FR-P4-06 | Support composite and bundled services, prerequisite relationships, and re-certification or surveillance-year variants | A bundle composes its member baselines; a surveillance-year variant is a distinct baseline | **NEW** | `effort_baselines` |
| FR-P4-07 | Report services with no baseline as a coverage gap | A coverage report lists every service sold in Pillar 2 that has no catalog entry | **NEW** | P4 reporting |
| FR-P4-55 | Pre-fill every cost and sizing input with a recommended default, and keep all of them editable | No figure in an estimate is locked. Each shows its recommended value, whether it has been overridden, and by whom — so an override is visible rather than silent | **NEW** — standing principle, stated once and applied across 4.1 to 4.5 | Estimate builder |
| FR-P4-56 | Let an estimator add **custom cost variables** to an engagement beyond the standard layers | A named, typed line can be added to any estimate with its own amount and treatment (per-resource-week, per-engagement, pass-through or marked-up), and it carries onto the cost breakdown and the calibration comparison | **NEW** | `estimate_cost_lines` |

> **CONCRETE EXAMPLE**  The SOC 2 Type II baseline for a mid-market first-time client is a team of four over twelve weeks: one lead consultant for 12 weeks, two security analysts for 8 weeks each, one compliance analyst for 6 weeks, and QA and review for 2 weeks. Because no completed engagement effort has been captured yet, it carries a Low confidence band and is declared judgement-based. Once delivered effort accumulates, the band is derived from the spread across completed engagements instead.

### 4.2 Scope & sizing model

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-08 | Hold a driver library with weights — headcount band, cloud environments, physical locations, security maturity, prior certification, in-scope systems, parallel frameworks | Each driver has a defined value set and a weight, editable by an entitled role | **NEW** | New `sizing_drivers` |
| FR-P4-09 | Compose multiple drivers into a single multiplier under stated composition rules, applied to **weeks, team size, or both** | The composed multiplier and each contributing driver are shown on the estimate, and the driver states whether it lengthens the engagement, enlarges the team, or does both | **NEW** — reviewed 25 Aug: a driver that adds a cloud environment may add weeks or add an analyst, and those cost differently | Sizing service |
| FR-P4-10 | Guard against implausible compounding with a configurable multiplier ceiling | A composition exceeding the ceiling is capped and flagged for review rather than applied silently | **NEW** | Sizing service |
| FR-P4-11 | Capture driver values through a scoping questionnaire that records each answer's source and confidence | Every driver value on an estimate carries who supplied it and how confident they were | **NEW** | New questionnaire UI |
| FR-P4-12 | Capture scope inclusions, exclusions and client obligations as structured items | Each is a discrete record that carries through unchanged to the quotation | **NEW** | New `scope_items` |
| FR-P4-13 | Re-size on scope change and show the effort and cost delta explicitly | A scope change produces a named delta in resource-weeks and cost — which roles gained or lost how many weeks — not a silently revised total | **NEW** | Sizing service |

> **CONCRETE EXAMPLE**  Northwind has 180 staff (band 100–250, neutral), three cloud environments (+15%), two locations (+5%), and no prior certification (+10%). Drivers compose to a 1.30 multiplier, taking the twelve-week baseline to roughly sixteen weeks of the same team shape. Each driver, its source, and whether it stretched the schedule or grew the team is retained, so the sizing can be defended or corrected later.

### 4.3 Cost engine

> **BOUNDARY NOTE**  In the source document these cost facts lived in a separate platform and were unreachable by design. Absorbed into this platform, they are protected by field-level permission and audit instead. Every requirement in this subsection is load-bearing for the security requirements in Section D.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-14 | Hold the three **per-resource weekly cost components** — base, seat and support — with effective dating, at both delivery-role average and named-employee level | Each component has a value, a scope (role or employee), a valid-from and a valid-to. A historic estimate resolves the components that applied on its date. Seat and support default to a company-wide figure and can be overridden per role or per person | **NEW** — reviewed 25 Aug | New `resource_cost_components` |
| FR-P4-15 | Compute labour cost as the sum over resources of loaded weekly cost multiplied by weeks on the engagement | Labour cost is derivable resource by resource and week by week, and reconciles to the total. Each resource line shows base, seat and support separately | **NEW** — reviewed 25 Aug: resource-weeks, not role-hours | Cost engine service |
| FR-P4-16 | Hold non-labour cost lines, each marked pass-through or marked-up | Pass-through lines appear at cost on the quotation; marked-up lines contribute to margin | **NEW** | `estimate_cost_lines` |
| FR-P4-17 | Apply **GNR (gross non-recoverable)** as a versioned percentage uplift on the engagement total, covering bench time, rework and unbilled travel | The GNR rate and its policy version are retained on the estimate. The base it applies to defaults to the full total including non-labour, and is configurable to labour-only | **NEW** — reviewed 25 Aug: replaces the "overhead policy" of the initial draft, which was the wrong concept | New `gnr_policies` |
| FR-P4-18 | Support **blended costing** at delivery-role averages and **named costing** at the cost of the specific people proposed | Both modes produce a total from the same team shape; the difference between them is displayed. Blended is the default before a team is chosen | **NEW** — central to this model, since a team is N named employees with different roles | Cost engine service |
| FR-P4-19 | Present a cost breakdown by role, stage and line item **only** to entitled roles | A user without the cost entitlement sees the price and never the cost — in the UI, in exports, in reports, in the API and in the AI assistant | **NEW** | Cost engine + NFR-SEC-04 |
| FR-P4-20 | Present a permission-safe cost summary to non-entitled roles where one is needed | Non-entitled roles see a margin band or a health indicator, never a currency cost figure | **NEW** | Cost engine service |

> **CONCRETE EXAMPLE**  Northwind's sized team is one lead consultant for 16 weeks, two security analysts for 10 weeks each, one compliance analyst for 8 weeks, and QA for 3 weeks. Each resource's loaded weekly cost is its base rate plus a seat cost for laptop and infrastructure plus a support allocation for HR and admin. Summed across the team and their weeks, that gives the labour subtotal. Non-labour adds the external auditor fee — passed through at cost, not marked up — plus tooling. GNR is then applied to the total to cover bench time and rework. Every one of those figures arrived pre-filled and any of them can be overridden, with the override recorded.

### 4.4 Capacity feasibility

Feasibility depends on a workforce data source that does not exist yet. The requirements are stated in full so the interface is designed correctly now; FR-P4-27 defines the interim behaviour and Section F sequences the real thing last.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-21 | Derive the required staffing shape from sized effort — which delivery roles, how many of each, across which calendar weeks | A staffing shape is produced from any sized estimate without further input | **NEW** | Feasibility service |
| FR-P4-22 | Search for qualified and available people combining skill, certification, proficiency and forecast availability | The search returns candidates satisfying all four constraints in the target window | **NEW** — requires a workforce data source | Feasibility service |
| FR-P4-23 | Return the earliest realistic start date with the specific constraint that sets it **named**, not implied | The verdict states, for example, "22 October — constrained by SOC 2 qualified lead, 85% allocated to 20 October" | **NEW** | Feasibility service |
| FR-P4-24 | Produce a contention list of other pipeline opportunities and committed engagements competing for the same scarce people | Contention is visible before the quote is sent | **NEW** | Feasibility service |
| FR-P4-25 | Offer alternative staffing options — later start, different mix, partial contractor, mentored junior — each with its cost and risk consequence | At least one alternative is presented with its delta against the primary option | **NEW** | Feasibility service |
| FR-P4-26 | Treat feasibility as a **gate**: a quotation carrying a start date the organization cannot support cannot be sent without a recorded override | Sending against an infeasible date requires an entitled approver and writes an override record with a reason | **NEW** — see open question Q-4 | Quotation service |
| FR-P4-27 | Until a workforce data source exists, accept a manually entered earliest start with a named constraint, and mark the verdict unverified | The quotation shows the date as manually asserted rather than system-verified | **NEW** — interim behaviour | Feasibility service |

> **CONCRETE EXAMPLE**  Northwind needs a SOC 2-qualified lead from 1 October for roughly twelve weeks. The only qualified lead is 85% allocated until 20 October, so the desk returns an earliest realistic start of **22 October** and names the constraint. The quote goes out with the date delivery can honour, not the date the client asked for.

### 4.5 Price & margin model

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-28 | Hold target margins by service line, client segment and commercial model, applied as **guidance rather than as the price** | A target margin resolves for any combination and suggests a price, but the quoted figure is set by the estimator against the market. Live margin against cost is displayed as the number moves | **NEW** — reviewed 25 Aug: cost sets the floor, the market sets the number | New `margin_targets` |
| FR-P4-29 | Support fixed-price, time-and-material, retainer and milestone commercial models | Each model prices correctly from the same cost basis and produces its own payment structure | **NEW** | Pricing service |
| FR-P4-30 | Apply contingency automatically from the estimate's confidence band | A Low-confidence estimate attracts contingency at the configured rate; Medium and High do not unless overridden with a reason | **NEW** | Pricing service |
| FR-P4-31 | Hold rate cards and published price lists with effective dating and client-specific agreed rates | A time-and-material quote resolves the correct rate for the client and the date | **NEW** | New `rate_cards` |
| FR-P4-32 | Enforce discount and margin floors with approval thresholds | A price below the floor cannot be approved without an entitled approver; the approval records who, when and why | **NEW** | Pricing + approval workflow |
| FR-P4-33 | When a price is reduced, require an explicit choice between discounting and de-scoping | The user must select one; a de-scope re-sizes the estimate, a discount does not | **NEW** — this is the argument of the entire source document | Pricing service |
| FR-P4-34 | Compare scenarios side by side — price, cost and margin under alternative scope, staffing and discount options | At least two scenarios are comparable in one view before one is approved | **NEW** | Pricing UI |
| FR-P4-35 | Publish price and approval state to Pillar 2, and permission-gated cost and margin to Pillar 7 | The opportunity amount comes from the approved price; the revenue pillar can compute realized margin | **NEW** | P4 to P2, P4 to P7 |

> **CONCRETE EXAMPLE**  At a 35% target margin, Northwind's INR 11,54,330 cost prices at INR 17,75,892, rounded to a quoted **INR 18,00,000** — an actual margin of 35.9%. Medium confidence adds no contingency. The price sits above the 28% floor, so no approval exception is required.

### 4.6 Bid decision

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-36 | Run an **absolute** test: margin against floor, cost confidence, payment terms and commercial risk | The absolute verdict is shown with each contributing factor | **NEW** | Decision service |
| FR-P4-37 | Run a **relative** test: opportunity cost of the constrained roles, scored against competing pipeline opportunities in the same window | Competing demand is surfaced **before** the quote is sent, with the displaced opportunity's value and probability | **NEW** | Decision service |
| FR-P4-38 | Score delivery risk from estimate confidence, client-side dependency exposure, service novelty and external auditor availability | A delivery risk score with its four inputs is shown on the decision | **NEW** | Decision service |
| FR-P4-39 | Apply strategic weighting for reference value, target-segment entry, partner relationship and follow-on potential | Strategic factors are recorded and can override an unfavourable economic verdict, with the override reasoned | **NEW** | Decision service |
| FR-P4-40 | Record a recommendation — bid, bid with conditions, re-scope, or decline — with reasoning retained and testable against the eventual outcome | The recommendation, its reasoning and the actual outcome are comparable after close | **NEW** | New `bid_decisions` |

> **CONCRETE EXAMPLE**  Northwind clears the floor at 35.9%. But the same lead constrains a pipeline ISO 27001 opportunity worth INR 24,00,000 at 42% margin in an overlapping window, and both cannot be staffed. The desk surfaces the contention before the quote goes out and recommends bidding with a 22 October start that sequences the two, rather than discovering the collision after both are won.

### 4.7 Quotation

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-41 | Generate the quotation document from the approved basis — price, commercial model, delivery window, milestones and payment schedule | No figure on the quotation is typed by hand; every one traces to the approved estimate | **NEW** | Quotation service + PDF renderer |
| FR-P4-42 | Carry scope, exclusions, assumptions and client obligations onto the quotation verbatim from the sizing model | Each structured scope item appears on the document unchanged | **NEW** | Quotation service |
| FR-P4-43 | Set a validity period and price expiry, and require re-approval when a lapsed quotation is revived | A quotation past its validity date cannot be accepted without re-approval | **NEW** | Quotation service |
| FR-P4-44 | Maintain quotation version history recording what changed between revisions and who approved each | Any two revisions are diffable, and each carries its approver | **NEW** | New `quotation_versions` |
| FR-P4-45 | Track quotation state: draft, pending approval, approved, sent, revised, expired, accepted, rejected | State transitions are recorded with timestamps and are visible on the opportunity | **NEW** | New `quotations` table |
| FR-P4-46 | Assemble commercial terms and hand them to Pillar 5 for negotiation and signature | Accepting a quotation creates or populates the contract record without re-keying | **NEW** | P4 to P5 |

### 4.8 Estimate freezing and calibration

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P4-47 | Freeze the estimate on quotation approval — sized effort, catalog version, sizing drivers, cost rates, overhead policy and approver | After approval the estimate record is immutable; a change produces a new revision instead | **NEW** | `estimates` + DB constraint |
| FR-P4-48 | Retain lost bids with price, competitor and stated reason | A lost quotation remains queryable with its full basis | **NEW** | `quotations` |
| FR-P4-49 | Capture delivered effort as **resource-weeks by delivery role and delivery stage**, against the same structure the estimate used | Each engagement accumulates who worked on it, in which delivery role, during which stage, for how many weeks. Comparable to the estimate without translation | **NEW** — reviewed 25 Aug: **confirmed in scope**. Nothing today can produce this. `personal_tasks.hoursSpent` is self-reported, optional, carries no role and no stage, and links to a project only sometimes | New engagement effort capture, P6 + FR-P4-54 |
| FR-P4-50 | Compare delivered against estimated **per role and per stage**, not only in total | The comparison view breaks down by both dimensions so offsetting errors do not cancel | **NEW** | Calibration service |
| FR-P4-51 | Attribute each variance to a cause: inaccurate baseline, mis-read sizing driver, unpriced scope change, client-side dependency, or delivery problem | Every variance carries an attribution; only the first two revise the catalog | **NEW** | Calibration service |
| FR-P4-52 | Revise baseline team shape, week counts and confidence bands as a new dated version where evidence supports it | Prior estimates continue to point at the version they were built from | **NEW** | Calibration service |
| FR-P4-53 | Feed realized margin against quoted margin back into target margins, contingency rules and discount floors | The pricing loop is closed and its inputs are inspectable | **NEW** | Calibration service |

> **IMPORTANT CONTROL**  An estimate must never be overwritten by actuals. Retain the original estimate, the catalog version and sizing drivers it was built from, the approver and the date, then compare against delivered effort. Overwriting the estimate destroys the only signal that tells you the estimates are wrong.

### Features — Pillar 4

**Delivery-role setup** — the role taxonomy the whole pillar rests on · **catalog manager** with team-shape-over-weeks baselines by service and stage, confidence bands and version history · **scoping questionnaire** capturing drivers with source and confidence · **estimate builder** showing baseline → drivers → team and weeks → cost → price as one traceable chain, every field pre-filled and editable · **custom cost variables** added per estimate · **cost breakdown panel** by resource, week and layer, visible only to users holding the financial permission · **blended-versus-named team costing toggle** · **feasibility check** returning earliest start with the named constraint and a contention list · **scenario comparison** across scope, staffing and discount options · **discount-or-descope decision prompt** · **bid decision card** with absolute, relative, risk and strategic verdicts · **quotation generator** with versioned templates, validity period and approval trail · **engagement effort capture** by role, stage and week · **estimate vs actual calibration report** with variance attribution.

---

## Pillar 5 — Contract & Commercial Agreement

*What have we committed to, on what terms, and is it signed and funded?*

The existing `onboardings` table is a good seed — it already tracks MSA, NDA and SOW status with dates, the negotiated engagement amount with a variance reason, payment terms, the PO, first payment and kickoff. Three structural facts stop it being a contract module:

1. **It is strictly one-to-one with a deal**, `UNIQUE NOT NULL` with cascade delete. A client cannot have two contracts, a renewal, or an amendment.
2. **Documents are status triplets, not documents.** There is no file anywhere in the system — file storage is configured in `.env.example` and read by no code.
3. **It is super-admin only**, which is right for a small module and wrong for the pillar that gates delivery and billing.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| ~~FR-P5-01~~ | ~~Model a contract as a first-class entity relating to zero, one or many opportunities~~ | — | **WITHDRAWN** 25 Aug — one contract per opportunity is genuinely how the business works. `onboardings.deal_id` stays `UNIQUE NOT NULL`. A **renewal is a new opportunity with its own contract**, not a child of the old one. Amendments and change orders attach to the existing contract as child records (FR-P5-09, FR-P5-10) | — |
| FR-P5-02 | Track document lifecycle for MSA, NDA, SOW and amendments through required, drafted, sent, under negotiation, signed | All five states are representable per document, with dates and counterparty | **PARTIAL** — only `not_required / pending / sent / signed`; drafted and under-negotiation are missing | `OnboardingDocumentStatus` |
| FR-P5-03 | Store the actual document file against the contract, versioned | A signed MSA, NDA, SOW or amendment is uploaded, retrieved, superseded by a new version with the prior kept, access-controlled and downloadable. **No e-signature integration** — documents are signed outside and the signed copy uploaded | **NEW** — reviewed 25 Aug. No upload path exists anywhere in the application; `STORAGE_TYPE`, `STORAGE_LOCAL_PATH` and `S3_*` are declared in `.env.example` and read by no code | New storage service, FR-X-14 |
| FR-P5-04 | Hold the negotiated engagement value alongside the quoted value with an explicit variance reason | Both figures and the reason are retained; neither overwrites the other | **EXISTS** | `engagementAmount`, `amountVarianceReason`, `deals_with_value` |
| FR-P5-05 | Record contracted scope as structured deliverables, exclusions, service levels, dependencies and client obligations | Each is a discrete item carried from the quotation and referenceable by Pillar 6 | **NEW** — scope exists only as free-text notes | New `contract_scope_items` |
| FR-P5-06 | Hold commercial terms: payment terms, purchase order, taxes and commercial model | All four are stored and reportable | **PARTIAL** — payment terms and PO exist; taxes and commercial model do not | `onboardings` |
| FR-P5-07 | Hold a billing schedule whose instalments are triggered **by a date or by a delivery milestone** | A contract carries any number of instalments, each with an amount or percentage and either a due date or a named milestone from Pillar 6. A 40% on signature / 60% on certification split and a monthly retainer are both representable. When a milestone-triggered instalment's milestone slips, the expected billing date moves with it | **NEW** — reviewed 25 Aug: both trigger types. Only a single `firstPaymentAmount` exists today | New `billing_schedules` |
| FR-P5-17 | Record each **payment received against its instalment** on the contract | A receipt carries date, amount and reference, and attaches to the instalment it settles. The contract shows what has been paid and what is outstanding without leaving the record | **NEW** — reviewed 25 Aug. Today only `firstPaymentAmount` and `firstPaymentReceivedAt` exist, so a second payment has nowhere to go | New `receipts`, shared with P7 |
| FR-P5-16 | Hold the statutory and practical **invoicing details** on the client: GSTIN, place of supply, SAC code, billing address and invoicing contact | An invoice raised in Pillar 7 carries everything an Indian tax invoice legally requires, without anyone re-typing it | **NEW** — reviewed 25 Aug. A grep of the entire schema for GSTIN, tax or billing address returns nothing; `companies` has a postal address with no billing designation | `companies` + contract |
| FR-P5-08 | Enforce a kickoff readiness gate: delivery cannot start until stated preconditions are met | Attempting to start delivery against an unsigned or unfunded contract is blocked or requires a recorded override | **PARTIAL** — the stage sequence implies the gate but nothing enforces it | Contract service |
| FR-P5-09 | Support change orders that revise scope and value, as **child records of the existing contract** | A change order carries its own value delta, approver and effective date, and updates the contract total without erasing the original figure | **NEW** — reviewed 25 Aug: attaches to the contract rather than creating one, since the contract stays 1:1 with its opportunity | New `change_orders` |
| FR-P5-10 | Support amendments to an existing contract, retaining what was amended | The contract shows its amendment chain, each with its document, effective date and approver | **NEW** — reviewed 25 Aug: child records of the same contract | New `contract_amendments` |
| FR-P5-11 | Hold end date, notice period and termination provisions, and surface expiring contracts in advance | Contracts within N days of their end date appear as an exception in Pillar 8. **A renewal is raised as a new opportunity**, which then creates its own contract in the normal way | **NEW** — reviewed 25 Aug | `onboardings` + P8 |
| FR-P5-12 | Record stage moves on a contract as append-only history | Every stage transition carries who moved it, when, and any note | **EXISTS** | `onboarding_stage_history` |
| FR-P5-13 | Publish contracted scope, deliverables, dates and obligations to Pillar 6, and the billing schedule and recognizable value to Pillar 7 | Delivery and revenue consume the contract rather than re-keying it | **PARTIAL** — the delivery link exists via `convertedToProjectId`; the revenue link has nothing to consume it | P5 to P6, P5 to P7 |
| FR-P5-14 | Auto-create a contract record when an opportunity is won on a sales pipeline | Winning a deal on a pipeline flagged `isSalesPipeline` creates the contract | **EXISTS** | [onboarding.service.ts](../src/server/services/onboarding.service.ts) |
| FR-P5-15 | Grant contract access to **super admins and to users holding the financial permission**, replacing the hard-coded role check | Access is decided by the per-user financial permission from FR-X-05, not by a role slug. Deal owners and delivery leads get **no** contract access | **PARTIAL** — reviewed 25 Aug. [onboarding.router.ts:9](../src/server/trpc/routers/onboarding.router.ts) throws unless `role.slug === 'super_admin'`, on every procedure | [onboarding.router.ts](../src/server/trpc/routers/onboarding.router.ts) |

> **CONCRETE EXAMPLE**  Northwind is quoted INR 18,00,000. After negotiation the SOW is signed at INR 15,50,000 with a recorded variance reason of reduced scope — the penetration test is deferred. Payment terms are 40% on signature and 60% on certification, net 30. The PO arrives eight days later. Only then does the engagement pass the kickoff readiness gate.

### Features — Pillar 5

Contract list and detail with stage board · document status tracking with dates · engagement value with variance reason · payment terms, PO and first payment capture · kickoff scheduling · delivery team assignment · stage history · **document upload and versioning (new)** · **structured contracted scope (new)** · **billing schedule builder (new)** · **enforced kickoff readiness checklist (new)** · **change order and amendment flow (new)** · **renewal and expiry watchlist (new)**.

---

## Pillar 6 — Engagement Delivery & Outcomes

> ### ⚠ NOT YET REVIEWED
>
> **Everything below this line is the unvalidated initial draft.** Pillars 1 to 5 were reviewed on 24–25 Aug 2026; the review was paused here to begin building the cost engine. Requirements in Pillars 6, 7 and 8 and in Section C are still my inferences, not business decisions.
>
> **Known consequence to settle when this pillar is reviewed:** FR-P5-07 now allows milestone-triggered billing, so FR-P6-04 milestones must emit an event Pillar 7 can bill from. The two were reviewed separately and need reconciling.

*What are we delivering, and will it land on time and at the promised outcome?*

Projects exist with stages, progress percentages, team members, compliance-categorised tasks and stage history carrying a real generated `durationHours` column. What is missing is everything that makes delivery a *commercial* signal: there are no milestones, no deliverables, no acceptance, and therefore nothing that can trigger a billing event.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P6-01 | Maintain engagement records linked to their contract, with service type, framework, scope and committed dates | An engagement names its contract and carries the contracted dates separately from any revised ones | **PARTIAL** — projects link to a deal, not to a contract; committed vs revised dates are conflated | [projects.ts](../src/server/db/schema/projects.ts) |
| FR-P6-02 | Support framework-specific delivery stages covering scoping, gap assessment, remediation, readiness review, audit and certification | Stages are configurable per framework rather than one fixed list | **PARTIAL** — one hard-coded eight-value stage union, of which the UI exposes six | [src/lib/projects.ts](../src/lib/projects.ts) |
| FR-P6-03 | Record every stage move with duration | Time in each stage is computed by the database | **EXISTS** | `project_stage_history.durationHours` |
| FR-P6-04 | Define milestones with committed dates, linked to contract billing triggers | A milestone can be marked complete, and completion emits an event Pillar 7 consumes | **NEW** — no milestone concept exists | New `engagement_milestones` |
| FR-P6-05 | Define deliverables with acceptance criteria and client-side sign-off status | A deliverable moves draft → submitted → accepted / rejected, with the client-side acceptor and date | **NEW** | New `deliverables` |
| FR-P6-06 | Track client-side dependencies and blockers separately from internal work | A blocked engagement names whether the blocker is ours or the client's | **PARTIAL** — tasks have a `blocked` status but no ownership attribution | `project_tasks` |
| FR-P6-07 | Track progress against stage with a default per stage | Progress defaults to the stage's percentage and is manually overridable | **EXISTS** | [src/lib/projects.ts](../src/lib/projects.ts) |
| FR-P6-08 | Flag schedule variance against the **committed** date, with an attributed delay reason and a revised date | A delay states its reason, its attribution, the original date and the revised one | **PARTIAL** — `isDelayed`, `delayReason` and `revisedEndDate` exist; attribution does not, and the committed date is overwritten | `projects`, `detectDelayedProjects` |
| FR-P6-09 | Maintain a task list with compliance-specific categories | Documentation, evidence collection, gap remediation, audit prep, policy, training and review are selectable | **EXISTS** | `ProjectTaskCategory` |
| FR-P6-10 | Maintain engagement team membership with roles | Lead, member, reviewer and consultant are assignable and grant visibility | **EXISTS** | `project_members` |
| FR-P6-11 | Record the outcome: audit result, certification achieved, its validity period, exceptions and observations carried forward | A certified engagement records what was certified, until when, and with what exceptions | **NEW** — `certified` is a stage value with no outcome record behind it | New `engagement_outcomes` |
| FR-P6-12 | Surface the commercial consequence of a delay — which billing milestone moves with it and by how much | A delayed engagement shows the revenue timing impact, not only the schedule impact | **NEW** | P6 to P7 to P8 |
| FR-P6-13 | Raise change requests to Pillar 5 when delivery discovers scope movement | A change request created in delivery becomes a change order candidate in the contract | **NEW** | P6 to P5 |
| FR-P6-14 | Let collection status gate further work where the contract says it should | An engagement can be paused on an overdue receivable, with the pause recorded and reversible | **NEW** | P7 to P6 |
| FR-P6-15 | Publish certification outcomes and reference potential back to Pillars 1, 2 and 3 | A certified client is identifiable as a reference, and the partner who sourced it can see the outcome | **NEW** | P6 to P1, P2, P3 |

> **CONCRETE EXAMPLE**  The Northwind SOC 2 Type II engagement is in Remediation, 62% complete, eleven days behind its committed readiness date because three client-side evidence items are outstanding. The delay is attributed to a client dependency, the audit window is re-forecast, and the certification-linked 60% billing milestone moves with it — which is what makes the delay a commercial signal rather than only a delivery one.

### Features — Pillar 6

Kanban and list views with drag-to-move stages · project detail with progress, delay flag and revised end date · compliance-categorised task list · team management with roles · stage history with durations · **milestone plan with billing triggers (new)** · **deliverable register with acceptance and sign-off (new)** · **client dependency tracker (new)** · **outcome and certification record with validity (new)** · **commercial impact panel showing revenue timing at risk (new)** · **change request flow into the contract (new)**.

---

## Pillar 7 — Revenue & Commercial Performance

> ### ⚠ NOT YET REVIEWED
>
> The requirements below are the unvalidated initial draft. The pillar-by-pillar review reached Pillar 5 on 25 Aug 2026 and was paused to build the cost engine.


*What have we earned, what have we collected, and is the relationship profitable?*

Entirely new. The platform currently has exactly one money concept — `deals_with_value.effective_value` — and it represents **contracted** value only. There are no invoices, no receipts, no aging, no recognition, and no distinction between money agreed and money received.

> **ARCHITECTURE PRINCIPLE**  Bookings are not revenue, and revenue is not cash. Reporting a won deal as income overstates performance, hides collection risk, and makes forecasting unreliable.

### Revenue state model

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P7-01 | Hold contracted, invoiced, recognized, collected and forecast value simultaneously and separately for every engagement | All five are retrievable for one engagement at one point in time without derivation from each other | **PARTIAL** — only contracted exists, via `deals_with_value` | New `revenue_states` |
| FR-P7-02 | Reconcile every revenue figure back to a contract and, where applicable, a delivery event | Any revenue number drills to its originating billing event, contract and milestone | **NEW** | Revenue service |
| FR-P7-03 | Report unbilled and work-in-progress balances | Contracted-but-unbilled is a first-class figure on every engagement and rolls up by client and period | **NEW** | Revenue service |
| FR-P7-04 | Apply a stated revenue recognition policy consistently | Recognition follows the documented policy and the policy version is retained on each recognized amount | **NEW** — see open question Q-3 | New `recognition_policies` |

### Billing and collections

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P7-05 | Create billing events from contract schedules and from delivery milestone completion | Completing a milestone in Pillar 6 creates a due billing event without manual entry | **NEW** | New `billing_events` |
| FR-P7-06 | Raise invoices from billing events, with number, date, due date, line items, tax and currency | An invoice is generated, numbered sequentially, and downloadable as a document | **NEW** | New `invoices` |
| FR-P7-07 | Record receipts against invoices, including partial payment | An invoice moves draft → sent → part-paid → paid, with each receipt dated and amounted | **NEW** | New `receipts` |
| FR-P7-08 | Produce receivables aging in standard buckets | Current / 1–30 / 31–60 / 61–90 / 90+ aging by client and by owner | **NEW** | Revenue reporting |
| FR-P7-09 | Record disputes and credit notes against invoices | A disputed invoice is excluded from collectable aging and shows its dispute reason and owner | **NEW** | New `credit_notes` |
| FR-P7-10 | Drive collection follow-up with owners, due dates and escalation | Overdue receivables generate reminders to the named owner and escalate on a schedule | **NEW** | Revenue + notification service |
| FR-P7-11 | Publish collection status to Pillar 6 where it gates further work, and to Pillar 3 where it triggers fee settlement | An overdue receivable can pause delivery; a collected receipt can settle a partner obligation | **NEW** | P7 to P6, P7 to P3 |

### Commercial performance

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P7-12 | Report revenue composition and trend by service line, framework, segment, geography, channel and client | All six dimensions are available on the same revenue measure | **PARTIAL** — pipeline value can be grouped by some dimensions; realized revenue does not exist to group | [metrics.service.ts](../src/server/services/metrics.service.ts) |
| FR-P7-13 | Compute realized margin per engagement using Pillar 4 cost against Pillar 7 collected value | Realized margin is comparable to quoted margin, visible only to entitled roles | **NEW** | P7 with P4 |
| FR-P7-14 | Compute client lifetime value, repeat and expansion revenue, renewal revenue and churn | Each is defined once and reported consistently across the platform | **NEW** | Revenue reporting |
| FR-P7-15 | Report per-client commercial contribution | A client shows revenue, cost, contribution and contribution rate over a selectable period | **NEW** | Revenue reporting |
| FR-P7-16 | Feed realized value and win quality back to Pillar 2, and payment behaviour to Pillar 1 | An account's payment behaviour is visible on the account record and usable in health scoring | **NEW** | P7 to P1, P2 |
| FR-P7-17 | Report forecast revenue by period, distinguishing contracted-not-yet-billed from pipeline-weighted | The two are never summed into one undifferentiated figure | **NEW** | Revenue reporting |

> **CONCRETE EXAMPLE**  Northwind's contract is INR 15,50,000. The 40% signature milestone of INR 6,20,000 is invoiced and collected within terms. The remaining INR 9,30,000 stays contracted-but-unbilled until certification. A referral fee of INR 62,000 settles against the collected portion. The client's lifetime value reaches INR 15,50,000 with a DPDP renewal opportunity forecast for the following quarter.

### Features — Pillar 7

**Revenue ledger** with the five states side by side · **billing event queue** driven by schedules and milestones · **invoice register** with generation and PDF output · **receipt recording with partial payment** · **receivables aging board** by bucket, client and owner · **dispute and credit note handling** · **collection follow-up worklist with escalation** · **revenue composition and trend dashboards** · **per-client contribution report (entitled roles)** · **LTV, renewal, expansion and churn analysis**.

---

## Pillar 8 — Client Intelligence & Executive Dashboard

> ### ⚠ NOT YET REVIEWED
>
> The requirements below are the unvalidated initial draft. The pillar-by-pillar review reached Pillar 5 on 25 Aug 2026 and was paused to build the cost engine.


*Which clients and deals need attention, why, and what action should follow?*

Real capability exists here — Executive Overview, Command Center, configurable widget dashboards, scheduled digests, per-person reports and an AI assistant with a typed tool library. What is missing is the thing the pillar is named for: an **explainable health model** and an **exception workflow with an action trail**. Today the system notifies; it does not track whether anyone did anything.

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-P8-01 | Present an executive overview across all seven other pillars with consistent metric definitions | One page answers client, pipeline, channel, pricing, contract, delivery and revenue posture | **PARTIAL** — covers projects, prospects and people; nothing on contracts, pricing or revenue | [executive-overview.service.ts](../src/server/services/executive-overview.service.ts) |
| FR-P8-02 | Compute an explainable client health score from delivery status, commercial standing, engagement recency, payment behaviour and renewal proximity | The score shows each contributing signal, its weight and its current value; no black box | **NEW** — no health model of any kind exists | New `client_health` |
| FR-P8-03 | Compute deal confidence from qualification completeness, engagement recency, stage velocity and decision-path coverage | Confidence is explainable to its inputs and distinct from the owner's stated probability | **NEW** | P8 with P2 |
| FR-P8-04 | Raise exceptions for stalled deals, unsigned contracts, unfunded work, delivery slippage, aging receivables and churn risk | Each exception class is detected on a schedule and appears in one prioritized queue | **PARTIAL** — stale deals and delayed projects are detected; the other four have no source data yet | [automation.service.ts](../src/server/services/automation.service.ts) |
| FR-P8-05 | Give every exception an owner, a recommended action, an acknowledgement, a resolution and an outcome | An exception moves raised → acknowledged → actioned → resolved, each step timestamped and attributed | **NEW** — notifications are fire-and-forget with no lifecycle | New `exceptions` table |
| FR-P8-06 | Quantify the commercial impact of an exception | An exception states the value at risk, not only that something is wrong | **NEW** | Exception service |
| FR-P8-07 | Route each exception to the pillar that owns the fix, with a deep link into the record | Acting on an exception takes the user to the exact record and action | **NEW** | Exception service |
| FR-P8-08 | Provide scorecards by segment, service line, channel, client and engagement, with targets and thresholds | A scorecard compares actual to target and colours by threshold | **PARTIAL** — widgets can display metrics; there is no target or threshold model | New `targets` table |
| FR-P8-09 | Support drill-down from any aggregate to the individual source record | Company revenue reconciles down to segment, client, engagement, contract and billing event | **PARTIAL** — some widgets drill; reconciliation to source is not guaranteed | Dashboard + reporting |
| FR-P8-10 | Let users build and share dashboards with widgets, visibility settings and public tokens | Dashboards are created, arranged, published and scheduled | **EXISTS** | [dashboards.ts](../src/server/db/schema/dashboards.ts) |
| FR-P8-11 | Deliver scheduled digests over email and chat, rendered from a dashboard | A digest binds a dashboard to a schedule and a recipient list and sends server-rendered widgets | **EXISTS** | [digest.service.ts](../src/server/services/digest.service.ts) |
| FR-P8-12 | Answer natural-language questions over the platform, scoped to the asker's permissions | The assistant answers with typed tools, falls back to validated SQL, and never returns data the asker cannot see | **EXISTS** | [ai-chat.service.ts](../src/server/services/ai-chat.service.ts), [sql-safety.service.ts](../src/server/services/sql-safety.service.ts) |
| FR-P8-13 | Extend permission-scoped answering to cost, margin and collections data | The assistant refuses or redacts cost and margin for non-entitled askers, in typed tools and in raw SQL | **NEW** — critical dependency of Decision D-1 | AI tools + SQL safety layer |
| FR-P8-14 | Maintain an audit trail of alert acknowledgement, action taken, outcome and revised forecast | The trail is queryable and survives the exception being closed | **NEW** | `exceptions` + [audit-log.ts](../src/server/db/schema/audit-log.ts) |
| FR-P8-15 | Report per-person performance over consistent periods with like-for-like comparison to the prior period | Individual reports with presets, weekly breakdown, prior-period comparison, and PDF/CSV export | **EXISTS** | [report.service.ts](../src/server/services/report.service.ts) |

> **CONCRETE EXAMPLE**  Northwind is marked At Risk: the engagement is eleven days behind, INR 9,30,000 is contracted but unbilled, the certification milestone has moved, and the renewal conversation is due in six weeks. The dashboard explains each contributing signal, quantifies the exposure, and recommends escalating the client-side evidence dependency, re-forecasting the billing milestone, and opening the DPDP renewal early. Each action is executed in the pillar that owns it.

### Features — Pillar 8

Executive overview with per-member drill-down · Command Center daily operational snapshot · build-your-own widget dashboards with grid layout and public sharing · scheduled email and Telegram digests · per-person and team reports with PDF/CSV/XLSX export · AI assistant with typed tools and a validated SQL escape hatch · command palette · notification bell · **explainable client health card (new)** · **prioritized exception queue with owner, action and resolution (new)** · **target and threshold management (new)** · **reconciling drill-down paths (new)**.

---

# Section C — Cross-cutting functional requirements

> ### ⚠ NOT YET REVIEWED
>
> The requirements below are the unvalidated initial draft. The pillar-by-pillar review reached Pillar 5 on 25 Aug 2026 and was paused to build the cost engine.


Owned by the platform rather than by any pillar. Several of these are prerequisites for Pillar 4 and cannot be deferred behind it.

## Identity and access

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-X-01 | Authenticate users with credentials and maintain a session | Login, logout and session expiry work; failed logins are logged | **EXISTS** | NextAuth v5, JWT, 7-day sessions |
| FR-X-02 | Define roles with a declarative per-module permission matrix supporting denied / own / team / all | Permissions are editable per role from Settings and enforced in the API layer | **EXISTS** | [permissions.ts](../src/server/lib/permissions.ts), [middleware.ts](../src/server/trpc/middleware.ts) |
| FR-X-03 | Scope record visibility by ownership, creation and team membership | A user outside the full-visibility set sees only records they own, created, or are on the team of | **EXISTS** | [visibility-filters.ts](../src/server/lib/visibility-filters.ts) |
| FR-X-04 | Make record visibility configurable per role rather than hard-coded by role slug | Creating a custom role with full visibility does not require a code change | **PARTIAL** — `FULL_VISIBILITY_ROLES` is a hard-coded slug set; a custom role is scoped-by-default regardless of its permission blob | [visibility-filters.ts](../src/server/lib/visibility-filters.ts) |
| FR-X-05 | Add a **financial permission granted per user**, governing cost components, delivery cost, margin and collections data, independent of role and of record-level permission | The permission is assigned and revoked against an individual user, not their role, so entitling one person does not entitle everyone sharing their role. A user may hold `all` record visibility and still be denied cost and margin. Grants and revocations are audited | **NEW** — reviewed 25 Aug (**closes Q-1**). This is the control that replaces the platform boundary removed by Decision D-1 | New entitlement layer, `users` |
| FR-X-06 | Enforce field-level redaction through a **single** centralised helper, not per-surface | Adding a new surface that returns money inherits redaction by default rather than by remembering to add it | **NEW** — role-based money restriction is currently reimplemented in seven separate files | New redaction service |
| FR-X-07 | Issue and revoke read-only API tokens for external automation | Tokens are hashed at rest, shown once, and revocable | **EXISTS** | [api-token.service.ts](../src/server/services/api-token.service.ts) |

## Time, taxonomy and reproducibility

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-X-08 | Provide a shared time model for fiscal periods, contract terms, attribution windows, revenue periods and forecast horizons | One definition of "this quarter" is used by every report and every pillar | **PARTIAL** — report presets exist; there is no fiscal period model | [report.service.ts](../src/server/services/report.service.ts) |
| FR-X-09 | Apply effective dating to cost rates, rate cards, overhead policies, catalog versions and margin targets | Any historic estimate resolves the exact values that applied on its date | **NEW** | Pillar 4 tables |
| FR-X-10 | Maintain canonical taxonomies for client status, opportunity stage, service line, contract type, delivery stage, role and sizing driver | Estimates and actuals use the same role and stage vocabulary so they are comparable without translation | **PARTIAL** — service lines exist in two places with different value sets ([constants.ts](../src/lib/constants.ts) and `ProjectServiceType`); there is no role taxonomy at all | [types.ts](../src/lib/types.ts), [constants.ts](../src/lib/constants.ts) |
| FR-X-11 | Support user-defined custom fields on core entities without a schema change | 18 field types, defined in Settings, stored per record | **EXISTS** | [custom-fields.ts](../src/server/db/schema/custom-fields.ts) |

## Workflow, documents and audit

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-X-12 | Provide a reusable approval workflow: request, approver resolution, decision, reason and trail | Used by margin floor breaches, lapsed quotation revival, feasibility override, shared-credit adjudication and write-offs | **NEW** — no approval concept exists anywhere | New approval service |
| FR-X-13 | Provide notification, escalation and due-date services usable by any pillar | An exception can notify, wait, and escalate without each pillar rebuilding it | **PARTIAL** — notifications and digests exist; escalation does not | [notification.service.ts](../src/server/services/notification.service.ts) |
| FR-X-14 | Provide file storage with upload, retrieval, versioning and access control | A contract document, a quotation PDF and an evidence attachment can all be stored and retrieved | **NEW** — `STORAGE_TYPE`, `STORAGE_LOCAL_PATH` and `S3_*` exist in `.env.example` and no code reads them | New storage service |
| FR-X-15 | Generate documents from versioned templates | Quotations and commercial terms render from a template, versioned so a reissued document is reproducible | **PARTIAL** — server-side PDF rendering exists for reports; there is no template model | [report-pdf.tsx](../src/server/lib/report-pdf.tsx) |
| FR-X-16 | Write an audit entry for every mutation, with actor, IP and a JSON diff | The audit log is queryable by entity and by user and survives user deletion | **EXISTS** | [audit-log.ts](../src/server/db/schema/audit-log.ts) |
| FR-X-17 | Record metric lineage so any reported number can be traced to its definition and inputs | Each dashboard metric names its source measure and filter set | **NEW** | Reporting layer |
| FR-X-18 | Import and export core entities as CSV, with mapping, validation and Excel-safe output | Import validates with Zod and rejects bad values; export honours filters and force-quotes phone columns | **EXISTS** | [ImportWizard.tsx](../src/components/import-export/ImportWizard.tsx) |

## Integration boundaries

| ID | Requirement | Acceptance | Status | Lands in |
|---|---|---|---|---|
| FR-X-19 | Define an integration boundary for a workforce platform supplying availability, skills, certifications and delivered effort | The contract is specified even before a provider exists, so Pillar 4 can be built against it | **NEW** | Feasibility + calibration |
| FR-X-20 | Define an integration boundary for finance and accounting supplying vendor cost and consuming invoices | Invoices and receipts can be exported or synced | **NEW** | Pillar 7 |
| FR-X-21 | Define an integration boundary for electronic signature | A contract document can be sent for signature and its returned status recorded | **NEW** | Pillar 5 |
| FR-X-22 | Define an integration boundary for calendar | Kickoff and audit windows create real calendar events | **NEW** — kickoff is currently a timestamp plus a free-text link | Pillar 5, Pillar 6 |
| FR-X-23 | Maintain chat integrations for logging and retrieval from outside the browser | Telegram, WhatsApp and Teams share one transport-agnostic command layer | **EXISTS** | [bot-commands.service.ts](../src/server/services/bot-commands.service.ts) |
| FR-X-24 | Deliver transactional and scheduled email with provider failover | Resend primary, SMTP fallback, one retry, no retry on rate limit | **EXISTS** | [mailer.ts](../src/server/lib/mailer.ts) |

---

# Section D — Non-functional requirements

## Security & access control

The absorb decision moves cost and margin data inside the same database, the same API and the same AI assistant that Analysts already query. These requirements are what pay for that decision. They are not optional hardening.

| ID | Requirement | Measure |
|---|---|---|
| NFR-SEC-01 | All traffic over TLS; no credential, token or cost figure in a URL or a log line | Verified by log inspection and header audit |
| NFR-SEC-02 | Passwords hashed with bcrypt at the configured cost factor; API tokens stored as SHA-256 with plaintext shown once | Verified in [api-token.service.ts](../src/server/services/api-token.service.ts) and the auth layer |
| NFR-SEC-03 | Authorization enforced server-side in the API layer, never by hiding UI | Every restricted procedure rejects an unauthorized caller even when invoked directly |
| NFR-SEC-04 | **Cost rates, delivery cost, margin and collections data are readable only by the cost entitlement**, enforced in a single redaction helper applied at the service boundary | A non-entitled user receives the redacted shape from every surface: UI, tRPC, REST metrics API, CSV/XLSX/PDF export, scheduled digest, and AI assistant |
| NFR-SEC-05 | The SQL safety layer must blocklist cost, rate, margin and overhead columns in addition to the existing financial columns | A generated query referencing `role_cost_rates` or any margin column is rejected before execution, for every role that lacks the entitlement |
| NFR-SEC-06 | AI assistant typed tools must never return cost or margin to a non-entitled asker, and must not be able to infer it from a permitted aggregate | Reviewed per tool; tested with adversarial prompts |
| NFR-SEC-07 | Every read of an individual cost rate writes an audit entry naming the actor and the record | Cost rate access is queryable in the audit log |
| NFR-SEC-08 | Redaction is default-deny: a newly added field returning money is redacted until explicitly permitted | Enforced by the shape of the redaction helper, not by convention |
| NFR-SEC-09 | Adding a new surface that exposes money requires no new redaction code | Demonstrated by adding one surface and confirming inherited behaviour |
| NFR-SEC-10 | Cost, margin and collections data are excluded from any publicly shared dashboard token | A published dashboard containing a restricted widget either refuses to publish or omits the widget |
| NFR-SEC-11 | Session expiry, forced logout on role change, and re-authentication for entitlement changes | Verified by test |

> **RISK STATEMENT**  Role-based money restriction is currently reimplemented in seven separate files — `crm-read.tools.ts`, `reporting.tools.ts`, `activity.tools.ts`, `escape-hatch.tools.ts`, `reports.router.ts`, `search.router.ts` and `partner.router.ts` — with an eighth rule, the financial-column blocklist, inside [sql-safety.service.ts](../src/server/services/sql-safety.service.ts). That pattern is already fragile at seven copies. Extending it to cost rates and margin without first consolidating it (FR-X-06) is the single largest security risk introduced by Decision D-1.

## Privacy and data protection

| ID | Requirement | Measure |
|---|---|---|
| NFR-PRIV-01 | Personal data handling meets DPDP Act obligations for notice, purpose limitation, and data-principal rights | Reviewed against the Act; a data-principal request can be fulfilled |
| NFR-PRIV-02 | Pricing, margin and collections data are accessed by purpose as well as by role | Purpose is recorded on access to the most sensitive classes |
| NFR-PRIV-03 | Stated retention periods for activity, audit, chat message logs and AI chat history, with enforced deletion | Retention job runs and is verifiable |
| NFR-PRIV-04 | Contact and account data can be exported and erased on request, with erasure recorded | Verified end-to-end |

## Auditability and immutability

| ID | Requirement | Measure |
|---|---|---|
| NFR-AUD-01 | Every mutation to a core record produces an audit entry with actor, IP, timestamp and JSON diff | Verified by inspection of the audit log after a change |
| NFR-AUD-02 | `createdBy` is immutable on every core record, even when ownership is reassigned | Enforced at the service layer |
| NFR-AUD-03 | Stage history on opportunities, contracts and engagements is append-only | No update or delete path exists on history tables |
| NFR-AUD-04 | An approved estimate is immutable; a change creates a new revision | Enforced by database constraint, not by convention |
| NFR-AUD-05 | Quoted, contracted, invoiced, recognized and collected values are each retained; none overwrites another | Verified by querying all five for a completed engagement |
| NFR-AUD-06 | Every approval, override and floor breach records who, when and why | No approval path allows an empty reason |

## Reproducibility

| ID | Requirement | Measure |
|---|---|---|
| NFR-REP-01 | Any estimate from any past date can be reproduced exactly, with the catalog version, sizing drivers, cost rates and overhead policy it used | Recomputing a six-month-old estimate returns the identical figure |
| NFR-REP-02 | Effective-dated records are never hard-updated; a rate change creates a new dated row | Verified by schema design |
| NFR-REP-03 | Reports over a closed period return the same numbers when re-run | Verified by snapshot comparison |

## Performance and scale

| ID | Requirement | Measure |
|---|---|---|
| NFR-PERF-01 | List views return within 500 ms at the 95th percentile for 100,000 contacts, 20,000 accounts and 20,000 opportunities | Load-tested |
| NFR-PERF-02 | Dashboard widgets render within 2 s at the 95th percentile; a scheduled digest renders within 30 s | Measured |
| NFR-PERF-03 | An estimate recalculation returns within 1 s; a feasibility check within 3 s | Measured |
| NFR-PERF-04 | AI assistant SQL queries are capped at 500 rows and 5 seconds | **EXISTS** — enforced in [sql-safety.service.ts](../src/server/services/sql-safety.service.ts) |
| NFR-PERF-05 | Exports are bounded — 5,000 contacts, 10,000 activity rows — and the bound is stated in the output | **EXISTS** |
| NFR-PERF-06 | Every predicate used for filtering, soft-delete exclusion and visibility scoping is indexed | Verified by query plan review |

## Availability and resilience

| ID | Requirement | Measure |
|---|---|---|
| NFR-AVL-01 | Target 99.5% monthly availability for the application | Measured against the `/api/health` endpoint |
| NFR-AVL-02 | Email delivery fails over from primary to secondary provider automatically, with one retry and no retry on rate limit | **EXISTS** — [mailer.ts](../src/server/lib/mailer.ts) |
| NFR-AVL-03 | Scheduled jobs are idempotent and guarded against double-registration and double-firing on manual run | **EXISTS** — [cron.ts](../src/server/lib/cron.ts), `automation_config` |
| NFR-AVL-04 | API responses must remain unbuffered and uncompressed on `/api/*` | **EXISTS and must be preserved.** `Cache-Control: no-store`, `X-Accel-Buffering: no`, `compress: false` are a deliberate workaround for transparent proxies at Indian carriers mangling compressed and buffered responses. See [src/proxy.ts](../src/proxy.ts) and [next.config.ts](../next.config.ts). This is a requirement, not cruft |
| NFR-AVL-05 | Database migrations apply automatically on deploy and are forward-only | **EXISTS** — `npm run db:migrate && npm start` |
| NFR-AVL-06 | Backup with a stated recovery point and recovery time objective | Documented and tested by restore |

## Data quality and integrity

| ID | Requirement | Measure |
|---|---|---|
| NFR-DQ-01 | Constrained value sets are enforced by the database, not only by the application | **Currently not met.** Almost every enum-like column is a plain `varchar` with a TypeScript union over it; only five columns carry `CHECK` constraints. Any write outside the app can store an arbitrary string. Pillar 4 and 7 tables must not repeat this |
| NFR-DQ-02 | Money is stored as a fixed-precision decimal, never a float, with an explicit currency on every amount | Verified by schema review |
| NFR-DQ-03 | Soft delete is applied consistently and cheaply | **PARTIAL** — `deletedAt` exists on five tables and is enforced by convention; each has a partial index. New tables must state their policy explicitly |
| NFR-DQ-04 | Referential integrity is enforced by foreign keys with an explicit delete policy per relationship | Verified by schema review; cascade is used only where the child cannot outlive the parent |
| NFR-DQ-05 | Import rejects invalid values rather than storing them | **EXISTS** — Zod validation in the import path |
| NFR-DQ-06 | Data-quality exceptions are measured and reported, not merely detectable | Data-quality panel with counts and trend |

## Usability, accessibility and localization

| ID | Requirement | Measure |
|---|---|---|
| NFR-UX-01 | Currency defaults to INR and formats in lakh and crore conventions | **EXISTS** |
| NFR-UX-02 | Timezone defaults to `Asia/Kolkata`; all scheduled jobs are defined in UTC and displayed in IST | **EXISTS** — cron is UTC, digests convert to IST |
| NFR-UX-03 | Every list supports saved views with filters, columns and sort, shareable at private, team or global scope | **EXISTS** |
| NFR-UX-04 | Core workflows are usable on mobile | **PARTIAL** — mobile bottom navigation covers seven modules; the new pricing and revenue surfaces need a mobile position |
| NFR-UX-05 | WCAG 2.1 AA for colour contrast, keyboard navigation and screen-reader labelling | Audited |
| NFR-UX-06 | Global search and command palette reachable by keyboard from anywhere | **EXISTS** |
| NFR-UX-07 | Any figure a user is shown, they can explain — every score, health rating and forecast exposes its inputs | No black-box number reaches a user |

## Observability, maintainability and deployment

| ID | Requirement | Measure |
|---|---|---|
| NFR-OPS-01 | Structured application logging with correlation across a request | Verified |
| NFR-OPS-02 | Scheduled job runs record last-run time, duration and result | **EXISTS** — `automation_config` |
| NFR-OPS-03 | Health endpoint suitable for a platform healthcheck | **EXISTS** — `/api/health` |
| NFR-OPS-04 | Error tracking with alerting on rate | To be added |
| NFR-OPS-05 | Business logic lives in services, not in routers or components, and is unit-testable independently | **PARTIAL** — the service layer is consistent; test coverage is limited to the SQL safety service |
| NFR-OPS-06 | Automated tests cover the cost engine, pricing rules, redaction and the revenue state model before those features ship | These four are the highest-consequence logic in the platform |
| NFR-OPS-07 | Schema changes ship as reviewed forward-only migrations | **EXISTS** — drizzle-kit migrations |

---

# Section E — Gap analysis summary

> **MID-REVIEW**  The counts below are from the initial draft. They are recomputed from the actual requirement rows once all eight pillars have been reviewed, so they will disagree with the pillar sections until then. Pillar 1 has been reviewed: 4 requirements withdrawn, 2 added.

| Pillar | EXISTS | PARTIAL | NEW | Headline gap |
|---|---:|---:|---:|---|
| 1 Client | 7 | 2 | 7 | No group structure and no merge — duplicates are detected but cannot be resolved |
| 2 Pipeline | 10 | 3 | 5 | Stages carry probability but no criteria, so the forecast is an opinion |
| 3 Partner | 3 | 1 | 11 | Attribution is one foreign key: no registration, no window, no credit model, no fee |
| 4 Pricing | 0 | 0 | 53 | The entire pillar. No cost basis exists for any price the business quotes |
| 5 Contract | 3 | 6 | 6 | Contracts are 1:1 with a deal and hold no documents — no renewal, no amendment, no file |
| 6 Delivery | 4 | 4 | 7 | No milestones or deliverables, so delivery cannot trigger billing |
| 7 Revenue | 0 | 2 | 15 | The platform has one money state (contracted) where it needs five |
| 8 Intelligence | 4 | 4 | 7 | Alerts notify but have no lifecycle — no owner, no action, no resolution |
| Cross-cutting | 9 | 5 | 10 | No approval workflow, no file storage, no field-level entitlement |
| **Total** | **40** | **27** | **121** | **188 functional requirements** |

Alongside these sit **56 non-functional requirements** across nine groups.

Read this table with one caveat: the EXISTS count for Pillars 1, 2 and 8 reflects genuinely mature capability, while the NEW count is concentrated in the commercial half of the business. The platform today is a good CRM with a delivery module attached. It is not yet a commercial operating layer, because four of the five numbers in the value chain do not exist in it.

---

# Section F — Recommended build sequence

Ordered by dependency, not by appetite. Each phase is shippable and leaves the platform coherent.

| Phase | Scope | Why here | Unblocks |
|---|---|---|---|
| **0** | **Consolidate field redaction (FR-X-06), add the entitlement tier (FR-X-05), extend the SQL safety blocklist (NFR-SEC-05)** | This must land **before** any cost data enters the database. Doing it after means retrofitting security onto live salary-derived data | Everything in Pillar 4 |
| **1** | File storage (FR-X-14), approval workflow (FR-X-12), role and service-line taxonomy (FR-X-10), effective dating helper (FR-X-09) | Four shared services that three later pillars each need. Building them once is the difference between a platform and four features | P4, P5, P7 |
| **2** | Contract decoupling: contracts as first-class, many per client, with documents, structured scope and billing schedules (FR-P5-01 to FR-P5-07) | The 1:1 cascade is the structural blocker. Revenue cannot exist without a billing schedule to hang off | P6, P7 |
| **3** | Pricing core: catalog, sizing, cost engine, price and margin, quotation generation, estimate freezing (Pillar 4 excluding feasibility) | The commercial heart. Delivers a defensible price and a generated quotation | P2 amount integrity, P7 margin |
| **4** | Delivery milestones, deliverables with acceptance, and outcome records (FR-P6-04, FR-P6-05, FR-P6-11) | The bridge that turns delivery progress into a billing trigger | P7 |
| **5** | Revenue: billing events, invoices, receipts, aging, the five-state model (Pillar 7) | Completes the value chain. Realized margin becomes computable for the first time | P3 settlement, P8 health |
| **6** | Partner attribution model: registration, windows, credit types, fee obligations and settlement (Pillar 3) | Needs collected revenue from Phase 5 to settle against | P8 channel view |
| **7** | Intelligence: explainable health, exception lifecycle, targets and thresholds (Pillar 8) | Needs signals from every prior phase. Built earlier it would score on incomplete data | Leadership cadence |
| **8** | Client group structure and merge (FR-P1-08 to FR-P1-12) | Independent of the commercial chain; sequenced here because rollup correctness matters most once revenue exists | Group-level reporting |
| **9** | Capacity feasibility (FR-P4-21 to FR-P4-26) | Requires a workforce data source that does not exist. FR-P4-27 carries the interim manual behaviour until then | Honest delivery dates |

> **SEQUENCING NOTE**  Phase 0 is not optional and not deferrable. It is the price of Decision D-1, and it is cheapest to pay before there is any cost data to protect.

---

# Section G — Decisions and open questions

## D-1 — The pricing desk is absorbed, not integrated

**Decision.** The Engagement Pricing & Quotation Desk becomes Pillar 4 of the client platform. Cost rates, the effort catalog, delivery cost and margin live in this database.

**What the source document intended instead.** A hard platform boundary. Its boundary matrix marks employee cost rate and named availability as **Never** crossing to the client platform — "no export, no report, no API" — with only price, delivery window, feasibility verdict, approval state and structured scope permitted to cross.

**What is gained.** One database, one permission model, one deployment. No integration contract to specify, version and keep honest. An estimate can join directly to its opportunity, contract, engagement and revenue without a synchronisation layer. Realized margin becomes a single query rather than a reconciliation.

**What is given up, and what replaces it.** A platform boundary is enforced by architecture — data that is not present cannot leak. A permission boundary is enforced by code, and code has bugs. Three specific exposures follow, each with a named compensating control:

| Exposure | Control |
|---|---|
| Salary-derived cost rates now sit in a database the AI assistant can query, including through its raw-SQL escape hatch | NFR-SEC-05, NFR-SEC-06, FR-P8-13 |
| Redaction is currently duplicated across seven independent locations, a pattern that will not survive being extended | FR-X-06, NFR-SEC-08, NFR-SEC-09 |
| Cost data can leak through a surface nobody thought about — an export, a digest, a public dashboard token, the metrics API | NFR-SEC-04, NFR-SEC-10, and Phase 0 sequencing |

**Reversibility.** Moderate. The cost engine is designed as a service with a narrow published output — price, window, verdict, approval state. If the boundary is later reinstated, that service moves with its tables; what stays behind are foreign keys to estimate IDs.

## D-2 — Feasibility is specified now and built last

The capacity feasibility capability requires availability, skills, certifications and allocations for named people. No such data exists in this platform or any adjacent one. Rather than dropping the requirement or building a shadow HR system, it is specified in full (FR-P4-21 to FR-P4-26), given an explicit interim behaviour (FR-P4-27), and sequenced last. Quotations built before then carry a manually asserted start date marked as unverified — visibly weaker than a checked one, which is the honest representation.

## Open questions

These need a business answer, not an engineering one. Each blocks a specific requirement.

| ID | Question | Blocks |
|---|---|---|
| ~~**Q-1**~~ | ~~Which roles hold the cost entitlement?~~ **CLOSED 25 Aug — it is not a role.** A **financial permission is granted per user**, assignable and revocable independently of their role, so any individual can be entitled without changing what their role means for everyone else. See FR-X-05 | — |
| ~~**Q-2**~~ | ~~When two partners claim the same opportunity, what is the shared-credit rule?~~ **CLOSED 25 Aug — no shared credit.** A deal carries one partner or none; FR-P3-05 to FR-P3-09 withdrawn | — |
| **Q-3** | What is the revenue recognition policy — on invoice, on milestone completion, or straight-line across the engagement? | FR-P7-04 |
| **Q-4** | Who may send a quotation against a feasibility warning, and who may breach a margin floor? Are they the same person? | FR-P4-26, FR-P4-32 |
| ~~**Q-5**~~ | ~~Is client health scored per legal entity or per client group?~~ **CLOSED 24 Aug — per legal entity.** Group structure cut; FR-P1-08 to FR-P1-10 withdrawn | — |
| **Q-6** | What are the fiscal period boundaries, and does the forecast horizon run to quarter end or a rolling 90 days? | FR-X-08, FR-P7-17 |
| **Q-7** | Who may write off a receivable, waive a partner fee, and close an exception without action? | FR-P7-09, FR-P3-14, FR-P8-05 |
| **Q-8** | Does the platform stay single-tenant? Several requirements here — group structure, entitlement tiers, targets — are cheaper to build now with tenancy in mind than to retrofit | Architecture-wide |

## Source-document review questions, answered

Both source documents close with a PRD review checklist. Where this specification answers one, the requirement is named; where it does not, the open question is named.

| Review question | Answer |
|---|---|
| Is every entity and metric owned by exactly one pillar? | Yes — Section A ownership table |
| Are quoted, contracted, invoiced, recognized and collected distinguishable everywhere? | FR-P7-01, NFR-AUD-05 |
| Can a user move from exception to corrective action without losing context? | FR-P8-07 |
| Are current, historical and forecast values clearly separated? | FR-P7-17, NFR-REP-03 |
| Can client health and deal confidence be traced to source evidence? | FR-P8-02, FR-P8-03, NFR-UX-07 |
| Are sourced, influenced and co-sold credit unambiguous, with a shared-credit rule? | FR-P3-07 defines the types; the rule itself is **Q-2** |
| Are pricing, terms, margin and collections protected by purpose and role? | FR-X-05, NFR-SEC-04, NFR-PRIV-02 |
| What happens when accounts duplicate or milestones are recorded late? | FR-P1-11, FR-P1-12, FR-P6-08, FR-P8-04 |
| Who can discount, sign, amend, gate kickoff, waive a fee, write off, close an exception? | Partly FR-X-12; the decision rights themselves are **Q-1**, **Q-4** and **Q-7** |
| Does each pillar have adoption, data-quality, operational and outcome measures? | Partly — FR-P1-13 and FR-P8-08. A full measure set per pillar is not yet specified |
| Can a six-month-old estimate be reproduced exactly? | NFR-REP-01, FR-X-09 |
| Is every "Never" item in the boundary matrix genuinely unreachable? | **No longer applicable** — the boundary is deliberately removed by D-1 and replaced by NFR-SEC-04 through NFR-SEC-10 |
| Can a quotation with an unsupportable start date be sent, and by whom? | FR-P4-26; the "by whom" is **Q-4** |
| When price is reduced, is discount-versus-descope an explicit choice? | FR-P4-33 |
| Is estimate confidence visible to the approver and does it drive contingency? | FR-P4-02, FR-P4-30 |
| Does the bid decision surface competing demand before the quote is sent? | FR-P4-37 |
| Is the original estimate provably immutable, and is variance attributed? | NFR-AUD-04, FR-P4-51 |
| Does the desk measure estimate accuracy, turnaround, floor-breach rate and win rate by confidence band? | FR-P4-50 and FR-P4-53 cover accuracy and margin; turnaround, floor-breach rate and win-rate-by-confidence are **not yet specified** |

> **RECOMMENDED PRODUCT FRAMING**  Position the platform as the commercial operating layer between the market and delivery: a single place to decide which clients to pursue, what it will cost to serve them, what to commit to, what to deliver, and what that relationship is ultimately worth.
