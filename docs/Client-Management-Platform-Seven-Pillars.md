PRODUCT ARCHITECTURE  /  PRD FOUNDATION

# Client Management Platform

## Client, Pipeline, Contract & Revenue Management Platform

> **NORTH-STAR QUESTION**  Do we have the right clients, moving through the right stages, on the right commercial terms, delivering the right outcomes, to protect and grow revenue now and next?

| | |
|---|---|
| **DOCUMENT PURPOSE** | Define the seven product pillars of the client platform and their operating dependencies |
| **PRIMARY AUDIENCE** | Product, engineering, design, sales, delivery, finance, partnerships, and leadership |
| **REVIEW MODE** | Product/PRD-ready architecture and scope alignment |
| **PREPARED** | 22 August 2026 |

`CLIENT  >  PIPELINE  >  PARTNER  >  CONTRACT  >  DELIVERY  >  REVENUE  >  CLIENT INTELLIGENCE`

---

# Executive overview

This product is not a generic CRM and not a billing system. It is an integrated operating layer that connects client identity, active pipeline, channel contribution, commercial commitment, delivery outcome, and realized revenue into one continuous record — from the first conversation with a prospect to the renewal of a certified client.

> **ARCHITECTURE PRINCIPLE**  Each pillar owns a distinct business truth. Other pillars may consume and enrich that truth, but should not create competing versions of it.

## The seven business questions

1. **Client:** Who are our clients and prospects, and who do we deal with inside them?
2. **Pipeline:** What is in play, where is it, and what will it close at?
3. **Partner:** Who brings us business, and what is that channel actually worth?
4. **Contract:** What have we committed to, on what terms, and is it signed and funded?
5. **Delivery:** What are we delivering, and will it land on time and at the promised outcome?
6. **Revenue:** What have we earned, what have we collected, and is the relationship profitable?
7. **Client intelligence:** Which clients and deals need attention, and what action should follow?

## Product design principles

- One source of truth per domain, with clear data ownership and lineage.
- Time-phased commercials: booked, contracted, recognized, collected, and forecast values must be distinguishable at all times.
- Evidence before opinion: client health, deal confidence, and revenue quality should be explainable from source records.
- Actionable intelligence: every exception needs an owner, a recommended response, and a resolution trail.
- Privacy by design: contract terms, pricing, margin, and collections data require role- and purpose-based access.
- Drill-down consistency: company revenue must reconcile to segment, client, engagement, contract, and individual billing event.

---

# How the pillars work together

The primary flow moves commercial context forward: a client is identified, an opportunity is pursued, a channel is credited, an agreement is signed, work is delivered, revenue is realized, and leadership steers. Feedback loops carry outcome evidence back into targeting, pricing, attribution, and forecasting.

*Figure 1. Primary commercial flow and the four major feedback loops.*

## Core feedback loops

**Qualification loop.** Win/loss evidence and delivered outcomes refine the ideal-client profile, segmentation, and qualification criteria held in Pillars 1 and 2, so future targeting improves rather than repeating the same mistakes.

**Commercial loop.** Variance between quoted and contracted value, and between contracted and realized value, revises how future opportunities are scoped, priced, and forecast.

**Attribution loop.** Closed, delivered, and collected revenue flows back to partner attribution, tiering, and channel investment decisions in Pillar 3.

**Retention loop.** Delivery outcomes, certification results, and payment behaviour revise renewal probability, expansion potential, and churn risk for the next cycle.

---

PILLAR 1  /  CLIENT

# Client & Account Intelligence

*Who are our clients and prospects, and who do we deal with inside them?*

## What it is

The authoritative record of organizations and the people inside them: accounts, contacts and their roles, group and subsidiary structure, segmentation, and client lifecycle status. It owns durable client facts. It does not own opportunity state, contract terms, or revenue.

## Why it is important

