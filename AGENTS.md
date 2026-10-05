# AGENTS.md

## Project overview

el-bot is a TypeScript QQ bot workspace. The monorepo conventions follow
YunYouJun/starter-monorepo, while the existing bot runtime is still migrating
from Mirai to NapCat and the official QQ platform.

## Commands

```bash
pnpm install
pnpm build
pnpm dev:lib
pnpm test
pnpm test:cli
pnpm lint
pnpm typecheck
pnpm typecheck:packages
pnpm docs:build
```

- `build` runs declared build scripts under `packages/*` and `apps/*`. `qq-sdk`, `@el-bot/codex` and
  `@el-bot/create-app` use tsdown. `el-bot` builds its framework, Nest adapter and CLI with tsdown;
  TypeScript source remains only for the legacy launcher and plugin loader.
- `dev:lib` watches only `qq-sdk` and `@el-bot/create-app`; it does not launch a bot.
- `typecheck` scans the full repository, including legacy plugins and examples.
  Keep this check visible; do not suppress existing errors to make CI pass.
- `typecheck:packages` runs the checks declared by independently built packages.
- `demo` and examples require the user's bot configuration; do not start them as tests.

## Conventions

- Use pnpm and `catalog:` for shared external versions in `pnpm-workspace.yaml`.
- Use `workspace:*` for internal dependencies and declare runtime dependencies
  in the package that imports them.
- New code uses ESM and strict TypeScript. New libraries use `src/`, a package
  tsconfig extending `tsconfig.base.json`, tsdown, and generated declarations.
- Put deployable applications in `apps/*`; retain existing demo/example paths
  until their runtime migration is complete.
- `packages/@el-bot/plugin-niubi` is an archived duplicate of `plugins/niubi`;
  do not register both as workspace packages.
- Preserve the full-repository lint and typecheck coverage.
- Use English for code/comments and Simplified Chinese for documentation.
- Use Conventional Commits.

## Codex integration direction

See `docs/development/codex-remote.md` for setup and protocol references.
`packages/el-bot` owns the unified `el-bot` / `el` binaries. The private `apps/qq-codex` module registers `el-bot codex` (init/check/start/paths) and connects official QQ C2C events to `packages/codex` using local
app-server stdio. Keep owner checks, persistent dedup, single-task admission,
project allowlists, explicit approvals and bounded passive replies intact.
Never start real bot connections as tests without configured credentials.
`pnpm qq:codex --check` checks local Codex login without executing a model turn.
Keep credentials and runtime state out of Git.

## Publishing

- Release only `el-bot` through `.github/workflows/release.yml` using npm OIDC.
- Build and smoke-test the exact tarball before the publish job; npm must not publish raw catalog/workspace manifests.
- Verify installed framework/Nest imports and CLI JSON output, including Node.js 22.18.0 compatibility.
- The Git tag must equal `v<packages/el-bot/package.json version>` and that version must not already exist on npm.
- Prereleases use the `next` npm tag, stable releases use `latest`.
- `pnpm release` bumps, commits, tags and pushes; do not run it as a validation command.
- Local dry runs do not prove the npm Trusted Publisher grant. See `docs/development/monorepo.md`.
