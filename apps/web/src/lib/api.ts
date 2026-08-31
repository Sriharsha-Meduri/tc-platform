/**
 * Server-side API client for Next.js Server Components.
 * Reads the tc_token cookie automatically — never call from Client Components.
 */
import { cookies } from 'next/headers';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

async function get<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Response shape types ───────────────────────────────────────────────────

export interface ApiStageInstance {
  id: string;
  transactionId: string;
  stage: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  waivedAt: string | null;
  createdAt: string;
}

export interface ApiTransaction {
  id: string;
  transactionNumber: string;
  transactionType: string;
  side: string;
  /** Which side of the transaction is coordinated ('BUYER' | 'SELLER'); absent on legacy rows → BUYER. */
  transactionSide?: string | null;
  status: string;
  propertyAddressLine1: string | null;
  propertyAddressLine2: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyPostalCode: string | null;
  listPrice: number | null;
  contractPrice: number | null;
  closeOfEscrowAt: string | null;
  offerAcceptedAt: string | null;
  formTemplateId: string | null;
  buyerAgentAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiParty {
  id: string;
  transactionId: string;
  partyRole: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  createdAt: string;
  /** Only populated by the workspace parties endpoint (GET /transactions/:id/workspace/parties) — absent elsewhere. */
  brokerage?: string | null;
}

export interface ApiMessage {
  id: string;
  transactionId: string;
  channel: string;
  direction: string;
  subject: string | null;
  bodyText: string | null;
  providerName: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  threadKey: string | null;
  status: string;
  receivedAt: string | null;
  createdAt: string;
  stage: string | null;
  senderPartyId: string | null;
  recipientPartyId: string | null;
  metadataJson: Record<string, unknown> | null;
}

export interface ApiWorkflowStep {
  id: string;
  transactionId: string;
  stepKey: string;
  stepName: string;
  category: string;
  responsibleRole: string;
  sortOrder: number;
  isOptional: boolean;
  status: string;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  waivedAt: string | null;
  notes: string | null;
}

export interface ApiDocument {
  id: string;
  transactionId: string;
  documentType: string;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  storageUrl: string | null;
  versionNo: number;
  status: string;
  dueAt: string | null;
  metadataJson: Record<string, unknown> | null;
  isOriginalPackage: boolean | null;
  sourceDocumentId?: string | null;
  formCode?: string | null;
  analysisStatus?: string | null;
  analyzedAt?: string | null;
  uploadedByAccount?: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiClockSettings {
  id: string;
  transactionId: string;
  timezone: string;
  virtualClockOffsetMs: string | null;
  updatedAt: string;
}

export interface ApiOrganization {
  id: string;
  name: string;
  type: string;
}

export interface ApiAccessGrant {
  id: string;
  transactionId: string;
  accountId: string;
  account: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    user?: { email: string };
  };
  transaction: {
    id: string;
    transactionNumber: string;
    propertyAddressLine1: string | null;
    propertyCity: string | null;
    propertyState: string | null;
  };
  grantedByAccount: { id: string; displayName: string } | null;
  accessLevel: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiAgentParty {
  id: string;
  transactionId: string;
  partyRole: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  accountId: string | null;
  transaction: {
    id: string;
    transactionNumber: string;
    propertyAddressLine1: string | null;
    propertyCity: string | null;
    propertyState: string | null;
    status: string;
  };
}

export interface ApiFormTemplateItem {
  id: string;
  templateId: string;
  formCode: string;
  formName: string;
  category: string;
  isRequired: boolean;
  sortOrder: number;
  stage: string | null;
  docusignTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiFormTemplate {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  stateCode: string | null;
  transactionType: string;
  side: string;
  isSystem: boolean;
  isActive: boolean;
  effectiveDate: string | null;
  retiredDate: string | null;
  createdByAccountId: string | null;
  docusignTemplateId: string | null;
  items?: ApiFormTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiCarForm {
  code: string;
  name: string;
  category: string;
  applicableTo: string[];
  transactionTypes: string[];
  required: boolean | 'conditional';
  description: string;
  revisedDate?: string;
  requiredWhen?: string;
}

export interface ApiOrgMember {
  id: string;
  organizationId: string;
  accountId: string;
  role: string;
  accessScope: string;
  isPrimary: boolean;
  joinedAt: string | null;
  account: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    cellPhone: string | null;
    officePhone: string | null;
    avatarUrl: string | null;
    user: { email: string };
  };
}

// ── API methods ────────────────────────────────────────────────────────────

export interface ApiMeResponse {
  user: {
    id: string;
    email: string;
    role: string;
    roles: string[];
    status: string;
  };
  account: {
    id: string;
    displayName: string;
  } | null;
}

export interface ApiTransactionSummary {
  id: string;
  transactionNumber: string;
  status: string;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  listPrice: number | null;
  contractPrice: number | null;
  closeOfEscrowAt: string | null;
  offerAcceptedAt: string | null;
  activeStage: string | null;
  blockerCount: number;
  warningCount: number;
  formCodes: string[];
  createdAt: string;
}

export const api = {
  auth: {
    me: () => get<ApiMeResponse>('/auth/me'),
  },
  transactions: {
    list: () => get<ApiTransaction[]>('/transactions'),
    get:  (id: string) => get<ApiTransaction>(`/transactions/${id}`),
    summary: () => get<ApiTransactionSummary[]>('/transactions/summary'),
  },
  parties: {
    byTransaction: (transactionId: string) =>
      get<ApiParty[]>(`/transaction-parties/transaction/${transactionId}`),
  },
  messages: {
    byTransaction: (transactionId: string) =>
      get<ApiMessage[]>(`/transaction-messages/transaction/${transactionId}`),
  },
  workflowSteps: {
    byTransaction: (transactionId: string) =>
      get<ApiWorkflowStep[]>(`/transaction-workflow-steps/transaction/${transactionId}`),
  },
  documents: {
    byTransaction: (transactionId: string) =>
      get<ApiDocument[]>(`/transaction-documents/transaction/${transactionId}`),
  },
  organizations: {
    list: () => get<ApiOrganization[]>('/organizations'),
  },
  accessGrants: {
    list: () => get<ApiAccessGrant[]>('/transaction-access-grants'),
  },
  agentsAndCoordinators: {
    list: () => get<ApiAgentParty[]>('/transaction-parties/agents-coordinators'),
  },
  members: {
    myOrgMembers: (accountId: string) =>
      get<ApiOrgMember[]>(`/organization-memberships/my-org-members/${accountId}`),
  },
  clock: {
    byTransaction: (id: string) => get<ApiClockSettings>(`/transactions/${id}/clock`),
  },
  stageInstances: {
    byTransaction: (id: string) => get<ApiStageInstance[]>(`/transactions/${id}/stages`),
  },
  formTemplates: {
    list: (params?: { organizationId?: string; transactionType?: string; side?: string; stateCode?: string }) => {
      const qs = new URLSearchParams(
        Object.entries(params ?? {}).filter(([, v]) => v != null) as [string, string][],
      ).toString();
      return get<ApiFormTemplate[]>(`/form-templates${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => get<ApiFormTemplate>(`/form-templates/${id}`),
  },
};
