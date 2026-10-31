import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' で GitHub Pages のサブパスでもそのまま動く
export default defineConfig({
  base: './',
  plugins: [react()],
  // 用語データ（JSON）を同梱するのでバンドルが大きめ（gzip 後 約240KB）
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ['tests/**/*.test.ts'] },
});
