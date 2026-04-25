import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getDb } from '@rundesk/db'

export const DB_TOKEN = 'DRIZZLE_DB'

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => getDb(config.getOrThrow('DATABASE_URL')),
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
