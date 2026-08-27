import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Legal/marketing copy pages — allow apostrophes and quotes in JSX text
      'react/no-unescaped-entities': 'warn',
      // Legacy components; tracked for cleanup without blocking CI deploys
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "r3f-animated-book-slider-final-main/**",
  ]),
]);

export default eslintConfig;
