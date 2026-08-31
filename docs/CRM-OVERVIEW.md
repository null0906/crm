# SecComply Command Center — Product & Technical Documentation

The internal CRM and delivery-management system for SecComply, an Indian cybersecurity-compliance consultancy.

This document is in two halves. **Parts 0–5** describe what the product does and what problem each feature solves — readable by anyone. **Parts 6–11** are the developer reference: architecture, data model, API surface, integrations, and local setup.

---

## Table of contents

- [Part 0 — What this is and the problem it solves](#part-0--what-this-is-and-the-problem-it-solves)
- [Part 1 — Vocabulary](#part-1--vocabulary)
- [Part 2 — The lifecycle](#part-2--the-lifecycle)
- [Part 3 — Feature modules](#part-3--feature-modules)
- [Part 4 — Automation and notifications](#part-4--automation-and-notifications)
- [Part 5 — Roles and permissions](#part-5--roles-and-permissions)
- [Part 6 — Architecture](#part-6--architecture)
- [Part 7 — Data model](#part-7--data-model)
- [Part 8 — API surface](#part-8--api-surface)
- [Part 9 — Integrations](#part-9--integrations)
- [Part 10 — Running it locally](#part-10--running-it-locally)
- [Part 11 — Known gaps and stale documentation](#part-11--known-gaps-and-stale-documentation)

---

## Part 0 — What this is and the problem it solves

SecComply sells and delivers cybersecurity compliance engagements: SOC 2 Type I/II, ISO 27001, India's DPDP Act, VAPT, CSPM, CERT-IN, and AI governance. That business has two halves, and generic CRMs only cover the first one.

**Half one is a sale.** A lead becomes a qualified prospect, gets a demo, receives a proposal, negotiates, and closes. Every CRM on the market handles this.

**Half two is a delivery project** that runs for three to twelve months after the sale: gap assessment, remediation, evidence collection, internal audit, external audit, certification. Generic CRMs stop at "Closed Won" and hand you off to a separate project tool, where the customer record, the contract value, the contact history, and the consultant's notes all have to be re-entered and then drift apart.

This system covers both halves in one database, with one contact record and one continuous history.

### The specific problems it solves

**1. The won-deal cliff.** Winning a deal doesn't end the record — it starts two more. A won prospect flows into an **Onboarding** record that tracks the contractual reality of starting work (MSA, NDA and SOW sent and signed; PO number; payment terms; first payment received; kickoff scheduled), and from there into a **Project** with compliance-specific delivery stages. Nothing is re-keyed. The chain from first email to certification is one query away.

**2. Revenue truth.** The amount on a prospect is an estimate made during the sale. The amount actually agreed is negotiated during onboarding and is often different. Reporting on the estimate gives you the wrong number. The system resolves this with a database view, `deals_with_value`, whose `effective_value` column coalesces the onboarding's engagement amount over the prospect's estimate. Every metric that reports money reads that column, never `deals.amount`.

**3. Consultants don't live in the CRM.** People doing compliance work are in client calls, in evidence spreadsheets, and in chat — not in a browser tab labelled CRM. So the CRM comes to them: Telegram, WhatsApp, and Microsoft Teams bots accept the same command set (`/add`, `/note`, `/log`, `/find`, `/today`, `/mytasks`) to create contacts and log activity from wherever they already are. And rather than expecting people to pull dashboards, the system pushes — morning briefings, daily reminder digests, weekly summaries, and scheduled dashboard digests over email and Telegram.

**4. Managers can't write SQL, and shouldn't have to.** The built-in AI assistant answers questions in plain language ("how many SOC 2 prospects are stuck in proposal?", "what did Runal do last week?"). It is not a thin chat wrapper: it has a typed tool library over the CRM, and a last-resort SQL escape hatch that is parsed and validated before execution. Critically, every answer is scoped to the asker's permissions — an Analyst asking about pipeline value gets their own prospects, with money redacted.

**5. Partner-sourced revenue needs attribution.** A meaningful share of business arrives through partner firms. Contacts and prospects both carry a `referredByPartnerId`, so the Partners module can answer "what has this partner actually brought us" — referred leads, open and won deals, and revenue — rather than leaving attribution as tribal knowledge.

**6. Compliance work is auditable by its nature.** A firm that audits other firms should be able to answer questions about its own record-keeping. Every mutation writes to an audit log with the acting user, IP, and a JSON diff. Prospect and project stage changes are recorded as append-only history with entry and exit timestamps. `createdBy` is immutable on every core record even when ownership is reassigned.

### Scope limits worth stating up front

- **Single tenant.** There is no `tenant_id`, no organization scoping, and no row-level security. This is SecComply's own deployment, not a product sold to other firms. Isolation between users is by ownership and role, not by tenant.
- **India-first defaults.** Currency defaults to INR, timezone to `Asia/Kolkata`. Deal-size histograms bucket in lakhs and crores. Scheduled digests are configured in IST.
- **No document storage.** Contracts are tracked by *status* (sent / signed), not stored as files. See [Part 9](#configured-but-not-wired-up).

---

## Part 1 — Vocabulary

The UI and the code use different words for several of the same things. This table is load-bearing — misreading it will make the rest of the document confusing.

| In the UI | In the code / database | Note |
|---|---|---|
| **Prospect** | `deals` table, `Deal` type, `deals` permission module | The single most common source of confusion. Sidebar says "Prospects", the route is `/deals`. |
| **Analyst** | `sales_rep` role slug | Renamed for display only, in [`src/lib/roles.ts`](../src/lib/roles.ts). The slug is still `sales_rep` everywhere in code and permission checks. |
| **Onboarding** | `onboardings` table | The contractual handoff between a won sale and delivery work. Not to be confused with employee onboarding. |
| **Project** | `projects` table | The compliance delivery engagement itself. |
| **Effective value** | `deals_with_value.effective_value` | The authoritative money figure: the negotiated engagement amount if one exists, else the prospect's estimate. |
| **Sales pipeline** | `pipelines.isSalesPipeline = true` | Only pipelines with this flag create an Onboarding record when a deal is won. |
| **Delivery pipeline** | `pipelines.pipelineType = 'active_delivery'` | Deals on these pipelines expose a Project tab. |

Beyond naming: there are **three separate task systems** (prospect tasks, project tasks, and personal tasks) with three different status vocabularies. See [Part 7](#the-three-task-tables).

---

## Part 2 — The lifecycle

This is the spine of the product. Everything else hangs off it.

```
   Contact ──┐
             ├──▶ Prospect ──▶ [won] ──▶ Onboarding ──▶ Project ──▶ Certified
   Company ──┘    (pipeline           (docs → payment    (delivery
                   stages)             → kickoff)         stages)
```

### Stage by stage

**Contact and Company** are the people and accounts. A contact may belong to a company, and either may carry a `referredByPartnerId` pointing at a partner company.

**Prospect** is the sale. It sits on a *pipeline*, at a *stage*. Pipelines and their stages are configurable data, not hardcoded enums — three ship seeded, and the compliance workflows provision two more on demand:

| Pipeline | Stages (with default probability) |
|---|---|
| **Sales Pipeline** (default) | Lead In 10 → Qualified 25 → Discovery 40 → Demo 55 → Proposal 70 → Negotiation 85 → **Closed Won** 100 / **Closed Lost** 0 |
| **Enterprise Pipeline** | Inbound 10 → Qualification 20 → Technical Assessment 35 → POC 50 → Security Review 65 → Commercial 80 → **Closed Won** 100 / **Closed Lost** 0 |
| **Partner Pipeline** | Identified 10 → Outreach 25 → Evaluation 50 → Agreement 75 → **Active Partner** 100 / **Declined** 0 |
| **SOC 2 Workflow** (provisioned on first visit) | Scoping 10 → Gap Assessment 25 → Remediation 50 → Readiness Review 75 → Audit 90 → **Certified** 100 / **Not Pursued** 0 |
| **DPDP Workflow** (provisioned on first visit) | Gap Assessment 15 → Data Mapping 30 → Policy Draft 50 → Implementation 70 → DPA Registration 85 → **Compliant** 100 / **Dropped** 0 |

Every stage move writes a row to `deal_stage_history` with entry and exit timestamps, which is what makes velocity reporting possible.

**Onboarding** begins when a prospect on a sales pipeline is won. It is a strict one-to-one with the prospect (`onboardings.deal_id` is `UNIQUE NOT NULL`, cascade delete). Its stages are:

`Documents Pending → Documents Sent → Documents Signed → Payment Pending → Payment Received → Kickoff Scheduled → Onboarding Complete` (or `Cancelled`)

Underneath the stage, three contract documents are tracked independently, each with its own status and sent/signed timestamps: **MSA**, **NDA**, and **SOW**. Alongside them sit the commercial facts — engagement amount and breakdown, a variance reason if it differs from the quoted amount, payment terms, PO number and date, first payment amount and date — and the kickoff details.

**Project** is the delivery engagement. It can be created from an onboarding, linked directly to a prospect, or created standalone (`projects.deal_id` is nullable). Its stages are:

`Project Kickstarted → Gap Assessment → Implementation → Internal Audit → External Audit & Certified` (or `Lost`)

A note for developers reading the schema: the database `ProjectStage` union has eight values, but the UI picker in [`src/lib/projects.ts`](../src/lib/projects.ts) exposes only six, relabelled. `certified` is folded into the "External Audit & Certified" label and `on_hold` is unreachable through the pipeline mapping, though both remain valid stored values.

### Which transitions are automatic

- **Prospect won → Onboarding created**: automatic, but only for pipelines flagged `isSalesPipeline`. Won deals on other pipelines do not create one. Super admins can also add an eligible won deal manually from the Onboarding page.
- **Onboarding → Project**: manual. The onboarding records the resulting project in `convertedToProjectId`.
- **Everything else**: manual stage moves, each recorded in history.

---

## Part 3 — Feature modules

Presented in sidebar order. The sidebar has four groups — an unlabelled main group, Compliance, Insights, and Admin.

### Contacts — `/contacts`, `/contacts/[id]`

**What it is:** the people database.

**Problem it solves:** leads arrive from Apollo exports, the website, events, referrals, and cold outreach, and without one home they live in individual inboxes and spreadsheets.

**What you can do:** search and filter by status and source; save and pin filter views; apply tags; toggle which columns are visible; import from CSV through a mapping wizard; export to CSV (Excel-safe — phone numbers are force-quoted so Excel doesn't eat leading zeros); bulk delete; create and edit in a slide-over without leaving the list; and fire per-row quick actions (open WhatsApp, call, email, schedule, add note).

Each contact carries a **lead score** that a nightly automation recalculates, a status (`new → contacted → qualified → nurturing → converted`, or `unqualified` / `lost` / `archived`), and an optional partner referral. The detail page has five tabs: Overview, Activity, Prospects, Demos, Tasks.

**Key files:** [`src/app/(dashboard)/contacts/`](<../src/app/(dashboard)/contacts/>), [`src/server/services/contact.service.ts`](../src/server/services/contact.service.ts), [`src/components/import-export/ImportWizard.tsx`](../src/components/import-export/ImportWizard.tsx)

### Companies — `/companies`, `/companies/[id]`

**What it is:** the accounts database — prospects, customers, partners, vendors, and competitors, distinguished by `companyType`.

**Problem it solves:** several contacts, several prospects, and several projects all belong to one organisation, and you need to see that organisation whole.

**What you can do:** search and filter by type, status and size; tag; import and export; manage columns. The detail page has seven tabs — Overview, Activity, Contacts, Prospects, Projects, Demos, Tasks — which together answer "what is our entire relationship with this account".

Domains are deduplicated by a **partial unique index**: a domain is unique among non-deleted rows only, so a soft-deleted company doesn't block re-adding the same domain.

**Key files:** [`src/app/(dashboard)/companies/`](<../src/app/(dashboard)/companies/>), [`src/server/services/company.service.ts`](../src/server/services/company.service.ts)

### Prospects — `/deals`, `/deals/[id]`

**What it is:** the sales pipeline. Called "deals" in code.

**Problem it solves:** knowing what is actually in play, where it is stuck, and what it's worth.

**What you can do:** switch between a **drag-and-drop kanban board** (stages as columns, powered by dnd-kit, with position preserved within each stage) and a **table view**; filter by status and by service sold; tag; import deals from CSV; and repair broken deal↔contact/company links with the backfill wizard.

Each prospect records the services being sold (VAPT, SOC 2, ISO 27001, PCI DSS, Cloud Security, GRC Consulting, Compliance Automation, Security Awareness Training, Audit Support, Other), an amount and probability, expected and actual close dates, win/loss reasons, a primary contact plus a wider contact list with roles (decision maker, champion, influencer, stakeholder, blocker), an owner, and a **deal team** — and that team membership is what grants Analysts visibility into a prospect they don't own.

The detail page has six tabs: Overview, Project (only on delivery pipelines), Activity, Demos, Tasks, Stage History.

A nightly automation compares each prospect's time in its current stage against computed pipeline benchmarks and flags it `isVelocitySlow` when it's dragging.

**Key files:** [`src/app/(dashboard)/deals/`](<../src/app/(dashboard)/deals/>), [`src/server/services/deal.service.ts`](../src/server/services/deal.service.ts)

### Onboarding — `/onboarding` *(super admin only)*

**What it is:** the contractual handoff between a won sale and delivery work.

**Problem it solves:** the gap where deals go quiet. A deal is "won", but nobody has signed the SOW, the PO hasn't arrived, no payment has landed, and no kickoff is booked — and none of that is visible in a pipeline that already moved the card to Closed Won. This module makes that gap explicit and trackable.

**What you can do:** list and search onboardings; manually add an eligible won deal that didn't auto-create one; record MSA/NDA/SOW status and dates; enter engagement amount and breakdown, with a variance reason when it differs from what was quoted; record payment terms, PO number, and first payment; schedule kickoff with a meeting link and notes; assign a delivery team; and move stages, with full stage history.

The engagement amount entered here is what `effective_value` reports downstream — this page is where revenue reporting gets its truth.

**Key files:** [`src/app/(dashboard)/onboarding/page.tsx`](<../src/app/(dashboard)/onboarding/page.tsx>), [`src/server/services/onboarding.service.ts`](../src/server/services/onboarding.service.ts)

### Projects — `/projects`, `/projects/[id]`

**What it is:** delivery engagements — the months of work after the sale.

**Problem it solves:** compliance delivery has its own stages, its own task categories, and its own definition of "late", none of which fit a sales pipeline.

**What you can do:** view as kanban or list, move stages by drag; create standalone projects or projects linked to a prospect; track progress percent against stage (each stage carries a default: kickoff 10%, gap assessment 30%, implementation 45%, internal audit 55%, external audit 80%, certified 100%); flag a project delayed with a reason and a revised end date; manage a task list with compliance-specific categories (documentation, evidence collection, gap remediation, audit prep, policy, training, review); and add or remove team members with roles (lead, member, reviewer, consultant).

Project service types: SOC 2 Type I, SOC 2 Type II, ISO 27001, DPDP, VAPT, CSPM, AI Governance, CERT-IN, Custom.

Stage history on projects carries a genuine generated column, `durationHours`, so time-in-stage is computed by the database rather than at read time.

**Key files:** [`src/app/(dashboard)/projects/`](<../src/app/(dashboard)/projects/>), [`src/server/services/project.service.ts`](../src/server/services/project.service.ts), [`src/lib/projects.ts`](../src/lib/projects.ts)

### Partners — `/partners`

**What it is:** the referral-partner view.

**Problem it solves:** partner-sourced revenue is invisible if referral is only remembered in someone's head. Both contacts and prospects carry a partner reference, and this page reads it back as attribution.

**What you can do:** browse partner companies; see deals and contacts by partner; see referred leads; read attribution stats (referred lead count, open and won deals, won revenue, pipeline value); attach an existing sales deal to a partner retroactively; and create a new deal directly against a partner.

Revenue figures on this page are nulled out for Analysts, consistent with amount masking elsewhere.

**Key files:** [`src/app/(dashboard)/partners/page.tsx`](<../src/app/(dashboard)/partners/page.tsx>), [`src/server/trpc/routers/partner.router.ts`](../src/server/trpc/routers/partner.router.ts)

### AI Assistant — `/ai-chat`, plus a floating widget on every page

**What it is:** natural-language question answering over the CRM.

**Problem it solves:** most questions people have about the CRM ("which prospects have gone quiet?", "what's the pipeline for ISO 27001?", "how did the team do last month?") are one query away for someone who can write SQL and impossible for everyone else.

**How it works:** the assistant is built on the Vercel AI SDK against Groq, and runs an agentic loop with a typed tool library — it is not text-to-SQL by default. Tools are constructed fresh per message with the caller's real session closed over them, so the model cannot claim to be someone else:

| Tool group | Tools |
|---|---|
| CRM reads | `list_contacts`, `get_contact`, `get_contacts_by_company`, `list_companies`, `get_company`, `list_prospects`, `get_prospect`, `get_prospects_by_stage`, `get_prospects_by_company`, `get_prospects_by_contact` |
| Activity | `resolve_crm_user`, `get_activity_by_person`, `get_pipeline_value`, `search_tags` |
| Reporting | `get_rep_report`, `get_executive_overview_summary`, `get_executive_member_detail` |
| Metrics | `get_daily_metrics` |
| Escape hatch | `run_custom_query` — raw SQL, only when no typed tool fits |
| Clarification | `ask_clarifying_question` |

**The SQL safety layer** ([`src/server/services/sql-safety.service.ts`](../src/server/services/sql-safety.service.ts)) parses the generated SQL to an AST with `node-sql-parser` before it goes anywhere near the database. It permits `SELECT` and `WITH` only, blacklists mutating keywords, blocks access to `pg_*`, `information_schema`, auth tables and password columns, caps results at 500 rows, and applies a 5-second statement timeout. For Analysts it additionally injects an ownership `WHERE` filter and rejects the query outright if it references financial columns.

Rather than guess at an ambiguous question, the assistant can call `ask_clarifying_question` and offer options. Sessions and messages are persisted, including the SQL that was generated and the tool calls that were made — so any answer can be audited after the fact.

**Key files:** [`src/server/services/ai-chat.service.ts`](../src/server/services/ai-chat.service.ts), [`src/server/services/ai-tools/`](../src/server/services/ai-tools/)

### Activities — `/activities`

**What it is:** the interaction timeline.

**Problem it solves:** "when did we last talk to them, and what was said" — answerable only if every touch lands in one place regardless of which module it happened in.

**What you can do:** filter the global feed by user and activity type, and log activity from a slide-over panel. Activity types available to log: call, email sent, email received, meeting, note, task, SMS, WhatsApp, LinkedIn, demo, proposal. The system also generates activities of its own — document, stage change, status change, assignment, custom — which appear in the feed but aren't manually loggable.

Calls capture direction and outcome (connected, voicemail, no answer, busy, wrong number) and duration. Meetings capture start/end, location, and link. Each activity can associate to any combination of contact, company, and prospect, and a sync service attaches new activity to the matching prospect automatically where it can.

**Key files:** [`src/app/(dashboard)/activities/page.tsx`](<../src/app/(dashboard)/activities/page.tsx>), [`src/server/services/activity.service.ts`](../src/server/services/activity.service.ts), [`src/server/services/activity-sync.service.ts`](../src/server/services/activity-sync.service.ts)

### My Tasks — `/tasks`

**What it is:** personal work tracking with hours.

**Problem it solves:** consultancy work needs a defensible record of who spent time on what — for utilisation, for client billing conversations, and for the weekly team report — and that record has to be cheap enough to keep that people actually keep it.

**What you can do:** add a task, optionally linked to a project or prospect and optionally flagged internal; see stats (total, completed, hours logged, average per day); complete a task with hours spent; cancel with a reason; delete. Super admins can assign tasks to others, and the assignee sees who assigned it.

Note the status vocabulary here differs from the other task tables: personal tasks are `in_progress → completed` or `cancelled`, and they start `in_progress` — there is no pending state, because a task you haven't started isn't worth logging.

**Key files:** [`src/app/(dashboard)/tasks/page.tsx`](<../src/app/(dashboard)/tasks/page.tsx>), [`src/server/services/personal-task.service.ts`](../src/server/services/personal-task.service.ts)

### Compliance workflows — `/compliance/soc2`, `/compliance/dpdp`

**What it is:** two purpose-built kanban boards for the two frameworks SecComply sells most.

**Problem it solves:** a SOC 2 engagement and a DPDP engagement move through genuinely different checkpoints, and forcing both through a generic sales pipeline loses the detail that matters.

Both pages share one component and differ only by configuration. On first visit each **provisions its pipeline idempotently** — if a compliance pipeline with that name already exists it is reused, otherwise it is created with its stages. Stage lists are in [Part 2](#stage-by-stage).

**Key files:** [`src/components/compliance/ComplianceWorkflow.tsx`](../src/components/compliance/ComplianceWorkflow.tsx), [`src/server/trpc/routers/compliance.router.ts`](../src/server/trpc/routers/compliance.router.ts)

### Executive Overview — `/executive-overview` *(super admin only)*

**What it is:** the leadership view of the whole business.

**Problem it solves:** the question "what is everyone working on and what's at risk" requires joining across prospects, projects, and activity, per person — a report nobody assembles by hand every week.

**What you can do:** see active projects with progress and end dates, **hot prospects** (those where the effective probability — explicit, or the stage default — is 70 or above), completed projects, and per-team-member cards. Clicking a member opens a drill-down slide-over showing their prospects, project involvement, and recent activity.

The same data is available to the AI assistant through `get_executive_overview_summary` and `get_executive_member_detail`, gated by the same permission check.

**Key files:** [`src/app/(dashboard)/executive-overview/page.tsx`](<../src/app/(dashboard)/executive-overview/page.tsx>), [`src/server/services/executive-overview.service.ts`](../src/server/services/executive-overview.service.ts)

### Command Center — `/command-center`

An operational snapshot for the start of the day: metric tiles for Open Tasks, Due Today, Active Deals, and Demo Records, alongside panels for Recent Activity, Open Follow-ups, Recent Demos, and Active Deals. Where Executive Overview answers "how is the business", Command Center answers "what needs me today".

### Dashboard — `/dashboard`

**What it is:** a build-your-own widget dashboard.

**Problem it solves:** different roles need different numbers, and hardcoding one dashboard means most people ignore it.

**What you can do:** maintain multiple dashboards; drag and resize widgets on a grid; add, configure, and delete widgets; set visibility (private, team, everyone); switch data source (Sales, Enterprise, Partner); auto-refresh; and go fullscreen. Dashboards can be published with a public share token for viewing without a login.

Widget types include metric cards (win rate, open prospects, contacts, companies), bar/line/pie/funnel charts, tables, pipeline summary, activity feed, leaderboard, goal tracker, conversion rate, time in stage, forecast, onboarding stats, and custom query.

Widgets are rendered with Recharts in the browser — and re-rendered server-side into email and Telegram digests, so a dashboard doubles as a scheduled report.

**Key files:** [`src/app/(dashboard)/dashboard/page.tsx`](<../src/app/(dashboard)/dashboard/page.tsx>), [`src/components/dashboard/WidgetRenderer.tsx`](../src/components/dashboard/WidgetRenderer.tsx)

### Reports — `/reports`, `/reports/[userId]`, `/reports/tasks`

**What it is:** per-person performance reporting and team time tracking.

**Problem it solves:** reviews, one-on-ones, and capacity planning need consistent numbers over consistent periods, with like-for-like comparison to the period before.

**`/reports`** lists reportable team members with a date-range selector. Presets: this week, last week, this month, last month, this quarter, last quarter, till date, plus custom.

**`/reports/[userId]`** is the individual report, with tabs for Activity Summary, Pipeline (including top deals), and Demos. It shows a highlights banner, a weekly breakdown, and comparison against the previous period, and exports to **PDF** (rendered server-side) and the activity feed to **CSV** (with the applied filters written into the file so an exported report is self-describing).

**`/reports/tasks`** *(super admin only)* is team task time tracking — team summary, all tasks, assign a task to someone, and export to CSV, styled multi-sheet Excel, or PDF.

Access rule: you can always view your own report. Viewing someone else's requires the `reports.view` permission or a role slug in the manager set. Analysts see reports with **deal amounts suppressed**.

**Key files:** [`src/server/services/report.service.ts`](../src/server/services/report.service.ts), [`src/server/services/report-access.ts`](../src/server/services/report-access.ts), [`src/server/lib/report-pdf.tsx`](../src/server/lib/report-pdf.tsx)

### Settings — `/settings` and twelve sub-pages

| Group | Page | Purpose |
|---|---|---|
| CRM | `/settings/tags` | Tags and tag categories. Seeded categories: Framework Interest, Engagement Status, Lead Source, Industry Vertical, Prospect Priority |
| CRM | `/settings/pipelines` | Create and configure pipelines; drag to reorder stages; set colours and default probabilities |
| CRM | `/settings/custom-fields` | Define custom fields on contacts, companies, prospects and projects — 18 field types including currency, select, multi-select, rating, percentage, and references to users/contacts/companies |
| Administration | `/settings/users` | Users and roles: create, edit, assign role, reset password, delete; edit the per-role permission matrix; jump to a user's report |
| Administration | `/settings/audit-log` | The system-wide audit trail |
| Administration | `/settings/api-access` | Issue and revoke read-only bearer tokens for external automations. The plaintext token is shown once and never stored |
| Data | `/settings/data-migration` | One-time backfill of demo and discovery records from legacy activity data, with preview before run |
| Integrations | `/settings/telegram` | Link Telegram users to CRM users, verify, review the message log |
| Integrations | `/settings/whatsapp` | Same, for WhatsApp |
| Integrations | `/settings/teams` | Same, for Microsoft Teams, plus bulk-link by email through Microsoft Graph |
| Integrations | `/settings/digests` | Scheduled dashboard digests over email and Telegram, with send-now |
| Integrations | `/settings/automations` | Enable/disable each automation, run any of them on demand, and configure stale-lead thresholds |

### Cross-cutting UI

- **Command palette** (⌘K / Ctrl+K) — global search across contacts, companies and prospects with keyboard navigation.
- **Notification bell** — in-app notifications with unread count, mark-read and mark-all-read.
- **Mobile bottom navigation** — Leads, Companies, Prospects, Projects, AI, Activity, Tasks.
- **Saved views** — named filter/column/sort combinations per entity, private, team-wide, or global, pinnable to the top of a list.
- **Collapsible sidebar** — state persisted in localStorage.

---

## Part 4 — Automation and notifications

Automation is bootstrapped in-process from [`src/instrumentation.ts`](../src/instrumentation.ts) → `initializeCron()` in [`src/server/lib/cron.ts`](../src/server/lib/cron.ts), using `node-cron`, guarded against double-registration.

**All cron expressions are UTC.** IST is UTC+5:30.

| Schedule (UTC) | IST | Job | What it does |
|---|---|---|---|
| `* * * * *` | every minute | `checkAndRunSchedules` | Digest scheduler — matches due digest schedules and sends them |
| `30 0 * * *` | 06:00 | `recalculateLeadScores` | Recomputes contact lead scores |
| `30 2 * * *` | 08:00 | `detectDelayedDeals` + `detectDelayedProjects` | Flags prospects and projects past their end date |
| `30 2 * * 1` | Mon 08:00 | `sendWeeklySummary` | Weekly team performance summary over email and Telegram |
| `0 3 * * *` | 08:30 | `createStaleAlerts` | Raises alerts for prospects and contacts with no recent activity |
| `30 3 * * *` | 09:00 | `sendMorningBriefings` | Per-user morning briefing |
| `0 4 * * *` | 09:30 | `sendConsolidatedReminderDigest` | One email per owner combining due tasks and stale prospects |
| `30 20 * * *` | 02:00 next day | `calculatePipelineBenchmarks` | Recomputes average days-in-stage; feeds the `isVelocitySlow` flag |

### Toggleable automations

Seven automations can be switched on and off, and run on demand, from **Settings → Automations**. Each records its last run time and result in `automation_config`, with idempotency guards so a manual run doesn't double-fire:

`lead_score` · `stale_alerts` · `morning_briefings` · `duplicate_detection` · `pipeline_benchmarks` · `weekly_summary` · `delayed_projects`

Stale-lead behaviour is configurable: enable/disable, inactivity threshold in days (default 3), a cooldown in hours so the same lead isn't flagged repeatedly (default 24), and which pipelines to watch (default: sales, partner, enterprise).

### Digest schedules

A digest binds a dashboard to a schedule and a recipient list. The scheduler wakes every minute, converts to IST, and matches on time-of-day plus daily / weekly (day of week) / monthly (day of month). It renders the dashboard's widgets server-side and sends to email recipients and Telegram chat IDs, then stamps `lastSentAt`.

### Event bus

Some automations are event-driven rather than scheduled, over an in-process `mitt` bus ([`src/server/lib/event-bus.ts`](../src/server/lib/event-bus.ts)). Duplicate contact detection, for example, subscribes to `contact.created`. Login and login-failure events are emitted from the auth layer, and import completion from the import router.

### Reminder digest

The daily reminder digest is assembled rather than sent piecemeal: [`reminder-digest.service.ts`](../src/server/services/reminder-digest.service.ts) merges due tasks (from `task-reminder.service.ts`) and stale prospects (from `deal-inactivity.service.ts`) into a **single email per owner**, so nobody gets four separate nags before breakfast. Note that `deal-inactivity.service.ts` carries a hardcoded CC list.

---

## Part 5 — Roles and permissions

Access control has **two independent layers**, and understanding both matters — the second one overrides your intuitions about the first.

### Layer A — declarative permissions

Each role owns a JSONB `permissions` blob ([`RolePermissions`](../src/lib/types.ts)). Each module/action pair holds a `PermissionLevel`:

| Value | Meaning |
|---|---|
| `false` | denied |
| `true` | allowed (for boolean actions like create, delete, export) |
| `'own'` | only records you own |
| `'team'` | only your team's records |
| `'all'` | everything |

Modules: `contacts`, `companies`, `deals`, `activities`, `dashboards`, `settings`, `reports`, `imports`, `audit_log`, `tags`, `users`, `roles`, `telegram`, `digests`, `tasks`.

Enforced by `requirePermission` / `requirePermissionLevel` in [`src/server/trpc/middleware.ts`](../src/server/trpc/middleware.ts), with helpers in [`src/server/lib/permissions.ts`](../src/server/lib/permissions.ts).

### Layer B — hard-coded visibility filters

This is what actually scopes prospect and project queries at the SQL level, in [`src/server/lib/visibility-filters.ts`](../src/server/lib/visibility-filters.ts):

```ts
const FULL_VISIBILITY_ROLES = new Set(['super_admin', 'sales_manager', 'viewer']);
```

A role outside that set sees a prospect only if they **own it**, **created it**, or **are on its deal team**. Projects follow the identical rule via `project_members`.

> **Trap worth knowing.** Layer B matches on **role slug**, not on the permissions JSON. A new custom role you create in Settings will be scoped-by-default no matter how permissive its `permissions` blob is, because its slug isn't in that hardcoded set. Widening a custom role's visibility requires a code change.

### The five seeded roles

| Capability | Super Admin | Sales Manager | Analyst (`sales_rep`) | Viewer | Intern |
|---|---|---|---|---|---|
| Contacts — read | all | all | all | all | team |
| Contacts — create / update / delete / export | ✅ / all / ✅ / ✅ | ✅ / all / ✅ / ✅ | ✅ / own / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ |
| Companies — read | all | all | all | all | team |
| Companies — create / update / delete / export | ✅ / all / ✅ / ✅ | ✅ / all / ✅ / ✅ | ✅ / own / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ |
| Prospects — read | all | all | **own** | all | **none** |
| Prospects — create / update / delete / export | ✅ / all / ✅ / ✅ | ✅ / all / **❌** / ✅ | ✅ / own / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ |
| Activities — read | all | all | own | all | own |
| Activities — create / update / delete | ✅ / all / ✅ | ✅ / all / ❌ | ✅ / own / ❌ | ❌ / ❌ / ❌ | ✅ / own / ❌ |
| Dashboards — read / create / publish | all / ✅ / ✅ | all / ✅ / ✅ | all / ❌ / ❌ | all / ❌ / ❌ | all / ❌ / ❌ |
| Reports — view / export | ✅ / ✅ | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | ❌ / ❌ |
| Imports | ✅ | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage tags | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage users / roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings: custom fields / pipelines | ✅ | ❌ | ❌ | ❌ | ❌ |
| Telegram / digests | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign tasks to others | ✅ | ❌ | ❌ | ❌ | ❌ |
| Full record visibility (layer B) | ✅ | ✅ | ❌ | ✅ | ❌ |

Source of truth: [`src/server/db/seed.ts`](../src/server/db/seed.ts).

Note the shape of **Viewer**: read-everything, change-nothing, and *in* the full-visibility set — it exists for leadership and audit access, not for restricted users. **Intern** is the genuinely restricted role: team-scoped contacts and companies, no prospect access at all, no reports.

### Super-admin-only surfaces

`/onboarding` · `/reports/tasks` · `/executive-overview` · the user assignment dropdown on project detail · task assignment to other users.

These are gated in the routers, not just hidden in the sidebar.

### Amount masking for Analysts

Deal amounts are suppressed for the `sales_rep` role, and this is enforced in **several independent places** rather than one — worth knowing before you add a new surface that exposes money:

- `crm-read.tools.ts` and `reporting.tools.ts` (AI assistant)
- `reports.router.ts` (two separate procedures)
- `search.router.ts` (global search results)
- `partner.router.ts` (attribution revenue)
- `sql-safety.service.ts` (blocks financial columns outright in raw SQL)

Analysts are also blocked from querying other users' activity in `activity.tools.ts`.

---

## Part 6 — Architecture

### Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.2** (App Router), React 19.2.4, TypeScript 5 |
| API | **tRPC v11** + TanStack React Query v5 — one HTTP route, ~200 typed procedures |
| Database | **PostgreSQL** via `pg` / `pg-pool` |
| ORM | **Drizzle ORM 0.45** + `drizzle-kit`. **Not Prisma** — there is no `schema.prisma` |
| Auth | **NextAuth v5 (beta)**, Credentials provider + bcryptjs, **JWT strategy, 7-day sessions** |
| Styling | Tailwind CSS v4, Radix UI primitives, CVA, CSS-variable theming |
| AI | Vercel AI SDK v7 + **Groq** (`llama-3.3-70b-versatile` default, with a fallback chain) |
| Charts / grid | Recharts, `react-grid-layout`, `@dnd-kit` for kanban |
| Docs export | `@react-pdf/renderer` (PDF), `exceljs` (XLSX) |
| Scheduling | `node-cron`, in-process |
| Deployment | Railway via nixpacks, Node 22 |

`@auth/drizzle-adapter` is installed but unused — the auth config uses JWT sessions, so there is no sessions table.

### Directory map

```
src/
├── app/
│   ├── (auth)/login/            Sign-in page
│   ├── (dashboard)/             All authenticated pages; layout.tsx is the auth gate
│   └── api/                     7 REST routes (auth, health, trpc, metrics, 3 webhooks)
├── components/
│   ├── layout/                  Sidebar, Topbar, CommandPalette, MobileBottomNav
│   ├── ui/                      Radix-based primitives
│   └── <domain>/                contacts, companies, deals, dashboard, reports, …
├── hooks/
├── lib/                         Shared types, constants, formatters, display labels
├── middleware.ts                API response headers
├── instrumentation.ts           Boots cron on server start
├── scripts/                     One-off backfills and local DB helpers
└── server/
    ├── db/
    │   ├── schema/              30 Drizzle table files + barrel index.ts
    │   ├── migrations/          0000–0020 SQL migrations + meta journal
    │   └── seed.ts              Roles, pipelines, stages, tags, custom fields
    ├── lib/                     auth, cron, mailer, permissions, visibility-filters, bots
    ├── services/                Business logic — one module per domain
    └── trpc/                    Routers, middleware, context, app-router
```

### Request path

```
React component
   → tRPC client hook (TanStack Query)
   → POST /api/trpc/[trpc]
   → context.ts        (resolves session user + role + permissions)
   → middleware.ts     (isAuthenticated → requirePermission)
   → routers/*.router.ts (Zod input validation)
   → services/*.service.ts (business logic + visibility filters)
   → Drizzle → Postgres
```

Server components in `(dashboard)/` call `getActiveSessionUser()` directly and redirect to `/login` when there is no active user — the layout is the auth gate, not middleware.

### The unusual response headers

[`src/middleware.ts`](../src/middleware.ts) and [`next.config.ts`](../next.config.ts) together force `Cache-Control: no-store, must-revalidate`, `X-Accel-Buffering: no`, `Connection: keep-alive`, `Vary: Accept-Encoding`, and disable Next's compression (`compress: false`) — all of it on `/api/*`.

This is deliberate. Comments in the code attribute it to transparent proxies at Indian carriers (JIO in particular) mangling or truncating compressed and buffered API responses. Don't "clean this up".

---

## Part 7 — Data model

Thirty tables plus one view. Schema files live in [`src/server/db/schema/`](../src/server/db/schema/); the barrel `index.ts` is what `drizzle-kit` reads.

### A convention that will surprise you

**There are almost no PostgreSQL enum types.** Everything that reads like an enum is a TypeScript string union in [`src/lib/types.ts`](../src/lib/types.ts), applied over a `varchar` column via Drizzle's `.$type<T>()`. That gives compile-time safety in the app and *nothing* at the database level.

Only these columns have real `CHECK` constraints backing them: `projects.stage`, `project_stage_history.from_stage` / `to_stage`, `onboardings.stage`, `onboardings.status`, and `personal_tasks.priority`. Every other "enum" column will accept an arbitrary string if written outside the app.

### Tables by domain

**Users and auth**

| Table | Purpose |
|---|---|
| `roles` | Role definitions with a JSONB `permissions` blob. `isSystemRole` protects the seeded five |
| `users` | Email, bcrypt hash, name, avatar, phone, one `roleId` (NOT NULL), status, preferences. **No soft delete** |
| `api_tokens` | Machine tokens for the metrics API. Stores a SHA-256 hash and a display prefix; plaintext shown once |

**Sales core**

| Table | Purpose |
|---|---|
| `companies` | Accounts. Partial-unique index on domain among non-deleted rows |
| `contacts` | People. Lead score, status, source, optional `referredByPartnerId` |
| `pipelines` | Configurable pipelines. `pipelineType`, `isDefault`, `isSalesPipeline` |
| `pipeline_stages` | Stages within a pipeline. Position, colour, `stageType`, default probability, `isSystemStage`. Unique on (pipeline, slug) and (pipeline, position) |
| `deals` | Prospects. Amount, probability, services array, dates, outcome, denormalized primary-contact snapshot, delivery mirror fields, kanban position, `isVelocitySlow` |
| `deal_contacts` | Junction with a contact role |
| `deal_team_members` | Grants visibility (see layer B) |
| `deal_tasks` | Tasks on a prospect |
| `deal_stage_history` | Append-only stage moves with entry/exit timestamps |
| `demo_records` | Structured demo and discovery-call capture: attendees, requirements, pain points, objections, next action |
| `pipeline_benchmarks` | Precomputed avg days-in-stage per (pipeline, stage) |

**Onboarding**

| Table | Purpose |
|---|---|
| `onboardings` | 1:1 with a deal. MSA/NDA/SOW status triplets, engagement amount and breakdown, payment terms, PO, first payment, kickoff, delivery team as a `uuid[]`, `convertedToProjectId` |
| `onboarding_stage_history` | Stage moves with notes |

**Projects**

| Table | Purpose |
|---|---|
| `projects` | Delivery engagements. Nullable unique `dealId` (standalone allowed), service type, stage, schedule, progress, delay tracking, contract value |
| `project_members` | Membership with role; grants visibility |
| `project_tasks` | Tasks with compliance categories |
| `project_stage_history` | Stage moves — includes `durationHours`, a real generated column |

**Activity and tasks**

| Table | Purpose |
|---|---|
| `activities` | One polymorphic timeline table. Type-specific column groups (call, email, meeting, task) that are mostly NULL. Optional links to contact, company, and deal |
| `personal_tasks` | Per-user work log. `userId` is the doer, `assignedBy` non-null means delegated |

**Platform**

| Table | Purpose |
|---|---|
| `tag_categories`, `tags` | Tags with categories, colours, and a denormalized `usageCount` |
| `contact_tags`, `company_tags`, `deal_tags` | Three junctions, composite PKs. There is no polymorphic tag table, and projects are not taggable |
| `custom_field_definitions` | Field metadata. **Values live in each row's `customFields` JSONB, keyed by slug** — there is no values table |
| `saved_views` | Named filter/column/sort configs with visibility |
| `dashboards`, `dashboard_widgets` | Widget dashboards; `publicToken` enables unauthenticated sharing |
| `audit_log` | `bigserial` PK, polymorphic `entityType`/`entityId`, JSON diff, IP as `inet`, denormalized user email so history survives user deletion |
| `notifications` | Per-user in-app notifications |
| `automation_settings`, `automation_config` | Singleton settings row; key-value toggles with last-run results |
| `digest_schedules` | Dashboard → schedule → email and Telegram recipients |

**Integrations**

Three chat platforms follow an identical two-table pattern:

| Platform | Identity table | Log table | External key |
|---|---|---|---|
| Telegram | `telegram_users` | `telegram_message_log` | `telegramUserId` (bigint) |
| WhatsApp | `whatsapp_users` | `whatsapp_message_log` | `waId` (phone without `+`) |
| Teams | `teams_users` | `teams_message_log` | `aadObjectId` (Entra GUID) |

`teams_users` additionally stores a `conversationReference` JSONB, because Bot Framework requires a captured reference to send proactively.

| Table | Purpose |
|---|---|
| `ai_chat_sessions`, `ai_chat_messages` | Assistant history, including generated SQL, result counts, and tool calls |

### Relationships

```
roles ──1:N──▶ users
users ──owner/creator──▶ companies, contacts, deals, projects, onboardings,
                          dashboards, saved_views, tags, custom_fields, api_tokens
users ──1:1──▶ telegram_users / whatsapp_users / teams_users
users ──1:N──▶ notifications, personal_tasks, ai_chat_sessions, audit_log

companies ──1:N──▶ contacts (companyId)
companies ──1:N──▶ contacts (referredByPartnerId)          [partner referral]
companies ──1:N──▶ deals    (companyId | partnerCompanyId | referredByPartnerId)
contacts  ──1:N──▶ deals    (primaryContactId)
contacts  ──M:N──▶ deals    via deal_contacts (with role)

pipelines ──1:N──▶ pipeline_stages ──1:N──▶ deals
pipelines + stages ──1:1──▶ pipeline_benchmarks

deals ──1:N──▶ deal_stage_history, deal_tasks, deal_team_members, deal_tags
deals ──1:1──▶ onboardings     (deal_id UNIQUE NOT NULL, cascade)
deals ──1:1──▶ projects        (deal_id UNIQUE, nullable — standalone allowed)
onboardings ──0:1──▶ projects  (convertedToProjectId)

projects ──1:N──▶ project_members, project_tasks, project_stage_history
deals / projects ──0:N──▶ personal_tasks (linkedDealId / linkedProjectId)

activities   ──▶ contacts | companies | deals            (all optional)
demo_records ──▶ contacts | companies | deals | activities (all optional)

dashboards ──1:N──▶ dashboard_widgets ; ──0:N──▶ digest_schedules
ai_chat_sessions ──1:N──▶ ai_chat_messages
```

### The `deals_with_value` view

Defined in [`migrations/0012_onboarding_module.sql`](../src/server/db/migrations/0012_onboarding_module.sql). It is not in the Drizzle schema and is queried by raw SQL.

```sql
CREATE OR REPLACE VIEW deals_with_value AS
SELECT d.*,
       COALESCE(o.engagement_amount, d.amount, 0) AS effective_value,
       o.id AS onboarding_id,
       o.engagement_amount,
       o.engagement_currency,
       (o.engagement_amount IS NOT NULL) AS has_engagement_amount
FROM deals d
LEFT JOIN onboardings o ON o.deal_id = d.id AND o.status != 'cancelled';
```

**Rule: any query that reports money reads `effective_value` from this view, never `deals.amount`.** The negotiated engagement amount overrides the sales estimate, and a cancelled onboarding is ignored.

### Soft delete

`deletedAt` exists on exactly **five** tables: `companies`, `contacts`, `deals`, `activities`, `projects`.

Everything else is hard-deleted — users, roles, onboardings, all three task tables, tags, dashboards, pipelines, integrations.

Enforcement is **by convention, not by the database**: queries append `isNull(x.deletedAt)` by hand. Each of the five tables carries a partial index `WHERE deleted_at IS NULL` to keep that predicate cheap. `restore` is a valid audit action, so undelete is a supported flow.

### Ownership columns

Core entities carry both:

- `ownerId` — nullable, `ON DELETE SET NULL`, reassignable. Who is responsible now.
- `createdBy` — NOT NULL, no cascade, never changed. Immutable provenance.

`activities` uses `performedBy` instead; `personal_tasks` uses `userId` plus `assignedBy`.

### The three task tables

A frequent source of bugs. Three tables, three status vocabularies:

| Table | Statuses |
|---|---|
| `deal_tasks` | `pending`, `in_progress`, `completed`, `blocked` |
| `project_tasks` | `pending`, `in_progress`, `completed`, `blocked`, **`not_applicable`** |
| `personal_tasks` | **`in_progress`**, `completed`, **`cancelled`** — no pending, no blocked; defaults to `in_progress` |

### Enum reference

All from [`src/lib/types.ts`](../src/lib/types.ts) unless noted.

```ts
// Contacts
ContactStatus = 'new' | 'contacted' | 'qualified' | 'unqualified'
              | 'nurturing' | 'converted' | 'lost' | 'archived'
ContactSource = 'apollo' | 'manual' | 'website' | 'referral' | 'event' | 'cold_outreach'

// Companies
CompanyStatus = 'active' | 'inactive' | 'churned' | 'archived'
CompanyType   = 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other'
CompanySize   = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+'

// Prospects / pipelines
DealStatus      = 'open' | 'won' | 'lost' | 'abandoned'
StageType       = 'active' | 'won' | 'lost'
PipelineType    = 'sales' | 'active_delivery' | 'partner' | 'compliance'
DealContactRole = 'primary' | 'decision_maker' | 'champion' | 'influencer'
                | 'stakeholder' | 'blocker'
DealTaskStatus  = 'pending' | 'in_progress' | 'completed' | 'blocked'

// Onboarding
OnboardingStage          = 'documents_pending' | 'documents_sent' | 'documents_signed'
                         | 'payment_pending' | 'payment_received' | 'kickoff_scheduled'
                         | 'completed' | 'cancelled'
OnboardingStatus         = 'active' | 'completed' | 'cancelled'
OnboardingDocumentStatus = 'not_required' | 'pending' | 'sent' | 'signed'

// Projects
ProjectStage        = 'kickoff' | 'gap_assessment' | 'implementation' | 'internal_audit'
                    | 'external_audit' | 'certified' | 'on_hold' | 'cancelled'
ProjectStatus       = 'active' | 'completed' | 'on_hold' | 'cancelled'
ProjectServiceType  = 'soc2_type1' | 'soc2_type2' | 'iso27001' | 'dpdp' | 'vapt'
                    | 'cspm' | 'ai_governance' | 'cert_in' | 'custom'
ProjectMemberRole   = 'lead' | 'member' | 'reviewer' | 'consultant'
ProjectTaskStatus   = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'not_applicable'
ProjectTaskCategory = 'documentation' | 'evidence_collection' | 'gap_remediation'
                    | 'audit_prep' | 'policy' | 'training' | 'review' | 'other'

// Activity & tasks
ActivityType = 'call' | 'email_sent' | 'email_received' | 'meeting' | 'note' | 'task'
             | 'sms' | 'whatsapp' | 'linkedin' | 'demo' | 'proposal'        // user-loggable
             | 'document' | 'stage_change' | 'status_change'
             | 'assignment' | 'custom'                                       // system-generated
CallOutcome        = 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'wrong_number'
CallDirection      = 'inbound' | 'outbound'
TaskPriority       = 'low' | 'medium' | 'high' | 'urgent'
PersonalTaskStatus = 'in_progress' | 'completed' | 'cancelled'

// Platform
UserStatus          = 'active' | 'inactive' | 'suspended' | 'invited'
PermissionLevel     = boolean | 'own' | 'team' | 'all'
EntityType          = 'contact' | 'company' | 'deal' | 'project' | 'activity'
FieldType           = 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime'
                    | 'select' | 'multi_select' | 'checkbox' | 'email' | 'phone' | 'url'
                    | 'user' | 'contact' | 'company' | 'rating' | 'percentage'
DashboardVisibility = 'private' | 'team' | 'everyone'
SavedViewVisibility = 'private' | 'team' | 'everyone'
DashboardDataSource = 'client' | 'partner' | 'enterprise'   // 'client' displays as "Sales"
WidgetType          = 'metric_card' | 'bar_chart' | 'line_chart' | 'pie_chart'
                    | 'funnel_chart' | 'table' | 'pipeline_summary' | 'activity_feed'
                    | 'leaderboard' | 'goal_tracker' | 'conversion_rate' | 'time_in_stage'
                    | 'forecast' | 'custom_query' | 'onboarding_stats'
AuditAction         = 'create' | 'update' | 'delete' | 'restore' | 'login' | 'logout'
                    | 'login_failed' | 'export' | 'import' | 'bulk_update' | 'bulk_delete'
                    | 'assign' | 'unassign' | 'tag_add' | 'tag_remove' | 'stage_change'
                    | 'permission_change' | 'role_change' | 'dashboard_publish'
                    | 'dashboard_unpublish' | 'api_access' | 'report_generated'
FilterOperator      = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with'
                    | 'ends_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in'
                    | 'contains_any' | 'contains_all' | 'is_empty' | 'is_not_empty'
                    | 'between' | 'current_user' | 'current_user_team'
```

Declared inline in [`schema/demo-records.ts`](../src/server/db/schema/demo-records.ts) rather than in `types.ts`:

```ts
DemoCallType = 'discovery' | 'demo' | 'follow_up' | 'proposal_walkthrough'
             | 'onboarding' | 'check_in'
DemoOutcome  = 'completed' | 'no_show' | 'rescheduled' | 'cancelled'
             | 'interested' | 'not_interested' | 'needs_follow_up'
```

Services sold, from [`src/lib/constants.ts`](../src/lib/constants.ts): VAPT, SOC 2, ISO 27001, PCI DSS, Cloud Security, GRC Consulting, Compliance Automation, Security Awareness Training, Audit Support, Other.

### Schema gotchas

1. **Not Prisma.** Searching for `schema.prisma` finds nothing.
2. **No PostgreSQL enum types.** See above — CHECK constraints exist on only five columns.
3. **`deals.weighted_amount` does not exist**, despite a code comment in `deals.ts` describing it as a generated column. Weighted pipeline is computed at query time in `report.service.ts` as `effective_value * probability / 100`.
4. **`project_stage_history.duration_hours` is the only genuine generated column** in the schema.
5. **`deal_contacts` has no primary key** — only an index on `contactId`.
6. **`onboardings.deliveryTeamAssigned` is a raw `uuid[]`** with no foreign-key integrity.
7. **Custom field values have no table** — they live in each row's `customFields` JSONB keyed by definition slug.
8. **Migration history reversal:** `0011` widened `sales_rep`'s deal read to `all`, `0013` reverted it to `own`. Current state is `own`.
9. **The project stage picker hides two valid values** — `certified` and `on_hold`.

---

## Part 8 — API surface

### REST routes

Only seven route files exist. Everything else is tRPC.

| Path | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | — | NextAuth handlers. Credentials only, no OAuth. Emits login / login-failed events |
| `/api/health` | GET | none | `SELECT 1` probe → `{status:'ok', db:'connected'}` or 503. Railway healthcheck target |
| `/api/trpc/[trpc]` | GET, POST | session | The entire application API |
| `/api/metrics/daily` | GET | **bearer token** | Read-only company metrics for external automations. No session |
| `/api/webhooks/telegram` | POST | shared secret header | Validates `x-telegram-bot-api-secret-token`; text messages only; fire-and-forget, always acks 200 |
| `/api/webhooks/whatsapp` | GET, POST | verify token / HMAC | GET is Meta's `hub.challenge` handshake; POST verifies `x-hub-signature-256` (HMAC-SHA256), then fire-and-forget |
| `/api/webhooks/teams` | POST | Entra JWT (in SDK) | Bridges into the `@microsoft/teams.apps` handler and returns its real status. Deliberately *not* fire-and-forget |

### `GET /api/metrics/daily`

The one contract designed for outside consumers. Issue a token at **Settings → API Access** (prefix `scmp_`, shown once), then:

```bash
curl -H "Authorization: Bearer scmp_..." https://<host>/api/metrics/daily
```

Deliberately global and unscoped — no per-user visibility filter — because it exists for company-level automations. All money comes from `deals_with_value.effective_value`.

```jsonc
{
  "generatedAt": "2026-08-22T09:00:00.000Z",
  "pipeline": {
    "openCount": 0,
    "openValue": 0,
    "byStage":       [{ "stage": "", "count": 0, "value": 0 }],
    "wonThisMonth":  { "count": 0, "value": 0 },
    "lostThisMonth": { "count": 0 },
    "byIndustry":    [{ "industry": "",    "count": 0, "value": 0 }],
    "byFramework":   [{ "framework": "",   "count": 0, "value": 0 }],  // unnests deals.services; empty → "Unspecified"
    "byGeography":   [{ "country": "",     "count": 0, "value": 0 }],
    "byCompanySize": [{ "companySize": "", "count": 0, "value": 0 }],
    "dealSizeHistogram": []                                            // Indian buckets: "< 1L" … "1Cr+", per currency
  },
  "activity": {
    "activitiesToday": 0,
    "proposalsSentThisMonth": 0,
    "staleProspects": 0,
    "unassignedLeads": 0
  },
  "companies": { "newToday": 0, "newThisWeek": 0 }
}
```

### tRPC router catalogue

Root router: [`src/server/trpc/app-router.ts`](../src/server/trpc/app-router.ts). Thirty-one routers.

**Core records**

| Router | Procedures |
|---|---|
| `contacts` | `list`, `byCompany`, `getById`, `create`, `update`, `delete`, `bulkUpdate`, `bulkDelete`, `addTags`, `removeTags` |
| `companies` | `list`, `getById`, `create`, `update`, `delete`, `bulkUpdate`, `addTags`, `removeTags` |
| `deals` | `list`, `byCompany`, `byContact`, `byStage`, `getById`, `getProjectDetails`, `create`, `update`, `updateProgress`, `addTeamMember`, `removeTeamMember`, `delete`, `bulkUpdate`, `moveToStage`, `addTags`, `removeTags` |
| `dealTasks` | `list`, `create`, `updateStatus`, `update`, `delete` |
| `activities` | `list`, `create`, `update`, `delete` |
| `demoRecords` | `list`, `create`, `update`, `delete`, `previewBackfill`, `runBackfill` |
| `search` | `global` |

**Pipeline, delivery, compliance**

| Router | Procedures |
|---|---|
| `pipelines` | `list`, `getWithStages`, `create`, `update`, `addStage`, `updateStage`, `reorderStages`, `deleteStage` |
| `projects` | `list`, `getById`, `create`, `update`, `delete`, `moveStage`, `updateProgress`, `addMember`, `removeMember`, `getByCompany`, `tasksByCompany`, `listTasks`, `createTask`, `updateTask`, `deleteTask`, `reorderTasks` |
| `onboarding` *(super admin)* | `list`, `eligibleManualDeals`, `createManual`, `getById`, `update`, `moveStage` |
| `compliance` | `ensurePipeline`, `moveDealToWorkflow` |
| `partners` | `dealsByPartner`, `contactsByPartner`, `availableSalesDeals`, `attachDeal`, `referredLeads`, `attributionStats` |

**People and tasks**

| Router | Procedures |
|---|---|
| `personalTasks` | `listMy`, `myStats`, `create`, `update`, `complete`, `cancel`, `assign`, `delete`, `linkableEntities`, `listAll` *(super admin)*, `teamSummary` *(super admin)* |
| `users` | `me`, `list`, `create`, `update`, `updatePreferences`, `listRoles`, `delete`, `resetPassword`, `updateRole` |

**Analytics**

| Router | Procedures |
|---|---|
| `dashboards` | `list`, `sourceCompanies`, `getById`, `create`, `update`, `delete`, `addWidget`, `updateWidget`, `deleteWidget` |
| `reports` | `getRepReport`, `getActivityFeed`, `getReportableUsers`, `exportRepReport`, `exportActivityFeed` |
| `executiveOverview` *(super admin)* | `summary`, `memberDetail` |

**Configuration and admin**

| Router | Procedures |
|---|---|
| `tags` | `list`, `listCategories`, `create`, `update`, `delete`, `createCategory` |
| `customFields` | `list`, `create`, `update`, `delete`, `reorder` |
| `savedViews` | `list`, `create`, `update`, `delete` |
| `auditLog` | `list` |
| `notifications` | `list`, `unreadCount`, `markRead`, `markAllRead`, `delete` |
| `apiTokens` | `list`, `create`, `revoke` |
| `digests` | `list`, `create`, `update`, `delete`, `toggleActive`, `sendNow` |
| `automation` | `list`, `setEnabled`, `runNow`, `getLeadInactivity`, `updateLeadInactivity`, `runLeadInactivityNow` |
| `import` | `contacts`, `companies`, `deals`, `backfillDealLinks`, `relinkContactCompanies`, `exportContacts` |
| `telegram` / `whatsapp` / `teams` | `listUsers`, `addUser`, `removeUser`, `toggleActive`, `getMessageLog`, `testConnection`, `getBotStatus`; `teams` adds `bulkLinkByEmail` |
| `aiChat` | `getOrCreateSession`, `getMessages`, `sendMessage`, `newSession`, `getSuggestions` |

### Import and export

**Import** goes through a client-side wizard ([`ImportWizard.tsx`](../src/components/import-export/ImportWizard.tsx)): parse CSV in the browser → map columns → send batched mutations (max 1000 rows per call). Rows are validated with Zod, so a bad status or source value is rejected rather than silently stored. A deal import template lives at [`deal_import_template.csv`](../deal_import_template.csv).

**Export** comes in several shapes:

| Export | Format | Notes |
|---|---|---|
| Contacts | CSV | Up to 5000 rows, honours current search/filters/sort. UTF-8 BOM, CRLF, and phone columns force-quoted as `="…"` so Excel keeps leading zeros |
| Rep report | PDF | Rendered server-side with `@react-pdf/renderer`, returned as a base64 data URL |
| Activity feed | CSV | Up to 10,000 rows, prepends an "Applied Filters" block, writes a `report_generated` audit entry |
| Task report | CSV / XLSX / PDF | XLSX is multi-sheet with frozen panes via ExcelJS |

Report exports require the `reports.export` permission unless you are exporting your own data.

---

## Part 9 — Integrations

### Email — [`src/server/lib/mailer.ts`](../src/server/lib/mailer.ts)

Dual provider with automatic failover: **Resend** (raw `fetch` to the API, no SDK) as primary, **nodemailer SMTP** as fallback, selected by `EMAIL_PROVIDER` (`auto` | `resend` | `smtp`). One retry with 2-second backoff, skipped on HTTP 429 so rate limits aren't compounded.

Consumers: digest service, reminder digest service, and the weekly summary automation.

### Chat bots — three transports, one command layer

The transports differ; the commands don't. [`bot-commands.service.ts`](../src/server/services/bot-commands.service.ts) is transport-agnostic and implements `/add`, `/addcompany`, `/note`, `/log`, `/find`, `/today`, `/mytasks`, `/help`, `/start`. Every inbound and outbound message is written to the platform's message log with the parsed command, result status, and any entity touched.

| Platform | Implementation |
|---|---|
| **Telegram** | Hand-rolled `fetch` wrapper ([`telegram-bot.ts`](../src/server/lib/telegram-bot.ts)) — `sendMessage`, `getUpdates`, `setWebhook`, `getMe`. Supports both webhook and long-polling modes (`TELEGRAM_MODE`). A pure parser handles `/command` plus `key: value` bodies |
| **WhatsApp** | Meta Cloud API via raw `fetch` against `graph.facebook.com`, no SDK. HMAC signature verification on inbound |
| **Microsoft Teams** | `@microsoft/teams.api` + `@microsoft/teams.apps` v2. The SDK is used deliberately — it validates Entra ID JWTs. A `NoopHttpServerAdapter` prevents the SDK from spinning up its own Express server inside Next.js |

**Microsoft Graph** ([`microsoft-graph.ts`](../src/server/lib/microsoft-graph.ts)) uses an app-only client-credentials token (cached with 60s skew) to look users up by email, reusing the Teams bot's Entra app registration. It needs `User.Read.All`, and is used only for `teams.bulkLinkByEmail`.

### AI — Groq

`ai@7` + `@ai-sdk/groq@4`, driven from [`ai-chat.service.ts`](../src/server/services/ai-chat.service.ts) with `generateText` and a step limit (`GROQ_MAX_TOOL_STEPS`, default 6). Model resolution walks a fallback chain so a rate-limited or retired model doesn't take the assistant down:

`GROQ_MODEL` → `GROQ_FALLBACK_MODELS` → `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `llama-3.3-70b-versatile`

### Configured but not wired up

Worth stating explicitly so nobody hunts for code that isn't there:

| Thing | Status |
|---|---|
| **File storage / uploads** | **Not implemented.** `STORAGE_TYPE`, `STORAGE_LOCAL_PATH`, and `S3_*` exist in `.env.example`, and MinIO is in `docker-compose.yml`, but no code reads any of them. `activities.attachments` is a JSONB column defaulting to `[]` with no upload path |
| **Redis** | `ioredis` is a dependency and Redis is in compose, but there are zero imports. `.env.example` says "not currently used" |
| **Gemini** | `GEMINI_*` env vars exist and the spec document describes Gemini; the shipped implementation is Groq. No Gemini code |
| **Calendar** | No calendar API. Kickoff is a timestamp plus a free-text meeting link |
| **Payments** | No payment gateway. Payment facts are manually recorded on the onboarding record |

---

## Part 10 — Running it locally

### Prerequisites

Node 22, Docker (for local Postgres), and a `.env` file.

### Environment variables

| Group | Variables |
|---|---|
| Database | `DATABASE_URL`, `DATABASE_POOL_MAX` |
| Auth | `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL`, `BCRYPT_ROUNDS` |
| App | `APP_NAME`, `APP_URL`, `DEFAULT_CURRENCY`, `DEFAULT_TIMEZONE` |
| AI | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODELS`, `GROQ_MAX_TOKENS`, `GROQ_TEMPERATURE` |
| Email | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`; optional `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_MODE` |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` |
| Teams | `TEAMS_BOT_APP_ID`, `TEAMS_BOT_APP_PASSWORD`, `TEAMS_BOT_TENANT_ID` |

[`.env.example`](../.env.example) is fully commented and is the authoritative reference, including where to obtain each credential.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:local` | Dev server pointed at the local Docker Postgres on port 5434 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:local:up` / `db:local:down` | Start / stop the local Postgres container |
| `npm run db:local:setup` | Full local database setup |
| `npm run db:local:clone` | Clone production data locally (requires `CONFIRM_PRODUCTION_CLONE=YES`) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Seed roles, pipelines, stages, tags, custom fields |
| `npm run backfill:projects` / `:activities` / `:onboardings` | One-off backfills |
| `npm run reset:projects` | Rebuild projects from the active delivery pipeline |
| `npm run test:reminder-email` | Send a test reminder digest |

### First run

```bash
npm install --legacy-peer-deps
npm run db:local:up
npm run db:migrate
npm run db:seed
npm run dev:local        # http://127.0.0.1:3000
```

See [`docs/local-security-testing.md`](./local-security-testing.md) for the local Postgres setup in detail, cloning production data, and a zsh gotcha around sourcing `.env.local`.

### Deployment

Railway with nixpacks and Node 22. Install runs with `--legacy-peer-deps`; start is `npm run db:migrate && npm start`, so **migrations apply automatically on deploy**. Healthcheck target is `/api/health`.

---

## Part 11 — Known gaps and stale documentation

**`README.md` is untouched `create-next-app` boilerplate.** It contains nothing project-specific. This document exists to fill that gap; the README has not been changed.

**`Seccomply crm ai automations spec.md`** (repo root, 35KB) is a design specification, not a description of what shipped. It is useful for understanding the *intent* behind the AI assistant and the automations, but it diverges from the code in two known ways:

- It specifies **Gemini** as the model provider. The implementation uses **Groq**.
- It describes eight automations. Two were never built: *Auto-Tag from Company Domain* and *Email-to-Activity Parser*.

**Stale code comment:** `deals.ts` describes `weighted_amount` as a generated column. That column does not exist in any migration.

**Root spreadsheets** — `SecComply_CRM_Changes.xlsx`, `SecComply_MOM_CRM_Updates_Tracker.xlsx`, `SecComply_WhatsNew_Users.xlsx` — are informal change trackers, not developer documentation.

**Not yet documented anywhere, including here:** webhook setup runbooks for Telegram, WhatsApp, and Teams (registering the webhook URL, configuring the Meta app, creating the Azure Bot resource and its Entra app registration).
