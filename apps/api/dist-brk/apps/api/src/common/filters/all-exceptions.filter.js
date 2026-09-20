"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
// Postgres SQLSTATE codes that represent bad/conflicting *input* rather than a
// server fault. Translating these to 4xx (instead of a raw 500) is a global
// safety net so malformed requests never leak an internal error, on every
// endpoint — complementing per-endpoint DTO validation.
const PG_ERROR_MAP = {
    '23502': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A required field is missing' },
    '23503': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A referenced resource does not exist' },
    '23505': { status: common_1.HttpStatus.CONFLICT, message: 'That resource already exists' },
    '23514': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A value failed a database constraint' },
    '22P02': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A value has an invalid format' },
    '22001': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A value is too long' },
    '22003': { status: common_1.HttpStatus.BAD_REQUEST, message: 'A numeric value is out of range' },
    '23P01': { status: common_1.HttpStatus.CONFLICT, message: 'That change conflicts with an existing record' },
    // postgres.js driver error (not a SQLSTATE): an undefined was passed as a value,
    // which means a required field was omitted from the request.
    UNDEFINED_VALUE: { status: common_1.HttpStatus.BAD_REQUEST, message: 'A required field is missing' },
};
function mapDatabaseError(exception) {
    const code = exception?.code;
    if (typeof code !== 'string')
        return null;
    const mapped = PG_ERROR_MAP[code];
    if (!mapped)
        return null;
    // Surface the offending column for SERVER-SIDE logging only. It must never
    // appear in the client-facing message — that would leak the internal DB
    // schema (column names). The client always gets the generic mapped message.
    const column = exception?.column_name;
    if (code === '23502' && column) {
        return { ...mapped, column };
    }
    return mapped;
}
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const reply = ctx.getResponse();
        const req = ctx.getRequest();
        const dbError = exception instanceof common_1.HttpException ? null : mapDatabaseError(exception);
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : (dbError?.status ?? common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        const message = exception instanceof common_1.HttpException
            ? exception.getResponse()
            : (dbError?.message ?? 'Internal server error');
        const errorId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (status === common_1.HttpStatus.INTERNAL_SERVER_ERROR) {
            const err = exception;
            const method = req?.method ?? 'UNKNOWN';
            const url = req?.url ?? 'UNKNOWN';
            const requestId = req?.id ?? 'n/a';
            const stack = err?.stack ?? String(exception);
            this.logger.error(`[${errorId}] ${method} ${url} requestId=${requestId}\n${stack}`);
        }
        else if (dbError?.column) {
            // NOT-NULL violation: record the internal column name server-side only,
            // so operators can debug without exposing the schema to the client.
            const method = req?.method ?? 'UNKNOWN';
            const url = req?.url ?? 'UNKNOWN';
            this.logger.warn(`[${errorId}] ${method} ${url} NOT NULL violation on column "${dbError.column}"`);
        }
        reply.status(status).send({
            data: null,
            error: {
                status,
                message: typeof message === 'string' ? message : message.message,
                details: {
                    ...(typeof message === 'object' ? message : {}),
                    errorId: status === common_1.HttpStatus.INTERNAL_SERVER_ERROR ? errorId : undefined,
                    path: req?.url,
                },
            },
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map