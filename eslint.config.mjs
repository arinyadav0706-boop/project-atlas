// ESLint 9 flat config (ADR-0039).
//
// Replaces `.eslintrc.json`: `eslint-config-next@16` requires ESLint 9, and
// ESLint 9 dropped eslintrc. `eslint-config-next` now ships flat configs
// directly, so no `FlatCompat` shim is needed.
//
// The architecture rules below are the point of this file. Everything else is
// stock; the `no-restricted-imports` block is how ADR-0004's portability and
// the Feature Architecture's repository boundary stop being conventions people
// remember and start being errors people cannot merge.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Flat config has no implicit ignores beyond node_modules, so the build
    // output has to be named or every generated chunk gets linted.
    ignores: [
      "**/node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/generated/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // Strict TypeScript, no `any` (CLAUDE.md rule 6).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Two React Compiler advisory rules that arrived with Next 16, kept as
      // warnings rather than errors — deliberately, and with an expiry.
      //
      // `refs` fires on dnd-kit's `setNodeRef`, which is the library's own
      // prescribed API; we cannot satisfy the rule without abandoning dnd-kit.
      // `set-state-in-effect` fires on the notification bell's poller and on
      // mount-time syncs from the DOM — subscribing to an external system is
      // what an effect is *for*, and it is the example the rule's own docs
      // allow.
      //
      // Some of the 14 are probably worth acting on. Working out which is a
      // behavioural change, and bundling behavioural changes into a framework
      // upgrade is how an upgrade becomes unreviewable (ADR-0039). Tracked as
      // UPG-1; this drops back to "error" when that is closed.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",

      // Feature Architecture §4 + ADR-0036, enforced rather than remembered.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Import Prisma only inside *.repository.ts files (see docs/01_Architecture/02_Feature_Architecture.md).",
            },
            {
              name: "echarts",
              message:
                "Import ECharts only inside src/shared/components/charts/echarts-core.ts (ADR-0036). A direct import pulls the whole library into the bundle.",
            },
          ],
          patterns: [
            {
              group: ["echarts/*"],
              message:
                "Import ECharts only inside src/shared/components/charts/echarts-core.ts (ADR-0036).",
            },
          ],
        },
      ],
    },
  },

  // The repository layer is the one place Prisma belongs, plus the seed and the
  // client singleton itself.
  {
    files: [
      "**/*.repository.ts",
      "prisma/seed.ts",
      "prisma/verus/*.ts",
      "src/shared/lib/db.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // The single module allowed to pull ECharts in.
  {
    files: ["src/shared/components/charts/echarts-core.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Prettier last, so formatting rules from the presets above are switched off
  // rather than fighting the formatter.
  prettier,
);
