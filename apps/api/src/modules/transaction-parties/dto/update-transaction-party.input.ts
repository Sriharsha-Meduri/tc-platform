import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsUUID, IsBoolean, IsEmail } from 'class-validator';
import { PartyRole } from '../entities/transaction-party.entity';

@InputType()
export class UpdateTransactionPartyInput {
  @Field(() => PartyRole, { nullable: true })
  @IsOptional()
  @IsEnum(PartyRole)
  partyRole?: PartyRole;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string;

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
