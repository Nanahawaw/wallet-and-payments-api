import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Relies on the unique indexes on email/username as the source of truth - a
   * pre-check-then-insert would still race under two concurrent signups with
   * the same email, so we let Postgres reject the duplicate and translate it.
   */
  async create(
    data: { email: string; username: string; passwordHash: string },
    manager?: EntityManager,
  ): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    const user = repo.create({
      email: data.email.toLowerCase(),
      username: data.username,
      passwordHash: data.passwordHash,
    });
    try {
      return await repo.save(user);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505') {
        throw new ConflictException('Email or username is already taken');
      }
      throw err;
    }
  }
}
