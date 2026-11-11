import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Hace una consulta mínima a PostgreSQL; false si falla o tarda más de 2 s */
  async isDatabaseUp(): Promise<boolean> {
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));
    const query = this.dataSource
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    return Promise.race([query, timeout]);
  }
}
