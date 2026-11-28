import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "native/target/**",
      "extension/icons/*.png",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["extension/src/**/*.{ts,tsx}", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        browser: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js", "vitest.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["sandbox/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: "readonly",
        Blob: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);