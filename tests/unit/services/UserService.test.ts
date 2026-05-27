import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../../../src/api/services/UserService';
import { AppError } from '../../../src/errors/AppError';
import { createUser } from '../../factories/user.factory';
import type { UserRepository } from '../../../src/api/repositories/UserRepository';

// ── Build UserService with mocked UserRepository ──────────────────────────────
function buildUserService() {
  const mockRepo = {
    findAll:     vi.fn(),
    findById:    vi.fn(),
    findByEmail: vi.fn(),
    create:      vi.fn(),
    update:      vi.fn(),
    delete:      vi.fn(),
  } as unknown as UserRepository;

  const service = new UserService(mockRepo);
  return { service, mockRepo };
}

describe('UserService', () => {
  describe('findAll', () => {
    it('should return an array of users', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const users = [createUser(), createUser()];
      mockRepo.findAll = vi.fn().mockResolvedValue(users);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toHaveLength(2);
      expect(mockRepo.findAll).toHaveBeenCalledOnce();
    });

    it('should return an empty array when no users exist', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      mockRepo.findAll = vi.fn().mockResolvedValue([]);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return the user when found', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const user = createUser();
      mockRepo.findById = vi.fn().mockResolvedValue(user);

      // Act
      const result = await service.findById(user.id);

      // Assert
      expect(result.id).toBe(user.id);
      expect(mockRepo.findById).toHaveBeenCalledWith(user.id);
    });

    it('should throw 404 AppError when user is not found', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.findById('non-existent-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw AppError (not plain Error) on missing user', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.findById('missing')).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('create', () => {
    it('should create and return the user when email is not taken', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const user = createUser({ email: 'new@example.com' });
      mockRepo.findByEmail = vi.fn().mockResolvedValue(null);
      mockRepo.create      = vi.fn().mockResolvedValue(user);

      // Act
      const result = await service.create({
        firstName:    'New',
        lastName:     'User',
        email:        'new@example.com',
        passwordHash: 'hash',
      });

      // Assert
      expect(result.email).toBe('new@example.com');
      expect(mockRepo.create).toHaveBeenCalledOnce();
    });

    it('should throw 409 AppError when email is already registered', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const existing = createUser({ email: 'taken@example.com' });
      mockRepo.findByEmail = vi.fn().mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.create({ firstName: 'A', lastName: 'B', email: 'taken@example.com', passwordHash: 'x' }),
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should return the updated user when found', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const user        = createUser();
      const updatedUser = { ...user, firstName: 'Updated' };
      mockRepo.findById = vi.fn().mockResolvedValue(user);
      mockRepo.update   = vi.fn().mockResolvedValue(updatedUser);

      // Act
      const result = await service.update(user.id, { firstName: 'Updated' });

      // Assert
      expect(result.firstName).toBe('Updated');
      expect(mockRepo.update).toHaveBeenCalledWith(user.id, { firstName: 'Updated' });
    });

    it('should throw 404 AppError when user is not found before update', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('ghost-id', { firstName: 'X' })).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should throw 404 AppError when update returns null (race condition)', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const user = createUser();
      mockRepo.findById = vi.fn().mockResolvedValue(user);
      mockRepo.update   = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(user.id, { firstName: 'X' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('delete', () => {
    it('should delete the user when found', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      const user = createUser();
      mockRepo.findById = vi.fn().mockResolvedValue(user);
      mockRepo.delete   = vi.fn().mockResolvedValue(undefined);

      // Act
      await service.delete(user.id);

      // Assert
      expect(mockRepo.delete).toHaveBeenCalledWith(user.id);
    });

    it('should throw 404 AppError when user is not found', async () => {
      // Arrange
      const { service, mockRepo } = buildUserService();
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete('ghost-id')).rejects.toMatchObject({ statusCode: 404 });
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