Every commercial decision depends on knowing exactly who the counterparty is. Duplicate accounts, contacts attached to the wrong organization, and inconsistent segmentation quietly corrupt pipeline coverage, partner attribution, and revenue reporting — and the damage is only discovered when the numbers stop reconciling.

## Main capabilities / modules

- Account master records: legal and trading name, domain, industry and sub-industry, size, geography, and client type.
- Contact records with role, seniority, decision authority, communication preferences, and relationship strength.
- Group structure: parent, subsidiary, and affiliate relationships so multi-entity clients can be seen whole or separately.
- Segmentation and profiling: industry vertical, company size band, geography, regulatory exposure, and framework interest.
- Client lifecycle status, identity resolution, deduplication, enrichment, and data-quality monitoring.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Engagement and interaction signals from Pillar 2 that update relationship strength and contact validity. | Client and contact identity, segment, and profile to every other pillar. |
| Referral source and partner relationship context from Pillar 3. | Qualified account context and target profile to Pillars 2 and 3. |
| Contract counterparty and signatory confirmation from Pillar 4. | Legal entity and signatory identity to Pillar 4. |
| Delivery outcome and certification status from Pillar 5; payment behaviour from Pillar 6. | Billing entity, segment, and hierarchy for revenue rollups to Pillar 6. |
| Data-quality and coverage exceptions raised by Pillar 7. | Account composition, growth, and concentration measures to Pillar 7. |

> **CONCRETE EXAMPLE**  Northwind Analytics is a 180-person SaaS company in Bengaluru with regulatory exposure to SOC 2 and DPDP. The account record holds three contacts: a CTO who is the economic buyer, a security lead who is the technical champion, and a finance controller who owns purchase orders. A second record created later from a website form is detected as a duplicate and merged, preserving both contact histories.

---

PILLAR 2  /  PIPELINE

# Sales Pipeline & Opportunity Management

*What is in play, where is it, and what will it close at?*

## What it is

The active selling model: opportunities, their stage, qualification evidence, scoped services, expected value and close date — together with the complete interaction record of meetings, demos, discovery calls, proposals, and follow-ups that produced that state. It owns what we are pursuing and everything we know about pursuing it. It does not own signed commercial terms.

## Why it is important

A pipeline is only useful if its stages mean something and its numbers can be trusted. Tying every stage to qualification evidence and every opportunity to its interaction history turns the forecast from an opinion into a defensible position, and makes stalled deals visible before the quarter ends.

## Main capabilities / modules

- Opportunity records: scoped services, expected value, currency, probability, expected close date, owner, and competitive context.
- Configurable stage models per motion, with entry and exit criteria, stage history, and time-in-stage measurement.
- Qualification framework: need, authority, budget, timing, regulatory driver, and named decision path.
- Complete interaction record: calls, meetings, demos, discovery sessions, proposals, and follow-up commitments with outcomes.
- Forecasting, weighted and committed pipeline views, engagement recency, stall detection, and win/loss capture with reasons.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Client, contact, segment, and profile data from Pillar 1. | Interaction evidence and relationship signals back to Pillar 1. |
| Referral registration, partner sourcing, and co-sell context from Pillar 3. | Won opportunities, scoped services, and quoted value to Pillar 4. |
| Contracted value and signature outcome from Pillar 4 to close the opportunity. | Sourced and influenced opportunity credit to Pillar 3. |
| Delivery feasibility and reference outcomes from Pillar 5. | Expected start dates and scope assumptions to Pillar 5. |
| Realized value and win-quality evidence from Pillar 6. | Weighted pipeline, forecast, coverage, and win rate to Pillars 6 and 7. |

> **CONCRETE EXAMPLE**  A SOC 2 Type II opportunity at Northwind Analytics is quoted at INR 18,00,000 and sits at Proposal with 70% probability, expected to close on 30 September. Qualification records the buyer, the audit deadline driving urgency, and the confirmed budget. Six interactions are attached, including a discovery call and a scoping demo. The deal has not moved in 21 days, so it is flagged as stalled while remaining in the forecast.

