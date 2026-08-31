import { ChecklistCompositionService } from './checklist-composition.service';

const TRANSACTION = { id: 'tx-1' };
const BUYER_LINK = { id: 'link-buyer', purpose: 'document_upload' };
const SELLER_LINK = { id: 'link-seller', purpose: 'seller_agent_document_upload' };
const ESCROW_LINK = { id: 'link-escrow', purpose: 'escrow_officer_document_upload' };
const BROKER_LINK = { id: 'link-broker', purpose: 'broker_document_upload' };

const BASE_CHECKLIST = { items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true };
const VALIDATION_ENRICHED = { ...BASE_CHECKLIST, items: [{ formCode: 'x', validation: 'validation-applied' }] };
const DOCUSIGN_ENRICHED = { ...BASE_CHECKLIST, items: [{ formCode: 'y', docusign: 'docusign-applied' }] };

function buildService(overrides: { sellerAgentLink?: typeof SELLER_LINK | null } = {}) {
  const externalTransactionInformationService = {
    getDocumentChecklist: jest.fn().mockResolvedValue(BASE_CHECKLIST),
    getDocumentChecklistForPurpose: jest.fn().mockResolvedValue(BASE_CHECKLIST),
  };
  const sellerAgentDocumentDocusignService = {
    enrichChecklistWithDocusignInfo: jest.fn().mockResolvedValue(DOCUSIGN_ENRICHED),
  };
  const buyerAgentChecklistValidationService = {
    enrichChecklistWithValidation: jest.fn().mockResolvedValue(VALIDATION_ENRICHED),
  };
  const uploadLinkRepo = {
    findMostRecentActiveByPurpose: jest.fn().mockResolvedValue(overrides.sellerAgentLink !== undefined ? overrides.sellerAgentLink : SELLER_LINK),
  };

  const service = new ChecklistCompositionService(
    externalTransactionInformationService as never,
    sellerAgentDocumentDocusignService as never,
    buyerAgentChecklistValidationService as never,
    uploadLinkRepo as never,
  );

  return { service, externalTransactionInformationService, sellerAgentDocumentDocusignService, buyerAgentChecklistValidationService, uploadLinkRepo };
}

describe('ChecklistCompositionService.composeForLink', () => {
  it('Buyer Agent: fetches via getDocumentChecklist and applies validation enrichment', async () => {
    const { service, externalTransactionInformationService, buyerAgentChecklistValidationService } = buildService();
    const result = await service.composeForLink(BUYER_LINK as never, TRANSACTION as never);
    expect(externalTransactionInformationService.getDocumentChecklist).toHaveBeenCalledWith(BUYER_LINK, TRANSACTION);
    expect(buyerAgentChecklistValidationService.enrichChecklistWithValidation).toHaveBeenCalledWith(BUYER_LINK, TRANSACTION, BASE_CHECKLIST);
    expect(result).toEqual(VALIDATION_ENRICHED);
  });

  it('Seller Agent: applies DocuSign enrichment instead of validation enrichment', async () => {
    const { service, sellerAgentDocumentDocusignService, buyerAgentChecklistValidationService } = buildService();
    const result = await service.composeForLink(SELLER_LINK as never, TRANSACTION as never);
    expect(sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo).toHaveBeenCalledWith(SELLER_LINK, TRANSACTION, BASE_CHECKLIST);
    expect(buyerAgentChecklistValidationService.enrichChecklistWithValidation).not.toHaveBeenCalled();
    expect(result).toEqual(DOCUSIGN_ENRICHED);
  });

  it('Escrow: applies validation enrichment, not DocuSign', async () => {
    const { service, sellerAgentDocumentDocusignService, buyerAgentChecklistValidationService } = buildService();
    await service.composeForLink(ESCROW_LINK as never, TRANSACTION as never);
    expect(sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo).not.toHaveBeenCalled();
    expect(buyerAgentChecklistValidationService.enrichChecklistWithValidation).toHaveBeenCalledWith(ESCROW_LINK, TRANSACTION, BASE_CHECKLIST);
  });

  it('Broker: applies validation enrichment, not DocuSign', async () => {
    const { service, sellerAgentDocumentDocusignService, buyerAgentChecklistValidationService } = buildService();
    await service.composeForLink(BROKER_LINK as never, TRANSACTION as never);
    expect(sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo).not.toHaveBeenCalled();
    expect(buyerAgentChecklistValidationService.enrichChecklistWithValidation).toHaveBeenCalledWith(BROKER_LINK, TRANSACTION, BASE_CHECKLIST);
  });
});

