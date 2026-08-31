/** The transaction_documents.documentType value for a generated CDA — shared by CdaGenerationService (writes it) and everything that reads it back (the upload-link CDA endpoint, CdaNotificationService, visibility checks). */
export const CDA_DOCUMENT_TYPE = 'cda';

/** The transaction_documents.documentType value for the Broker-uploaded signed CDA — distinct from CDA_DOCUMENT_TYPE (the system-generated unsigned original, which keeps existing after signing). Shared by SignedCdaUploadService (writes it) and everything that reads it back (Broker's checklist, the Escrow upload-link visibility exception, CdaNotificationService's escrow notification). */
export const SIGNED_CDA_DOCUMENT_TYPE = 'signed_cda';
