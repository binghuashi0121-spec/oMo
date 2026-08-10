import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> { const request = context.switchToHttp().getRequest(); return next.handle().pipe(map((data) => ({ code: 'OK', message: 'ok', data: data === undefined ? null : data, requestId: request.requestId }))); }
}