describe('ChecklistCompositionService.composeForPurpose — the internal (no-token) entry point used by the myTC swimlane', () => {
  it('with a real link, behaves identically to composeForLink', async () => {
    const { service, externalTransactionInformationService } = buildService();
    await service.composeForPurpose('document_upload' as never, BUYER_LINK as never, TRANSACTION as never);
    expect(externalTransactionInformationService.getDocumentChecklist).toHaveBeenCalledWith(BUYER_LINK, TRANSACTION);
    expect(externalTransactionInformationService.getDocumentChecklistForPurpose).not.toHaveBeenCalled();
  });

  it('with link: null, falls back to getDocumentChecklistForPurpose', async () => {
    const { service, externalTransactionInformationService } = buildService();
    await service.composeForPurpose('escrow_officer_document_upload' as never, null, TRANSACTION as never);
    expect(externalTransactionInformationService.getDocumentChecklistForPurpose).toHaveBeenCalledWith('escrow_officer_document_upload', TRANSACTION);
    expect(externalTransactionInformationService.getDocumentChecklist).not.toHaveBeenCalled();
  });

  it('Seller Agent purpose with link: null still falls back to validation enrichment, not DocuSign — nothing uploaded yet for DocuSign detail to attach to', async () => {
    const { service, sellerAgentDocumentDocusignService, buyerAgentChecklistValidationService } = buildService();
    const result = await service.composeForPurpose('seller_agent_document_upload' as never, null, TRANSACTION as never);
    expect(sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo).not.toHaveBeenCalled();
    expect(buyerAgentChecklistValidationService.enrichChecklistWithValidation).toHaveBeenCalledWith(null, TRANSACTION, BASE_CHECKLIST);
    expect(result).toEqual(VALIDATION_ENRICHED);
  });

  it('Seller Agent purpose with a real link still applies DocuSign enrichment', async () => {
    const { service, sellerAgentDocumentDocusignService } = buildService();
    await service.composeForPurpose('seller_agent_document_upload' as never, SELLER_LINK as never, TRANSACTION as never);
    expect(sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo).toHaveBeenCalledWith(SELLER_LINK, TRANSACTION, BASE_CHECKLIST);
  });
});

describe('ChecklistCompositionService.getSellerAgentStatusSummary — cross-side read for another link (e.g. Buyer Agent)', () => {
  it('resolves the Seller Agent\'s own current active link and returns only allRequiredSubmitted', async () => {
    const { service, uploadLinkRepo, externalTransactionInformationService } = buildService({ sellerAgentLink: SELLER_LINK });
    const result = await service.getSellerAgentStatusSummary(TRANSACTION as never);

    expect(uploadLinkRepo.findMostRecentActiveByPurpose).toHaveBeenCalledWith('tx-1', 'seller_agent_document_upload');
    expect(externalTransactionInformationService.getDocumentChecklist).toHaveBeenCalledWith(SELLER_LINK, TRANSACTION);
    expect(result).toEqual({ allRequiredSubmitted: true });
  });

  it('falls back to the no-link composition when the Seller Agent has no active link yet', async () => {
    const { service, externalTransactionInformationService } = buildService({ sellerAgentLink: null });
    const result = await service.getSellerAgentStatusSummary(TRANSACTION as never);

    expect(externalTransactionInformationService.getDocumentChecklistForPurpose).toHaveBeenCalledWith('seller_agent_document_upload', TRANSACTION);
    expect(result).toEqual({ allRequiredSubmitted: true });
  });

  it('reflects allRequiredSubmitted: false straight through from the composed checklist', async () => {
    const { service, externalTransactionInformationService, sellerAgentDocumentDocusignService } = buildService({ sellerAgentLink: SELLER_LINK });
    const incompleteChecklist = { ...BASE_CHECKLIST, allRequiredSubmitted: false };
    externalTransactionInformationService.getDocumentChecklist.mockResolvedValue(incompleteChecklist);
    sellerAgentDocumentDocusignService.enrichChecklistWithDocusignInfo.mockResolvedValue(incompleteChecklist);

    const result = await service.getSellerAgentStatusSummary(TRANSACTION as never);
    expect(result).toEqual({ allRequiredSubmitted: false });
  });
});
