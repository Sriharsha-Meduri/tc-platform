export type DocuSignTabType = 'signHere' | 'initialHere' | 'dateSigned' | 'fullName' | 'checkbox' | 'text';
export type FieldConfidence = 'high' | 'medium' | 'low';
export type DocumentFieldStatus =
  | 'complete'
  | 'missing_signatures'
  | 'missing_initials'
  | 'missing_dates'
  | 'missing_fields'
  | 'needs_review';

export interface MissingField {
  id: string;
  fieldType: 'signature' | 'initials' | 'date' | 'name' | 'checkbox' | 'text';
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

export interface DocumentAnalysis {
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
  fields: MissingField[];
  recommendedRecipients: Array<{
    role: string;
    label: string;
    name: string;
    email: string;
  }>;
}

export interface AnalyzeDocumentsResponse {
  analyses: DocumentAnalysis[];
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
  tabs: DocuSignTabRequest[];
}

export type RecipientRole = {
  recipientId: string;
  name: string;
  email: string;
  role: string;
  partyRole: string;
};
