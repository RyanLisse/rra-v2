import { faker } from '@faker-js/faker';
import { BaseFactory } from './base-factory';
import type {
  FactoryOptions,
  UserInsert,
  SessionInsert,
  AccountInsert,
  CompleteUser,
} from './types';

/**
 * User factory for creating test user data
 */
export class UserFactory extends BaseFactory<UserInsert> {
  create(options?: FactoryOptions): UserInsert {
    const realistic = options?.realistic ?? true;
    const baseTime = new Date();

    const user: UserInsert = {
      id: this.generateId(),
      email: realistic
        ? faker.internet.email()
        : `test-${faker.string.alphanumeric(8)}@example.com`,
      password: realistic
        ? faker.internet.password({ length: 12 })
        : 'test-password-123',
      emailVerified: realistic
        ? faker.datatype.boolean(0.8)
        : true,
      image:
        realistic && faker.datatype.boolean(0.3)
          ? faker.image.avatar()
          : null,
      name: realistic
        ? faker.person.fullName()
        : `Test User ${faker.string.alphanumeric(4)}`,
      type: faker.helpers.weightedArrayElement([
        { weight: 70, value: 'regular' },
        { weight: 25, value: 'premium' },
        { weight: 5, value: 'admin' },
      ]),
      isAnonymous: false,
      createdAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 1, max: 365 * 24 * 60 }),
      ),
      updatedAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 0, max: 24 * 60 }),
      ),
    };

    return this.applyOverrides(user, options?.overrides);
  }

  /**
   * Create anonymous user
   */
  createAnonymous(options?: FactoryOptions): UserInsert {
    return this.create({
      ...options,
      overrides: {
        email: null,
        password: null,
        emailVerified: false,
        name: 'Anonymous User',
        type: 'regular',
        isAnonymous: true,
        ...options?.overrides,
      },
    });
  }

  /**
   * Create admin user
   */
  createAdmin(options?: FactoryOptions): UserInsert {
    return this.create({
      ...options,
      overrides: {
        type: 'admin',
        emailVerified: true,
        name: `Admin ${faker.person.firstName()}`,
        ...options?.overrides,
      },
    });
  }

  /**
   * Create premium user
   */
  createPremium(options?: FactoryOptions): UserInsert {
    return this.create({
      ...options,
      overrides: {
        type: 'premium',
        emailVerified: true,
        ...options?.overrides,
      },
    });
  }

  /**
   * Create users with specific activity patterns
   */
  createActiveUser(options?: FactoryOptions): UserInsert {
    const now = new Date();
    return this.create({
      ...options,
      overrides: {
        emailVerified: true,
        updatedAt: this.generateTimestamp(
          now,
          -faker.number.int({ min: 0, max: 60 }),
        ), // Updated recently
        ...options?.overrides,
      },
    });
  }

  createInactiveUser(options?: FactoryOptions): UserInsert {
    const now = new Date();
    return this.create({
      ...options,
      overrides: {
        updatedAt: this.generateTimestamp(
          now,
          -faker.number.int({ min: 30 * 24 * 60, max: 365 * 24 * 60 }),
        ), // Not updated in 30+ days
        ...options?.overrides,
      },
    });
  }
}

/**
 * Session factory for creating test session data
 */
export class SessionFactory extends BaseFactory<SessionInsert> {
  create(options?: FactoryOptions): SessionInsert {
    const baseTime = new Date();
    const createdAt = this.generateTimestamp(
      baseTime,
      -faker.number.int({ min: 0, max: 24 * 60 }),
    );
    const expiresAt = this.generateTimestamp(createdAt, 30 * 24 * 60); // 30 days from creation

    const session: SessionInsert = {
      id: this.generateId(),
      userId: options?.overrides?.userId || this.generateId(),
      token: faker.string.alphanumeric(64),
      expiresAt,
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      createdAt,
      updatedAt: this.generateTimestamp(
        createdAt,
        faker.number.int({ min: 0, max: 60 }),
      ),
    };

    return this.applyOverrides(session, options?.overrides);
  }

  /**
   * Create expired session
   */
  createExpired(options?: FactoryOptions): SessionInsert {
    const pastTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    return this.create({
      ...options,
      overrides: {
        expiresAt: pastTime,
        ...options?.overrides,
      },
    });
  }

  /**
   * Create active session (expires in the future)
   */
  createActive(options?: FactoryOptions): SessionInsert {
    const futureTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    return this.create({
      ...options,
      overrides: {
        expiresAt: futureTime,
        ...options?.overrides,
      },
    });
  }
}

