# SecComply CRM — Feature Addendum 2: AI Chatbot + Smart Automations

> **Companion to:** SecComply_CRM_Platform_Development_Prompt.md + SecComply_CRM_Features_Addendum.md  
> **AI Provider:** Google Gemini Flash 2.0 (free tier — 1,500 req/day, 1M token context)  
> **Deployment:** Railway Hobby (existing environment, no new services needed)

---

## Part 1: AI CRM Chatbot

### 1.1 What It Does

A conversational assistant embedded in the CRM that lets management ask natural language questions about their data. It queries the live Postgres database and returns formatted answers. It handles ambiguity by asking clarifying questions before running queries.

**Example conversations:**

```
User: How many leads have Aditya as the lead owner and are from the Delhi event?

Bot: I can see multiple Delhi events in your CRM. Which would you like to filter by?

  1. CIO Axis Delhi (32 leads)
  2. NASSCOM Delhi Summit (18 leads)
  3. All Delhi events combined

User: All Delhi events combined, but break it down by event

Bot: Here's the breakdown of Aditya's leads from Delhi events:

  📊 Total: 47 leads across 2 Delhi events

  CIO Axis Delhi — 32 leads
  ├ New: 8  |  Contacted: 12  |  Qualified: 9  |  Demo Done: 3
  └ Pipeline value: ₹18,40,000

  NASSCOM Delhi Summit — 18 leads (minus 3 overlapping)
  ├ New: 4  |  Contacted: 7  |  Qualified: 5  |  Demo Done: 2
  └ Pipeline value: ₹9,20,000

  Last activity logged: 2 days ago (Aditya — call with Priya Mehta @ CloudNine)
```

```
User: Which deals are stuck and haven't had any activity in over 2 weeks?

Bot: Found 6 deals with no activity in 14+ days:

  1. InfraSec Solutions — Discovery stage, ₹4,50,000, 23 days stale
     Owner: Aditi | Last activity: Email sent 23 Apr
  2. TechVault — Proposal stage, ₹8,00,000, 19 days stale
     Owner: Shivani | Last activity: Demo call 27 Apr
  ... (4 more)

  Want me to create follow-up tasks for these 6 deals and assign them to their owners?
```

```
User: Show me conversion rates for each pipeline stage this quarter

Bot: Q2 2026 (Apr–Jun) Stage Conversion Rates:

  Lead In → Qualified:     68% (102 of 150 leads)
  Qualified → Discovery:   54% (55 of 102)
  Discovery → Demo:        71% (39 of 55)
  Demo → Proposal:         62% (24 of 39)
  Proposal → Negotiation:  58% (14 of 24)
  Negotiation → Won:       64% (9 of 14)

  Overall close rate: 6% (9 won from 150 leads)
  Average sales cycle: 47 days
```

### 1.2 Architecture

```
User types question
       ↓
Chat UI (React component in CRM sidebar or dedicated page)
       ↓
POST /api/ai/chat (tRPC mutation)
       ↓
┌─────────────────────────────────────────────────┐
│  Conversation Manager                            │
│  - Maintains message history in session          │
│  - Detects if clarification is needed            │
│  - Manages multi-turn state                      │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  Gemini Flash 2.0 (Intent + SQL Generation)      │
│                                                  │
│  System prompt includes:                         │
│  - Full DB schema (tables, columns, relationships)│
│  - Current user context (role, owned leads)      │
│  - RBAC rules (what data this user can see)      │
│  - Response format instructions                  │
│                                                  │
│  Two-phase approach:                             │
│  Phase 1: Classify intent + detect ambiguity     │
│  Phase 2: Generate SQL (if no clarification needed)│
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  SQL Safety Layer                                │
│  - Parse generated SQL                           │
│  - Verify: SELECT only (no INSERT/UPDATE/DELETE) │
│  - Verify: No system tables accessed             │
│  - Verify: RBAC filters are present              │
│  - Set statement_timeout = 5000ms                │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  Postgres Query Execution                        │
│  - Run validated SELECT query                    │
│  - Return raw results (JSON)                     │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│  Gemini Flash 2.0 (Response Formatting)          │
│  - Convert raw data to natural language          │
│  - Add emoji, structure, context                 │
│  - Suggest follow-up actions where relevant      │
└─────────────────┬───────────────────────────────┘
                  ↓
Formatted response back to Chat UI
```

