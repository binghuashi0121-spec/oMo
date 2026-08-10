import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
async function bootstrap(){const app=configureApp(await NestFactory.create(AppModule));const port=Number(process.env.PORT||3001);await app.listen(port,'0.0.0.0');console.log(`[admin-api] listening on ${port}`);} bootstrap().catch((error)=>{console.error('[admin-api] startup failed',error);process.exitCode=1;});
