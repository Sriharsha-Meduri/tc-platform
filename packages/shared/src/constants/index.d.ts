export declare const API_VERSION = "v1";
export declare const API_PREFIX = "/api/v1";
export declare const GRAPHQL_PATH = "/graphql";
/**
 * Code-level feature flags. Flip a value here — not an env var, not a DB
 * setting — to enable/disable a feature across web + api. Both apps import
 * this same constant from @tc/shared, so there is a single source of truth.
 *
 * sellerSideEnabled: gates the Seller Side option in Create Transaction.
 * While false, the UI shows Seller Side as locked (TransactionSideSelector)
 * and the API refuses to create a Seller Side transaction (see
 * normalizeTransactionSide in document-extraction.controller.ts). Flip to
 * true to unlock — the existing Seller Side workflow is otherwise untouched.
 */
export declare const TRANSACTION_FEATURES: {
    sellerSideEnabled: boolean;
};
/**
 * CDA (Commission Disbursement Authorization) generation config — not yet
 * admin-configurable or per-transaction; flip these constants directly
 * until a real settings UI/DB-backed config exists.
 *
 * mytcAppCommissionAmount: myTC's own transaction-coordination fee, in
 * dollars, subtracted from grossCommission alongside the broker's cut to
 * arrive at the agent's commission (see CdaGenerationService). Defaults to
 * $0 — every CDA legitimately has no myTC fee until this is set.
 *
 * myTCAddress: myTC App LLC's official mailing address, printed on the
 * CDA. Null omits that line entirely (see cda-calculator.ts's
 * getCdaDisplayValue) rather than printing a placeholder.
 */
export declare const CDA_CONFIG: {
    mytcAppCommissionAmount: number;
    myTCAddress: string | null;
};
//# sourceMappingURL=index.d.ts.map