import type { ExtractedContractField } from '../../extractor/extractor.types';
import type { ComplianceCheck } from '../validator.types';

export interface FieldValidationSummary {
  status: 'pass' | 'blocker' | 'unknown';
  checks: ComplianceCheck[];
}

/**
 * Debug-only logger for one resolved contract field, gated behind
 * `DEBUG_CONTRACT_TERMS=1`. Logs form/page/printed-default/entered-value/
 * resolved-value/source-type/evidence/confidence, plus — separately — the
 * validation status and any blocking checks.
 *
 * The one non-negotiable this function exists to enforce: it always reads
 * `field.value` for "resolved_value", NEVER `field.defaultValue`, and this
 * holds even when `validation.status === 'blocker'`. A failed signature or
 * initials check must never make the debug output (or anything else) show
 * the printed default in place of the value actually written on the
 * document — that would silently reproduce the exact bug this package's
 * extraction/validation separation exists to prevent.
 */
export function logResolvedFieldDebug<T>(
  fieldKey: string,
  field: ExtractedContractField<T> | null | undefined,
  validation?: FieldValidationSummary,
): void {
  if (process.env.DEBUG_CONTRACT_TERMS !== '1') return;

  if (!field) {
    // eslint-disable-next-line no-console
    console.log(`[ContractTermsDebug] field=${fieldKey} | no field data`);
    return;
  }

  const parts = [
    `field=${fieldKey}`,
    `form=${field.source.formCode}`,
    `page=${field.source.page}`,
    `printed_default=${JSON.stringify(field.defaultValue ?? null)}`,
    `entered_value=${JSON.stringify(field.enteredValue ?? null)}`,
    // Always field.value, never field.defaultValue — see doc comment above.
    `resolved_value=${JSON.stringify(field.value)}`,
    `source_type=${field.sourceType}`,
  ];
  if (field.evidence?.text != null) parts.push(`evidence=${JSON.stringify(field.evidence.text)}`);
  if (field.evidence?.confidence != null) parts.push(`confidence=${field.evidence.confidence}`);

  if (validation) {
    parts.push(`validation_status=${validation.status}`);
    if (validation.checks.length > 0) {
      parts.push(`validation_checks=[${validation.checks.map((c) => c.ruleId).join(', ')}]`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[ContractTermsDebug] ${parts.join(' | ')}`);
}
