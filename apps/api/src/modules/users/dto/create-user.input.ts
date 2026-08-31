import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';

@InputType()
export class CreateUserInput {
  @Field()
  @IsEmail()
  email: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  password: string;
}
