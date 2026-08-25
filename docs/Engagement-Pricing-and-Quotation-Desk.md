PRODUCT ARCHITECTURE  /  PRD FOUNDATION

# Engagement Pricing & Quotation Desk

## Cost, Capacity, Bid Decision & Quotation Platform

> **NORTH-STAR QUESTION**  Can we price this engagement from what it will actually cost us to deliver, staff it in the window we are promising, and know before we quote whether winning it is worth the capacity it consumes?

| | |
|---|---|
| **DOCUMENT PURPOSE** | Define the capability that turns cost and capacity truth into a defensible quotation |
| **PRIMARY AUDIENCE** | Product, engineering, sales, delivery, finance, and leadership |
| **REVIEW MODE** | Product/PRD-ready architecture and scope alignment |
| **PREPARED** | 23 August 2026 |

`CATALOG  >  SIZING  >  COST  >  FEASIBILITY  >  PRICE  >  DECISION  >  QUOTATION`

---

# Executive overview

A quotation is three claims bundled into one number. It claims a **price**. It claims a **delivery window**. And it implies a **margin**. Most quoting tools calculate only the first.

That is why quotations stop making sense. The price gets set from what the last similar deal went for or what the market seems to bear. The start date gets taken from what the client asked for rather than from what delivery can honour. And the margin is discovered months later in a profitability report, when nothing can be done about it.

This desk makes all three claims provable before the quote is sent. It estimates delivery cost from a versioned effort catalog and the organization's real cost rates, checks the staffing against real availability, prices to a target margin, tests whether winning is worth the capacity consumed, and generates the quotation from the approved basis.

> **ARCHITECTURE PRINCIPLE**  The desk owns cost and capacity truth and never exports it. It publishes a price, a delivery window, and a feasibility verdict. Cost rates and named availability stay behind the boundary.

## The seven questions

1. **Catalog:** What does this kind of engagement normally take?
2. **Sizing:** How much bigger or smaller is this one?
3. **Cost:** What will it cost us to deliver?
4. **Feasibility:** Can we actually staff it in that window?
5. **Price:** What do we charge, and what does that leave?
6. **Decision:** Is this a good choice?
7. **Quotation:** What do we send them?

## Product design principles

- Estimate before opinion: every quoted number must trace to an effort baseline, a sizing driver, and a cost rate.
- Separate the three claims: price, delivery window, and margin are quoted together but proven independently.
- Feasibility is a gate, not a note. A start date the workforce cannot support does not reach the client.
- Confidence is quoted, not hidden. A first-of-kind engagement carries a contingency; a well-calibrated one does not.
- Cost truth stays behind the boundary. What crosses to the commercial system is the price and the verdict.
- Estimates are retained, never overwritten, so the catalog can be corrected by what actually happened.

---

# How the desk works

The primary flow moves an opportunity from a service selection to a sendable quotation: a catalog baseline is selected, sizing drivers scale it, cost is computed, staffing is tested against real availability, price is set to a target margin, the bid is judged against alternatives, and the quotation is generated. Feedback loops carry delivered reality back into the baselines.

*Figure 1. From catalog baseline to sendable quotation, and the loops that keep it honest.*

## Core feedback loops

**Calibration loop.** Delivered effort is compared against the retained estimate for the same service and sizing profile, and the catalog baseline and its confidence band are revised. This is the loop that makes the desk more accurate over time rather than permanently wrong in the same direction.

**Pricing loop.** Realized margin on completed engagements, and the discount actually needed to win, revise target margins, rate cards, and discount floors.

**Capacity contention loop.** Feasibility checks accumulate into a view of which roles and qualifications are repeatedly the constraint, feeding hiring, upskilling, and certification decisions.

**Win/loss loop.** Won and lost outcomes with price and competitor context revise how aggressively similar engagements are priced and which ones are worth bidding at all.

---

CAPABILITY 1  /  CATALOG

# Service & Effort Catalog

*What does this kind of engagement normally take?*

## What it is

The versioned library of standard effort baselines: for each service line, how many hours of each role, across each delivery stage, a typical engagement consumes. Each baseline carries a confidence band derived from how many completed engagements support it and how widely they varied.

It owns what normal looks like. It does not own what this particular engagement looks like — that is sizing.

## Why it is important

