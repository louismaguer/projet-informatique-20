import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "fhevmTemp/**",
      "tmp/**",
      ".coverage_artifacts/**",
      ".coverage_cache/**",
      ".coverage_contracts/**",
      "artifacts/**",
      "build/**",
      "cache/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "types/**",
      // vendor Zama — pré-bundlé, pas du code source
      "frontend/bundle/**",
      "frontend/mock-fhevm.js",
      "*.env",
      "*.log",
      "coverage.json",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Les scripts .js du projet utilisent CommonJS (require) — Zama template.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // chai utilise des expression statements (expect(...) sans ; final)
      // pour ses assertions. Le désactiver évite ~6 faux positifs.
      "@typescript-eslint/no-unused-expressions": "off",
      // try { ... } catch {} (catch vide) est un pattern courant dans
      // les tests : on teste qu'une opération revert sans se soucier
      // du message d'erreur exact.
      "no-empty": "off",
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreIIFE: true, ignoreVoid: true },
      ],
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "_", varsIgnorePattern: "_" },
      ],
    },
  }
);
