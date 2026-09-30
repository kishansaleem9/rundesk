import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import fastifyCookie from '@fastify/cookie'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TenantDbInterceptor } from './common/database/tenant-db.interceptor'
import { SHARED_DB_TOKEN } from './common/database/database.module'
import { TenantDatabasesService } from './modules/tenant-databases/tenant-databases.service'
import { describeTrustProxy, trustProxyFrom } from './common/http/trust-proxy'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  // WHO IS ASKING (`found-30-sep/client-address-behind-nginx`). Behind nginx the
  // socket is nginx's for everybody, and the client's address is the LAST
  // X-Forwarded-For entry, the one nginx appended; the entries before it are
  // the client's own to write. TRUST_PROXY counts the proxies in front (1 behind
  // nginx) and Fastify trusts exactly that many hops, never every hop. Unset, the
  // socket's address is the client's. The rate limiter, the workspace IP
  // allowlist and a session's recorded address all read `req.ip`. Read before
  // anything is built, so a value it cannot read stops the API here.
  const trustProxy = trustProxyFrom(process.env.TRUST_PROXY)
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy }),
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

  // §14.2 dedicated-database routing. Registered after ResponseInterceptor so
  // ResponseInterceptor stays outermost (response shaping is unchanged) and the
  // tenant interceptor is innermost — closest to the controller — establishing
  // the request's DB context around the handler. It is a near-no-op unless an
  // org has an ACTIVE dedicated database; it uses the SHARED handle for its own
  // registry/workspace lookups and never re-routes them.
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new TenantDbInterceptor(app.get(SHARED_DB_TOKEN), app.get(TenantDatabasesService)),
  )
  app.useGlobalFilters(new AllExceptionsFilter())

  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // Only mount interactive API docs outside production: the schema enumerates
  // every route/DTO and is a reconnaissance aid an attacker should not be
  // handed. NODE_ENV must be 'production' to disable it.
  const swaggerEnabled = process.env.NODE_ENV !== 'production'
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Rundesk API')
      .setDescription('Rundesk internal PM platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = process.env.PORT ?? 3001
  await app.listen(port, '0.0.0.0')
  logger.log(`API running on http://localhost:${port}/api/v1`)
  logger.log(describeTrustProxy(trustProxy))
  if (swaggerEnabled) logger.log(`Swagger docs at http://localhost:${port}/api/docs`)
}

bootstrap()