---

PILLAR 3  /  PARTNER

# Partner & Channel Ecosystem

*Who brings us business, and what is that channel actually worth?*

## What it is

The channel model covering partner organizations, their agreements and tiers, referral registration, attribution rules, co-selling activity, and the revenue each partner ultimately produces. It owns the partner relationship and the credit model. It does not own the client relationship or the revenue record itself.

## Why it is important

Channel-sourced business is easy to celebrate and hard to measure. Without registered referrals and explicit attribution rules, credit becomes a negotiation after the fact, partner economics stay unknown, and there is no evidence base for deciding which partnerships deserve investment.

## Main capabilities / modules

- Partner accounts, agreements, commercial terms, tiers, and coverage by service line and geography.
- Referral registration with a defined attribution window, protection rules, and conflict handling against existing pipeline.
- Attribution model distinguishing sourced, influenced, and co-sold revenue, with a documented rule for shared credit.
- Co-sell workspace: shared opportunities, partner-facing status, joint activity, and commitments.
- Partner performance: referral volume and quality, conversion rate, revenue contribution, commission or fee obligations, and tier movement.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Partner organization identity and contacts from Pillar 1. | Referral source and channel context to Pillars 1 and 2. |
| Sourced and influenced opportunity credit from Pillar 2. | Registered referrals, attribution claims, and co-sell opportunities to Pillar 2. |
| Contract signature and contracted value from Pillar 4. | Partner terms and fee obligations to Pillars 4 and 6. |
| Delivery outcomes affecting partner reputation from Pillar 5. | Attributed revenue basis and commission triggers to Pillar 6. |
| Collected revenue and commission settlement from Pillar 6. | Channel contribution, partner health, and tier exceptions to Pillar 7. |

> **CONCRETE EXAMPLE**  A virtual-CISO firm registers Northwind Analytics as a referral with a 90-day attribution window. The opportunity converts inside that window, so the partner is credited as sourced. On collection of the first invoice, a 10% referral fee obligation is triggered. Across the year the partner has produced eleven referrals, a 45% conversion rate, and INR 94,00,000 in collected revenue — moving it into the top tier.

---

PILLAR 4  /  CONTRACT

# Contract & Commercial Agreement

*What have we committed to, on what terms, and is it signed and funded?*

## What it is

The commitment record: the documents that make an engagement real and the terms that govern it. MSA, NDA and SOW status, the negotiated engagement value, contracted scope, payment terms, purchase order, billing schedule, and kickoff readiness — plus amendments, change orders, and renewal terms over the life of the relationship.

## Why it is important

This is where most commercial leakage happens and where most CRMs go silent. A deal marked won is not yet a funded engagement: the SOW may be unsigned, the PO may not exist, and the agreed value may differ materially from what was quoted. Making the gap between *won* and *committed* explicit is what prevents delivery starting on unfunded work and stops the forecast from reporting money nobody agreed to pay.

## Main capabilities / modules

- Document lifecycle for MSA, NDA, SOW and amendments: required, drafted, sent, under negotiation, signed, with dates and counterparties.
- Negotiated engagement value and currency, held alongside the original quoted value with an explicit variance reason.
- Contracted scope: services, deliverables, exclusions, service levels, dependencies, and client obligations.
- Commercial terms: payment terms, purchase order, billing schedule and triggers, taxes, and commercial model.
- Kickoff readiness gate, change orders, amendments, renewal terms, and notice and termination provisions.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Won opportunity, scoped services, and quoted value from Pillar 2. | Signature outcome and contracted value back to Pillar 2 to close the opportunity. |
| Legal entity, signatory, and billing entity from Pillar 1. | Commission triggers and partner obligations to Pillar 3. |
| Partner commercial terms and fee obligations from Pillar 3. | Contracted scope, deliverables, dates, and obligations to Pillar 5. |
| Delivery-driven change requests and scope movement from Pillar 5. | Billing schedule, payment terms, and recognizable contract value to Pillar 6. |
| Billing and collection status affecting renewal posture from Pillar 6. | Unsigned, unfunded, and expiring-contract exceptions to Pillar 7. |

