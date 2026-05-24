import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { UserRepository } from '../repositories/UserRepository';
import { AppError } from '../../errors/AppError';
import type { User, NewUser } from '../models/user.schema';
import type { UpdateUserDto } from '../validators/UpdateUserDto';

@injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new AppError(`User "${id}" not found`, 404);
    return user;
  }

  async create(data: NewUser): Promise<User> {
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError(`Email "${data.email}" is already registered`, 409);
    }
    return this.userRepository.create(data);
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    // Verify existence before touching the DB
    const exists = await this.userRepository.findById(id);
    if (!exists) throw new AppError(`User "${id}" not found`, 404);

    const updated = await this.userRepository.update(id, data);
    if (!updated) throw new AppError(`User "${id}" not found`, 404);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const exists = await this.userRepository.findById(id);
    if (!exists) throw new AppError(`User "${id}" not found`, 404);
    await this.userRepository.delete(id);
  }
}
