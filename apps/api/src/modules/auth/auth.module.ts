import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Global so every other module can guard its routes without re-importing
 * the token/session plumbing.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, SessionService],
  exports: [AuthService, TokenService, SessionService],
})
export class AuthModule {}
