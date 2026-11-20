import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePatientDto, PatientsQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear paciente' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.createPatient(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar / buscar pacientes' })
  findAll(@Query() query: PatientsQueryDto) {
    return this.patientsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un paciente' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos o antecedentes del paciente' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePatientDto) {
    return this.patientsService.updatePatient(id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar todos los datos del paciente (lo no enviado vuelve a su valor por defecto)' })
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePatientDto) {
    return this.patientsService.replacePatient(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar paciente (solo si no tiene casos)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.deletePatient(id);
  }

  @Get(':id/cases')
  @ApiOperation({ summary: 'Historial de casos del paciente' })
  getCases(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.getPatientCases(id);
  }
}
