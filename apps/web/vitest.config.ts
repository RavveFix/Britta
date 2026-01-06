import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        root: resolve(__dirname),
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        globals: true,
        passWithNoTests: true
    }
});
