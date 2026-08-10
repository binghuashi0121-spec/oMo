import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestIdMiddleware } from './common/request-id.middleware';
import { ResponseInterceptor } from './common/response.interceptor';
import { ApiExceptionFilter } from './common/http-exception.filter';

export function configureApp(app: INestApplication) {
  const origin=process.env.ADMIN_WEB_ORIGIN||'http://localhost:4173';
  app.getHttpAdapter().getInstance().set('trust proxy',1);
  app.use(helmet()); app.use(cookieParser()); app.use(requestIdMiddleware);
  app.enableCors({origin:origin.split(',').map((item)=>item.trim()),credentials:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['content-type','x-csrf-token','x-request-id','x-omo-scenic-area-id']});
  app.setGlobalPrefix('api/admin/v1'); app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true})); app.useGlobalInterceptors(new ResponseInterceptor()); app.useGlobalFilters(new ApiExceptionFilter()); app.enableShutdownHooks(); return app;
}
