import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore Vite build output to keep lint fast in CI.
    "dist/**",
  ]),
  {
    rules: {
      "@next/next/no-img-element": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);

export default eslintConfig;
