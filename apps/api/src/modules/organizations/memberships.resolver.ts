import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { MembershipsService } from './memberships.service';
import { OrganizationMembershipEntity } from './entities/organization-membership.entity';
import { CreateMembershipInput } from './dto/create-membership.input';

@Resolver(() => OrganizationMembershipEntity)
export class MembershipsResolver {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Query(() => [OrganizationMembershipEntity], { name: 'organizationMemberships' })
  findAll() {
    return this.membershipsService.findAll();
  }

  @Query(() => [OrganizationMembershipEntity], { name: 'membershipsByOrganization' })
  findByOrganization(@Args('organizationId') organizationId: string) {
    return this.membershipsService.findByOrganization(organizationId);
  }

  @Query(() => [OrganizationMembershipEntity], { name: 'membershipsByAccount' })
  findByAccount(@Args('accountId') accountId: string) {
    return this.membershipsService.findByAccount(accountId);
  }

  @Mutation(() => OrganizationMembershipEntity)
  createMembership(@Args('input') input: CreateMembershipInput) {
    return this.membershipsService.create(input);
  }

  @Mutation(() => Boolean)
  async removeMembership(@Args('id') id: string) {
    await this.membershipsService.remove(id);
    return true;
  }
}
