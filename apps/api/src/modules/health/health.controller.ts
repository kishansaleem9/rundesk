import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { sql } from 'drizzle-orm'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now()

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe — returns 200 if the process is up' })
  live() {
    return {
      status: 'ok',
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
    }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — fails if critical dependencies are unreachable' })
  async ready() {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

    const dbStart = Date.now()
    try {
      await this.db.execute(sql`select 1`)
      checks.database = { ok: true, latencyMs: Date.now() - dbStart }
    } catch (err) {
      checks.database = { ok: false, error: (err as Error).message }
    }

    const allOk = Object.values(checks).every((c) => c.ok)
    const body = {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    }

    if (!allOk) throw new ServiceUnavailableException(body)
    return body
  }
}
