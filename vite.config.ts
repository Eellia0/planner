/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // относительные пути: собранное приложение можно открыть из любой папки
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
