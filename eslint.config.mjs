import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/"],
  },
  {
    rules: {
      // Allow underscore-prefixed unused vars (common pattern for intentionally unused params)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow declaration merging for type-safe event emitters
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
    },
  },
);