Without standard baselines every quote is guesswork wearing a spreadsheet. Baselines make estimates comparable, make the estimator's assumptions visible, and give the calibration loop something concrete to correct. They also make a junior estimator's quote resemble a senior one's, which is what allows quoting to scale beyond the founder.

## Main capabilities / modules

- Effort baselines per service line — SOC 2 Type I and II, ISO 27001, DPDP, VAPT, CSPM, CERT-IN, AI governance — broken down by role and delivery stage.
- Confidence band per baseline, derived from sample size and observed variance across completed engagements.
- Version history: every baseline change is dated and attributed, and estimates record the version they were built from.
- Non-labour cost templates: external auditor fee ranges, tooling and evidence-platform costs, travel assumptions.
- Composite and bundled services, prerequisite relationships, and re-certification or surveillance-year variants.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Delivered effort by role and stage from completed engagements, via the calibration loop. | Effort baselines and confidence bands to Capability 2. |
| Delivery stage definitions and deliverable structure from the delivery pillar. | Non-labour cost templates to Capability 3. |
| Actual external auditor fees and tooling costs from finance. | Estimate-quality and variance evidence to Capability 5 for contingency setting. |
| Estimator feedback where a baseline consistently required override. | Coverage gaps — services with no baseline — to leadership. |

> **CONCRETE EXAMPLE**  The SOC 2 Type II baseline for a mid-market first-time client is 420 hours: 120 lead consultant, 180 security analyst, 90 compliance analyst, 30 QA and review. It is supported by nine completed engagements with a ±18% observed spread, so it carries a Medium confidence band. The DPDP baseline, supported by two engagements, carries Low confidence and attracts a contingency when quoted.

---

CAPABILITY 2  /  SIZING

# Scope & Sizing Model

*How much bigger or smaller is this one?*

## What it is

The model that converts a client profile and a scope conversation into a multiplier on the catalog baseline. It holds the drivers that genuinely change effort, the weight each carries, and the record of which drivers were applied to a given estimate.

## Why it is important

Two SOC 2 engagements can differ by a factor of two, and the difference is predictable if you know what to ask. Naming the drivers explicitly turns the scoping call into a structured interview rather than an intuition, makes the estimate arguable in a good way, and means a scope change can be re-priced by changing a driver rather than rebuilding the quote.

## Main capabilities / modules

- Driver library with weights: headcount band, number of cloud environments, number of physical locations, existing security maturity, prior certification history, number of in-scope systems, and frameworks running in parallel.
- Composition rules for how multiple drivers combine, with guardrails so multipliers cannot compound implausibly.
- Scoping questionnaire that captures driver values, their source, and the confidence in each answer.
- Scope inclusions, exclusions, and client obligations captured as structured items that carry through to the quotation.
- Re-sizing on scope change, with the effort and cost delta made explicit rather than absorbed.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Effort baselines and confidence bands from Capability 1. | Sized effort by role and stage to Capability 3. |
| Client profile — industry, headcount, geography, regulatory exposure — from the client platform. | Required staffing shape to Capability 4. |
| Scoping answers captured during discovery in the client platform's pipeline. | Structured scope, exclusions, and client obligations to Capability 7. |
| Observed driver accuracy from the calibration loop. | Scope-change deltas to Capability 5 for re-pricing. |

> **CONCRETE EXAMPLE**  Northwind Analytics has 180 staff (band 100–250, neutral), three cloud environments (+15%), two locations (+5%), and no prior certification (+10%). The drivers compose to ×1.30, taking the 420-hour SOC 2 Type II baseline to 546 hours. Each driver and its source is retained on the estimate, so the sizing can be defended or corrected later.

---

CAPABILITY 3  /  COST

# Cost Engine

*What will it cost us to deliver?*

## What it is

The calculation that turns sized effort into delivery cost: hours by role multiplied by the organization's internal cost rates, plus non-labour cost, plus overhead under a configured policy.

This capability owns cost truth. Cost rates are salary-derived and never leave it — not to the quotation, not to the client platform, not to the estimator's screen unless they are permitted to see them.

## Why it is important

A price without a cost basis is a guess with a decimal point. Compliance engagements also carry large non-labour components — external auditor fees frequently rival the labour cost — and whether those are passed through at cost or marked up changes the margin picture entirely. Getting cost right is what makes every downstream number mean something.

