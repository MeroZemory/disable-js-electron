import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    // 디버깅 편의를 위해 소스맵 활성화
    sourcemap: true,
    minify: false,
  },
});
