import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["dist/**", "client/dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        URL: "readonly",
        RequestInit: "readonly",
        document: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
