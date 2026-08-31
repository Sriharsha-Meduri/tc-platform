import { IsIn } from 'class-validator';

export class CreateTestRunDto {
  @IsIn(['mock', 'real'])
  mode!: 'mock' | 'real';
}
