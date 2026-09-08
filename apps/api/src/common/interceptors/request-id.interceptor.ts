import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';

/**
 * Stamps every request with a correlation id, echoed back in
 * `x-request-id` and included in error bodies so a user-reported failure
 * can be found in the logs.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    return next.handle();
  }
}
