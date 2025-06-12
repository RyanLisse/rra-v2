import { vi } from 'vitest';

// Mock user for tests
export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  given_name: 'Test',
  family_name: 'User',
  picture: null,
};

// Mock guest user
export const mockGuestUser = {
  id: 'guest-user-123',
  email: 'guest123@guest.local',
  given_name: 'Guest',
  family_name: 'User',
  picture: null,
};

// Mock session functions
export const mockGetUser = vi.fn();
export const mockIsAuthenticated = vi.fn();
export const mockGetPermission = vi.fn();
export const mockGetPermissions = vi.fn();
export const mockGetOrganization = vi.fn();
export const mockGetToken = vi.fn();
export const mockGetUserOrganizations = vi.fn();

// Mock session object
export const mockSession = {
  getUser: mockGetUser,
  isAuthenticated: mockIsAuthenticated,
  getPermission: mockGetPermission,
  getPermissions: mockGetPermissions,
  getOrganization: mockGetOrganization,
  getToken: mockGetToken,
  getUserOrganizations: mockGetUserOrganizations,
};

// Mock getKindeServerSession function
export const mockGetKindeServerSession = vi.fn(() => {
  return {
    getUser: mockGetUser,
    isAuthenticated: mockIsAuthenticated,
    getPermission: mockGetPermission,
    getPermissions: mockGetPermissions,
    getOrganization: mockGetOrganization,
    getToken: mockGetToken,
    getUserOrganizations: mockGetUserOrganizations,
  };
});

// Helper to setup authenticated state
export const setupAuthenticatedUser = (user: any = mockUser) => {
  mockIsAuthenticated.mockReturnValue(true);
  mockGetUser.mockResolvedValue(user);
};

// Helper to setup unauthenticated state
export const setupUnauthenticatedUser = () => {
  mockIsAuthenticated.mockReturnValue(false);
  mockGetUser.mockResolvedValue(null);
};

// Helper to setup auth error
export const setupAuthError = (error: Error) => {
  mockIsAuthenticated.mockImplementation(() => {
    throw error;
  });
};

// Reset all mocks
export const resetAuthMocks = () => {
  mockGetUser.mockReset();
  mockIsAuthenticated.mockReset();
  mockGetPermission.mockReset();
  mockGetPermissions.mockReset();
  mockGetOrganization.mockReset();
  mockGetToken.mockReset();
  mockGetUserOrganizations.mockReset();
  mockGetKindeServerSession.mockClear();
};