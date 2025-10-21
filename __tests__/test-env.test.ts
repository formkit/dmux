import { describe, it, expect } from 'vitest';

describe('Environment check', () => {
  it('should detect test environment', () => {
    console.log('VITEST env:', process.env.VITEST);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('typeof VITEST:', typeof process.env.VITEST);
    
    const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                             process.env.VITEST === 'true' || 
                             typeof process.env.VITEST !== 'undefined';
    
    expect(isTestEnvironment).toBe(true);
  });
});