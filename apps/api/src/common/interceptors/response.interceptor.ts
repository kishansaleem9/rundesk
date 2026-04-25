import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
  error: null
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If handler already returned shaped { data, meta }, pass through
        if (data && typeof data === 'object' && 'data' in data && 'error' in data) return data
        return { data, meta: undefined, error: null }
      }),
    )
  }
}