> **CONCRETE EXAMPLE**  Northwind Analytics is quoted INR 18,00,000. After negotiation the SOW is signed at INR 15,50,000 with a recorded variance reason of reduced scope — the penetration test is deferred to a later phase. Payment terms are 40% on signature and 60% on certification, net 30. The PO arrives eight days later. Only then does the engagement pass the kickoff readiness gate.

---

PILLAR 5  /  DELIVERY

# Engagement Delivery & Outcomes

*What are we delivering, and will it land on time and at the promised outcome?*

## What it is

The client-facing view of the work: the engagement record, its delivery stage, milestones and deliverables, audit and certification outcomes, schedule variance, and the status the client would recognize if shown it.

It owns whether the promise is being kept. It does not own who is staffed on the work or how their time is spent — that is a workforce truth held elsewhere. This pillar consumes delivery progress; it does not manage the people producing it.

## Why it is important

A signed contract is a promise, and the outcome of that promise determines renewal, reference value, and whether the revenue is ever collected. Compliance engagements have hard external dependencies — auditor availability, evidence readiness, client remediation — so schedule risk needs to be visible early, in terms the client and the commercial team both understand.

## Main capabilities / modules

- Engagement records linked to their contract, with service type, framework, scope, and committed dates.
- Framework-specific delivery stages covering scoping, gap assessment, remediation, readiness review, audit, and certification.
- Milestones and deliverables with acceptance criteria, client-side dependencies, and sign-off status.
- Progress, schedule variance, delay reasons, revised dates, blockers, and their commercial consequences.
- Outcome record: audit result, certification achieved and its validity period, exceptions, and observations carried forward.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Contracted scope, deliverables, dates, and client obligations from Pillar 4. | Change requests, scope movement, and revised dates to Pillar 4. |
| Client and contact context from Pillar 1; expected start assumptions from Pillar 2. | Milestone completion and billing-trigger events to Pillar 6. |
| Delivery progress and completion signals from the workforce platform. | Certification outcomes and reference potential to Pillars 1 and 2. |
| Billing and collection status that gates further work, from Pillar 6. | Partner-visible delivery outcomes to Pillar 3. |
| Health thresholds and escalation policy from Pillar 7. | Delivery health, schedule risk, and outcome exceptions to Pillar 7. |

> **CONCRETE EXAMPLE**  The Northwind SOC 2 Type II engagement is in Remediation, 62% complete, and eleven days behind its committed readiness date because three client-side evidence items are outstanding. The delay is attributed to a client dependency, the audit window is re-forecast, and the certification-linked 60% billing milestone moves with it — which is what makes the delay a commercial signal rather than only a delivery one.

---

PILLAR 6  /  REVENUE

# Revenue & Commercial Performance

*What have we earned, what have we collected, and is the relationship profitable?*

## What it is

The financial truth of the client relationship: contracted, invoiced, recognized and collected value, billing events, unbilled work, receivables aging, revenue composition by service and segment and channel, client lifetime value, renewal and expansion revenue, and churn.

## Why it is important

Bookings are not revenue, and revenue is not cash. Reporting a won deal as income overstates performance, hides collection risk, and makes forecasting unreliable. Separating these states — and reconciling every one of them back to a contract and a delivery event — is what allows leadership to tell a growing business from a busy one.

## Main capabilities / modules

