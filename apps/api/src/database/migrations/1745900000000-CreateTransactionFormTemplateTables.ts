import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionFormTemplateTables1745900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Form checklist templates ───────────────────────────────────────────────
    // organizationId = null  → system/platform template (available to all orgs)
    // organizationId = set   → org-private custom template
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_form_templates" (
        "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
        "organizationId"     UUID,
        "name"               VARCHAR     NOT NULL,
        "description"        TEXT,
        "stateCode"          VARCHAR,
        "transactionType"    VARCHAR     NOT NULL,
        "side"               VARCHAR     NOT NULL,
        "isSystem"           BOOLEAN     NOT NULL DEFAULT false,
        "isActive"           BOOLEAN     NOT NULL DEFAULT true,
        "createdByAccountId" UUID,
        "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_transaction_form_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_form_template_org"
          FOREIGN KEY ("organizationId") REFERENCES "real_estate_organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_form_template_created_by"
          FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_FORM_TMPL_ORG"   ON "transaction_form_templates" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_FORM_TMPL_STATE" ON "transaction_form_templates" ("stateCode")`);
    await queryRunner.query(`CREATE INDEX "IDX_FORM_TMPL_TYPE"  ON "transaction_form_templates" ("transactionType", "side")`);

    // ── Form checklist template items ─────────────────────────────────────────
    // Each item is a CAR form code (or custom form) included in the template.
    // sortOrder uses gaps of 100 for insertability.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_form_template_items" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "templateId"  UUID        NOT NULL,
        "formCode"    VARCHAR     NOT NULL,
        "formName"    VARCHAR     NOT NULL,
        "category"    VARCHAR     NOT NULL,
        "isRequired"  BOOLEAN     NOT NULL DEFAULT true,
        "sortOrder"   INTEGER     NOT NULL DEFAULT 100,
        "notes"       TEXT,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_transaction_form_template_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_form_item_template"
          FOREIGN KEY ("templateId") REFERENCES "transaction_form_templates"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_form_item_template_code" UNIQUE ("templateId", "formCode")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_FORM_ITEMS_TEMPLATE" ON "transaction_form_template_items" ("templateId")`);
    await queryRunner.query(`CREATE INDEX "IDX_FORM_ITEMS_ORDER"    ON "transaction_form_template_items" ("templateId", "sortOrder")`);

    // ── Seed system form templates (DEFAULT_FORM_PACKAGES) ────────────────────
    // CA Residential Buyer Standard
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential – Buyer Standard',
           'Standard form package for California residential purchase transactions, buyer side.',
           'CA', 'residential', 'buyer_side', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RPA',    'Residential Purchase Agreement',                   'purchase_agreement',        true,  100),
        ('ABR',    'All Cash Offer Addendum',                          'addendum',                  false, 200),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 300),
        ('CR-B',   'Buyer Contingency Removal',                        'contingency_performance',   true,  400),
        ('RRRR',   'Request for Repairs',                              'inspection_repair',          false, 500),
        ('NBP',    'Notice to Buyer to Perform',                       'contingency_performance',   false, 600),
        ('PEAD-B', 'Pandemic Disclosure and Addendum (Buyer)',         'disclosure',                true,  700),
        ('AD',     'Addendum',                                         'addendum',                  false, 800),
        ('AR',     'Arbitration Agreement',                            'addendum',                  false, 900),
        ('SIP',    'Seller in Possession Addendum',                    'addendum',                  false, 1000),
        ('EAN',    'Estimated Buyer Costs',                            'finance',                   false, 1100),
        ('FVA',    'FHA/VA Financing Addendum',                        'finance',                   false, 1200),
        ('LOAN',   'Loan Assumption Addendum',                         'finance',                   false, 1300),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  1400),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  1500),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  1600),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  1700),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  1800)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Residential Seller Standard
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential – Seller Standard',
           'Standard form package for California residential purchase transactions, seller side.',
           'CA', 'residential', 'seller_side', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RPA',    'Residential Purchase Agreement',                   'purchase_agreement',        true,  100),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 200),
        ('SCO',    'Seller Counter Offer',                             'counter_offer',              false, 300),
        ('NSP',    'Notice to Seller to Perform',                      'contingency_performance',   false, 400),
        ('PEAD-S', 'Pandemic Disclosure and Addendum (Seller)',        'disclosure',                true,  500),
        ('AD',     'Addendum',                                         'addendum',                  false, 600),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  700),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  800),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  900),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  1000),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  1100),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  1200),
        ('RLA',    'Residential Listing Agreement',                    'listing_agreement',          true,  1300),
        ('SELM',   'Seller Estimated Net Proceeds',                    'finance',                   false, 1400),
        ('FLD',    'Flipping Disclosure',                              'disclosure',                false, 1500),
        ('VLPA',   'Vacant Land Purchase Agreement (if applicable)',   'purchase_agreement',        false, 1600),
        ('SSD',    'Smoke and CO Detector Statement of Compliance',    'federal_compliance',         true,  1700),
        ('CBRE',   'Combined Hazards Book Receipt',                    'federal_compliance',         false, 1800),
        ('WPA',    'Wood-Destroying Pest Addendum',                    'inspection_repair',          false, 1900)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Residential Dual Agency
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential – Dual Agency',
           'Form package for California residential transactions where one agent/brokerage represents both buyer and seller.',
           'CA', 'residential', 'dual', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RPA',    'Residential Purchase Agreement',                   'purchase_agreement',        true,  100),
        ('DA',     'Dual Agency Disclosure',                           'disclosure',                true,  200),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 300),
        ('SCO',    'Seller Counter Offer',                             'counter_offer',              false, 400),
        ('CR-B',   'Buyer Contingency Removal',                        'contingency_performance',   true,  500),
        ('NSP',    'Notice to Seller to Perform',                      'contingency_performance',   false, 600),
        ('NBP',    'Notice to Buyer to Perform',                       'contingency_performance',   false, 700),
        ('RRRR',   'Request for Repairs',                              'inspection_repair',          false, 800),
        ('PEAD-B', 'Pandemic Disclosure and Addendum (Buyer)',         'disclosure',                true,  900),
        ('PEAD-S', 'Pandemic Disclosure and Addendum (Seller)',        'disclosure',                true,  1000),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  1100),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  1200),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  1300),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  1400),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  1500),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  1600),
        ('RLA',    'Residential Listing Agreement',                    'listing_agreement',          true,  1700),
        ('AD',     'Addendum',                                         'addendum',                  false, 1800),
        ('AR',     'Arbitration Agreement',                            'addendum',                  false, 1900),
        ('EAN',    'Estimated Buyer Costs',                            'finance',                   false, 2000),
        ('SELM',   'Seller Estimated Net Proceeds',                    'finance',                   false, 2100),
        ('WPA',    'Wood-Destroying Pest Addendum',                    'inspection_repair',          false, 2200),
        ('SSD',    'Smoke and CO Detector Statement of Compliance',    'federal_compliance',         true,  2300),
        ('CBRE',   'Combined Hazards Book Receipt',                    'federal_compliance',         false, 2400),
        ('FLD',    'Flipping Disclosure',                              'disclosure',                false, 2500),
        ('SIP',    'Seller in Possession Addendum',                    'addendum',                  false, 2600)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Residential Listing
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential – Listing Package',
           'Standard form package for California residential listing engagements.',
           'CA', 'residential', 'listing', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RLA',    'Residential Listing Agreement',                    'listing_agreement',         true,  100),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  200),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  300),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  400),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  500),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  600),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  700),
        ('LA',     'Listing Agreement Addendum',                       'addendum',                  false, 800),
        ('SELM',   'Seller Estimated Net Proceeds',                    'finance',                   false, 900),
        ('MLAN',   'Multiple Listing Agreement Addendum',              'addendum',                  false, 1000),
        ('PRBS',   'Possible Representation of More than One Buyer',   'disclosure',                false, 1100),
        ('DA',     'Dual Agency Disclosure',                           'disclosure',                false, 1200),
        ('FLD',    'Flipping Disclosure',                              'disclosure',                false, 1300),
        ('SSD',    'Smoke and CO Detector Statement of Compliance',    'federal_compliance',         true,  1400),
        ('CBRE',   'Combined Hazards Book Receipt',                    'federal_compliance',         false, 1500)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Residential Buyer – FHA/VA
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Residential – Buyer FHA/VA',
           'Form package for California residential purchase transactions with FHA or VA financing.',
           'CA', 'residential', 'buyer_side', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RPA',    'Residential Purchase Agreement',                   'purchase_agreement',        true,  100),
        ('FVA',    'FHA/VA Financing Addendum',                        'finance',                   true,  200),
        ('CR-B',   'Buyer Contingency Removal',                        'contingency_performance',   true,  300),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 400),
        ('RRRR',   'Request for Repairs',                              'inspection_repair',          false, 500),
        ('NBP',    'Notice to Buyer to Perform',                       'contingency_performance',   false, 600),
        ('PEAD-B', 'Pandemic Disclosure and Addendum (Buyer)',         'disclosure',                true,  700),
        ('AD',     'Addendum',                                         'addendum',                  false, 800),
        ('AR',     'Arbitration Agreement',                            'addendum',                  false, 900),
        ('EAN',    'Estimated Buyer Costs',                            'finance',                   false, 1000),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  1100),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  1200),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  1300),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  1400),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  1500),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  1600),
        ('LBP',    'Federal Lead-Based Paint Disclosure',              'federal_compliance',         true,  1700),
        ('WPA',    'Wood-Destroying Pest Addendum',                    'inspection_repair',          false, 1800),
        ('SSD',    'Smoke and CO Detector Statement of Compliance',    'federal_compliance',         true,  1900),
        ('CBRE',   'Combined Hazards Book Receipt',                    'federal_compliance',         false, 2000)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Income Property Buyer
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Income Property – Buyer Standard',
           'Form package for California income/investment property purchases, buyer side.',
           'CA', 'income_property', 'buyer_side', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('RIPA',   'Residential Income Property Purchase Agreement',   'purchase_agreement',        true,  100),
        ('CR-B',   'Buyer Contingency Removal',                        'contingency_performance',   true,  200),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 300),
        ('RRRR',   'Request for Repairs',                              'inspection_repair',          false, 400),
        ('NBP',    'Notice to Buyer to Perform',                       'contingency_performance',   false, 500),
        ('AD',     'Addendum',                                         'addendum',                  false, 600),
        ('RLOA',   'Rent and Lease Addendum',                          'lease_rental',               true,  700),
        ('TDS',    'Transfer Disclosure Statement',                    'disclosure',                true,  800),
        ('SPQ',    'Seller Property Questionnaire',                    'disclosure',                true,  900),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  1000),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  1100),
        ('WHSD',   'Water Heater & Smoke Detector Statement',          'federal_compliance',         true,  1200),
        ('EAN',    'Estimated Buyer Costs',                            'finance',                   false, 1300),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  1400),
        ('WPA',    'Wood-Destroying Pest Addendum',                    'inspection_repair',          false, 1500),
        ('SSD',    'Smoke and CO Detector Statement of Compliance',    'federal_compliance',         true,  1600)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);

    // CA Land/Vacant Lot Buyer
    await queryRunner.query(`
      WITH t AS (
        INSERT INTO "transaction_form_templates"
          ("name", "description", "stateCode", "transactionType", "side", "isSystem", "isActive")
        VALUES
          ('California Land / Vacant Lot – Buyer Standard',
           'Form package for California vacant land and lot purchase transactions, buyer side.',
           'CA', 'land', 'buyer_side', true, true)
        RETURNING "id"
      )
      INSERT INTO "transaction_form_template_items"
        ("templateId", "formCode", "formName", "category", "isRequired", "sortOrder")
      SELECT t."id", s."formCode", s."formName", s."category", s."isRequired", s."sortOrder"
      FROM t
      CROSS JOIN (VALUES
        ('VLPA',   'Vacant Land Purchase Agreement',                   'purchase_agreement',        true,  100),
        ('CR-B',   'Buyer Contingency Removal',                        'contingency_performance',   true,  200),
        ('COP',    'Counter Offer',                                    'counter_offer',              false, 300),
        ('NBP',    'Notice to Buyer to Perform',                       'contingency_performance',   false, 400),
        ('AD',     'Addendum',                                         'addendum',                  false, 500),
        ('NHD',    'Natural Hazard Disclosure',                        'disclosure',                true,  600),
        ('SBSA',   'Statewide Buyer & Seller Advisory',                'advisory',                  true,  700),
        ('EAN',    'Estimated Buyer Costs',                            'finance',                   false, 800),
        ('LBP',    'Federal Lead-Based Paint Disclosure',              'federal_compliance',         false, 900),
        ('AVID',   'Agent Visual Inspection Disclosure',               'disclosure',                true,  1000)
      ) AS s("formCode", "formName", "category", "isRequired", "sortOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_form_template_items" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_form_templates" CASCADE`);
  }
}
