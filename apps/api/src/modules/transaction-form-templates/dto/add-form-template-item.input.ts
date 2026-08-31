import { InputType, Field, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

@InputType()
export class AddFormTemplateItemInput {
  @Field()
  @IsString()
  formCode: string;

  @Field()
  @IsString()
  formName: string;

  @Field()
  @IsString()
  category: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  stage?: string;
}
