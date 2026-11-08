import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Env } from './env.model';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  // 5. Swagger: documentación interactiva en /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('API de Triage y Priorización de Casos Clínicos')
    .setDescription('Evalúa signos vitales y síntomas recolectados por el promotor en campo, ' + 'calcula NEWS2 + reglas de hipertensión y diabetes, y ordena la bandeja ' + 'del especialista por prioridad (ALTA, MEDIA, BAJA).\n\n' + 'Herramienta de apoyo a la decisión clínica: no reemplaza el criterio médico.')
    .setVersion('1.0')
    .addTag('users', 'Promotores, especialistas y administradores')
    .addTag('patients', 'Gestión de pacientes')
    .addTag('cases', 'Casos clínicos (al crear uno se calcula el triage automáticamente)')
    .addTag('triage', 'Evaluación de riesgo y cola priorizada')
    .addTag('attachments', 'Fotos, ECG, historia clínica y otros adjuntos')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('PORT') ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API corriendo en      http://localhost:${port}/api/v1`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}
void bootstrap();