## Main capabilities / modules

- Role-based internal cost rates, sourced from the workforce record, with effective dating so historic estimates stay reproducible.
- Non-labour cost lines: external auditor fees, tooling and evidence platforms, travel, and third-party testing, each marked pass-through or marked-up.
- Overhead policy applied to labour under a configured rate, with the policy version retained on the estimate.
- Blended and named costing: estimate at role-average rates, or at the cost of the specific people the feasibility check proposes.
- Cost breakdown by role, stage, and line item, visible only to permitted roles, with a permission-safe summary for everyone else.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Sized effort by role and stage from Capability 2. | Total delivery cost and its breakdown to Capability 5. |
| Role cost rates and effective dates from the workforce record. | Cost of the proposed named team back to Capability 4 for comparison. |
| Non-labour cost templates from Capability 1; actual vendor costs from finance. | Permission-gated engagement cost and margin to the client platform's revenue pillar. |
| Overhead policy and its version from finance. | Cost variance against delivered cost to the calibration loop. |

> **CONCRETE EXAMPLE**  Northwind's 546 sized hours cost INR 6,43,500 in labour: 156 lead hours at INR 1,800, 234 security analyst hours at INR 950, 117 compliance analyst hours at INR 700, and 39 QA hours at INR 1,500. Non-labour adds INR 3,95,000, dominated by a INR 3,50,000 external auditor fee passed through at cost. Overhead at 18% of labour adds INR 1,15,830. Total delivery cost is **INR 11,54,330**.

---

CAPABILITY 4  /  FEASIBILITY

# Capacity Feasibility

*Can we actually staff it in that window?*

## What it is

The check that tests a proposed engagement against real availability and real qualification: who could do this work, are they free in the window, and if not, when is the earliest date the organization can honestly commit to.

It consumes availability from the workforce record and returns a verdict. The roster itself never crosses the boundary.

## Why it is important

A delivery window is a promise, and a promise made without checking capacity is how engagements start late, get staffed with whoever is free rather than whoever is qualified, and consume unplanned senior time to recover. In compliance work the constraint is usually qualification rather than headcount — a lead auditor who can sign off an ISO 27001 engagement is not interchangeable with an available analyst.

## Main capabilities / modules

- Required staffing shape derived from sized effort: which roles, how many hours, distributed across which weeks.
- Qualified-and-available search combining skill, certification, proficiency, and forecast availability in the target window.
- Earliest realistic start date, with the specific constraint that sets it named rather than implied.
- Contention list: which other pipeline opportunities or committed engagements compete for the same scarce people.
- Alternative staffing options — later start, different mix, partial contractor, mentored junior — each with its cost and risk consequence.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Required staffing shape from Capability 2; named-team cost from Capability 3. | Feasibility verdict and earliest realistic start date to Capabilities 5, 6 and 7. |
| Forecast availability, allocations, and leave from the workforce record. | Contention list and constrained roles to Capability 6. |
| Skills, certifications, and proficiency from the workforce record. | Provisional demand signal to workforce demand planning. |
| Expected start date and priority from the client platform's pipeline. | Repeatedly constrained roles to the capacity contention loop. |

> **CONCRETE EXAMPLE**  Northwind needs a SOC 2-qualified lead from 1 October for roughly twelve weeks. The only qualified lead is 85% allocated until 20 October, so the desk returns an earliest realistic start of **22 October** and names the constraint. The quote goes out with the date delivery can honour, not the date the client asked for.

---

CAPABILITY 5  /  PRICE

# Price & Margin Model

*What do we charge, and what does that leave?*

## What it is

The layer that turns cost into price: target margins by service line and segment, rate cards for time-and-material work, contingency for low-confidence estimates, and the floors and approval thresholds that govern how far a price can move.

## Why it is important

Discounting is where margin quietly disappears, because a price concession feels like one decision and is actually two — how much less we charge, and whether anything left the scope. Holding price, cost, and scope in one model means a reduction can be tested before it is offered, and a concession that breaches the floor needs a decision from someone entitled to make it.

## Main capabilities / modules

