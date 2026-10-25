import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environmentOptions: { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
  },
});
