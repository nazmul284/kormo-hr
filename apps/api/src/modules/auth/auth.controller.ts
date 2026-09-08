import {
  Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CONFIG, type AppConfig } from '../../common/config/configuration';
import { CurrentUser, Public } from '../../common/decorators';
import type { SessionPrincipal } from '../../common/types';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto, LoginDto, RequestPasswordResetDto, ResetPasswordDto,
} from './dto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './guards';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Both tokens travel as httpOnly cookies.
   *
   * `sameSite: lax` is enough because the API is reverse-proxied onto the
   * app's own origin — which also removes the CORS preflight that the
   * reference system paid for on every single request by serving its API
   * from a separate port.
   */
  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const shared = {
      httpOnly: true,
      secure: this.config.cookie.secure,
      sameSite: 'lax' as const,
      path: '/',
      ...(this.config.cookie.domain && this.config.cookie.domain !== 'localhost'
        ? { domain: this.config.cookie.domain }
        : {}),
    };

    res.cookie(ACCESS_COOKIE, accessToken, { ...shared, maxAge: 15 * 60 * 1000 });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...shared,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // The refresh cookie is only ever sent to the refresh/logout routes.
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      res.clearCookie(name, { path: '/' });
    }
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Brute-force protection: ten attempts per minute per IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with username / email / employee ID' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.identifier, dto.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      mustChangePassword: result.mustChangePassword,
      expiresIn: 15 * 60,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate the refresh token and mint a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('You are not signed in.');

    try {
      const result = await this.auth.refresh(token, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
      return { user: result.user, expiresIn: 15 * 60 };
    } catch (error) {
      // A dead refresh token must not leave a stale cookie behind, or the
      // client will loop on it forever.
      this.clearAuthCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the refresh token and clear cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearAuthCookies(res);
    return { loggedOut: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current identity, permissions and tenant feature flags' })
  async me(@CurrentUser() user: SessionPrincipal) {
    return this.auth.buildSessionUser(user);
  }

  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Change your own password' })
  async changePassword(@CurrentUser() user: SessionPrincipal, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password reset link' })
  async forgotPassword(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.identifier);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete a password reset' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }
}
