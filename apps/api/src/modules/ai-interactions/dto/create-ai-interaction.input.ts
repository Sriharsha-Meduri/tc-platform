import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsNotEmpty, IsUUID, IsNumber, IsInt } from 'class-validator';
import { AiInteractionStatus } from '../entities/ai-interaction.entity';

@InputType()
export class CreateAiInteractionInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  modelName: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  feature: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  promptText: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  responseText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  actorAccountId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  promptTokens?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  completionTokens?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  costUsd?: number;

  @Field(() => AiInteractionStatus, { nullable: true })
  @IsOptional()
  @IsEnum(AiInteractionStatus)
  status?: AiInteractionStatus;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  // Structured parsed result stored as JSONB — returned as a JS object on retrieval (no JSON.parse needed)
  metadataJson?: Record<string, unknown>;
}
