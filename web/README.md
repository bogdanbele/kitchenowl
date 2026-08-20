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

Note that nothing in the app reads these files at runtime — they are input for
the seeder below, not a data source. Adding a photo to a seed file changes
nothing until the seeder is run; rebuilding the app will not show it.

To push the seeds into a household, from the machine running the server:

```sh
npm run seed:dry
```

That reports what it would do and changes nothing. Then:

```sh
npm run seed
```

Both prompt for an access token without echoing it, default to household 1 and
`http://localhost:8088`, and pass `--photos`. Add `--household`/`--server` after
a `--` if yours differ, e.g. `npm run seed -- --household 2`.

The run is idempotent: a recipe whose name is already present is skipped, and
`--photos` only fills in a picture where there is none — it never replaces one
somebody chose. Get the token from a logged-in browser tab's devtools console:

```js
localStorage.getItem("kitchenowl.access")
```

Access tokens last 15 minutes, so fetch it when you are ready to run. Prefer the
prompt to `--token`: a credential on the command line is visible in `ps` and
kept in the shell's history file. The script takes no passwords in any case.
