import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsBoolean, IsEmail } from 'class-validator';
import { PartyRole } from '../entities/transaction-party.entity';

@InputType()
export class CreateTransactionPartyInput {
  @Field()
  @IsUUID()
  transactionId: string;

  @Field(() => PartyRole)
  @IsEnum(PartyRole)
  partyRole: PartyRole;

  @Field()
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
