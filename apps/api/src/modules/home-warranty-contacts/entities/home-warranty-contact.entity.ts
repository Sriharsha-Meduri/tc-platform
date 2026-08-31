import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('home_warranty_contacts')
export class HomeWarrantyContactEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String)
  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  contactName: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Field(() => String)
  @Column({ type: 'varchar' })
  companyName: string;

  @Field(() => String)
  @Column({ type: 'varchar' })
  email: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  officePhone: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  orderingPortalUrl: string | null;

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
