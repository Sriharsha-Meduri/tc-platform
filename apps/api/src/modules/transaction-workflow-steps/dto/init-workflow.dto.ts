export class InitWorkflowDto {
  /** 2-letter state code (e.g. 'CA'). Overrides the transaction's propertyState for template matching. */
  stateCode?: string;

  /** ISO date string (YYYY-MM-DD). Used to compute step dueAt dates. Falls back to transaction.offerAcceptedAt. */
  offerAcceptedAt?: string;

  /**
   * stepKey values of optional steps to include (e.g. ['pest_inspection', 'request_for_repair']).
   * Optional steps not listed here are skipped.
   */
  optionalStepKeys?: string[];

  /** Account ID of the coordinator initiating the workflow (used for journal authorship). */
  initiatedByAccountId?: string;
}
