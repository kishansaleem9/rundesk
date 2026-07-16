import { Module } from '@nestjs/common'
import { TenantDatabasesService } from './tenant-databases.service'
import { TenantDatabasesController } from './tenant-databases.controller'
import { AuthModule } from '../auth/auth.module'

/**
 * §14.2 Optional dedicated-database tier. Registry + connection resolver that
 * routes an enterprise org's queries to its own Postgres when configured, else
 * the shared cluster. The service is exported so other modules can consult the
 * resolver (`getDbForOrganization`); per-request routing remains opt-in.
 */
@Module({
  imports: [AuthModule],
  controllers: [TenantDatabasesController],
  providers: [TenantDatabasesService],
  exports: [TenantDatabasesService],
})
export class TenantDatabasesModule {}
