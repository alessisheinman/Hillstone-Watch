/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works at any GitHub Pages path (/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Run tests in a non-New-York zone so the PC's own clock zone can never leak into the maths.
    env: { TZ: 'Asia/Tokyo' },
  },
});
