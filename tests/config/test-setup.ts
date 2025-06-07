import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Set environment for testing
process.env.NODE_ENV = 'test';
process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
process.env.BETTER_AUTH_SECRET = 'test-secret';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock @/lib/auth
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
  },
}));

// Mock AI SDK hooks for testing
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages: [],
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    append: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
  }),
  useCompletion: () => ({
    completion: '',
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    complete: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
  }),
}));

// Silence console.warn during tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('React Hook useEffect has missing dependencies')
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
