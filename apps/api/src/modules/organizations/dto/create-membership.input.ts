import { InputType, Field } from '@nestjs/graphql';
import { IsUUID, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { MemberRole } from '../entities/organization-membership.entity';

@InputType()
export class CreateMembershipInput {
  @Field()
  @IsUUID()
  organizationId: string;

  @Field()
  @IsUUID()
  accountId: string;

  @Field(() => MemberRole)
  @IsEnum(MemberRole)
  role: MemberRole;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
