import { InputType, Field, Float } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import {
  TransactionType,
  TransactionSide,
  TransactionStatus,
} from '../entities/transaction.entity';

@InputType()
export class UpdateTransactionInput {
  @Field(() => TransactionType, { nullable: true })
  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @Field(() => TransactionSide, { nullable: true })
  @IsOptional()
  @IsEnum(TransactionSide)
  side?: TransactionSide;

  @Field(() => TransactionStatus, { nullable: true })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyAddressLine1?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyAddressLine2?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyCity?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyState?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyPostalCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  mlsNumber?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  listPrice?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  contractPrice?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  earnestMoneyAmount?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  commissionAmount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  offerAcceptedAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  openEscrowAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  inspectionDeadlineAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  financeDeadlineAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  appraisalDeadlineAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  closeOfEscrowAt?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  assignedCoordinatorAccountId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  buyerAgentAccountId?: string | null;
}
