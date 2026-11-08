import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { AddVitalSignsDto, AssignCaseDto, CasesQueryDto, CreateCaseDto, UpdateCaseDto, UpdateCaseStatusDto } from './dto/case.dto';

@ApiTags('cases')
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear caso con signos vitales (calcula el triage automáticamente)',
  })
  create(@Body() dto: CreateCaseDto) {
    return this.casesService.createCase(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar casos con filtros' })
  findAll(@Query() query: CasesQueryDto) {
    return this.casesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle del caso: paciente, signos, historial de triage y adjuntos',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.casesService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar motivo, síntomas u observaciones' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCaseDto) {
    return this.casesService.updateCase(id, dto);
  }

  @Post(':id/vital-signs')
  @ApiOperation({ summary: 'Registrar nueva toma de signos vitales (recalcula triage)' })
  addVitalSigns(@Param('id', ParseIntPipe) id: number, @Body() dto: AddVitalSignsDto) {
    return this.casesService.addVitalSigns(id, dto);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Un especialista toma el caso (pasa a EN_REVISION)' })
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignCaseDto) {
    return this.casesService.assignCase(id, dto);
  }

  @Patch(':id/release')
  @ApiOperation({ summary: 'El especialista suelta el caso (vuelve a PENDIENTE)' })
  release(@Param('id', ParseIntPipe) id: number) {
    return this.casesService.releaseCase(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Cambiar estado: ATENDIDO, DERIVADO o CERRADO',
  })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCaseStatusDto) {
    return this.casesService.updateStatus(id, dto);
  }
}