- Revenue state model that distinguishes contracted, recognized, invoiced, collected, and forecast value at all times.
- Billing events driven by contract schedules and delivery milestones, including unbilled and work-in-progress balances.
- Invoicing, receipts, receivables aging, disputes, credit notes, and collection follow-up.
- Revenue composition and trend by service line, framework, segment, geography, channel, and client.
- Client lifetime value, repeat and expansion revenue, renewal revenue, churn, and per-client commercial contribution.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Billing schedule, payment terms, and contract value from Pillar 4. | Realized value and win quality back to Pillar 2. |
| Milestone completion and billing triggers from Pillar 5. | Collection status that gates or releases further work, to Pillar 5. |
| Billing entity, segment, and account hierarchy from Pillar 1. | Attributed and collected revenue, and commission settlement, to Pillar 3. |
| Partner fee obligations and attribution basis from Pillar 3. | Payment behaviour and client value to Pillar 1. |
| Forecast assumptions and targets from Pillar 7. | Revenue, receivables, margin, and commercial exceptions to Pillar 7. |

> **CONCRETE EXAMPLE**  Northwind's contract is INR 15,50,000. The 40% signature milestone of INR 6,20,000 is invoiced and collected within terms. The remaining INR 9,30,000 stays contracted-but-unbilled until certification. A referral fee of INR 62,000 is settled against the collected portion. The client's lifetime value reaches INR 15,50,000 with a DPDP renewal opportunity forecast for the following quarter.

---

PILLAR 7  /  CLIENT INTELLIGENCE

# Client Intelligence & Executive Dashboard

*Which clients and deals need attention, why, and what action should follow?*

## What it is

The control tower that unifies the first six pillars into executive scorecards, explainable client and deal health, alerts, trends, forecasts, drill-down analysis, and decision support. It is an intelligence and action layer, not a separate source of commercial truth.

## Why it is important

Leaders should not have to open six views to discover that a large engagement is behind, unbilled, and up for renewal in six weeks. This pillar prioritizes exceptions, explains their causes, quantifies their commercial impact, and routes each action to the pillar that owns the fix.

## Main capabilities / modules

- Executive overview across clients, pipeline, channel, contracts, delivery, and revenue with consistent metric definitions.
- Explainable client health combining delivery status, commercial standing, engagement recency, payment behaviour, and renewal proximity.
- Alerts and exception workflows for stalled deals, unsigned contracts, unfunded work, delivery slippage, aging receivables, and churn risk.
- Scorecards by segment, service line, channel, client, and engagement, with targets, thresholds, and drill-down paths.
- Trends, forecasts, scenario summaries, recommended actions, ownership, acknowledgement, and resolution tracking.

## Cross-pillar connections

| Inputs from other pillars | Outputs to other pillars |
|---|---|
| Curated KPIs, forecasts, events, and permission-filtered measures from Pillars 1–6. | Prioritized decisions and actions back to the owning pillar: re-engage, requalify, chase signature, escalate delivery, invoice, or collect. |
| Data-quality and coverage signals from every pillar. | Targets, thresholds, alert rules, ownership model, and decision policies. |
| Resolution outcomes and revised forecasts after action is taken. | Cross-functional visibility and a common commercial operating cadence. |
| | Audit trail for alert acknowledgement, action taken, outcome, and revised forecast. |

> **CONCRETE EXAMPLE**  Northwind Analytics is marked At Risk: the engagement is eleven days behind, INR 9,30,000 is contracted but unbilled, the certification milestone has moved, and the renewal conversation is due in six weeks. The dashboard explains each contributing signal, quantifies the exposure, and recommends escalating the client-side evidence dependency, re-forecasting the billing milestone, and opening the DPDP renewal early. Each action is executed in the pillar that owns it.

---

# Contract-to-revenue realization loop

The path from a qualified opportunity to collected cash crosses four pillars and is where most commercial value is won or lost. Pillar 2 owns what we expect to earn, Pillar 4 owns what was agreed, Pillar 5 owns what was delivered, and Pillar 6 owns what was actually realized. Each value is retained separately, and the differences between them are the most useful numbers in the platform.

