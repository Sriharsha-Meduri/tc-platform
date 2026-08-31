import { Body, Controller, Get, Post, Query, Request, BadRequestException } from '@nestjs/common';
import { AuthService, RegisterInput, RegisterBrokerInput, RegisterAgentInput, RegisterCoordinatorInput, RegisterWithInviteInput } from './auth.service';
import { Public } from './decorators/public.decorator';
import type { ChangePasswordInput } from './dto/change-password.input';
import { MemberRole } from '../organizations/entities/organization-membership.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterInput) {
    return this.authService.register(body);
  }

  @Public()
  @Post('register-broker')
  registerBroker(@Body() body: RegisterBrokerInput) {
    return this.authService.registerBroker(body);
  }

  @Public()
  @Post('register-agent')
  registerAgent(@Body() body: RegisterAgentInput) {
    return this.authService.registerAgent(body);
  }

  @Public()
  @Post('register-coordinator')
  registerCoordinator(@Body() body: RegisterCoordinatorInput) {
    return this.authService.registerCoordinator(body);
  }

  @Public()
  @Post('register-with-invite')
  registerWithInvite(@Body() body: RegisterWithInviteInput) {
    return this.authService.registerWithInvite(body);
  }

  @Public()
  @Get('invite-info')
  getInviteInfo(@Query('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  @Public()
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  getMe(@Request() req: { user: { userId: string } }) {
    return this.authService.getMe(req.user.userId);
  }

  @Post('join-brokerage')
  joinBrokerage(
    @Request() req: { user: { userId: string } },
    @Body() body: { organizationId: string },
  ) {
    return this.authService.joinBrokerage(req.user.userId, body.organizationId);
  }

  @Post('invite-member')
  inviteMember(
    @Request() req: { user: { userId: string } },
    @Body() body: { email: string; role: MemberRole; organizationId: string },
  ) {
    return this.authService.inviteMember(req.user.userId, body.email, body.role, body.organizationId);
  }

  @Post('change-password')
  async changePassword(
    @Request() req: { user: { userId: string } },
    @Body() body: ChangePasswordInput,
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    if (body.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    await this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
    return { message: 'Password changed successfully' };
  }
}
