import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EvaluateTriageDto, QueueQueryDto } from './dto/triage.dto';
import { TriageService } from './triage.service';

@ApiTags('triage')
@Controller('triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluar signos vitales y devolver prioridad + alertas',
    description: 'Con caseId: guarda la nueva toma de signos en el caso y lo reevalúa. ' + 'Sin caseId: solo calcula (modo simulación, no guarda nada).',
  })
  evaluate(@Body() dto: EvaluateTriageDto) {
    return this.triageService.evaluate(dto);
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Cola priorizada para el especialista',
    description: 'Casos PENDIENTE y EN_REVISION ordenados por prioridad (ALTA → MEDIA → BAJA), ' + 'luego por NEWS2 y luego por tiempo de espera. Cada caso indica si está disponible.',
  })
  getQueue(@Query() query: QueueQueryDto) {
    return this.triageService.getPrioritizedQueue(query);
  }

  @Get('cases/:caseId/history')
  @ApiOperation({ summary: 'Historial de evaluaciones de triage de un caso' })
  getHistory(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.triageService.getCaseHistory(caseId);
  }
}
