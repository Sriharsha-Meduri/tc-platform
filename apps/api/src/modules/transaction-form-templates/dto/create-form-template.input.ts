import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean, Matches } from 'class-validator';

@InputType()
export class CreateFormTemplateInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @Field()
  @IsString()
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  stateCode?: string;

  @Field()
  @IsString()
  transactionType: string;

  @Field()
  @IsString()
  side: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  createdByAccountId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  retiredDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  docusignTemplateId?: string;
}
