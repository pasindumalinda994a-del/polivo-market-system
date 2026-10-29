import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import nextVitals from "eslint-config-next/core-web-vitals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * @param {import("eslint").Linter.Config[]} configs
 * @param {string[]} files
 */
function scopedTo(configs, files) {
  return configs.map((config) => ({
    ...config,
    files,
  }));
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/release/**",
      "**/*.min.js",
      "pnpm-lock.yaml",
      "**/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  ...scopedTo(nextVitals, ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"]).map((config) => ({
    ...config,
    settings: {
      ...config.settings,
      next: {
        ...config.settings?.next,
        rootDir: "apps/web/",
      },
    },
  })),
  {
    files: ["apps/desktop/src/renderer/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  {
    files: [
      "apps/desktop/src/main/**/*.{js,ts}",
      "apps/desktop/src/preload/**/*.{js,ts}",
      "apps/desktop/electron.vite.config.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/stall-service/**/*.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  eslintConfigPrettier,
);
