import { DataSource } from 'typeorm';
import {
  TransactionEntity,
  TransactionType,
  TransactionSide,
  TransactionStatus,
} from '../../../modules/transactions/entities/transaction.entity';
import {
  TransactionStageInstanceEntity,
  TransactionStage,
  StageInstanceStatus,
} from '../../../modules/transactions/entities/transaction-stage-instance.entity';
import {
  TransactionPartyEntity,
  PartyRole,
} from '../../../modules/transaction-parties/entities/transaction-party.entity';
import {
  TransactionJournalEntity,
  JournalType,
  JournalSource,
} from '../../../modules/transaction-journals/entities/transaction-journal.entity';
import {
  TransactionTaskEntity,
  TaskStatus,
  TaskPriority,
} from '../../../modules/transaction-tasks/entities/transaction-task.entity';
import {
  TransactionMessageEntity,
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../../../modules/transaction-messages/entities/transaction-message.entity';
import { OrganizationEntity } from '../../../modules/organizations/entities/organization.entity';
import { AccountEntity } from '../../../modules/accounts/entities/account.entity';
import { ContactEntity, ContactType } from '../../../modules/contacts/entities/contact.entity';

export async function seedContacts(dataSource: DataSource): Promise<ContactEntity[]> {
  const repo = dataSource.getRepository(ContactEntity);

  const existing = await repo.count();
  if (existing > 0) {
    console.log(`  [contacts] Skipped — ${existing} contacts already exist.`);
    return repo.find();
  }

  const contacts = repo.create([
    {
      contactType: ContactType.PERSON,
      firstName: 'James',
      lastName: 'Buyer',
      email: 'james.buyer@email.com',
      phone: '+15550002001',
    },
    {
      contactType: ContactType.PERSON,
      firstName: 'Linda',
      lastName: 'Buyer',
      email: 'linda.buyer@email.com',
      phone: '+15550002002',
    },
    {
      contactType: ContactType.PERSON,
      firstName: 'Robert',
      lastName: 'Seller',
      email: 'robert.seller@email.com',
      phone: '+15550002003',
    },
  ]);

  const saved = await repo.save(contacts);
  console.log(`  [contacts] Seeded ${saved.length} contacts.`);
  return saved;
}

export async function seedTransactions(
  dataSource: DataSource,
  organization: OrganizationEntity,
  // accounts[0]=Sarah broker, [1]=Alice TC, [2]=Bob TC, [3]=Carol agent, [4]=David agent
  accounts: AccountEntity[],
  // contacts[0]=James buyer, [1]=Linda buyer, [2]=Robert seller
  contacts: ContactEntity[],
): Promise<void> {
  const txRepo           = dataSource.getRepository(TransactionEntity);
  const stageRepo        = dataSource.getRepository(TransactionStageInstanceEntity);
  const partyRepo        = dataSource.getRepository(TransactionPartyEntity);
  const journalRepo      = dataSource.getRepository(TransactionJournalEntity);
  const taskRepo         = dataSource.getRepository(TransactionTaskEntity);

  const existing = await txRepo.count();
  if (existing > 0) {
    console.log(`  [transactions] Skipped — ${existing} transactions already exist.`);
    return;
  }

  // ── Transaction 1: Active purchase under contract ───────────────────────
  const tx1 = await txRepo.save(
    txRepo.create({
      organizationId:               organization.id,
      transactionNumber:            'TXN-2024-0001',
      transactionType:              TransactionType.PURCHASE,
      side:                         TransactionSide.BUYER_SIDE,
      status:                       TransactionStatus.UNDER_CONTRACT,
      propertyAddressLine1:         '456 Maple Street',
      propertyCity:                 'Pasadena',
      propertyState:                'CA',
      propertyPostalCode:           '91101',
      propertyCounty:               'Los Angeles',
      mlsNumber:                    'MLS-2024-56789',
      bedrooms:                     4,
      bathrooms:                    2.5,
      squareFeet:                   2200,
      yearBuilt:                    1998,
      listPrice:                    875000,
      contractPrice:                865000,
      earnestMoneyAmount:           17300,
      commissionAmount:             25950,
      offerAcceptedAt:              new Date('2024-03-01'),
      openEscrowAt:                 new Date('2024-03-03'),
      inspectionDeadlineAt:         new Date('2024-03-15'),
      financeDeadlineAt:            new Date('2024-03-25'),
      appraisalDeadlineAt:          new Date('2024-03-20'),
      closeOfEscrowAt:              new Date('2024-04-01'),
      createdByAccountId:           accounts[3].id,  // Carol (agent)
      assignedCoordinatorAccountId: accounts[1].id,  // Alice (TC)
    }),
  );

  // ── Stage instances for tx1 (CONTRACT + DISCLOSURES completed, INSPECTION active) ─
  await stageRepo.save(stageRepo.create([
    { transactionId: tx1.id, stage: TransactionStage.CONTRACT,    status: StageInstanceStatus.COMPLETED, startedAt: new Date('2024-03-01'), completedAt: new Date('2024-03-03') },
    { transactionId: tx1.id, stage: TransactionStage.DISCLOSURES, status: StageInstanceStatus.COMPLETED, startedAt: new Date('2024-03-03'), completedAt: new Date('2024-03-10') },
    { transactionId: tx1.id, stage: TransactionStage.INSPECTION,  status: StageInstanceStatus.ACTIVE,    startedAt: new Date('2024-03-10') },
  ]));

  // ── Parties for tx1 ───────────────────────────────────────────────────────
  await partyRepo.save(
    partyRepo.create([
      // Buyers
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.BUYER,
        contactId:     contacts[0].id,
        displayName:   `${contacts[0].firstName} ${contacts[0].lastName}`,
        email:         contacts[0].email,
        phone:         contacts[0].phone,
        isPrimary:     true,
      },
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.BUYER,
        contactId:     contacts[1].id,
        displayName:   `${contacts[1].firstName} ${contacts[1].lastName}`,
        email:         contacts[1].email,
        phone:         contacts[1].phone,
        isPrimary:     false,
      },
      // Seller
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.SELLER,
        contactId:     contacts[2].id,
        displayName:   `${contacts[2].firstName} ${contacts[2].lastName}`,
        email:         contacts[2].email,
        phone:         contacts[2].phone,
        isPrimary:     true,
      },
      // Agents
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.BUYER_AGENT,
        displayName:   accounts[3].displayName,    // Carol
        email:         'carol.agent@sunsetrealty.com',
        isPrimary:     true,
      },
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.SELLER_AGENT,
        displayName:   accounts[4].displayName,    // David
        email:         'david.agent@sunsetrealty.com',
        isPrimary:     true,
      },
      // TC
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.BUYER_TRANSACTION_COORDINATOR,
        displayName:   accounts[1].displayName,    // Alice
        email:         'alice.tc@sunsetrealty.com',
        isPrimary:     true,
      },
      // Lender
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.LENDER,
        displayName:   'Mike Chen',
        email:         'mike.chen@fastfunds.com',
        phone:         '+15550003001',
        isPrimary:     true,
      },
      // Inspector
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.INSPECTOR,
        displayName:   'Sarah Park',
        email:         'sarah.park@pacifichomeinspect.com',
        phone:         '+15550003002',
        isPrimary:     true,
      },
      // Escrow officer
      {
        transactionId: tx1.id,
        partyRole:     PartyRole.ESCROW_OFFICER,
        displayName:   'Tom Rivera',
        email:         'tom.rivera@pacifictitle.com',
        phone:         '+15550003003',
        isPrimary:     true,
      },
    ]),
  );

  // ── Journal entries for tx1 ───────────────────────────────────────────────
  await journalRepo.save(
    journalRepo.create([
      {
        transactionId:  tx1.id,
        journalType:    JournalType.STATUS_CHANGE,
        source:         JournalSource.SYSTEM,
        actorAccountId: accounts[3].id,
        title:          'Transaction created',
        body:           'Offer accepted. Transaction entered Active status.',
        eventAt:        new Date('2024-03-01T10:00:00Z'),
      },
      {
        transactionId:  tx1.id,
        journalType:    JournalType.STAGE_CHANGE,
        source:         JournalSource.SYSTEM,
        actorAccountId: accounts[1].id,
        title:          'Stage advanced to Inspection',
        body:           'Escrow opened. Moved to Inspection stage.',
        eventAt:        new Date('2024-03-03T09:00:00Z'),
      },
      {
        transactionId:  tx1.id,
        journalType:    JournalType.NOTE,
        source:         JournalSource.UI,
        actorAccountId: accounts[1].id,
        title:          'Inspection scheduled',
        body:           'Home inspection scheduled for 2024-03-10 at 9 AM with Pacific Home Inspectors.',
        eventAt:        new Date('2024-03-04T14:30:00Z'),
      },
    ]),
  );

  // ── Tasks for tx1 ─────────────────────────────────────────────────────────
  const task1 = await taskRepo.save(
    taskRepo.create({
      transactionId:     tx1.id,
      title:             'Order home inspection',
      status:            TaskStatus.DONE,
      priority:          TaskPriority.HIGH,
      assignedAccountId: accounts[1].id,
      dueAt:             new Date('2024-03-05'),
      completedAt:       new Date('2024-03-04'),
      createdByAccountId: accounts[1].id,
    }),
  );

  await taskRepo.save(
    taskRepo.create([
      {
        transactionId:      tx1.id,
        title:              'Review inspection report & negotiate repairs',
        status:             TaskStatus.IN_PROGRESS,
        priority:           TaskPriority.HIGH,
        assignedAccountId:  accounts[1].id,
        dueAt:              new Date('2024-03-16'),
        dependsOnTaskId:    task1.id,
        createdByAccountId: accounts[1].id,
      },
      {
        transactionId:      tx1.id,
        title:              'Submit loan application documents to lender',
        status:             TaskStatus.TODO,
        priority:           TaskPriority.NORMAL,
        assignedAccountId:  accounts[1].id,
        dueAt:              new Date('2024-03-20'),
        createdByAccountId: accounts[1].id,
      },
      {
        transactionId:      tx1.id,
        title:              'Confirm earnest money deposit received by escrow',
        status:             TaskStatus.DONE,
        priority:           TaskPriority.HIGH,
        assignedAccountId:  accounts[1].id,
        dueAt:              new Date('2024-03-08'),
        completedAt:        new Date('2024-03-06'),
        createdByAccountId: accounts[1].id,
      },
    ]),
  );

  // ── Transaction 2: New listing in intake ─────────────────────────────────
  const tx2 = await txRepo.save(
    txRepo.create({
      organizationId:               organization.id,
      transactionNumber:            'TXN-2024-0002',
      transactionType:              TransactionType.SALE,
      side:                         TransactionSide.SELLER_SIDE,
      status:                       TransactionStatus.ACTIVE,
      propertyAddressLine1:         '789 Oak Drive',
      propertyCity:                 'Glendale',
      propertyState:                'CA',
      propertyPostalCode:           '91205',
      propertyCounty:               'Los Angeles',
      bedrooms:                     3,
      bathrooms:                    2,
      squareFeet:                   1650,
      yearBuilt:                    2005,
      listPrice:                    720000,
      createdByAccountId:           accounts[4].id,  // David (agent)
      assignedCoordinatorAccountId: accounts[2].id,  // Bob (TC)
    }),
  );

  // ── Stage instances for tx2 (INTAKE active) ───────────────────────────────
  await stageRepo.save(stageRepo.create([
    { transactionId: tx2.id, stage: TransactionStage.INTAKE, status: StageInstanceStatus.ACTIVE, startedAt: new Date() },
  ]));

  console.log('  [transactions] Seeded 2 transactions with parties, journals, tasks, and stage instances.');
}