### 1.3 The System Prompt

This is the core of the chatbot's intelligence. It is injected fresh on every API call and includes the live database schema + current user context:

```typescript
function buildSystemPrompt(userContext: {
    userId: string;
    userName: string;
    role: string;
    permissions: Record<string, any>;
}): string {
    return `
You are the SecComply CRM Intelligence Assistant. You help the sales team and management query their CRM data using natural language.

## Your Capabilities
- Answer questions about contacts, companies, deals, activities, pipelines, tags, and team performance
- Generate SQL queries against the SecComply CRM PostgreSQL database
- Ask smart clarifying questions when a query is ambiguous
- Format results in a clean, readable way with relevant context
- Suggest follow-up actions when appropriate

## Database Schema

### contacts
id (uuid), first_name, last_name, email, phone, job_title, company_id (→companies.id),
status (new/contacted/qualified/unqualified/nurturing/converted/lost/archived),
lead_score (0-100), owner_id (→users.id), source, created_at, last_contacted_at,
custom_fields (jsonb), deleted_at (null = active)

### companies  
id (uuid), name, domain, industry, company_size, company_type (prospect/customer/partner/vendor),
city, state, country, owner_id (→users.id), created_at, deleted_at

### deals
id (uuid), title, pipeline_id (→pipelines.id), stage_id (→pipeline_stages.id),
amount (decimal), currency, probability (0-100), weighted_amount (computed),
status (open/won/lost), expected_close_date, actual_close_date,
primary_contact_id (→contacts.id), company_id (→companies.id),
owner_id (→users.id), created_at, stage_entered_at, deleted_at

### activities
id (uuid), activity_type (call/email_sent/email_received/meeting/note/task/...),
subject, body, contact_id, company_id, deal_id, performed_by (→users.id),
occurred_at, task_due_date, task_completed_at, call_duration_seconds, call_outcome

### tags
id (uuid), name, slug, color, category_id

### contact_tags (junction)
contact_id (→contacts.id), tag_id (→tags.id)

### deal_tags (junction)
deal_id (→deals.id), tag_id (→tags.id)

### users
id (uuid), first_name, last_name, email, role_id

### pipelines
id (uuid), name

### pipeline_stages
id (uuid), pipeline_id, name, position, stage_type (active/won/lost), default_probability

### deal_stage_history
deal_id, from_stage_id, to_stage_id, entered_at, exited_at, duration_seconds, moved_by

## Current User Context
Name: ${userContext.userName}
Role: ${userContext.role}
User ID: ${userContext.userId}

## RBAC Rules for SQL Generation
- Always add WHERE deleted_at IS NULL to contacts, companies, and deals queries
- If user role is 'sales_rep', add: AND owner_id = '${userContext.userId}' to contacts/deals queries unless they are asking about team-wide data (only managers/admins can see all)
- Never expose password_hash, sensitive auth fields
- Only SELECT queries are permitted — never generate INSERT, UPDATE, DELETE, DROP, or any mutation

## How to Handle Ambiguous Queries

