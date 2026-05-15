import { Body, Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Password login',
    description: 'Exchanges the admin password for a short-lived JWT.',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.password);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Inspect the current session',
    description: 'Returns the user behind the JWT. Rejects API-token callers.',
  })
  async getSession(@Request() req: any) {
    return {
      user: req.user,
      authenticated: true,
    };
  }
}
