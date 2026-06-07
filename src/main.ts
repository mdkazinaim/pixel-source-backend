import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = configService.get<string>('API_PREFIX') || 'api/v1';
  const port = process.env.PORT || configService.get<number>('APP_PORT') || 3000;

  app.setGlobalPrefix(prefix);
  app.enableCors({ origin: ['https://pixel-source.vercel.app', 'http://localhost:3001'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}/${prefix}`);
}
bootstrap();
