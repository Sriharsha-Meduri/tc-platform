import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('title_contacts')
export class TitleContactEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  contactName: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  companyName: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  email: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  cellPhone: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  addressLine1: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  zipCode: string | null;

  @Field(() => Boolean)
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
