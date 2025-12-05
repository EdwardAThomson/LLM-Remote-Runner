import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export interface AuthSession {
  userId: string;
  username: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.checkAuthConfiguration();
  }

  private checkAuthConfiguration(): void {
    const hash = this.configService.get<string>('app.adminPasswordHash');
    const fs = require('fs');
    const path = require('path');
    const setupScriptPath = path.join(process.cwd(), 'scripts', 'setup-auth.ts');
    const setupScriptExists = fs.existsSync(setupScriptPath);
    
    // Check 1: Password must be configured
    if (!hash || hash.trim() === '') {
      console.error('\n❌ ========================================');
      console.error('❌ AUTHENTICATION NOT CONFIGURED');
      console.error('❌ ========================================');
      console.error('❌ Admin password has not been set.');
      console.error('❌ Please run the setup script:');
      console.error('❌   cd gateway');
      console.error('❌   pnpm tsx scripts/setup-auth.ts');
      console.error('❌');
      console.error('❌   (The script is located at: gateway/scripts/setup-auth.ts)');
      console.error('❌');
      console.error('❌   If the script is missing, download it from:');
      console.error('❌   https://github.com/EdwardAThomson/LLM-Remote-Runner');
      console.error('❌ ========================================\n');
      process.exit(1);
    }
    
    // Check 2: Setup script should be deleted for security
    if (setupScriptExists) {
      console.error('\n⚠️  ========================================');
      console.error('⚠️  SECURITY WARNING');
      console.error('⚠️  ========================================');
      console.error('⚠️  The authentication setup script still exists!');
      console.error('⚠️  This is a security risk as it allows password resets.');
      console.error('⚠️  ');
      console.error('⚠️  Please delete it from the gateway directory:');
      console.error('⚠️    cd gateway && rm scripts/setup-auth.ts');
      console.error('⚠️');
      console.error('⚠️  (Full path: gateway/scripts/setup-auth.ts)');
      console.error('⚠️  ');
      console.error('⚠️  If you need to reset your password in the future,');
      console.error('⚠️  restore it from git history or download from:');
      console.error('⚠️  https://github.com/EdwardAThomson/LLM-Remote-Runner');
      console.error('⚠️  ========================================\n');
      process.exit(1);
    }
    
    console.log('✅ Authentication configured and secure');
  }

  async validatePassword(password: string): Promise<boolean> {
    const hash = this.configService.get<string>('app.adminPasswordHash');
    
    if (!hash) {
      throw new UnauthorizedException(
        'Authentication not configured. Run setup-auth script.',
      );
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      return false;
    }
  }

  async login(password: string): Promise<{ access_token: string }> {
    const isValid = await this.validatePassword(password);
    
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const payload = {
      sub: 'admin',
      username: 'admin',
      type: 'session',
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    return { access_token: token };
  }

  async validateSession(token: string): Promise<AuthSession> {
    try {
      const payload = this.jwtService.verify(token);
      
      if (payload.type !== 'session') {
        throw new UnauthorizedException('Invalid token type');
      }

      return {
        userId: payload.sub,
        username: payload.username,
        expiresAt: payload.exp * 1000,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
