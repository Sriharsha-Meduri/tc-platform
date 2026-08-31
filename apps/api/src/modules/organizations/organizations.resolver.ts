import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { OrganizationsService } from './organizations.service';
import { OrganizationEntity } from './entities/organization.entity';
import { CreateOrganizationInput } from './dto/create-organization.input';
import { UpdateOrganizationInput } from './dto/update-organization.input';

@Resolver(() => OrganizationEntity)
export class OrganizationsResolver {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Query(() => [OrganizationEntity], { name: 'organizations' })
  findAll() {
    return this.organizationsService.findAll();
  }

  @Query(() => OrganizationEntity, { name: 'organization' })
  findOne(@Args('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Mutation(() => OrganizationEntity)
  createOrganization(@Args('input') input: CreateOrganizationInput) {
    return this.organizationsService.create(input);
  }

  @Mutation(() => OrganizationEntity)
  updateOrganization(@Args('id') id: string, @Args('input') input: UpdateOrganizationInput) {
    return this.organizationsService.update(id, input);
  }

  @Mutation(() => Boolean)
  async removeOrganization(@Args('id') id: string) {
    await this.organizationsService.remove(id);
    return true;
  }
}
