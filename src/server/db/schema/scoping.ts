import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { estimates } from './estimating';
import { users } from './users';
import type { ScopingSourceFormat } from '@/lib/types';

/* ------------------------------------------------- scoping questionnaire */

/**
 * The client's returned scoping questionnaire, attached to one estimate.
 *
 * A second scoping artefact alongside `estimate_drivers`, and deliberately not
 * wired to it. A driver is an answer that moves a number: it carries a weight,
 * the weights compose into `estimates.size_multiplier`, and changing one changes
 * what the engagement is sized at. This is the sheet the client actually sent
 * back — their prose, their words, their order — which sizes nothing and is read
 * by whoever is deciding hours and headcount. Nothing here reaches the cost
 * engine, and nothing here may ever be given a weight: the moment a column on
 * this table multiplies something, the two paths have merged and the estimator
 * has lost the ability to disagree with the sheet.
 *
 * The file itself is never stored. It is parsed in the browser and posted as
 * rows through tRPC, matching the import wizard's precedent — no upload
 * endpoint, no blob store, nothing on disk to secure, back up or leak.
 *
 * One sheet per estimate, and the unique constraint is what says so rather than
 * a convention in the service. A re-upload is a corrected questionnaire, not a
 * second one, so it replaces in place; what the previous sheet was lives in the
 * audit log, which is already where every other estimate write records itself.
 */
export const estimateScopingDocuments = pgTable(
  'estimate_scoping_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    /** As the uploader's filesystem had it. Provenance, never a lookup key. */
    fileName: varchar('file_name', { length: 255 }).notNull(),
    sourceFormat: varchar('source_format', { length: 10 })
      .$type<ScopingSourceFormat>()
      .notNull(),
    /**
     * Which worksheet the rows came from. Null for CSV, which has no tabs. A
     * workbook routinely carries the questionnaire beside an instructions tab
     * and a change log, and which one was read is the difference between a
     * complete sheet and an empty one.
     */
    sheetName: varchar('sheet_name', { length: 100 }),
    /**
     * How the bytes were decoded. 'windows-1252' means we inferred it because
     * the file carried no marker and was not valid UTF-8 — kept so a mangled
     * quote noticed months later is explainable rather than mysterious.
     */
    encoding: varchar('encoding', { length: 20 }),
    /**
     * How many rows were stored, not how many the file had. The parser drops
     * rows with neither a question nor an answer, and a count that disagreed
     * with what is on screen would be worse than no count. Denormalised so a
     * summary line can be drawn without touching the child table.
     */
    rowCount: integer('row_count').notNull().default(0),
    /**
     * Who put it in the system — not who duplicated the estimate afterwards.
     * `duplicateEstimate` copies this and `uploaded_at` unchanged, unlike
     * `estimates.created_by`, which becomes the person duplicating. The estimate
     * really is new; the client's questionnaire is not, and claiming otherwise
     * would say someone collected evidence they never asked for.
     */
    uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Doubles as the lookup index. One sheet per estimate makes "the uniqueness
    // rule" and "find this estimate's sheet" the same object, so a separate
    // index on estimate_id would be a duplicate maintained for nothing.
    unique('uq_scoping_document_estimate').on(t.estimateId),
    check('scoping_document_format_check', sql`${t.sourceFormat} IN ('csv', 'xlsx')`),
    check('scoping_document_row_count_check', sql`${t.rowCount} >= 0`),
  ]
);

/**
 * One row of the returned sheet, in the order the client sent it.
 *
 * `question` and `answer` are `text`, not `varchar(n)`. The answers are prose
 * and the sample set already runs past a thousand characters, so any n large
 * enough to be safe expresses no rule at all. Postgres stores the two
 * identically, and the only real difference is the length check — written here
 * as an explicit CHECK sized to match the router's zod caps. The router is
 * where a caller is told what is too long; this is what stops a caller who
 * never goes through the router.
 *
 * Section headings ("2. Scope Definition") are kept as rows and flagged, rather
 * than discarded. Dropping them would mean the stored artefact is not the sheet
 * that was sent, and being the sheet that was sent is the only property a piece
 * of evidence has. `section` additionally carries the heading down onto the rows
 * beneath it, so a question still reads correctly when it is shown on its own —
 * in a search result, say, where its heading is off screen.
 */
export const estimateScopingAnswers = pgTable(
  'estimate_scoping_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => estimateScopingDocuments.id, { onDelete: 'cascade' }),
    /**
     * 0-based, taken from the array index server-side. Never sent by the client,
     * for the same reason `replaceTeamLines` and `replaceCostLines` assign
     * theirs: the array already carries the order, and a client-supplied
     * position is a way to write duplicates and negatives.
     */
    position: integer('position').notNull(),
    /** The heading this row sits under, carried down by the parser. */
    section: varchar('section', { length: 200 }),
    question: text('question').notNull(),
    answer: text('answer'),
    isSectionHeader: boolean('is_section_header').notNull().default(false),
  },
  (t) => [
    // Composite and unique in one. Every read is "this document's rows, in
    // order", so the constraint that stops a duplicate position is also the
    // index that serves the filter and the sort.
    unique('uq_scoping_answer_position').on(t.documentId, t.position),
    check('scoping_answer_position_check', sql`${t.position} >= 0`),
    // A heading has no answer by definition. Without this a row could claim to
    // be both a section title and a response, and every consumer would need a
    // rule for a case that cannot legitimately occur.
    check(
      'scoping_answer_header_check',
      sql`${t.isSectionHeader} = false OR ${t.answer} IS NULL`
    ),
    // Sized to the router's caps. A cell longer than this is not a scoping
    // answer, it is a report someone pasted into the wrong column.
    check('scoping_answer_question_length_check', sql`char_length(${t.question}) <= 2000`),
    check(
      'scoping_answer_answer_length_check',
      sql`${t.answer} IS NULL OR char_length(${t.answer}) <= 20000`
    ),
  ]
);

export type EstimateScopingDocument = typeof estimateScopingDocuments.$inferSelect;
export type NewEstimateScopingDocument = typeof estimateScopingDocuments.$inferInsert;
export type EstimateScopingAnswer = typeof estimateScopingAnswers.$inferSelect;
export type NewEstimateScopingAnswer = typeof estimateScopingAnswers.$inferInsert;
