"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const cookie_1 = __importDefault(require("@fastify/cookie"));
const app_module_1 = require("./app.module");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const tenant_db_interceptor_1 = require("./common/database/tenant-db.interceptor");
const database_module_1 = require("./common/database/database.module");
const tenant_databases_service_1 = require("./modules/tenant-databases/tenant-databases.service");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, 
    // trustProxy lets Fastify derive the real client IP from X-Forwarded-For
    // when running behind a reverse proxy (nginx). Required for the workspace
    // IP-allowlist policy to see the true client IP in production. Off by
    // default so a direct deployment isn't tricked by spoofed XFF headers.
    new platform_fastify_1.FastifyAdapter({ logger: false, trustProxy: process.env.TRUST_PROXY === 'true' }), 
    // rawBody buffers the untouched request body onto `req.rawBody` while normal
    // JSON parsing continues for every route. The Stripe webhook
    // (POST /api/v1/billing/webhook) verifies its HMAC signature against these
    // exact bytes — a JSON round-trip would break the signature. This is the
    // only consumer; all other routes keep using the parsed `req.body`.
    { rawBody: true });
    // Cookie parsing/serialisation for httpOnly access/refresh + CSRF cookies
    // (Plan §1.1). No secret: we don't use signed cookies — the access/refresh
    // cookies are already-signed JWTs and the CSRF cookie is a double-submit value.
    await app.register(cookie_1.default);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        // Strip unknown properties instead of rejecting them: DTOs can be added
        // incrementally without risk of 400-ing requests that carry fields the DTO
        // hasn't (yet) declared. Combined with whitelist, unknown input is dropped
        // before it reaches a handler.
        forbidNonWhitelisted: false,
        transform: true,
    }));
    // §14.2 dedicated-database routing. Registered after ResponseInterceptor so
    // ResponseInterceptor stays outermost (response shaping is unchanged) and the
    // tenant interceptor is innermost — closest to the controller — establishing
    // the request's DB context around the handler. It is a near-no-op unless an
    // org has an ACTIVE dedicated database; it uses the SHARED handle for its own
    // registry/workspace lookups and never re-routes them.
    app.useGlobalInterceptors(new response_interceptor_1.ResponseInterceptor(), new tenant_db_interceptor_1.TenantDbInterceptor(app.get(database_module_1.SHARED_DB_TOKEN), app.get(tenant_databases_service_1.TenantDatabasesService)));
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    app.enableCors({
        origin: process.env.APP_URL ?? 'http://localhost:5173',
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    // Only mount interactive API docs outside production: the schema enumerates
    // every route/DTO and is a reconnaissance aid an attacker should not be
    // handed. NODE_ENV must be 'production' to disable it.
    const swaggerEnabled = process.env.NODE_ENV !== 'production';
    if (swaggerEnabled) {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('Rundesk API')
            .setDescription('Rundesk internal PM platform API')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('api/docs', app, document);
    }
    const port = process.env.PORT ?? 3001;
    await app.listen(port, '0.0.0.0');
    logger.log(`API running on http://localhost:${port}/api/v1`);
    if (swaggerEnabled)
        logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map