// ── Message seed ──────────────────────────────────────────────────────────────
// Builds a realistic 10-message email thread for TXN-2024-0001 spanning
// inspection negotiation and financing threads.

export async function seedMessages(dataSource: DataSource): Promise<void> {
  const msgRepo = dataSource.getRepository(TransactionMessageEntity);
  const txRepo  = dataSource.getRepository(TransactionEntity);

  const existing = await msgRepo.count();
  if (existing > 0) {
    console.log(`  [messages] Skipped — ${existing} messages already exist.`);
    return;
  }

  const tx = await txRepo.findOne({ where: { transactionNumber: 'TXN-2024-0001' } });
  if (!tx) {
    console.log('  [messages] Skipped — TXN-2024-0001 not found (run transaction seed first).');
    return;
  }

  // ── Thread 1: Inspection findings & repair negotiation ───────────────────
  //   sarah.park → alice.tc → carol.agent → alice.tc → robert.seller
  //   → alice.tc → carol.agent → alice.tc → james.buyer → alice.tc (final — unresponded)
  //
  // ── Thread 2: Loan / financing ───────────────────────────────────────────
  //   mike.chen → alice.tc → mike.chen (resolved)

  const rows = msgRepo.create([
    // ── Thread 1 root: Inspector sends report ─────────────────────────────
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'Inspection Report — 456 Maple Street',
      bodyText:
        'Hi Alice,\n\nCompleted the inspection this morning. Overall the property is in good condition, but I flagged the roof — it shows significant wear and will likely need full replacement within 2-3 years. Estimated cost: $4,200–$4,800.\n\nFull report attached. Let me know if you need anything.\n\nBest,\nSarah Park\nPacific Home Inspections',
      providerName:     'mailgun',
      providerMessageId:'msg-001@mg.pacifichomeinspect.com',
      providerThreadId: null,
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-10T14:00:00Z'),
      metadataJson: {
        from: 'Sarah Park <sarah.park@pacifichomeinspect.com>',
        sender: 'sarah.park@pacifichomeinspect.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-001@mg.pacifichomeinspect.com',
      },
    },

    // TC relays findings to buyer's agent
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.OUTBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Hi Carol,\n\nInspection came back — roof flagged at $4,200-$4,800 to replace. Inspector says 2-3 years before it becomes urgent.\n\nI recommend requesting a credit from the seller. What do James and Linda want to do?\n\nAlice',
      providerName:     'mailgun',
      providerMessageId:'msg-002@mg.sunsetrealty.com',
      providerThreadId: 'msg-001@mg.pacifichomeinspect.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.SENT,
      sentAt:           new Date('2024-03-10T15:30:00Z'),
      receivedAt:       new Date('2024-03-10T15:30:00Z'),
      metadataJson: {
        from: 'Alice TC <alice.tc@sunsetrealty.com>',
        sender: 'alice.tc@sunsetrealty.com',
        recipient: 'carol.agent@sunsetrealty.com',
        messageId: 'msg-002@mg.sunsetrealty.com',
      },
    },

    // Buyer's agent responds with repair demand
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Alice,\n\nI spoke with James and Linda. They want to request a $4,500 repair credit — rounded up a bit to cover their inconvenience. They are firm on this.\n\nPlease forward to the listing agent and let me know.\n\nCarol',
      providerName:     'mailgun',
      providerMessageId:'msg-003@mg.sunsetrealty.com',
      providerThreadId: 'msg-002@mg.sunsetrealty.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-10T17:00:00Z'),
      metadataJson: {
        from: 'Carol Agent <carol.agent@sunsetrealty.com>',
        sender: 'carol.agent@sunsetrealty.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-003@mg.sunsetrealty.com',
      },
    },

    // TC forwards demand to seller
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.OUTBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Hi Robert,\n\nFollowing up on the inspection. The buyers are requesting a $4,500 repair credit to address the roof finding. Please let me know your position by end of day Thursday.\n\nThank you,\nAlice',
      providerName:     'mailgun',
      providerMessageId:'msg-004@mg.sunsetrealty.com',
      providerThreadId: 'msg-003@mg.sunsetrealty.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.SENT,
      sentAt:           new Date('2024-03-11T09:00:00Z'),
      receivedAt:       new Date('2024-03-11T09:00:00Z'),
      metadataJson: {
        from: 'Alice TC <alice.tc@sunsetrealty.com>',
        sender: 'alice.tc@sunsetrealty.com',
        recipient: 'robert.seller@email.com',
        messageId: 'msg-004@mg.sunsetrealty.com',
      },
    },

    // ── Thread 2 root: Lender sends conditional approval ─────────────────
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'Conditional Loan Approval — Henderson Purchase',
      bodyText:
        'Alice,\n\nPlease be advised that we have issued a conditional approval for James and Linda Henderson.\n\nOutstanding conditions:\n1. Updated purchase agreement reflecting final sales price\n2. Signed repair addendum (if applicable)\n3. HOA cert (if applicable)\n\nPlease send the updated purchase agreement at your earliest convenience.\n\nMike Chen\nFast Funds Lending',
      providerName:     'mailgun',
      providerMessageId:'msg-005@mg.fastfunds.com',
      providerThreadId: null,
      threadKey:        'msg-005@mg.fastfunds.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-11T10:00:00Z'),
      metadataJson: {
        from: 'Mike Chen <mike.chen@fastfunds.com>',
        sender: 'mike.chen@fastfunds.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-005@mg.fastfunds.com',
      },
    },

    // TC sends updated purchase agreement to lender
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.OUTBOUND,
      subject:          'RE: Conditional Loan Approval — Henderson Purchase',
      bodyText:
        'Hi Mike,\n\nAttaching the updated purchase agreement at $865,000. We are currently in repair credit negotiation — I will send the addendum as soon as it is signed.\n\nPlease confirm receipt.\n\nAlice',
      providerName:     'mailgun',
      providerMessageId:'msg-006@mg.sunsetrealty.com',
      providerThreadId: 'msg-005@mg.fastfunds.com',
      threadKey:        'msg-005@mg.fastfunds.com',
      status:           MessageStatus.SENT,
      sentAt:           new Date('2024-03-11T11:30:00Z'),
      receivedAt:       new Date('2024-03-11T11:30:00Z'),
      metadataJson: {
        from: 'Alice TC <alice.tc@sunsetrealty.com>',
        sender: 'alice.tc@sunsetrealty.com',
        recipient: 'mike.chen@fastfunds.com',
        messageId: 'msg-006@mg.sunsetrealty.com',
      },
    },

    // Lender confirms receipt, notes appraisal
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'RE: Conditional Loan Approval — Henderson Purchase',
      bodyText:
        'Received, thank you. Appraisal is scheduled for March 22nd between 10 AM – 12 PM. Please ensure property access.\n\nMike',
      providerName:     'mailgun',
      providerMessageId:'msg-007@mg.fastfunds.com',
      providerThreadId: 'msg-006@mg.sunsetrealty.com',
      threadKey:        'msg-005@mg.fastfunds.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-11T13:00:00Z'),
      metadataJson: {
        from: 'Mike Chen <mike.chen@fastfunds.com>',
        sender: 'mike.chen@fastfunds.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-007@mg.fastfunds.com',
      },
    },

    // Seller counters on repair (continuing thread 1)
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Alice,\n\nWe reviewed the inspection report with our agent. The roof is functional — we are not obligated to replace it. We will offer a $3,000 closing credit as a good-faith gesture. That is our final offer.\n\nRobert Seller',
      providerName:     'mailgun',
      providerMessageId:'msg-008@mg.gmail.com',
      providerThreadId: 'msg-004@mg.sunsetrealty.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-12T09:15:00Z'),
      metadataJson: {
        from: 'Robert Seller <robert.seller@email.com>',
        sender: 'robert.seller@email.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-008@mg.gmail.com',
      },
    },

    // TC relays seller's counter to buyer agent
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.OUTBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Hi Carol,\n\nSeller is countering with $3,000 closing credit — says it is their final offer. Need buyer decision by end of day today so we can keep the inspection period on track.\n\nAlice',
      providerName:     'mailgun',
      providerMessageId:'msg-009@mg.sunsetrealty.com',
      providerThreadId: 'msg-008@mg.gmail.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.SENT,
      sentAt:           new Date('2024-03-12T10:00:00Z'),
      receivedAt:       new Date('2024-03-12T10:00:00Z'),
      metadataJson: {
        from: 'Alice TC <alice.tc@sunsetrealty.com>',
        sender: 'alice.tc@sunsetrealty.com',
        recipient: 'carol.agent@sunsetrealty.com',
        messageId: 'msg-009@mg.sunsetrealty.com',
      },
    },

    // Buyer accepts (ball now in TC's court — unresponded)
    {
      transactionId:    tx.id,
      channel:          MessageChannel.EMAIL,
      direction:        MessageDirection.INBOUND,
      subject:          'RE: Inspection Report — 456 Maple Street',
      bodyText:
        'Alice,\n\nWe discussed it and we will accept the $3,000 credit. Please prepare the repair addendum and send to us for signatures.\n\nThanks,\nJames',
      providerName:     'mailgun',
      providerMessageId:'msg-010@mg.gmail.com',
      providerThreadId: 'msg-009@mg.sunsetrealty.com',
      threadKey:        'msg-001@mg.pacifichomeinspect.com',
      status:           MessageStatus.RECEIVED,
      receivedAt:       new Date('2024-03-12T14:30:00Z'),
      metadataJson: {
        from: 'James Buyer <james.buyer@email.com>',
        sender: 'james.buyer@email.com',
        recipient: `txn-${tx.id}@mg.yourdomain.com`,
        messageId: 'msg-010@mg.gmail.com',
      },
    },
  ]);

  await msgRepo.save(rows);
  console.log(`  [messages] Seeded ${rows.length} messages across 2 email threads for TXN-2024-0001.`);
}
