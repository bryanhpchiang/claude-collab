import { mergeConfig, defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      globals: true,
      include: ["tests/**/*.vitest.{ts,tsx}"],
      pool: "threads",
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
      setupFiles: ["./src/web/test/setup.ts"],
    },
  }),
);
