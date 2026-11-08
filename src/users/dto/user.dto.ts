import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '../../common/enums';

export class CreateUserDto {
  /** Nombre completo
   * @example "Laura Martínez Erazo" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  /** @example "laura.martinez@triage.com" */
  @IsEmail()
  email: string;

  /** @example "ESPECIALISTA" */
  @IsEnum(Role)
  role: Role;

  /** Solo para especialistas
   * @example "Medicina interna" */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialty?: string;

  /** @example "3001234567" */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  /** false para desactivar al usuario (no se borra para no perder el historial) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UsersQueryDto {
  @ApiPropertyOptional({ enum: Role, description: 'Filtrar por rol' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
