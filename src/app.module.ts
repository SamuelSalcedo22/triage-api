import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Env } from './env.model';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { CasesModule } from './cases/cases.module';
import { TriageModule } from './triage/triage.module';
import { AttachmentsModule } from './attachments/attachments.module';

@Module({
  imports: [
    // Lee el archivo .env y lo deja disponible en toda la app
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Conexión a PostgreSQL usando los valores del .env
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env>) => ({
        type: 'postgres',
        host: configService.getOrThrow('POSTGRES_HOST'),
        port: Number(configService.getOrThrow('POSTGRES_PORT')),
        username: configService.getOrThrow('POSTGRES_USER'),
        password: configService.getOrThrow('POSTGRES_PASSWORD'),
        database: configService.getOrThrow('POSTGRES_DB'),
        autoLoadEntities: true,
        // Crea/actualiza las tablas a partir de las entidades (solo desarrollo)
        synchronize: true,
      }),
    }),
    UsersModule,
    PatientsModule,
    CasesModule,
    TriageModule,
    AttachmentsModule,
  ],
})
export class AppModule {}