1. **Qualify and quote.** Pillar 2 records scoped services, quoted value, probability, and expected close date, supported by qualification evidence and interaction history.
2. **Register the channel.** If a partner sourced or influenced the opportunity, Pillar 3 registers the referral and the attribution basis before the deal closes, not after.
3. **Win and hand over.** The opportunity is won. Pillar 2 closes it with a win reason and passes scoped services and quoted value to Pillar 4. The deal is now won but not yet committed.
4. **Contract and fund.** Pillar 4 tracks documents to signature, records the negotiated value with its variance reason, captures payment terms and the purchase order, and only then opens the kickoff readiness gate.
5. **Deliver against the commitment.** Pillar 5 executes against contracted scope and dates, recording milestone completion, deliverable acceptance, delays with reasons, and the eventual audit or certification outcome.
6. **Bill and collect.** Milestone completion and contract schedule together trigger billing events in Pillar 6. Invoiced, recognized, and collected values are tracked separately, with unbilled balances visible throughout.
7. **Settle, learn, and renew.** Partner fees settle against collected revenue in Pillar 3. Variance between quoted, contracted, and realized value feeds the commercial loop; delivery outcome and payment behaviour feed the retention loop and the next renewal forecast.

> **IMPORTANT CONTROL**  A contract value must never silently overwrite the sales estimate. Retain the quoted amount, the negotiated amount, the approver, the date, and the variance reason so forecast accuracy stays measurable and every revenue number remains explainable.

---

# Cross-pillar dependency matrix

The matrix summarizes the most important contract each pillar has with the rest of the platform. It is a product-scope guide, not a complete integration catalog.

| Pillar | Owns | Primary inputs | Primary consumers | Key decisions enabled |
|---|---|---|---|---|
| **1. Client** | Account and contact identity, structure, segmentation, lifecycle status | Interaction signals; referral context; delivery and payment outcomes | Pipeline, partner, contract, delivery, revenue, intelligence | Who to target, who to trust, and who we are actually contracting with |
| **2. Pipeline** | Opportunities, stages, qualification, forecast, and the full interaction record | Client profile; partner referrals; contract outcomes; realized value | Client, partner, contract, delivery, revenue, intelligence | Pursue, requalify, re-engage, discount, or disqualify |
| **3. Partner** | Partner relationships, agreements, tiers, referral registration, attribution | Partner identity; opportunity credit; contracted and collected revenue | Client, pipeline, contract, revenue, intelligence | Credit a channel, settle a fee, promote a tier, or invest further |
| **4. Contract** | Documents, negotiated value, contracted scope, terms, billing schedule, renewals | Won opportunities; signatory identity; partner terms; scope changes | Pipeline, partner, delivery, revenue, intelligence | Sign, amend, gate kickoff, raise a change order, or renew |
| **5. Delivery** | Engagement record, delivery stages, milestones, outcomes, schedule variance | Contracted scope and dates; delivery progress; collection status | Contract, revenue, client, partner, intelligence | Escalate, re-forecast, request a change, or declare an outcome |
| **6. Revenue** | Contracted, invoiced, recognized and collected value, receivables, margin, LTV | Billing schedules; milestone triggers; account hierarchy; partner obligations | Pipeline, partner, delivery, client, intelligence | Invoice, chase, dispute, settle, or protect commercial value |
| **7. Client intelligence** | Cross-pillar KPI semantics, health, exceptions, decisions, action trail | Permission-filtered signals from Pillars 1–6 | Leadership and action owners in Pillars 1–6 | What needs attention, why, who acts, and whether it worked |

---

# End-to-end example scenario

**Scenario:** a partner-referred mid-market SaaS company needs SOC 2 Type II certification ahead of an enterprise procurement deadline. The platform must convert that need into a signed, delivered, and collected engagement while protecting the timeline and the commercial outcome.

