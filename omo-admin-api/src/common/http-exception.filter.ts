import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) { const http = host.switchToHttp(); const response = http.getResponse<Response>(); const request = http.getRequest(); const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR; const body = exception instanceof HttpException ? exception.getResponse() : null; let message = '服务器内部错误'; let code = `HTTP_${status}`; if (typeof body === 'string') message = body; else if (body && typeof body === 'object') { const record = body as Record<string, any>; message = Array.isArray(record.message) ? record.message.join('；') : String(record.message || message); if (record.code) code = String(record.code); } if (status >= 500) console.error('[admin-api]', { requestId: request.requestId, exception }); response.status(status).json({ code, message, data: null, requestId: request.requestId }); }
}
