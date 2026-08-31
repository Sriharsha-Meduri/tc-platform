import type { BlockerOutput, WarningOutput } from '@tc/document-intelligence';

export type FieldType = 'signature' | 'initials' | 'date' | 'name' | 'checkbox' | 'text';
export type DocuSignTabType = 'signHere' | 'initialHere' | 'dateSigned' | 'fullName' | 'checkbox' | 'text';

export interface MissingFieldMetadata {
  id: string;
  fieldType: FieldType;
  docuSignTabType: DocuSignTabType;
  label: string;
  description: string;
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  recommendedRecipientRole: string;
  recipientName: string | null;
  recipientEmail: string | null;
  formCode: string;
  documentId: string;
  sourceCode: string;
  confidence: FieldConfidence;
  anchorString: string | null;
  isRequired: boolean;
}

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface DocumentFieldAnalysis {
  documentId: string;
  fileName: string;
  formCode: string;
  formName: string;
  status: DocumentFieldStatus;
  statusLabel: string;
  totalFields: number;
  requiredFields: number;
  missingRequired: number;
  missingOptional: number;
  fields: MissingFieldMetadata[];
  recommendedRecipients: Array<{
    role: string;
    label: string;
    name: string;
    email: string;
  }>;
}

export type DocumentFieldStatus =
  | 'complete'
  | 'missing_signatures'
  | 'missing_initials'
  | 'missing_dates'
  | 'missing_fields'
  | 'needs_review';

export interface AnalyzeDocumentsResponse {
  analyses: DocumentFieldAnalysis[];
  summary: {
    totalDocuments: number;
    completeDocuments: number;
    documentsWithMissingFields: number;
    totalMissingRequired: number;
    totalMissingOptional: number;
    statusLabels: string[];
  };
}

export interface DocuSignTabRequest {
  tabType: DocuSignTabType;
  recipientId: string;
  pageNumber: string;
  xPosition: string;
  yPosition: string;
  documentId: string;
  tabLabel: string;
  anchorString?: string;
  anchorUnits?: string;
  anchorXOffset?: string;
  anchorYOffset?: string;
  width?: string;
  height?: string;
  required?: string;
  locked?: string;
}

export interface EnvelopeFieldPlacement {
  documentId: string;
  documentBase64: string;
  fileName: string;
  documentNumber: string;
  tabs: Record<string, unknown[]>;
}

export interface CreateEnvelopeWithFieldsRequest {
  transactionId: string;
  documentIds: string[];
  signers: Array<{ name: string; email: string; role: string }>;
  fieldPlacements: EnvelopeFieldPlacement[];
  emailSubject?: string;
  emailBody?: string;
}

export type FieldIssue =
  | { kind: 'no_recipient'; fieldId: string; fieldLabel: string }
  | { kind: 'invalid_coordinates'; fieldId: string; fieldLabel: string; reason: string }
  | { kind: 'low_confidence'; fieldId: string; fieldLabel: string }
  | { kind: 'no_connected_account'; message: string };

export interface FieldValidationResult {
  valid: boolean;
  issues: FieldIssue[];
}

// ─── Form-specific coordinate maps ─────────────────────────────────────────────

export interface FormFieldPlacement {
  label: string;
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  docuSignTabType: DocuSignTabType;
  recommendedRecipientRole: string;
  description: string;
  complianceCode: string;
}

export interface FormFieldTemplate {
  formCode: string;
  pageCount: number;
  placements: FormFieldPlacement[];
}