/**
 * Account factory for creating OAuth account data
 */
export class AccountFactory extends BaseFactory<AccountInsert> {
  create(options?: FactoryOptions): AccountInsert {
    const provider = faker.helpers.arrayElement([
      'google',
      'github',
      'discord',
      'microsoft',
    ]);
    const baseTime = new Date();

    const account: AccountInsert = {
      id: this.generateId(),
      userId: options?.overrides?.userId || this.generateId(),
      accountId: faker.string.alphanumeric(16),
      providerId: provider,
      accessToken: faker.string.alphanumeric(128),
      refreshToken: faker.datatype.boolean(0.8)
        ? faker.string.alphanumeric(128)
        : null,
      idToken: faker.datatype.boolean(0.6)
        ? faker.string.alphanumeric(256)
        : null,
      accessTokenExpiresAt: this.generateTimestamp(baseTime, 60), // 1 hour from now
      refreshTokenExpiresAt: faker.datatype.boolean(0.8)
        ? this.generateTimestamp(baseTime, 30 * 24 * 60)
        : null, // 30 days from now
      scope: this.generateScopeForProvider(provider),
      password: null, // OAuth accounts don't have passwords
      createdAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 1, max: 365 * 24 * 60 }),
      ),
      updatedAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 0, max: 24 * 60 }),
      ),
    };

    return this.applyOverrides(account, options?.overrides);
  }

  /**
   * Create account for specific provider
   */
  createForProvider(provider: string, options?: FactoryOptions): AccountInsert {
    return this.create({
      ...options,
      overrides: {
        providerId: provider,
        scope: this.generateScopeForProvider(provider),
        ...options?.overrides,
      },
    });
  }

  private generateScopeForProvider(provider: string): string {
    const scopes = {
      google: 'openid email profile',
      github: 'user:email read:user',
      discord: 'identify email',
      microsoft: 'openid email profile',
    };
    return scopes[provider as keyof typeof scopes] || 'openid email profile';
  }
}

/**
 * Complete user factory that creates user with all related data
 */
export class CompleteUserFactory extends BaseFactory<CompleteUser> {
  private userFactory = new UserFactory(this.seed);
  private sessionFactory = new SessionFactory(this.seed);
  private accountFactory = new AccountFactory(this.seed);

  create(options?: FactoryOptions): CompleteUser {
    const user = this.userFactory.create(options);

    const sessionCount = faker.number.int({ min: 0, max: 3 });
    const sessions = this.sessionFactory.createBatch({
      count: sessionCount,
      overrides: { userId: user.id },
    });

    const accountCount = faker.number.int({ min: 0, max: 2 });
    const accounts = this.accountFactory.createBatch({
      count: accountCount,
      overrides: { userId: user.id },
      customizer: (index) => ({
        providerId: ['google', 'github', 'discord'][index % 3],
      }),
    });

    const result: CompleteUser = {
      user,
      sessions,
      accounts,
      chats: [], // Will be populated by relationship factory
      documents: [], // Will be populated by relationship factory
    };

    return this.applyOverrides(result, options?.overrides);
  }

  /**
   * Create user with specific activity level
   */
  createActiveUser(options?: FactoryOptions): CompleteUser {
    const user = this.userFactory.createActiveUser(options);

    // Active users have more sessions
    const sessions = this.sessionFactory.createBatch({
      count: faker.number.int({ min: 2, max: 5 }),
      overrides: { userId: user.id },
    });

    // Active users are more likely to have OAuth accounts
    const accounts = this.accountFactory.createBatch({
      count: faker.number.int({ min: 1, max: 3 }),
      overrides: { userId: user.id },
    });

    return {
      user,
      sessions,
      accounts,
      chats: [],
      documents: [],
    };
  }

  /**
   * Create minimal user (for performance testing)
   */
  createMinimal(options?: FactoryOptions): CompleteUser {
    const user = this.userFactory.create(options);

    return {
      user,
      sessions: [
        this.sessionFactory.createActive({ overrides: { userId: user.id } }),
      ],
      accounts: [],
      chats: [],
      documents: [],
    };
  }
}

// Export factory instances
export const userFactory = new UserFactory();
export const sessionFactory = new SessionFactory();
export const accountFactory = new AccountFactory();
export const completeUserFactory = new CompleteUserFactory();
