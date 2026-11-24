import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { json, type Request, type Response, type NextFunction } from 'express';

async function startServer() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '20mb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.header('X-Watershed-Client') !== '1') {
      res.status(403).json({ message: 'Missing request verification header.' });
      return;
    }
    next();
  });
  await app.listen(process.env.PORT ?? 3000);
}
await startServer();