- Target margin by service line, client segment, and commercial model, with fixed-price, time-and-material, retainer, and milestone variants.
- Contingency rules driven by the estimate's confidence band, so low-confidence work is priced with a buffer rather than optimism.
- Rate cards and published price lists, with effective dating and client-specific agreed rates.
- Discount and margin floors, approval thresholds, and an approval trail recording who authorised an exception and why.
- Scenario comparison: price, cost, and margin under alternative scope, staffing, and discount options, side by side.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Total delivery cost and breakdown from Capability 3. | Price, margin, and approval state to Capabilities 6 and 7. |
| Confidence band from Capability 1 and driver confidence from Capability 2. | Scenario comparisons to Capability 6. |
| Feasibility verdict and alternative staffing options from Capability 4. | Price and approval state to the client platform's pipeline. |
| Realized margin and required discount from the pricing loop. | Floor breaches and approval requests to leadership. |

> **CONCRETE EXAMPLE**  At a 35% target margin, Northwind's INR 11,54,330 cost prices at INR 17,75,892, rounded to a quoted **INR 18,00,000** — an actual margin of 35.9%. The estimate's Medium confidence adds no contingency. The price sits above the 28% margin floor, so no approval exception is required.

---

CAPABILITY 6  /  DECISION

# Bid Decision

*Is this a good choice?*

## What it is

The recommendation layer. It judges a priced, staffed engagement not only on whether it clears the margin floor, but on whether the capacity it consumes has a better use.

## Why it is important

"Is this a good choice" has two readings, and only one of them is usually answered. The **absolute** test asks whether the engagement is profitable enough. The **relative** test asks what else that capacity could have done. When a single qualified lead is the constraint, a 26%-margin engagement that books them for three months does not merely earn 26% — it forecloses everything else they could have delivered in that window.

A desk that answers only the absolute question will fill the calendar with acceptable work and never notice the better work it displaced.

## Main capabilities / modules

- Absolute test: margin against floor, cost confidence, payment terms, and commercial risk.
- Relative test: opportunity cost of the constrained roles, scored against competing pipeline opportunities in the same window.
- Delivery risk: estimate confidence, client-side dependency exposure, novelty of the service, and external auditor availability.
- Strategic weighting for reference value, entry into a target segment, partner relationship, and follow-on potential.
- A recorded recommendation — bid, bid with conditions, re-scope, or decline — with the reasoning retained and testable against the outcome.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Price, margin, and scenario comparisons from Capability 5. | Bid recommendation and conditions to Capability 7. |
| Feasibility verdict and contention list from Capability 4. | Decline and re-scope signals to the client platform's pipeline. |
| Competing opportunity value and probability from the client platform's pipeline. | Displaced-opportunity evidence to workforce demand planning. |
| Strategic priorities, segment targets, and partner context from leadership. | Decision record and reasoning to the win/loss loop. |

> **CONCRETE EXAMPLE**  Northwind clears the floor at 35.9%. But the same lead is the constraint on a pipeline ISO 27001 opportunity worth INR 24,00,000 at 42% margin in an overlapping window, and both cannot be staffed. The desk surfaces the contention before the quote goes out and recommends bidding with a 22 October start that sequences the two, rather than discovering the collision after both are won.

---

CAPABILITY 7  /  QUOTATION

# Quotation & Contract Assembly

*What do we send them?*

## What it is

Generation of the client-ready quotation from the approved basis, and assembly of the commercial terms that become the contract. It produces the document; it does not own the signed agreement, which belongs to the client platform.

## Why it is important

Re-typing a quotation into a document is where the basis and the artifact drift apart — a number gets rounded, an exclusion gets dropped, a start date reverts to the one the client originally asked for. Generating from the approved basis makes the sent document and the approved decision the same thing, and means every quotation states its scope, its exclusions, and its validity period without depending on who wrote it.

## Main capabilities / modules

- Quotation generation from the approved basis: price, commercial model, delivery window, milestones, and payment schedule.
- Scope, exclusions, assumptions, and client obligations carried through from the sizing model in the client's language.
- Validity period, price expiry, and the re-approval required when a lapsed quotation is revived.
- Version history with a clear record of what changed between revisions and who approved each.
- Assembly of commercial terms for the contract, handed to the client platform for negotiation and signature.

## Cross-boundary connections

