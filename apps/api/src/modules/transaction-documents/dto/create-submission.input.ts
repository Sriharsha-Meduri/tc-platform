import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID } from 'class-validator';

@InputType()
export class CreateSubmissionInput {
  @Field()
  @IsUUID()
  transactionId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  submittedByPartyId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
