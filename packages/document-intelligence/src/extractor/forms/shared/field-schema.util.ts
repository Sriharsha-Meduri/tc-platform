/**
 * Shared schema-fragment + prompt-instruction generator for contract fields
 * that need the entered-vs-printed-default distinction (spec items 3/4):
 * the LLM must report what was actually typed/handwritten/checked/selected
 * SEPARATELY from any pre-printed default the form shows, and must never let
 * signature/initials/execution status influence whether a value counts as
 * "entered". Execution validity is a completely different question, handled
 * by the validator stages, never by extraction.
 *
 * For RPA page 2's contingency-days rows, which already carry the
 * equivalent triad under different, already-wired field names
 * (default_days_after_acceptance / override_days_after_acceptance /
 * days_after_acceptance), do NOT use fieldSchema() — instead splice the 4
 * extra keys below directly into that existing schema block, to avoid
 * renaming fields every downstream consumer (contract.stage.ts's
 * effectiveDays()) already reads correctly.
 */

export interface FieldSchemaOptions {
  /** True only when the form itself prints a default value for this field before any entry. Most fields have none. */
  hasPrintedDefault?: boolean;
  valueType?: 'number' | 'string' | 'boolean' | 'date';
}

function typeLabel(valueType: FieldSchemaOptions['valueType']): string {
  switch (valueType) {
    case 'boolean': return 'boolean';
    case 'date': return 'date: YYYY-MM-DD';
    case 'string': return 'string';
    default: return 'number';
  }
}

/** Full standalone field schema for a value with no existing default/entered split. */
export function fieldSchema(description: string, opts: FieldSchemaOptions = {}): Record<string, string> {
  const t = typeLabel(opts.valueType);
  return {
    default_value: opts.hasPrintedDefault
      ? `<${t}|null — printed/pre-printed default exactly as shown on the form, before any entry or override>`
      : `<${t}|null — this field has no printed default on the form; leave null unless one is visibly printed>`,
    entered_value: `<${t}|null — value actually typed, handwritten, checked, or selected by a party. ${description}>`,
    resolved_value: `<${t}|null — entered_value when entered_value_present is true, otherwise default_value, otherwise null>`,
    entered_value_present: '<boolean — true only when a party actually entered/typed/checked/selected this field. This must NEVER be set false because a signature or initials appear missing anywhere on the page or document — execution status is a separate concern handled elsewhere.>',
    source_type: "<'typed'|'handwritten'|'checkbox'|'radio'|'pdf_form_field'|'pdf_text'|'vision'|'printed_default'|'derived'|'unknown'>",
    evidence_text: '<string|null — the literal text/marks read for this field>',
    confidence: '<number 0-1|null>',
  };
}

/** The 4 extra keys to splice into an existing default/override/resolved triad (e.g. RPA page 2's L1-L8/M/N rows) — additive, does not rename the existing keys. */
export function fieldProvenanceKeys(): Record<string, string> {
  return {
    entered_value_present: '<boolean — true only when an override/entered value was actually provided. Must NEVER be set false due to missing signatures or initials — execution status is a separate concern.>',
    source_type: "<'typed'|'handwritten'|'checkbox'|'radio'|'pdf_form_field'|'pdf_text'|'vision'|'printed_default'|'derived'|'unknown'>",
    evidence_text: '<string|null>',
    confidence: '<number 0-1|null>',
  };
}

export const FIELD_EXTRACTION_INSTRUCTION = `
FIELD VALUE RULES (applies to every field built with the standard field schema, and to every default/override day-count field):
- entered_value (or override_*) is whatever a party actually wrote, typed, checked, or selected — even if it conflicts with a printed default.
- default_value is ONLY a pre-printed/boilerplate value the form shows before any entry (e.g. a printed default day count). Most fields have none — leave default_value null.
- resolved_value = entered_value when entered_value_present is true, otherwise default_value, otherwise null.
- entered_value_present reflects ONLY whether a value was written/typed/checked/selected. It must NEVER be set false because a signature or initials appear missing anywhere on the page or document. Signatures, initials, and execution status are a completely separate concern handled elsewhere and must not affect entered_value, resolved_value, or entered_value_present.
`;