| Inputs | Outputs |
|---|---|
| Price, commercial model, and approval state from Capability 5. | Client-ready quotation document to the client platform. |
| Bid recommendation and conditions from Capability 6. | Assembled commercial terms to the client platform's contract pillar. |
| Delivery window and earliest start from Capability 4. | Quotation version history and approval trail for audit. |
| Structured scope, exclusions, and obligations from Capability 2. | Sent, revised, expired, and accepted states to the client platform's pipeline. |
| Client identity, contacts, and billing entity from the client platform. | Accepted basis, retained for calibration against delivery. |

> **CONCRETE EXAMPLE**  Northwind's quotation is generated at INR 18,00,000 with a 22 October start, a twelve-week window, milestone billing at 40% on signature and 60% on certification, the external auditor fee shown as a pass-through, and penetration testing listed as an explicit exclusion. It is valid for 30 days. Nothing on it was typed by hand.

---

# Estimate-to-actuals calibration loop

An estimating desk is only worth building if its estimates improve. That requires the original estimate to survive contact with reality — retained, not replaced — so the difference between what was predicted and what happened can be measured and fed back into the baselines.

1. **Retain the estimate.** When a quotation is approved, the sized effort, catalog version, sizing drivers, cost rates, overhead policy, and approver are frozen onto the estimate record.
2. **Send and record the outcome.** The client platform reports won, lost, or re-scoped, with the contracted value and the reason. A lost bid still teaches: the price, the competitor, and the stated reason are retained.
3. **Track delivered effort.** As the engagement runs, actual effort by role and stage accumulates from the workforce platform against the same structure the estimate used.
4. **Compare like with like.** At completion, delivered effort and actual non-labour cost are compared against the frozen estimate, per role and per stage rather than only in total, so offsetting errors do not cancel out.
5. **Attribute the variance.** Each variance is attributed: an inaccurate baseline, a mis-read sizing driver, scope that changed without re-pricing, a client-side dependency, or a delivery problem. Only the first two are the catalog's fault.
6. **Revise the baseline.** Baseline hours and confidence bands are updated where the evidence supports it, as a new dated version. Prior estimates keep pointing at the version they were built from.
7. **Close the commercial loop.** Realized margin against quoted margin revises target margins, contingency rules, and discount floors, and the displaced-opportunity record is tested against what the constrained roles actually delivered.

> **IMPORTANT CONTROL**  An estimate must never be overwritten by actuals. Retain the original estimate, the catalog version and sizing drivers it was built from, the approver, and the date, then compare against delivered effort. Overwriting the estimate destroys the only signal that tells you the estimates are wrong.

---

# Platform boundary matrix

The desk lives in the employee platform because that is where cost and capacity truth already lives. What crosses to the client platform is deliberately narrow.

| Data | Owner | Crosses to client platform | Rule |
|---|---|---|---|
| Employee cost rate (salary-derived) | Employee platform | **Never** | Stays inside the cost engine. No export, no report, no API |
| Named availability and allocation | Employee platform | **Never** | Only the verdict crosses, never the roster |
| Effort estimate by role and stage | Employee platform | No | Internal basis for the price |
| Overhead policy and non-labour breakdown | Employee platform | No | Internal, except pass-through lines shown on the quote |
| Engagement cost total and margin % | Employee platform | Permission-gated | Finance and leadership only. The revenue pillar needs it; the pipeline does not |
| Price and commercial model | Employee → Client | Yes | The quotable fact |
| Delivery window and earliest realistic start | Employee → Client | Yes | Gates the promised date |
| Feasibility verdict and confidence band | Employee → Client | Yes | A start date delivery cannot honour does not reach the client |
| Approval state | Employee → Client | Yes | A quote below floor cannot be sent unapproved |
| Structured scope, exclusions, obligations | Employee → Client | Yes | Carried onto the quotation verbatim |
| Quotation document and contract | Client platform | Owned there | Client platform's contract pillar |
| Contracted value, won/lost, reason | Client → Employee | Yes | Feeds the calibration and win/loss loops |
| Actual delivered effort | Employee platform | Internal | Feeds the calibration loop |

---

# Worked example

**Scenario:** Northwind Analytics — a 180-person Bengaluru SaaS company, first-time certification, three cloud environments, two locations — needs SOC 2 Type II ahead of an enterprise procurement deadline and asks to start on 1 October.

