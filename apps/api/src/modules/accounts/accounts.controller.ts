import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountInput } from './dto/create-account.input';
import { UpdateAccountInput } from './dto/update-account.input';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Get('search')
  findByEmail(@Query('email') email: string) {
    return this.accountsService.findByEmail(email);
  }

  @Get('search-coordinators')
  searchCoordinators(@Query('q') q: string) {
    if (!q || q.length < 2) return [];
    return this.accountsService.searchCoordinators(q);
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string) {
    return this.accountsService.findByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAccountInput) {
    return this.accountsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountInput) {
    return this.accountsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.delete(id);
  }
}
