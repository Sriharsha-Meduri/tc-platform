import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowTemplateTables1745800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Workflow templates ─────────────────────────────────────────────────────
    // org_id = null  → system/platform template (available to all orgs)
    // org_id = set   → org-private custom template (overrides matching system template)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_workflow_templates" (
        "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
        "organizationId"        UUID,
        "name"                  VARCHAR     NOT NULL,
        "stateCode"             VARCHAR,
        "transactionType"       VARCHAR     NOT NULL,
        "side"                  VARCHAR     NOT NULL,
        "version"               INTEGER     NOT NULL DEFAULT 1,
        "isActive"              BOOLEAN     NOT NULL DEFAULT true,
        "isSystem"              BOOLEAN     NOT NULL DEFAULT false,
        "description"           TEXT,
        "createdByAccountId"    UUID,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_workflow_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wf_template_org"
          FOREIGN KEY ("organizationId") REFERENCES "real_estate_organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wf_template_created_by"
          FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_WF_TEMPLATES_ORG"   ON "transaction_workflow_templates" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_WF_TEMPLATES_STATE" ON "transaction_workflow_templates" ("stateCode")`);
    await queryRunner.query(`CREATE INDEX "IDX_WF_TEMPLATES_TYPE"  ON "transaction_workflow_templates" ("transactionType", "side")`);

    // ── Workflow template steps ────────────────────────────────────────────────
    // sort_order uses gaps of 1000 (1000, 2000 …) so steps can be inserted
    // between existing ones without renumbering (e.g. 1500 between 1000 & 2000).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_workflow_template_steps" (
        "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
        "templateId"           UUID        NOT NULL,
        "stepKey"              VARCHAR     NOT NULL,
        "stepName"             VARCHAR     NOT NULL,
        "description"          TEXT,
        "category"             VARCHAR     NOT NULL,
        "responsibleRole"      VARCHAR     NOT NULL,
        "sortOrder"            INTEGER     NOT NULL,
        "isOptional"           BOOLEAN     NOT NULL DEFAULT false,
        "defaultDurationDays"  INTEGER,
        "prerequisiteKeys"     JSONB,
        "metadataJson"         JSONB,
        "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_wf_template_steps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wf_template_step_template"
          FOREIGN KEY ("templateId") REFERENCES "transaction_workflow_templates"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_wf_template_step_key" UNIQUE ("templateId", "stepKey")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_WF_TMPL_STEPS_TEMPLATE" ON "transaction_workflow_template_steps" ("templateId")`);
    await queryRunner.query(`CREATE INDEX "IDX_WF_TMPL_STEPS_ORDER"    ON "transaction_workflow_template_steps" ("templateId", "sortOrder")`);

    // ── Seed system templates ──────────────────────────────────────────────────
    // Templates: CA buyer, CA seller, CA dual, IL buyer, NY buyer, generic buyer fallback.
    // Steps use sort_order gaps of 1000 for future insertability.

    await queryRunner.query(`
      WITH templates AS (
        INSERT INTO "transaction_workflow_templates"
          ("name", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential Purchase – Buyer Side',  'CA', 'purchase', 'buyer_side',  true, true),
          ('California Residential Purchase – Seller Side', 'CA', 'purchase', 'seller_side', true, true),
          ('California Residential Purchase – Dual',        'CA', 'purchase', 'dual',        true, true),
          ('Illinois Residential Purchase – Buyer Side',    'IL', 'purchase', 'buyer_side',  true, true),
          ('New York Residential Purchase – Buyer Side',    'NY', 'purchase', 'buyer_side',  true, true),
          ('Generic Purchase – Buyer Side (Fallback)',      NULL, 'purchase', 'buyer_side',  true, true)
        RETURNING "id", "stateCode", "side"
      )
      INSERT INTO "transaction_workflow_template_steps"
        ("templateId", "stepKey", "stepName", "category", "responsibleRole", "sortOrder", "isOptional", "defaultDurationDays")
      SELECT
        t."id",
        s."stepKey",
        s."stepName",
        s."category",
        s."responsibleRole",
        s."sortOrder",
        s."isOptional",
        s."defaultDurationDays"
      FROM templates t
      CROSS JOIN (VALUES
        ('contract_execution',           'Contract Execution',              'closing',     'buyer_agent',      1000, false, 0),
        ('disclosure_period',            'Seller Disclosures',              'disclosure',  'seller_agent',     2000, false, 7),
        ('escrow_opening',               'Open Escrow',                     'closing',     'escrow_officer',   3000, false, 3),
        ('earnest_money_deposit',        'Earnest Money Deposit',           'financial',   'buyer',            4000, false, 3),
        ('home_inspection',              'Home Inspection',                 'inspection',  'buyer',            5000, false, 10),
        ('pest_inspection',              'Pest Inspection',                 'inspection',  'buyer',            6000, true,  10),
        ('buyer_investigation_period',   'Buyer Investigation Period',      'inspection',  'buyer',            7000, false, 17),
        ('request_for_repair',           'Request for Repair (RRR)',        'inspection',  'buyer_agent',      8000, true,  2),
        ('seller_rrr_response',          'Seller Response to RRR',         'inspection',  'seller_agent',     9000, true,  2),
        ('appraisal_ordered',            'Appraisal Ordered',               'financial',   'loan_officer',    10000, false, 5),
        ('appraisal_contingency_removal','Appraisal Contingency Removal',   'financial',   'buyer_agent',     11000, false, 1),
        ('loan_processing',              'Loan Processing & Approval',      'financial',   'loan_officer',    12000, false, 21),
        ('loan_contingency_removal',     'Loan Contingency Removal',        'financial',   'buyer_agent',     13000, false, 1),
        ('all_contingencies_removed',    'All Contingencies Removed',       'closing',     'buyer_agent',     14000, false, 1),
        ('final_walkthrough',            'Final Walkthrough',               'closing',     'buyer',           15000, false, 1),
        ('signing',                      'Signing Appointment',             'closing',     'escrow_officer',  16000, false, 1),
        ('funding_recording',            'Funding & Recording',             'closing',     'escrow_officer',  17000, false, 1),
        ('post_close',                   'Post-Close Follow-Up',            'post_close',  'buyer_agent',     18000, false, 7)
      ) AS s("stepKey", "stepName", "category", "responsibleRole", "sortOrder", "isOptional", "defaultDurationDays")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_workflow_template_steps" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_workflow_templates" CASCADE`);
  }
}
