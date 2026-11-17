/// <reference types="vitest/config" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // относительные пути: собранное приложение можно открыть из любой папки
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
