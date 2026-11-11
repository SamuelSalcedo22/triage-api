import { existsSync } from 'node:fs';
import { Client } from 'pg';

/**
 * Se ejecuta UNA vez antes de las pruebas e2e:
 * borra y vuelve a crear la base de datos "triage_e2e" para empezar en limpio.
 * Así las pruebas nunca tocan los datos de la base de desarrollo (triage_db).
 */
export default async function crearBaseDeDatosDePruebas() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5433),
    user: process.env.POSTGRES_USER ?? 'triage_user',
    password: process.env.POSTGRES_PASSWORD ?? 'triage_password',
    database: 'postgres',
  });

  try {
    await client.connect();
  } catch {
    throw new Error('No se pudo conectar a PostgreSQL. Ejecuta primero: docker compose up -d --wait postgres');
  }
  await client.query('DROP DATABASE IF EXISTS triage_e2e WITH (FORCE)');
  await client.query('CREATE DATABASE triage_e2e');
  await client.end();
}
