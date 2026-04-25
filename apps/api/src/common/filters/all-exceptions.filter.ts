import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FastifyReply } from 'fastify'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error'

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception)
    }

    reply.status(status).send({
      data: null,
      error: {
        status,
        message: typeof message === 'string' ? message : (message as any).message,
        details: typeof message === 'object' ? message : undefined,
      },
    })
  }
}
