import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums';
import { CreateUserDto, UpdateUserDto, UsersQueryDto } from './dto/user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly userRepository: Repository<User>) {}

  async create(dto: CreateUserDto) {
    const exists = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (exists) {
      throw new ConflictException(`Ya existe un usuario con email ${dto.email}`);
    }
    const user = await this.userRepository.save(this.userRepository.create(dto));
    return { message: 'Usuario creado con éxito', data: user };
  }

  async findAll(query: UsersQueryDto) {
    const users = await this.userRepository.find({
      where: query.role ? { role: query.role } : {},
      order: { fullName: 'ASC' },
    });
    return { message: 'Usuarios encontrados', data: users, count: users.length };
  }

  async findById(id: number) {
    return { message: 'Usuario encontrado', data: await this.findOne(id) };
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    const updated = await this.userRepository.save(this.userRepository.merge(user, dto));
    return { message: 'Usuario actualizado con éxito', data: updated };
  }

  /** Busca un usuario o lanza 404 (lo usan otros módulos) */
  async findOne(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return user;
  }

  /** Verifica que el usuario exista, esté activo y tenga uno de los roles indicados */
  async findWithRole(id: number, roles: Role[]) {
    const user = await this.findOne(id);
    if (!user.isActive) {
      throw new BadRequestException(`El usuario ${user.fullName} está inactivo`);
    }
    if (!roles.includes(user.role)) {
      throw new BadRequestException(`El usuario ${user.fullName} tiene rol ${user.role}; se requiere: ${roles.join(' o ')}`);
    }
    return user;
  }
}
