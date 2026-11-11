import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Env } from './env.model';

/**
 * Configuración global de la aplicación (prefijo, CORS, validación y errores).
 * Está en una función aparte para que main.ts y las pruebas e2e levanten
 * EXACTAMENTE la misma aplicación.
 */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env>>(ConfigService);

  // 1. Prefijo global: todas las rutas quedan como /api/v1/...
  app.setGlobalPrefix('api/v1');

  // 2. CORS: permite que el frontend (otro puerto/dominio) consuma la API
  const corsOrigin: string = config.get('CORS_ORIGIN') ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
  });

  // 3. Validación global de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina campos que no están en el DTO
      forbidNonWhitelisted: true, // ...y si llegan, responde 400
      transform: true, // convierte "5" -> 5 según el tipo del DTO
    }),
  );

  // 4. Formato único para los errores
  app.useGlobalFilters(new AllExceptionsFilter());
}
