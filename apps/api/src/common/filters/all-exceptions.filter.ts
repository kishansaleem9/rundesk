import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const req = ctx.getRequest<FastifyRequest>()

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error'

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
