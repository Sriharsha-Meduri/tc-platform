import { InputType, Field } from '@nestjs/graphql';
import { IsEnum } from 'class-validator';
import { MessageStatus } from '../entities/transaction-message.entity';

@InputType()
export class UpdateMessageStatusInput {
  @Field(() => MessageStatus)
  @IsEnum(MessageStatus)
  status: MessageStatus;
}
