import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { TransactionDocumentsService } from './transaction-documents.service';
import { TransactionDocumentEntity, DocumentStatus } from './entities/transaction-document.entity';
import { CreateTransactionDocumentInput } from './dto/create-transaction-document.input';
import { UpdateDocumentInput } from './dto/update-document.input';

@Resolver(() => TransactionDocumentEntity)
export class TransactionDocumentsResolver {
  constructor(private readonly transactionDocumentsService: TransactionDocumentsService) {}

  @Query(() => [TransactionDocumentEntity], { name: 'documentsByTransaction' })
  findByTransaction(@Args('transactionId') transactionId: string) {
    return this.transactionDocumentsService.findByTransaction(transactionId);
  }

  @Query(() => TransactionDocumentEntity, { name: 'transactionDocument' })
  findOne(@Args('id') id: string) {
    return this.transactionDocumentsService.findOne(id);
  }

  @Mutation(() => TransactionDocumentEntity)
  createDocument(@Args('input') input: CreateTransactionDocumentInput) {
    return this.transactionDocumentsService.create(input);
  }

  @Mutation(() => TransactionDocumentEntity)
  updateDocument(@Args('id') id: string, @Args('input') input: UpdateDocumentInput) {
    return this.transactionDocumentsService.update(id, input);
  }

  @Mutation(() => TransactionDocumentEntity)
  updateDocumentStatus(
    @Args('id') id: string,
    @Args('status', { type: () => DocumentStatus }) status: DocumentStatus,
  ) {
    return this.transactionDocumentsService.updateStatus(id, status);
  }
}
