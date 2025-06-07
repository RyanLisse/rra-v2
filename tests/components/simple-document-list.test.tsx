import { describe, it, expect, vi } from 'vitest';

// Simple test to check if vitest is working
describe('Simple DocumentList Test', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with mocks', () => {
    const mockFn = vi.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});