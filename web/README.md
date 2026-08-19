# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Seed recipes

`public/seeds/` holds curated recipe collections — currently the 50 most common
Romanian, Filipino and Danish home dishes — kept in the repo so that what a model
wrote is reviewable like code. Every recipe is tagged `AI-written` and carries an
`ai://<model>` source, which the app surfaces as a badge.

`src/lib/seeds.test.ts` holds each file to the API's shape and the closed tag
vocabulary from `src/lib/recipeTags.ts`, so `npm test` catches a malformed seed
before it becomes a broken recipe in somebody's household.

To push the seeds into a household (idempotent — existing names are skipped):

```sh
node scripts/seed-recipes.mjs --household 1 --token <access token>
```

The token comes from a logged-in browser session (localStorage key
`kitchenowl.access`); the script deliberately takes no passwords.
