import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { SsoService } from './sso.service'
import { ScimService } from './scim.service'
import { SsoAdminController, SsoAuthController } from './sso.controller'
import { ScimAdminController, ScimController } from './scim.controller'
import { SecurityModule } from '../security/security.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [ConfigModule, SecurityModule, forwardRef(() => AuthModule)],
  controllers: [SsoAdminController, SsoAuthController, ScimAdminController, ScimController],
  providers: [SsoService, ScimService],
  exports: [SsoService, ScimService],
})
export class SsoModule {}
