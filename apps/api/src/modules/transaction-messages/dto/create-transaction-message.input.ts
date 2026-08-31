import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { MessageChannel, MessageDirection } from '../entities/transaction-message.entity';

@InputType()
export class CreateTransactionMessageInput {
  @Field()
  @IsUUID()
  transactionId: string;

  @Field(() => MessageChannel)
  @IsEnum(MessageChannel)
  channel: MessageChannel;

  @Field(() => MessageDirection)
  @IsEnum(MessageDirection)
  direction: MessageDirection;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  subject?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bodyText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  senderPartyId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  recipientPartyId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  providerName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  providerThreadId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  threadKey?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  sentAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  stage?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  metadataJson?: string;
}
