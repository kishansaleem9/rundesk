import { Global, Module } from '@nestjs/common'
import { R2Service } from './r2.service'
import { PublicImagesController } from './public-images.controller'
import { RateLimitGuard } from '../guards/rate-limit.guard'

@Global()
@Module({
  controllers: [PublicImagesController],
  providers: [R2Service, RateLimitGuard],
  exports: [R2Service],
})
export class StorageModule {}

