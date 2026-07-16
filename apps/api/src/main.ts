import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import fastifyCookie from '@fastify/cookie'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy lets Fastify derive the real client IP from X-Forwarded-For
    // when running behind a reverse proxy (nginx). Required for the workspace
    // IP-allowlist policy to see the true client IP in production. Off by
    // default so a direct deployment isn't tricked by spoofed XFF headers.
    new FastifyAdapter({ logger: false, trustProxy: process.env.TRUST_PROXY === 'true' }),
    // rawBody buffers the untouched request body onto `req.rawBody` while normal
    // JSON parsing continues for every route. The Stripe webhook
    // (POST /api/v1/billing/webhook) verifies its HMAC signature against these
    // exact bytes — a JSON round-trip would break the signature. This is the
    // only consumer; all other routes keep using the parsed `req.body`.
    { rawBody: true },
  )

  // Cookie parsing/serialisation for httpOnly access/refresh + CSRF cookies
  // (Plan §1.1). No secret: we don't use signed cookies — the access/refresh
  // cookies are already-signed JWTs and the CSRF cookie is a double-submit value.
  await app.register(fastifyCookie as any)

  app.setGlobalPrefix('api/v1')

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    // Strip unknown properties instead of rejecting them: DTOs can be added
    // incrementally without risk of 400-ing requests that carry fields the DTO
    // hasn't (yet) declared. Combined with whitelist, unknown input is dropped
    // before it reaches a handler.
    forbidNonWhitelisted: false,
    transform: true,
  }))

  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Rundesk API')
    .setDescription('Rundesk internal PM platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT ?? 3001
  await app.listen(port, '0.0.0.0')
  logger.log(`API running on http://localhost:${port}/api/v1`)
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`)
}

bootstrap()
