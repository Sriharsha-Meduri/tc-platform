import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsDateString } from 'class-validator';
import { DocumentStatus } from '../entities/transaction-document.entity';

@InputType()
export class CreateTransactionDocumentInput {
  @Field()
  @IsUUID()
  transactionId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  documentType: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  fileName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  storageUrl?: string;

  @Field(() => DocumentStatus)
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  requestedFromPartyId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  uploadedByAccountId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  submissionId?: string;
}