1. **The referral is registered.** A virtual-CISO partner registers Northwind Analytics in Pillar 3 with a 90-day attribution window. Pillar 1 creates or matches the account, capturing industry, size, geography, and regulatory exposure.
2. **The opportunity is qualified.** Pillar 2 opens a SOC 2 Type II opportunity, quotes INR 18,00,000, and records the qualification evidence — the enterprise procurement deadline driving urgency, the CTO as economic buyer, and confirmed budget.
3. **Engagement builds the case.** Discovery calls, a scoping session, and a proposal walkthrough are recorded in Pillar 2. Contact roles and relationship strength update the account record in Pillar 1.
4. **The deal is won and handed over.** The opportunity closes won inside the attribution window. Pillar 3 credits the partner as sourced. Pillar 2 passes scoped services and quoted value to Pillar 4. The deal is won, but not yet committed.
5. **The contract is agreed.** Pillar 4 tracks the SOW to signature at INR 15,50,000, recording reduced scope as the variance reason. Payment terms are 40/60 against signature and certification, net 30. The purchase order arrives and the kickoff readiness gate opens.
6. **Delivery begins and slips.** Pillar 5 runs scoping, gap assessment, and remediation. Three client-side evidence items stall, putting the engagement eleven days behind its readiness date, and the audit window is re-forecast.
7. **Commercial consequences follow.** Pillar 6 has collected the INR 6,20,000 signature milestone. The certification-linked INR 9,30,000 moves with the audit date and remains contracted but unbilled — turning a delivery delay into a visible revenue timing risk.
8. **Intelligence drives correction.** Pillar 7 marks the client At Risk, explains the contributing signals, quantifies the exposure, and recommends escalating the client dependency, re-forecasting the billing milestone, and opening the DPDP renewal conversation early.
9. **The loop closes.** Certification is achieved and the final milestone is invoiced and collected. The partner fee settles in Pillar 3. Quoted-to-contracted-to-realized variance feeds the commercial loop, the certification outcome becomes reference value in Pillars 1 and 2, and payment behaviour informs the renewal forecast.

---

# Product implications and review checklist

## Shared platform services

- Identity, role-based permissions, and field-level control over pricing, contract terms, margin, and collections data.
- A shared time model for fiscal periods, contract terms, attribution windows, revenue periods, and forecast horizons.
- Canonical taxonomies for client status, opportunity stage, service line, contract type, delivery stage, and health thresholds.
- Workflow and notification services for approvals, exceptions, acknowledgements, escalations, and due dates.
- Analytics definitions with metric lineage, snapshotting, data-quality monitoring, and drill-down reconciliation.
- Integration boundaries for the workforce platform, finance and billing systems, document signature, email and calendar, and identity providers.

## PRD review questions

- **Ownership:** Is every entity and metric owned by exactly one pillar?
- **Commercial states:** Are quoted, contracted, invoiced, recognized, and collected values distinguishable everywhere they appear?
- **Workflow:** Can a user move from exception to corrective action without losing context?
- **Temporal accuracy:** Are current, historical, and forecast values clearly separated?
- **Explainability:** Can client health, deal confidence, and revenue quality be traced to source evidence?
- **Attribution:** Are sourced, influenced, and co-sold credit defined unambiguously, with a rule for shared credit and contested claims?
- **Security:** Are pricing, contract terms, margin, and collections data protected by purpose and role?
- **Data quality:** What happens when accounts are duplicated, contacts go stale, contracts are unsigned, or milestones are recorded late?
- **Decision rights:** Who can discount, sign, amend, gate kickoff, waive a fee, write off, and close an exception?
- **Success metrics:** Does each pillar have adoption, data-quality, operational, and outcome measures?

> **RECOMMENDED PRODUCT FRAMING**  Position the platform as the commercial operating layer between the market and delivery: a single place to decide which clients to pursue, what to commit to, what to deliver, and what that relationship is ultimately worth.
