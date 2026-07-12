import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './common/config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  validateEnv();

  // rawBody: true preserves the exact request bytes on req.rawBody so payment
  // webhook signatures (Stripe) can be verified against the untouched payload.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.use(helmet());

  // Web app runs on a separate origin (:3000) and calls this API from the
  // browser — allow it. Tighten `origin` to the real domain(s) in production.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Overlay API listening on :${port}`);
}

bootstrap();
