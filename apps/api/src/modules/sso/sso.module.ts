import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { SsoService } from './sso.service'
import { ScimService } from './scim.service'
import { SsoAdminController, SsoAuthController } from './sso.controller'
import { ScimAdminController, ScimController } from './scim.controller'
import { SecurityModule } from '../security/security.module'
import { AuthModule } from '../auth/auth.module'
import { WorkspaceGroupsModule } from '../workspace-groups/workspace-groups.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'

@Module({
  imports: [ConfigModule, SecurityModule, forwardRef(() => AuthModule), WorkspaceGroupsModule, CustomRolesModule],
  controllers: [SsoAdminController, SsoAuthController, ScimAdminController, ScimController],
  // RateLimitGuard for the sign-in routes (`found-30-sep/register-unthrottled`).
  providers: [SsoService, ScimService, RateLimitGuard],
  exports: [SsoService, ScimService],
})
export class SsoModule {}
