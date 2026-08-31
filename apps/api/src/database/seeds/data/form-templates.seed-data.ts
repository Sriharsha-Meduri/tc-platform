import { DataSource } from 'typeorm';
import { OrganizationEntity } from '../../../modules/organizations/entities/organization.entity';
import { TransactionFormTemplateEntity } from '../../../modules/transaction-form-templates/entities/transaction-form-template.entity';
import { TransactionFormTemplateItemEntity } from '../../../modules/transaction-form-templates/entities/transaction-form-template-item.entity';

const CONTRACT_FORMS = [
  { formCode: 'RPA',  formName: 'Residential Purchase Agreement',          category: 'contract', isRequired: true,  sortOrder: 100 },
  { formCode: 'AD',   formName: 'Addendum',                                category: 'contract', isRequired: false, sortOrder: 200, warningCode: 'WARN_MISSING_AD' },
  { formCode: 'AVID', formName: 'Agent Visual Inspection Disclosure',      category: 'contract', isRequired: false, sortOrder: 300, warningCode: 'WARN_MISSING_AVID' },
  { formCode: 'BIA',  formName: 'Buyer Inspection Advisory',               category: 'contract', isRequired: false, sortOrder: 400, warningCode: 'WARN_MISSING_BIA' },
  { formCode: 'SCO',  formName: 'Seller Counter Offer',                    category: 'contract', isRequired: false, sortOrder: 500 },
  { formCode: 'BCO',  formName: 'Buyer Counter Offer',                     category: 'contract', isRequired: false, sortOrder: 600 },
];

const DISCLOSURES_FORMS = [
  { formCode: 'TDS',  formName: 'Transfer Disclosure Statement',           category: 'disclosure', isRequired: true,  sortOrder: 100 },
  { formCode: 'SPQ',  formName: 'Seller Property Questionnaire',           category: 'disclosure', isRequired: true,  sortOrder: 200 },
  { formCode: 'NHD',  formName: 'Natural Hazard Disclosure',               category: 'disclosure', isRequired: true,  sortOrder: 300 },
  { formCode: 'AVID', formName: 'Agent Visual Inspection Disclosure',      category: 'disclosure', isRequired: false, sortOrder: 400 },
];

export async function seedFormTemplates(
  dataSource: DataSource,
  org: OrganizationEntity,
  createdByAccountId: string,
): Promise<void> {
  const templateRepo = dataSource.getRepository(TransactionFormTemplateEntity);
  const itemRepo = dataSource.getRepository(TransactionFormTemplateItemEntity);

  const existing = await templateRepo.count({ where: { organizationId: org.id } });
  if (existing > 0) {
    console.log(`  [form-templates] Skipped — ${existing} templates already exist for ${org.name}.`);
    return;
  }

  // ── Buyer template ──────────────────────────────────────────────────────────
  const buyerTemplate = await templateRepo.save(
    templateRepo.create({
      organizationId: org.id,
      name: 'Residential CA Buyer',
      description: 'Standard California residential purchase — buyer side',
      stateCode: 'CA',
      transactionType: 'residential',
      side: 'buyer_side',
      isSystem: false,
      isActive: true,
      createdByAccountId,
    }),
  );

  const allBuyerItems = [
    ...CONTRACT_FORMS.map((f) => ({ ...f, stage: 'CONTRACT' })),
    ...DISCLOSURES_FORMS.map((f) => ({ ...f, stage: 'DISCLOSURES' })),
  ];

  await itemRepo.save(
    allBuyerItems.map((item) =>
      itemRepo.create({
        templateId: buyerTemplate.id,
        formCode: item.formCode,
        formName: item.formName,
        category: item.category,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        stage: item.stage,
      }),
    ),
  );

  console.log(`  [form-templates] Seeded "${buyerTemplate.name}" with ${allBuyerItems.length} items.`);

  // ── Seller template ─────────────────────────────────────────────────────────
  const sellerTemplate = await templateRepo.save(
    templateRepo.create({
      organizationId: org.id,
      name: 'Residential CA Seller',
      description: 'Standard California residential purchase — seller side',
      stateCode: 'CA',
      transactionType: 'residential',
      side: 'seller_side',
      isSystem: false,
      isActive: true,
      createdByAccountId,
    }),
  );

  const allSellerItems = [...DISCLOSURES_FORMS.map((f) => ({ ...f, stage: 'DISCLOSURES' }))];

  await itemRepo.save(
    allSellerItems.map((item) =>
      itemRepo.create({
        templateId: sellerTemplate.id,
        formCode: item.formCode,
        formName: item.formName,
        category: item.category,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        stage: item.stage,
      }),
    ),
  );

  console.log(`  [form-templates] Seeded "${sellerTemplate.name}" with ${allSellerItems.length} items.`);
}
