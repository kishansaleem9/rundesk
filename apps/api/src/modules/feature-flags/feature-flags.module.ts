import { Module, Global } from '@nestjs/common'
import { FeatureFlagsService } from './feature-flags.service'
import { FeatureFlagsController } from './feature-flags.controller'
import { SecurityModule } from '../security/security.module'

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
