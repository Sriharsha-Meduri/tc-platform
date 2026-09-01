import { InputType, Field, Float } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsNumber } from 'class-validator';
import {
  TransactionType,
  TransactionSide,
  CoordinatorSide,
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

  /**
   * Which side is being coordinated ('BUYER' | 'SELLER'). Optional; omitted or
   * null is treated as BUYER at the application layer (legacy default). A
   * 'SELLER' value is only honored while TRANSACTION_FEATURES.sellerSideEnabled
   * is true.
   */
  @Field(() => CoordinatorSide, { nullable: true })
  @IsOptional()
  @IsEnum(CoordinatorSide)
  transactionSide?: CoordinatorSide;

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
