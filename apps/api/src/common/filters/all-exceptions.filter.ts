import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'

// Postgres SQLSTATE codes that represent bad/conflicting *input* rather than a
// server fault. Translating these to 4xx (instead of a raw 500) is a global
// safety net so malformed requests never leak an internal error, on every
// endpoint — complementing per-endpoint DTO validation.
const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'A required field is missing' },
  '23503': { status: HttpStatus.BAD_REQUEST, message: 'A referenced resource does not exist' },
  '23505': { status: HttpStatus.CONFLICT, message: 'That resource already exists' },
  '23514': { status: HttpStatus.BAD_REQUEST, message: 'A value failed a database constraint' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'A value has an invalid format' },
  '22001': { status: HttpStatus.BAD_REQUEST, message: 'A value is too long' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'A numeric value is out of range' },
  '23P01': { status: HttpStatus.CONFLICT, message: 'That change conflicts with an existing record' },
  // postgres.js driver error (not a SQLSTATE): an undefined was passed as a value,
  // which means a required field was omitted from the request.
  UNDEFINED_VALUE: { status: HttpStatus.BAD_REQUEST, message: 'A required field is missing' },
}

function mapDatabaseError(exception: unknown): { status: number; message: string } | null {
  const code = (exception as { code?: unknown })?.code
  if (typeof code !== 'string') return null
  const mapped = PG_ERROR_MAP[code]
  if (!mapped) return null
  const column = (exception as { column_name?: string })?.column_name
  if (code === '23502' && column) {
    return { status: mapped.status, message: `Required field missing: ${column}` }
  }
  return mapped
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const req = ctx.getRequest<FastifyRequest>()

    const dbError = exception instanceof HttpException ? null : mapDatabaseError(exception)

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : (dbError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR)

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : (dbError?.message ?? 'Internal server error')

    const errorId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const err = exception as any
      const method = req?.method ?? 'UNKNOWN'
      const url = req?.url ?? 'UNKNOWN'
      const requestId = (req as any)?.id ?? 'n/a'
      const stack = err?.stack ?? String(exception)
      this.logger.error(
        `[${errorId}] ${method} ${url} requestId=${requestId}\n${stack}`,
      )
    }

    reply.status(status).send({
      data: null,
      error: {
        status,
        message: typeof message === 'string' ? message : (message as any).message,
        details: {
          ...(typeof message === 'object' ? (message as any) : {}),
          errorId: status === HttpStatus.INTERNAL_SERVER_ERROR ? errorId : undefined,
          path: req?.url,
        },
      },
    })
  }
}
