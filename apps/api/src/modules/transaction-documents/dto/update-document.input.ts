import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { DocumentStatus } from '../entities/transaction-document.entity';

@InputType()
export class UpdateDocumentInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  documentType?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

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

  @Field(() => DocumentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

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
}
