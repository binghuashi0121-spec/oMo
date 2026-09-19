import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

function mountAdminWeb(app: ReturnType<typeof configureApp>) {
  const webRoot = join(process.cwd(), 'public');
  const indexFile = join(webRoot, 'index.html');
  if (!existsSync(indexFile)) return;

  const server = app.getHttpAdapter().getInstance();
  server.use(express.static(webRoot, { index: 'index.html' }));
  server.use((req: Request, res: Response, next: NextFunction) => {
    const originalPath = req.originalUrl.split('?', 1)[0];
    if (req.method !== 'GET' || originalPath === '/api' || originalPath.startsWith('/api/') || !req.accepts('html')) return next();
    return res.sendFile('index.html', { root: webRoot });
  });
}

async function bootstrap(){
  const app=configureApp(await NestFactory.create(AppModule));
  mountAdminWeb(app);
  const port=Number(process.env.PORT||3001);
  await app.listen(port,'0.0.0.0');
  console.log(`[admin-api] listening on ${port}`);
}

bootstrap().catch((error)=>{console.error('[admin-api] startup failed',error);process.exitCode=1;});
