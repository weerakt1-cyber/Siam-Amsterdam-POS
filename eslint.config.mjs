import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The new experimental React-Compiler rules (react-hooks v6) flag many
      // standard, correct patterns as build-blocking errors in this hand-written
      // (non-compiler) codebase:
      //   - set-state-in-effect: the canonical "fetch on mount" effect, where
      //     setState happens after an await, not synchronously.
      //   - immutability: mutating a ref (ref.current = x) or setting up a DOM
      //     element you just created (script.src = ...) — both endorsed by React.
      //   - purity: calling Date.now()/new Date() inside an async event handler.
      // None of these are bugs here, so treat them as hints, not errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
