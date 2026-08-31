import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsDateString } from 'class-validator';
import { JournalType, JournalSource } from '../entities/transaction-journal.entity';

@InputType()
export class CreateTransactionJournalInput {
  @Field()
  @IsUUID()
  transactionId: string;

  @Field(() => JournalType)
  @IsEnum(JournalType)
  journalType: JournalType;

  @Field(() => JournalSource)
  @IsEnum(JournalSource)
  source: JournalSource;

  @Field()
  @IsDateString()
  eventAt: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  body?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  actorAccountId?: string;
}
