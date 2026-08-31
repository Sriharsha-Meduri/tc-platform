import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionsService } from './transactions.service';
import { MailgunService } from '../auth/mailgun.service';
import { EmailTemplateService } from '../auth/email-template.service';

export interface VoidNotifyDto {
  fromEmail?: string | null;
  toEmail: string;
  subject?: string | null;
}

// Mirrors the shapes stored in transaction_documents.metadata_json
interface ExtractionResult {
  property: { streetAddress?: string | null; city?: string | null; state?: string | null };
  transaction: {
    acceptanceDate?: string | null;
    closingDate?: string | null;
    offerDate?: string | null;
    purchasePrice?: number | null;
    earnestMoneyAmount?: number | null;
  };
  parties: {
    buyerAgents: Array<{ fullName?: string | null }>;
    listingAgents: Array<{ fullName?: string | null }>;
  };
  signatures: { missingSignatures: string[] };
  formsAndDisclosures: Array<{ title: string; formCode?: string | null; status: string }>;
}

interface ComplianceCheck {
  status: string;
  formCode: string;
  label: string;
  detail?: string;
}

interface ComplianceResult {
  checks: ComplianceCheck[];
}

interface DocumentMetadata {
  extraction?: ExtractionResult;
  compliance?: ComplianceResult;
}

@Injectable()
export class VoidNotifyService {
  private readonly logger = new Logger(VoidNotifyService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    private readonly transactionsService: TransactionsService,
    private readonly mailgunService: MailgunService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async voidAndNotify(transactionId: string, dto: VoidNotifyDto): Promise<TransactionEntity> {
    // Void the transaction first
    const transaction = await this.transactionsService.void(transactionId);

    // Load the latest document with extraction metadata
    const doc = await this.documentsRepo.findOne({
      where: { transactionId },
      order: { createdAt: 'DESC' },
    });

    const meta = (doc?.metadataJson ?? {}) as DocumentMetadata;
    const extraction = meta.extraction;
    const compliance = meta.compliance;

    // Build template context
    const address = extraction
      ? [extraction.property.streetAddress, extraction.property.city, extraction.property.state]
          .filter(Boolean).join(', ') || 'Unknown property'
      : [transaction.propertyAddressLine1, transaction.propertyCity, transaction.propertyState]
          .filter(Boolean).join(', ') || 'Unknown property';

    const missingFields = this.buildMissingFields(extraction);
    const complianceFailures = (compliance?.checks ?? [])
      .filter((c) => c.status === 'fail')
      .map((c) => ({ formCode: c.formCode, label: c.label, detail: c.detail ?? null }));
    const missingForms = (extraction?.formsAndDisclosures ?? [])
      .filter((f) => f.status === 'missing')
      .map((f) => ({ title: f.title, formCode: f.formCode ?? null }));

    const hasIssues = missingFields.length > 0 || complianceFailures.length > 0 || missingForms.length > 0;

    const ctx: Record<string, unknown> = {
      address,
      txNumber: transaction.transactionNumber ?? null,
      missingFields,
      complianceFailures,
      missingForms,
      hasIssues,
    };

    const subject = dto.subject?.trim()
      || `Contract voided — ${address}`;

    const fromAddress = dto.fromEmail?.trim()
      ? `TC Platform <${dto.fromEmail.trim()}>`
      : transaction.outboundEmailAddress
        ? `TC Platform <${transaction.outboundEmailAddress}>`
        : undefined;

    try {
      await this.mailgunService.sendEmail(
        dto.toEmail,
        subject,
        this.emailTemplateService.render('contract-voided.html.hbs', ctx),
        this.emailTemplateService.render('contract-voided.text.hbs', ctx),
        fromAddress,
      );
      this.logger.log(`Void notification sent to ${dto.toEmail} for transaction ${transaction.transactionNumber}`);
    } catch (err) {
      this.logger.error(`Failed to send void notification: ${(err as Error).message}`);
      throw err;
    }

    return transaction;
  }

  private buildMissingFields(extraction: ExtractionResult | undefined): string[] {
    if (!extraction) return [];
    const tx = extraction.transaction;
    const fields: string[] = [];
    if (!tx.acceptanceDate)       fields.push('Acceptance date');
    if (!tx.closingDate)          fields.push('Closing / close of escrow date');
    if (!tx.offerDate)            fields.push('Offer date');
    if (tx.purchasePrice == null) fields.push('Purchase price');
    if (tx.earnestMoneyAmount == null) fields.push('Earnest money amount');
    if (extraction.parties.buyerAgents.length === 0)  fields.push('Buyer agent details');
    if (extraction.parties.listingAgents.length === 0) fields.push('Listing agent details');
    if (extraction.signatures.missingSignatures.length > 0)
      fields.push(`Missing signatures: ${extraction.signatures.missingSignatures.join(', ')}`);
    return fields;
  }
}
