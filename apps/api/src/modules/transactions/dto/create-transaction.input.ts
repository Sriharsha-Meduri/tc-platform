import { InputType, Field, Float } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsNumber } from 'class-validator';
import {
  TransactionType,
  TransactionSide,
} from '../entities/transaction.entity';

@InputType()
export class CreateTransactionInput {
  @Field()
  @IsUUID()
  organizationId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  transactionNumber: string;

  @Field(() => TransactionType)
  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @Field(() => TransactionSide)
  @IsEnum(TransactionSide)
  side: TransactionSide;

  @Field()
  @IsString()
  @IsNotEmpty()
  propertyAddressLine1: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  propertyCity: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  propertyState: string;

  @Field()
  @IsUUID()
  createdByAccountId: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  listPrice?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  contractPrice?: number;
}
