import type { User, NewUser } from '../../src/api/models/user.schema';
import type { SafeUser } from '../../src/api/services/AuthService';

const DEFAULT_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$stub-salt-for-tests$stub-hash-value-for-unit-tests-only';

let counter = 0;

/**
 * Returns a unique email each call so multiple factories don't clash.
 */
function uniqueEmail(): string {
  counter += 1;
  return `test${counter}@example.com`;
}

/**
 * Creates a NewUser (insert shape) with sensible defaults.
 * Pass `overrides` to customise any field.
 */
export function createUserData(overrides: Partial<NewUser> = {}): NewUser {
  return {
    firstName:    'Test',
    lastName:     'User',
    email:        uniqueEmail(),
    passwordHash: DEFAULT_PASSWORD_HASH,
    ...overrides,
  };
}

/**
 * Creates a full User (select shape — includes id, timestamps).
 */
export function createUser(overrides: Partial<User> = {}): User {
  return {
    id:           crypto.randomUUID(),
    firstName:    'Test',
    lastName:     'User',
    email:        uniqueEmail(),
    passwordHash: DEFAULT_PASSWORD_HASH,
    createdAt:    new Date('2024-01-01T00:00:00Z'),
    updatedAt:    new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a SafeUser — User without passwordHash (what the API returns).
 */
export function createSafeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  const { passwordHash: _pw, ...safe } = createUser();
  return { ...safe, ...overrides };
}
