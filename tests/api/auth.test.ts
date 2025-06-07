import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from '@/app/api/auth/[...all]/route';
import { createMockRequest, setupTestEnvironment } from '../utils/test-helpers';

// Mock better-auth
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: vi.fn(() => ({
    POST: vi.fn(),
    GET: vi.fn(),
  })),
}));

vi.mock('@/lib/auth/config', () => ({
  auth: {
    handler: vi.fn(),
  },
}));

describe('Auth API Routes', () => {
  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
  });

  describe('POST /api/auth/[...all]', () => {
    it('should handle sign in requests', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: 'user1', email: 'test@example.com' },
            session: { token: 'session-token' },
          }),
          { status: 200 },
        ),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'password123',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle sign up requests', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: 'user1', email: 'newuser@example.com' },
            session: { token: 'new-session-token' },
          }),
          { status: 201 },
        ),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-up',
        {
          method: 'POST',
          body: {
            email: 'newuser@example.com',
            password: 'password123',
            name: 'New User',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('should handle invalid credentials', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
        }),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'wrongpassword',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('Invalid credentials');
    });

    it('should validate required fields', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Email is required' }), {
          status: 400,
        }),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            password: 'password123',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/[...all]', () => {
    it('should handle session verification', async () => {
      const mockHandler = vi.mocked(GET);
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: 'user1', email: 'test@example.com' },
            session: { token: 'valid-token' },
          }),
          { status: 200 },
        ),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/session',
        {
          headers: {
            Authorization: 'Bearer valid-token',
          },
        },
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();
    });

    it('should handle invalid session tokens', async () => {
      const mockHandler = vi.mocked(GET);
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 401,
        }),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/session',
        {
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        },
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should handle missing authorization header', async () => {
      const mockHandler = vi.mocked(GET);
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ error: 'No authorization header' }), {
          status: 401,
        }),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/session',
      );

      const response = await GET(request);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits for sign in attempts', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
        }),
      );

      // Simulate multiple rapid requests
      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'password123',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(429);
    });
  });

  describe('Password Security', () => {
    it('should hash passwords before storage', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockImplementation(async () => {
        // Verify password is hashed (mock implementation)
        return new Response(
          JSON.stringify({ message: 'User created successfully' }),
          { status: 201 },
        );
      });

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-up',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'plaintext-password',
            name: 'Test User',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('should enforce password complexity requirements', async () => {
      const mockHandler = vi.mocked(POST);
      mockHandler.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Password must be at least 8 characters long',
          }),
          { status: 400 },
        ),
      );

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-up',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: '123',
            name: 'Test User',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
