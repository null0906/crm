/**
 * The one list of what we sell.
 *
 * Three vocabularies grew up independently and none of them agreed. Deals used
 * display strings ('SOC 2'), projects used slugs ('soc2_type2'), and the effort
 * catalog stored whichever the author happened to type. The cost of that was
 * not cosmetic: the only seeded effort baseline was written as 'soc2_type2'
 * while the estimate dialog searched for 'SOC 2', so the baseline could not be
 * found and every SOC 2 estimate started from nothing.
 *
 * Everything that prices, sizes or reports against a service now stores the
 * slug and renders the label. `fromLegacy` exists to migrate what came before
 * and to read the sales-side list, which deliberately keeps its own strings.
 */

export interface ServiceLine {
  /** Stored. Stable — renaming one is a data migration, not an edit. */
  slug: string;
  /** Rendered. Safe to change. */
  label: string;
  isActive: boolean;
}

/**
 * The seed list, and the fallback while the query is in flight.
 *
 * Service lines now live in the `service_lines` table and are edited in
 * Settings, because adding one used to mean a deploy before anyone could price
 * it. This array is what migration 0032 seeded that table from, and what
 * `useServiceLines` renders before the first response arrives — a label that
 * flickers in from nothing is worse than a stale one that is almost always
 * right. Editing it changes neither: it is history plus a first paint.
 *
 * SOC 2 is split by type because the two are genuinely different engagements —
 * a Type I is a point-in-time design opinion, a Type II observes a review
 * period — and costing them from one baseline would average away the
 * difference. The legacy sales list had a single 'SOC 2' entry, which is why
 * `fromLegacy` has to make a choice about it.
 */
export const SERVICE_LINES: readonly ServiceLine[] = [
  { slug: 'soc2_type1', label: 'SOC 2 Type I', isActive: true },
  { slug: 'soc2_type2', label: 'SOC 2 Type II', isActive: true },
  { slug: 'iso27001', label: 'ISO 27001', isActive: true },
  { slug: 'iso27701', label: 'ISO 27701 (PIMS)', isActive: true },
  { slug: 'dpdp', label: 'DPDP Act', isActive: true },
  { slug: 'gdpr', label: 'GDPR', isActive: true },
  { slug: 'vapt', label: 'VAPT', isActive: true },
  { slug: 'pci_dss', label: 'PCI DSS', isActive: true },
  { slug: 'cspm', label: 'Cloud Security (CSPM)', isActive: true },
  { slug: 'cert_in', label: 'CERT-In', isActive: true },
  { slug: 'ai_governance', label: 'AI Governance', isActive: true },
  { slug: 'grc_consulting', label: 'GRC Consulting', isActive: true },
  { slug: 'compliance_automation', label: 'Compliance Automation', isActive: true },
  { slug: 'security_awareness_training', label: 'Security Awareness Training', isActive: true },
  { slug: 'audit_support', label: 'Audit Support', isActive: true },
  { slug: 'other', label: 'Other', isActive: true },
] as const;

/**
 * Company-wide, used by `margin_targets` where a NULL would break the partial
 * unique index on the open row — Postgres treats NULLs as distinct, so two
 * open company-wide rows could coexist. Passes through `fromLegacy` untouched.
 */
export const SERVICE_LINE_ANY = '*';

const BY_SLUG = new Map(SERVICE_LINES.map((s) => [s.slug, s]));

export function isServiceLineSlug(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && BY_SLUG.has(value);
}

export function activeServiceLines(): ServiceLine[] {
  return SERVICE_LINES.filter((s) => s.isActive);
}

/**
 * Renders a stored slug against the seed list.
 *
 * Falls back to the raw value rather than to 'Unknown', so a row written before
 * the migration is legible on screen instead of disappearing behind a
 * placeholder. React callers should prefer `useServiceLines().label`, which
 * reads the configured list and so knows about lines added since this constant
 * was written; this one exists for server code and for the fallback path.
 */
export function serviceLineLabel(slug: string | null | undefined): string {
  if (!slug) return 'Not set';
  if (slug === SERVICE_LINE_ANY) return 'All service lines';
  return BY_SLUG.get(slug)?.label ?? slug;
}

/**
 * Legacy display strings and project slugs, lowercased, mapped to canonical
 * slugs.
 *
 * 'soc 2' resolves to Type II. The sales list never distinguished the two, and
 * Type II is the overwhelming majority of what is actually sold — but it is a
 * guess, and it is the only entry here that is. A row that was genuinely a
 * Type I has to be corrected by hand; nothing can recover that from the string.
 */
const LEGACY: Record<string, string> = {
  // Sales-side display strings — DEAL_SERVICE_OPTIONS.
  'soc 2': 'soc2_type2',
  'soc2': 'soc2_type2',
  'iso 27001': 'iso27001',
  'iso 27701': 'iso27701',
  'pci dss': 'pci_dss',
  'cloud security': 'cspm',
  'grc consulting': 'grc_consulting',
  'compliance automation': 'compliance_automation',
  'security awareness training': 'security_awareness_training',
  'audit support': 'audit_support',
  'vapt': 'vapt',
  'other': 'other',
  // Project-side slugs — SERVICE_TYPE_CONFIG.
  'soc2_type1': 'soc2_type1',
  'soc2_type2': 'soc2_type2',
  'iso27001': 'iso27001',
  'dpdp': 'dpdp',
  'cspm': 'cspm',
  'cert_in': 'cert_in',
  'cert-in': 'cert_in',
  'ai_governance': 'ai_governance',
  'custom': 'other',
  // Spellings seen in the scoping workbooks.
  'gdpr': 'gdpr',
  'dpdpa': 'dpdp',
  'pims': 'iso27701',
};

/**
 * Maps anything previously stored to a canonical slug. Returns null for an
 * empty value and for anything unrecognised — callers decide whether that is a
 * warning or a silent skip, because the right answer differs between a
 * migration and a coverage report.
 */
export function fromLegacy(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (raw === '') return null;
  if (raw === SERVICE_LINE_ANY) return SERVICE_LINE_ANY;
  if (BY_SLUG.has(raw)) return raw;
  return LEGACY[raw.toLowerCase()] ?? null;
}
