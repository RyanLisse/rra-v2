import { describe, it, expect, vi } from 'vitest';

describe('Test Setup Check', () => {
  it('should have vi.mock available', () => {
    expect(vi).toBeDefined();
    expect(vi.mock).toBeDefined();
    expect(typeof vi.mock).toBe('function');
  });

  it('should allow mocking with vi.mock', () => {
    // Test inline mock
    const mockFn = vi.fn();
    mockFn.mockReturnValue('mocked');
    
    expect(mockFn()).toBe('mocked');
    expect(mockFn).toHaveBeenCalled();
  });
});