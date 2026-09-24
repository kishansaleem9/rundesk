import { Injectable, NestInterceptor, ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common'
import { HEADERS_METADATA } from '@nestjs/common/constants'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
  error: null
}

/**
 * Whether what a handler returned IS the response body, to be sent as it is:
 * a `StreamableFile`, or anything from a handler that declared, with
 * `@Header('Content-Type', …)`, a body that is not JSON — a CSV export returns
 * its CSV as a string.
 *
 * Wrapping those was a bug every export shared: a PDF arrived as JSON
 * describing the file (`{"data":{"options":{"type":"application/pdf"…`), and a
 * string under a declared `text/csv` became an object Fastify refused to send
 * (500, "Attempted to send payload of invalid type 'object'").
 */
export function isRawBody(handler: object, body: unknown): boolean {
  if (body instanceof StreamableFile) return true
  const declared: Array<{ name: string; value: string }> | undefined = Reflect.getMetadata(HEADERS_METADATA, handler)
  const type = declared?.find((h) => h.name.toLowerCase() === 'content-type')?.value
  return type !== undefined && !/json/i.test(type)
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const handler = context.getHandler()
    return next.handle().pipe(
      map((data) => {
        if (isRawBody(handler, data)) return data
        // If handler already returned shaped { data, meta }, pass through
        if (data && typeof data === 'object' && 'data' in data && 'error' in data) return data
        return { data, meta: undefined, error: null }
      }),
    )
  }
}
