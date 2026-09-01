import { asc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import { estimateScopingAnswers, estimateScopingDocuments } from '@/server/db/schema';
import type { ScopingSourceFormat } from '@/lib/types';
import { assertDraft } from './estimate.service';

type DbClient = typeof defaultDb;

/**
 * The client's returned scoping questionnaire, as an attachment to an estimate.
 *
 * The mirror of estimate-staffing.service.ts, and for the same kind of reason:
 * this carries the client's own words about their business, their IT estate and
 * their security posture — never cost, never a rate, and never anything that
 * reaches the cost engine. Nothing in here may be given a weight. The moment a
 * value stored here multiplies something, this path and the sizing-driver path
 * have merged, and the estimator has lost the ability to read the sheet and
 * disagree with it.
 *
 * Writes go through `assertDraft`, so an approved estimate's questionnaire
 * freezes along with its figures. That is not incidental: because the sheet
 * feeds no number, it is *only* evidence, and evidence that can be swapped
 * after approval is worse than none. A corrected questionnaire belongs on a
 * duplicate, which is what the frozen-estimate message already tells people.
 */

export interface ScopingRowInput {
  section?: string | null;
  question: string;
  answer?: string | null;
  isSectionHeader?: boolean;
}

export interface ReplaceScopingSheetInput {
  fileName: string;
  sourceFormat: ScopingSourceFormat;
  sheetName?: string | null;
  encoding?: string | null;
  rows: ScopingRowInput[];
}

export interface ScopingSheet {
  document: typeof estimateScopingDocuments.$inferSelect;
  answers: (typeof estimateScopingAnswers.$inferSelect)[];
}

/** What the previous sheet was, for the audit trail. */
export interface PreviousScopingSheet {
  fileName: string;
  rowCount: number;
  sourceFormat: string;
}

/**
 * Thrown when two people upload at once and the unique constraint refuses the
 * second. Correctness is preserved either way; this exists so the loser is told
 * to reload rather than shown a 500.
 */
export class ScopingSheetConflictError extends Error {
  readonly code = 'SCOPING_SHEET_CONFLICT';
  constructor() {
    super('Someone else changed the questionnaire on this estimate. Reload and try again.');
    this.name = 'ScopingSheetConflictError';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/**
 * The sheet on an estimate, or null.
 *
 * Two sequential queries rather than a join or a Promise.all. The short-circuit
 * is the point: an estimate with no sheet — which is every estimate that exists
 * before this feature ships — costs one indexed single-row lookup that returns
 * nothing. Sequential because `db` may be a transaction client, which is a
 * single connection, and concurrent queries on one connection break in pg@9.
 */
export async function getScopingSheet(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<ScopingSheet | null> {
  const [document] = await db
    .select()
    .from(estimateScopingDocuments)
    .where(eq(estimateScopingDocuments.estimateId, estimateId))
    .limit(1);
  if (!document) return null;

  const answers = await db
    .select()
    .from(estimateScopingAnswers)
    .where(eq(estimateScopingAnswers.documentId, document.id))
    .orderBy(asc(estimateScopingAnswers.position));

  return { document, answers };
}

/**
 * Puts a sheet on a draft, replacing whatever was there.
 *
 * Replace rather than accumulate: a re-upload is a corrected questionnaire, not
 * a second one, and keeping both would raise "which did we scope against?" with
 * nothing able to answer it. The previous header is returned so the caller can
 * record what was displaced — the answers themselves are not, because the audit
 * log is not the place for a diff of two hundred prose paragraphs.
 */
export async function replaceScopingSheet(
  estimateId: string,
  input: ReplaceScopingSheetInput,
  uploadedBy: string,
  db: DbClient = defaultDb
): Promise<{ rowCount: number; previous: PreviousScopingSheet | null }> {
  await assertDraft(estimateId, db);

  const [existing] = await db
    .select({
      fileName: estimateScopingDocuments.fileName,
      rowCount: estimateScopingDocuments.rowCount,
      sourceFormat: estimateScopingDocuments.sourceFormat,
    })
    .from(estimateScopingDocuments)
    .where(eq(estimateScopingDocuments.estimateId, estimateId))
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      // The answers go with it: the FK cascades.
      await tx
        .delete(estimateScopingDocuments)
        .where(eq(estimateScopingDocuments.estimateId, estimateId));

      const [document] = await tx
        .insert(estimateScopingDocuments)
        .values({
          estimateId,
          fileName: input.fileName,
          sourceFormat: input.sourceFormat,
          sheetName: input.sheetName ?? null,
          encoding: input.encoding ?? null,
          rowCount: input.rows.length,
          uploadedBy,
        })
        .returning();

      if (input.rows.length) {
        await tx.insert(estimateScopingAnswers).values(
          input.rows.map((row, position) => ({
            documentId: document!.id,
            // Assigned here, never sent by the caller: the array already
            // carries the order, and a client-supplied position is a way to
            // write duplicates and negatives.
            position,
            section: row.section ?? null,
            question: row.question,
            // A heading has no answer, and the CHECK on the table agrees.
            answer: row.isSectionHeader ? null : (row.answer ?? null),
            isSectionHeader: row.isSectionHeader ?? false,
          }))
        );
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ScopingSheetConflictError();
    throw error;
  }

  return {
    rowCount: input.rows.length,
    previous: existing
      ? {
          fileName: existing.fileName,
          rowCount: existing.rowCount,
          sourceFormat: existing.sourceFormat,
        }
      : null,
  };
}

/** Takes the sheet off a draft. Returns whether there was one. */
export async function deleteScopingSheet(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<boolean> {
  await assertDraft(estimateId, db);
  const removed = await db
    .delete(estimateScopingDocuments)
    .where(eq(estimateScopingDocuments.estimateId, estimateId))
    .returning({ id: estimateScopingDocuments.id });
  return removed.length > 0;
}