When a query mentions something that could match multiple values (an event name, a person's name, a time period), ALWAYS clarify before generating SQL.

Specifically:
- If they mention "Delhi event" or any event name — list matching tags from the tags table that look like event tags, ask which ones
- If they mention a person by first name only and there are multiple — list them and ask
- If they mention "this quarter/month/year" — confirm the exact date range you'll use
- If they ask "how many" without specifying a breakdown — ask if they want a total or breakdown by owner/stage/tag/etc.

## Response Format

For data answers: Lead with a summary line, then structured breakdown with emoji. Include:
- The direct answer prominently
- Relevant context (stage distribution, last activity, etc.)
- A suggested follow-up action if the data suggests one

For clarifying questions: List the options clearly and ask what they want. Keep it concise.

For "no results": Say so clearly and suggest why (maybe the filter is too narrow).

IMPORTANT: You must respond in TWO distinct phases:
1. First, output a JSON block with your intent analysis: 
   {"phase": "clarify", "question": "..."} if you need to ask something, OR
   {"phase": "query", "sql": "SELECT ...", "explanation": "what this query does"}
2. After the JSON block, do NOT output anything else — the system will handle formatting.
`.trim();
}
```

### 1.4 Ambiguity Detection Logic

The LLM handles most ambiguity detection through the system prompt. Additionally, implement these deterministic pre-checks before even calling the LLM:

```typescript
interface AmbiguityCheck {
    isAmbiguous: boolean;
    clarificationNeeded: string;
    options?: Array<{ id: string; label: string; count?: number }>;
}

async function checkForAmbiguity(
    query: string,
    db: Database
): Promise<AmbiguityCheck> {
    // Check 1: Does query mention an event/tag without being specific?
    const eventKeywords = ['event', 'conference', 'summit', 'expo', 'meetup'];
    const mentionsEvent = eventKeywords.some(k => query.toLowerCase().includes(k));
    
    if (mentionsEvent) {
        // Find all tags that look like events (check tag categories or naming patterns)
        const eventTags = await db.query(`
            SELECT t.id, t.name, COUNT(ct.contact_id) as contact_count
            FROM tags t
            LEFT JOIN contact_tags ct ON ct.tag_id = t.id
            WHERE t.category_id IN (
                SELECT id FROM tag_categories WHERE name ILIKE '%event%'
            )
            OR t.name ILIKE '%event%'
            OR t.name ILIKE '%summit%'
            OR t.name ILIKE '%conference%'
            OR t.name ILIKE '%expo%'
            GROUP BY t.id, t.name
            ORDER BY contact_count DESC
        `);
        
        if (eventTags.length > 1) {
            return {
                isAmbiguous: true,
                clarificationNeeded: 'multiple_events',
                options: eventTags.map(t => ({
                    id: t.id,
                    label: t.name,
                    count: t.contact_count,
                })),
            };
        }
    }
    
    // Check 2: Does query mention a person by first name only?
    // (LLM handles this dynamically — skip for pre-check)
    
    return { isAmbiguous: false, clarificationNeeded: '' };
}
```

### 1.5 SQL Safety Layer

```typescript
import { parse as parseSql } from 'node-sql-parser';

function validateGeneratedSql(sql: string): { valid: boolean; reason?: string } {
    // 1. Only SELECT statements allowed
    const upperSql = sql.trim().toUpperCase();
    if (!upperSql.startsWith('SELECT')) {
        return { valid: false, reason: 'Only SELECT queries are permitted' };
    }
    
    // 2. No mutation keywords anywhere in the query
    const dangerousKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
    for (const keyword of dangerousKeywords) {
        if (upperSql.includes(keyword)) {
            return { valid: false, reason: `Prohibited keyword: ${keyword}` };
        }
    }
    
    // 3. No system table access
    const systemTables = ['pg_', 'information_schema', 'auth.', 'nextauth'];
    for (const table of systemTables) {
        if (sql.toLowerCase().includes(table)) {
            return { valid: false, reason: `System table access not permitted` };
        }
    }
    
    // 4. No password fields
    if (sql.toLowerCase().includes('password')) {
        return { valid: false, reason: 'Sensitive field access not permitted' };
    }
    
    return { valid: true };
}

async function executeSafeQuery(db: Database, sql: string): Promise<any[]> {
    // Set query timeout to prevent runaway queries
    await db.query('SET LOCAL statement_timeout = 5000');
    
    // Limit rows returned to prevent massive result sets
    const limitedSql = sql.replace(/;?\s*$/, '') + ' LIMIT 500';
    
    const result = await db.query(limitedSql);
    return result.rows;
}
```

### 1.6 Multi-Turn Conversation State

Conversation history is stored in the database so it persists across page reloads:

```sql
CREATE TABLE ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    
    -- Store query metadata for debugging
    sql_query TEXT,             -- The SQL that was generated (if any)
    query_result_count INTEGER, -- How many rows the query returned
    was_clarification BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON ai_chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session ON ai_chat_messages(session_id);
```

Pass the last 6 messages as context to Gemini on each call (enough for multi-turn clarification without burning too many tokens).

### 1.7 Chat UI Component

The chat UI lives in two places:
1. **Floating chat button** (bottom-right of every page) — opens a compact chat panel (400px wide, 500px tall)
2. **Full page** at `/ai-chat` — for longer analysis sessions

**Chat panel design:**
- Clean message bubbles (user right-aligned, assistant left-aligned)
- Markdown rendering for assistant responses (tables, bold, lists)
- Typing indicator (animated dots) while waiting for response
- "Clarification" messages from the bot show as option buttons the user can click (not just text) — clicking a button sends that option as the next message automatically
- Copy button on each assistant message
- "New conversation" button to clear context
- Input bar at bottom with send button and Shift+Enter for newlines

**Option buttons for clarifications:**
When the assistant returns a clarification question with options, render them as clickable buttons below the message rather than making the user type:
```
Which Delhi events would you like?
[ CIO Axis Delhi (32 leads) ] [ NASSCOM Delhi Summit (18 leads) ] [ All combined ]
```

### 1.8 Sample Questions to Pre-populate as Suggestions

Show these as clickable suggestions when the chat is empty:
- "How many open deals do we have and what's the total pipeline value?"
- "Which leads haven't been contacted in over 2 weeks?"
- "Show me Aditi's activity this week"
- "What's our win rate this quarter?"
- "Which stage has the most stuck deals?"
- "How many leads came from each event?"

---

## Part 2: Smart Automations

### 2.1 Overview

The Telegram bot handles manual data entry. These automations handle everything that should happen **without anyone doing anything**. They run as background jobs triggered by database events (via the existing event bus) or on a schedule.

### 2.2 Automation 1: Smart Lead Score Auto-Updater

**Trigger:** Runs daily at 6 AM IST (cron job)

**Logic:** Recalculate lead score for every contact based on:

| Signal | Points |
|--------|--------|
| Has email address | +10 |
| Has phone number | +5 |
| Has LinkedIn URL | +5 |
| Status = qualified | +20 |
| Status = nurturing | +10 |
| Has an open deal | +25 |
| Deal in proposal/negotiation stage | +15 more |
| Activity in last 7 days | +15 |
| Activity in last 30 days | +8 |
| No activity in 60+ days | -15 |
| Hot lead tag | +20 |
| Decision maker title (C-suite, VP, Director) | +10 |
| Company has 200+ employees | +5 |

Scores are capped at 100. The update is done in a single bulk SQL UPDATE. Changes are logged to the audit trail as a system action.

**Implementation:**
```typescript
// automation.service.ts
async function recalculateLeadScores(db: Database) {
    await db.query(`
        WITH score_calc AS (
            SELECT 
                c.id,
                LEAST(100, GREATEST(0,
                    CASE WHEN c.email IS NOT NULL THEN 10 ELSE 0 END +
                    CASE WHEN c.phone IS NOT NULL THEN 5 ELSE 0 END +
                    CASE WHEN c.linkedin_url IS NOT NULL THEN 5 ELSE 0 END +
                    CASE WHEN c.status = 'qualified' THEN 20
                         WHEN c.status = 'nurturing' THEN 10 ELSE 0 END +
                    CASE WHEN EXISTS (
                        SELECT 1 FROM deals d 
                        WHERE d.primary_contact_id = c.id AND d.status = 'open' AND d.deleted_at IS NULL
                    ) THEN 25 ELSE 0 END +
                    CASE WHEN EXISTS (
                        SELECT 1 FROM activities a 
                        WHERE a.contact_id = c.id 
                        AND a.occurred_at > NOW() - INTERVAL '7 days'
                    ) THEN 15
                    WHEN EXISTS (
                        SELECT 1 FROM activities a 
                        WHERE a.contact_id = c.id 
                        AND a.occurred_at > NOW() - INTERVAL '30 days'
                    ) THEN 8
                    WHEN NOT EXISTS (
                        SELECT 1 FROM activities a 
                        WHERE a.contact_id = c.id 
                        AND a.occurred_at > NOW() - INTERVAL '60 days'
                    ) THEN -15 ELSE 0 END +
                    CASE WHEN EXISTS (
                        SELECT 1 FROM contact_tags ct 
                        JOIN tags t ON t.id = ct.tag_id 
                        WHERE ct.contact_id = c.id AND t.name ILIKE '%hot%'
                    ) THEN 20 ELSE 0 END +
                    CASE WHEN c.job_title ILIKE ANY(ARRAY['%ciso%','%cto%','%ceo%','%coo%','%vp%','%director%','%head%']) 
                    THEN 10 ELSE 0 END
                )) AS new_score
            FROM contacts c
            WHERE c.deleted_at IS NULL
        )
        UPDATE contacts c
        SET lead_score = sc.new_score, updated_at = NOW()
        FROM score_calc sc
        WHERE c.id = sc.id AND c.lead_score != sc.new_score
    `);
}
```

### 2.3 Automation 2: Stale Deal & Contact Alerts

**Trigger:** Daily at 8:30 AM IST (30 min before the digest)

**Logic:**
- Find all open deals with no activity in 14+ days → create a task for the deal owner: "Follow up required — no activity in X days"
- Find all contacts with status=contacted/qualified with no activity in 21+ days → create a task for the contact owner
- Find all deals in the same stage for 21+ days → create a task: "Deal stuck in [Stage] for X days"

**Deduplication:** Before creating a task, check if an identical "stale" task already exists and is uncompleted. Don't spam the owner with duplicate tasks.

```typescript
async function createStaleAlerts(db: Database) {
    // Stale deals — no activity in 14+ days
    const staleDeals = await db.query(`
        SELECT d.id, d.title, d.owner_id, u.first_name,
               EXTRACT(DAY FROM NOW() - MAX(a.occurred_at)) as days_since_activity
        FROM deals d
        JOIN users u ON u.id = d.owner_id
        LEFT JOIN activities a ON a.deal_id = d.id
        WHERE d.status = 'open' AND d.deleted_at IS NULL
        GROUP BY d.id, d.title, d.owner_id, u.first_name
        HAVING MAX(a.occurred_at) < NOW() - INTERVAL '14 days'
            OR MAX(a.occurred_at) IS NULL
    `);
    
    for (const deal of staleDeals) {
        // Check if a stale-alert task already exists
        const existing = await db.query(`
            SELECT id FROM activities 
            WHERE deal_id = $1 
            AND activity_type = 'task' 
            AND subject ILIKE '%stale%'
            AND task_completed_at IS NULL
            LIMIT 1
        `, [deal.id]);
        
        if (existing.rows.length === 0) {
            await activityService.create({
                activityType: 'task',
                subject: `Follow up required — no activity in ${deal.days_since_activity} days`,
                dealId: deal.id,
                performedBy: 'system',
                taskDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
                taskPriority: deal.days_since_activity > 21 ? 'high' : 'medium',
                isAutomated: true,
            });
            
            // Also send Telegram notification to owner if they have a Telegram mapping
            await telegramService.notifyUser(deal.owner_id, 
                `⚠️ Stale deal alert\n\n"${deal.title}" has had no activity for ${deal.days_since_activity} days.\n\nLog an activity to keep it moving.`
            );
        }
    }
}
```

### 2.4 Automation 3: Duplicate Contact Detector

**Trigger:** On every contact create (event bus listener: `contact.created`)

**Logic:** After a new contact is created, run a background duplicate check:
- Same email address (exact match)
- Same name + same company (fuzzy match using pg_trgm similarity)
- Same phone number (normalized)

If duplicates found, create an in-app notification for the contact's owner: "Possible duplicate detected — [Contact Name] may already exist. Review and merge?"

The notification links to both records side-by-side with a "Merge" button.

```typescript
eventBus.on('contact.created', async ({ contactId }) => {
    await checkForDuplicates(contactId);
});

async function checkForDuplicates(contactId: string, db: Database) {
    const contact = await contactService.getById(contactId);
    
    const duplicates = await db.query(`
        SELECT id, first_name, last_name, email, company_id, phone,
               similarity(LOWER(first_name || ' ' || last_name), LOWER($1)) as name_sim
        FROM contacts
        WHERE id != $2
        AND deleted_at IS NULL
        AND (
            (email = $3 AND email IS NOT NULL AND $3 IS NOT NULL)
            OR (similarity(LOWER(first_name || ' ' || last_name), LOWER($1)) > 0.85 
                AND company_id = $4 AND company_id IS NOT NULL)
            OR (regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace($5, '[^0-9]', '', 'g')
                AND phone IS NOT NULL AND $5 IS NOT NULL)
        )
        LIMIT 5
    `, [
        `${contact.firstName} ${contact.lastName}`,
        contactId,
        contact.email,
        contact.companyId,
        contact.phone,
    ]);
    
    if (duplicates.rows.length > 0) {
        await notificationService.create({
            userId: contact.ownerId,
            title: 'Possible duplicate contact',
            body: `"${contact.firstName} ${contact.lastName}" may already exist in the CRM.`,
            actionUrl: `/contacts/${contactId}?duplicateOf=${duplicates.rows[0].id}`,
            type: 'warning',
        });
    }
}
```

### 2.5 Automation 4: Auto-Tag from Company Domain

**Trigger:** On contact create / company create

**Logic:** When a company is created with a domain, auto-apply industry-based tags using a lookup table. When a contact is linked to a company, inherit the company's tags (only the ones in the "Industry Vertical" category).

Additionally, recognize government domains (.gov.in), educational (.ac.in, .edu), and auto-tag accordingly.

### 2.6 Automation 5: Deal Stage Velocity Tracker

**Trigger:** Daily cron

**Logic:** For each pipeline, calculate average time spent in each stage across all deals closed in the last 90 days. Store as a `pipeline_benchmarks` table. Then find deals currently in a stage that have exceeded 1.5x the benchmark time — mark them with a "Slow" indicator visible in the Kanban board (an orange clock icon on the card).

This gives sales managers instant visibility into which deals are moving slower than historical average without anyone having to manually track it.

### 2.7 Automation 6: Smart Follow-Up Suggestions via Telegram

**Trigger:** Daily at 9 AM IST, sent to each sales rep via Telegram

**Logic:** For each sales rep, generate a personalized morning briefing (more detailed than `/today`) that includes:

- Their 3 highest-priority tasks for today
- Deals they haven't touched in 7+ days (with a direct link)
- Any leads assigned to them that are still "New" after 48 hours (need first contact)
- One "deal to focus on" selected by: highest weighted value deal closest to closing

```
Good morning Aditi! ☀️ Here's your focus for today:

📋 Priority tasks (3)
1. Follow up with Rajesh Sharma — demo 5 days ago, no next step set
2. Send proposal to CloudNine — promised last call
3. Check in with Ajay Nikumb — Demo Scheduled for 3 days

⏰ Deals needing attention
- InfraSec Solutions — ₹4,50,000 — 18 days no activity
- TechVault — ₹8,00,000 — 12 days no activity

🆕 New leads to contact
- 3 leads assigned to you haven't been contacted yet

🎯 Deal to focus on today
Adiroha Solutions — ₹6,50,000 — Proposal stage
Probability: 65% | Close date: 15 Jun | 2 days left to respond

Have a great day! 💪
```

This is an extension of the existing Telegram bot — add a new cron that runs at 9 AM IST, queries each authorized Telegram user's CRM data, and sends this personalized briefing.

### 2.8 Automation 7: Email-to-Activity Parser (Phase 2, if Gmail connected)

If a Google Workspace email integration is added later, this automation parses inbound emails and auto-matches them to CRM contacts by sender email address, creating `email_received` activities automatically. No manual logging needed.

### 2.9 Automation 8: Weekly Performance Summary (Telegram + Email)

**Trigger:** Every Monday at 8 AM IST

**Recipients:** Sales Manager + Super Admin roles

A richer version of the daily digest, covering:
- Deals won/lost last week with amounts
- New leads added last week (by source)
- Activities logged by each rep (leaderboard)
- Pipeline changes: deals that moved forward vs. backward
- Week-over-week comparisons
- Top performing rep callout

---

## Part 3: Environment Variables to Add

```env
# Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp   # Free tier model
GEMINI_MAX_TOKENS=2048
GEMINI_TEMPERATURE=0.1              # Low temp for SQL generation accuracy
```

### How to get the free Gemini API key:
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key — that's it. No billing setup required for the free tier.
5. Free tier: 1,500 requests/day, 1M tokens/minute, 1M token context window

---

## Part 4: File Structure Additions

```
src/
├── server/
│   ├── db/schema/
│   │   ├── ai-chat.ts                    # NEW — ai_chat_sessions + ai_chat_messages
│   │   └── pipeline-benchmarks.ts        # NEW — stage velocity benchmarks
│   ├── services/
│   │   ├── ai-chat.service.ts            # NEW — chatbot orchestration
│   │   ├── gemini.service.ts             # NEW — Gemini API client wrapper
│   │   ├── sql-safety.service.ts         # NEW — SQL validation layer
│   │   ├── automation.service.ts         # NEW — all automation logic
│   │   └── lead-score.service.ts         # NEW — lead scoring engine
│   ├── trpc/routers/
│   │   ├── ai-chat.router.ts             # NEW — chat endpoints
│   │   └── automation.router.ts          # NEW — automation config endpoints
│   └── lib/
│       └── cron.ts                       # EXTEND — add new cron schedules
├── app/
│   ├── (dashboard)/
│   │   ├── ai-chat/page.tsx              # NEW — full page chat
│   │   └── settings/
│   │       └── automations/page.tsx      # NEW — automation config
└── components/
    ├── ai-chat/
    │   ├── ChatPanel.tsx                 # NEW — floating chat widget
    │   ├── ChatMessage.tsx               # NEW — message bubble with markdown
    │   ├── ClarificationOptions.tsx      # NEW — clickable option buttons
    │   ├── ChatInput.tsx                 # NEW — message input bar
    │   └── SuggestedQuestions.tsx        # NEW — empty state suggestions
    └── settings/
        └── AutomationSettings.tsx        # NEW — toggle automations on/off
```

---

## Part 5: Gemini API Integration Pattern

```typescript
// gemini.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface ChatMessage {
    role: 'user' | 'model';
    parts: [{ text: string }];
}

export async function generateChatResponse(
    userMessage: string,
    conversationHistory: ChatMessage[],
    systemPrompt: string
): Promise<string> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        systemInstruction: systemPrompt,
        generationConfig: {
            temperature: 0.1,  // Low for SQL accuracy
            maxOutputTokens: 2048,
        },
    });
    
    const chat = model.startChat({ history: conversationHistory });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
}
```

Install: `npm install @google/generative-ai`

---

## Part 6: Complete Flow — Chatbot Request Lifecycle

```
1. User types: "How many leads have Aditya as owner from Delhi events?"

2. Client sends to: tRPC mutation ai-chat.sendMessage({ sessionId, message })

3. Server loads conversation history (last 6 messages) from ai_chat_messages

4. Pre-check: query mentions "event" → query DB for event tags → finds 2 Delhi event tags

5. Ambiguity detected → skip Gemini SQL generation → return clarification:
   {
     "phase": "clarify",
     "question": "I found 2 Delhi events. Which would you like?",
     "options": [
       { "label": "CIO Axis Delhi", "count": 32 },
       { "label": "NASSCOM Delhi Summit", "count": 18 },
       { "label": "All Delhi events combined" }
     ]
   }

6. Bot message stored to ai_chat_messages (was_clarification: true)

7. User clicks "All Delhi events combined, broken down by event"

8. This message sent as next turn. Now no ambiguity.

9. Gemini called with full conversation history (includes the clarification exchange)

10. Gemini returns:
    {
      "phase": "query",
      "sql": "SELECT t.name as event_name, COUNT(DISTINCT c.id) as lead_count, ...",
      "explanation": "Counting contacts owned by Aditya tagged with Delhi event tags, grouped by event"
    }

11. SQL safety layer validates — passes

12. Query executed against Postgres → returns rows

13. Gemini called again with raw results → formats into final response

14. Response stored + returned to client

15. Chat UI renders formatted response with markdown
```

---

## Part 7: Automation Settings Page

Admin page at Settings → Automations that shows a list of all automations with:
- Name and description
- Schedule or trigger
- Toggle on/off
- Last ran timestamp
- Last result (success/failed/X records affected)

This lets management enable/disable automations without code changes.

---

## Part 8: Testing Checklist

### AI Chatbot
- [ ] Simple count query ("how many leads do we have") returns correct number
- [ ] Ambiguous event query triggers clarification with clickable options
- [ ] After clarification, correct SQL is generated and executed
- [ ] Multi-turn: answer references context from previous messages
- [ ] SQL safety: attempt to ask "delete all contacts" is rejected
- [ ] SQL safety: timeout fires for slow queries (test with pg_sleep)
- [ ] RBAC: sales rep chatbot only returns their own deals (not team's)
- [ ] Empty results handled gracefully ("No deals found matching your criteria")
- [ ] Conversation history persists across page navigation
- [ ] Chat UI renders markdown tables correctly
- [ ] Suggested questions load when chat is empty
- [ ] Option buttons work (clicking sends option as message)

### Automations
- [ ] Lead score recalculation runs and updates scores correctly
- [ ] Stale deal alert creates task and sends Telegram notification
- [ ] Duplicate detection fires on contact create and notifies owner
- [ ] No duplicate tasks created if stale alert task already exists
- [ ] Morning briefing Telegram message sends to correct user at 9 AM
- [ ] Automations settings page shows correct last-ran timestamps
- [ ] Disabled automation does not run
- [ ] All automation actions appear in audit log with is_automated: true

---

**END OF ADDENDUM 2**