1. **Catalog.** The SOC 2 Type II mid-market first-time baseline is selected: 420 hours across lead consultant, security analyst, compliance analyst, and QA. Medium confidence, nine supporting engagements.
2. **Sizing.** Three cloud environments (+15%), two locations (+5%), and no prior certification (+10%) compose to ×1.30. Sized effort is **546 hours**.
3. **Cost.** Labour INR 6,43,500; non-labour INR 3,95,000 (INR 3,50,000 external auditor fee, pass-through, plus INR 45,000 tooling); overhead at 18% of labour INR 1,15,830. **Total delivery cost INR 11,54,330.**
4. **Feasibility.** The only SOC 2-qualified lead is 85% allocated until 20 October. Earliest realistic start is **22 October**, not 1 October.
5. **Price.** At a 35% target margin, cost prices at INR 17,75,892, quoted as **INR 18,00,000** — a 35.9% margin, above the 28% floor.
6. **Decision.** Clears the absolute test. The relative test surfaces a competing ISO 27001 opportunity at INR 24,00,000 and 42% margin needing the same lead. Recommendation: bid with the 22 October start, which sequences both rather than colliding them.
7. **Quotation.** Generated at INR 18,00,000, 22 October start, twelve-week window, 40/60 milestone billing, auditor fee shown as pass-through, penetration testing excluded, valid 30 days.
8. **Scope reduction.** The client asks to defer the penetration test. The desk re-sizes rather than discounting: 84 security analyst hours, 12 lead hours, and INR 30,000 of tooling leave the scope, removing **INR 1,49,652** of cost. New cost INR 10,04,678, new price **INR 15,50,000**, margin **35.2%**.
9. **Signature and calibration.** The contract signs at INR 15,50,000. The estimate is frozen and, at completion, delivered effort is compared against it per role and stage, revising the SOC 2 baseline and its confidence band.

**Why step 8 is the argument for the whole document.** Had the same INR 2,50,000 been given as a discount with the penetration test left in scope, the cost would have stayed at INR 11,54,330 and the margin would have fallen to **25.5%** — below the floor, and nobody would have known until the engagement closed. The same signed value of INR 15,50,000 is a 35% engagement or a 26% engagement depending entirely on whether scope left with the price. Nothing in a conventional CRM tells you which one you just signed.

---

# Product implications and review checklist

## Shared platform services

- Role-based permissions with field-level control, so cost rates, margin, and named availability are visible only to entitled roles while the price is visible to everyone who quotes.
- Effective dating across cost rates, rate cards, overhead policies, and catalog versions, so any historic estimate can be reproduced exactly.
- Approval workflow for floor breaches, exceptions, and lapsed-quotation revival, with a retained trail of who approved what and why.
- A shared taxonomy of service lines, roles, delivery stages, and sizing drivers, identical to the one delivery uses, so estimates and actuals are comparable without translation.
- Document generation with versioned templates for quotations and commercial terms.
- Integration boundaries with the client platform for opportunity and contract context, and with finance for vendor and overhead cost.

## PRD review questions

- **Ownership:** Is every input to a quoted number owned by exactly one capability?
- **Reproducibility:** Can an estimate from six months ago be reproduced exactly, with the rates, policies, and baseline version it used?
- **Boundary:** Is every item marked "Never" in the boundary matrix genuinely unreachable from the client platform, including through reports and exports?
- **Feasibility as a gate:** Can a quotation carrying a start date the workforce cannot support actually be sent, and if so, by whom?
- **Scope and price coupling:** When price is reduced, does the system require an explicit choice between discounting and de-scoping?
- **Confidence:** Is estimate confidence visible to whoever approves the price, and does it drive contingency automatically?
- **Opportunity cost:** Does the bid decision surface competing demand for constrained roles before the quote is sent, not after?
- **Calibration:** Is the original estimate provably immutable once approved, and is variance attributed rather than merely measured?
- **Decision rights:** Who can override a sizing driver, waive a contingency, breach a margin floor, and approve a bid against a feasibility warning?
- **Success metrics:** Does the desk measure estimate accuracy, quote turnaround time, floor-breach rate, and win rate by confidence band?

> **RECOMMENDED PRODUCT FRAMING**  Position the desk as the gate between wanting the work and promising it: the place where a price, a delivery date, and a margin stop being hopes and become claims the organization can defend.
