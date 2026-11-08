/** Variables de entorno que usa la API (archivo .env) */
export interface Env {
  PORT: number;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  UPLOADS_DIR: string;
  MAX_UPLOAD_MB: number;
  CORS_ORIGIN: string;
}
