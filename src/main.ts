import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './env.model';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env>>(ConfigService);

  // Prefijo api/v1, CORS, validación global y formato único de errores
  configureApp(app);

  // Swagger: documentación interactiva en /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('API de Triage y Priorización de Casos Clínicos')
    .setDescription('Evalúa signos vitales y síntomas recolectados por el promotor en campo, ' + 'calcula NEWS2 + reglas de hipertensión y diabetes, y ordena la bandeja ' + 'del especialista por prioridad (ALTA, MEDIA, BAJA).\n\n' + 'Herramienta de apoyo a la decisión clínica: no reemplaza el criterio médico.')
    .setVersion('1.0')
    .addTag('health', 'Estado de la API y de la base de datos')
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
