// Lint config focused on catching real breakage during the modularization
// refactor — above all `no-undef`, which flags a component/helper that's used
// but never imported (Vite would build it fine, then crash at runtime).
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  settings: { react: { version: "detect" } },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  rules: {
    // The safety net for extraction: undefined identifiers are hard errors.
    "no-undef": "error",
    "react/prop-types": "off", // this codebase doesn't use prop-types
    "react/no-unescaped-entities": "off", // copy uses apostrophes/quotes freely
    // Unused vars are a warning (helps spot dead code left after a move) but
    // never block work; ignore intentionally-unused capitalized args.
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist/", "node_modules/"],
};
