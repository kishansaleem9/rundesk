import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { SecurityModule } from '../security/security.module'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'

@Module({
  // SecurityModule for the workspace's password policy, and RateLimitGuard for
  // the password change's ten a minute (`found-30-sep/password-change-unthrottled`).
  imports: [SecurityModule],
  providers: [UsersService, RateLimitGuard],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
