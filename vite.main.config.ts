import { defineConfig } from "vite";
import commonjs from "@rollup/plugin-commonjs";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    commonjs({
      // 불필요시 dynamicRequireTargets 제거하거나 최소화
      ignoreDynamicRequires: false,
    }),
  ],
  build: {
    // 디버깅 편의를 위해 소스맵 활성화
    sourcemap: true,
    minify: false,
    //
    rollupOptions: {
      external: [
        // selenium-webdriver 전역 번들 제외
        "selenium-webdriver",
        "selenium-webdriver/chrome",
        // eslint 관련 모듈 제외
        "eslint-plugin-no-only-tests",
        "eslint-plugin-prettier",
        "eslint-plugin-mocha",
        "eslint-plugin-n",
      ],
    },
  },
});
