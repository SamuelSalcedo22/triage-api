import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Estado de la API y de la base de datos',
    description: '200 si la API puede consultar PostgreSQL; 503 si la base de datos no responde.',
  })
  async check() {
    const database = await this.healthService.isDatabaseUp();
    if (!database) {
      throw new ServiceUnavailableException('La base de datos no responde');
    }
    return {
      message: 'API en funcionamiento',
      data: { status: 'ok', database: 'up', uptimeSeconds: Math.floor(process.uptime()) },
    };
  }
}
