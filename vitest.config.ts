import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
    exclude: [
      '.dmux/**',
      'node_modules/**',
      'dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/server/embedded-assets.ts', // Generated file
        'src/utils/generated-agents-doc.ts', // Generated file
        'node_modules',
        'dist',
      ],
      all: true,
      lines: 60,
      functions: 60,
      branches: 60,
      statements: 60,
    },
  },
});
