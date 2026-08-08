# Contributing to GyosJS

GyosJS accepts contributions to the runtime, examples, tests, and documentation. The public documentation in `docs/en` is written for library users, so contributor-facing process stays here at the repo root.

Maintainers should also follow `MAINTAINING.md` for triage, compatibility, cross-repository coordination, and release gates.

## Setup

```bash
npm install
npm run build
npm run test
npm run typecheck
```

## What To Keep In Mind

- Preserve the HTML-first, MPA-first design of the project.
- Treat `src/core/router/router.ts` and the router examples as behavioral source of truth when changing navigation behavior.
- Keep examples realistic. Several files in `examples` are also used as development-time behavior checks.
- Avoid undocumented runtime changes. If public behavior changes, update the matching docs in `docs/en`.

## Documentation Work

- User-facing docs live in `docs/en`.
- Write for developers adopting GyosJS, not only for contributors reading source code.
- Prefer practical guidance: what problem a feature solves, when to use it, and the constraints that matter in real projects.

## Pull Requests

- Keep changes scoped.
- Include tests when behavior changes.
- Mention docs updates when public behavior, API shape, or packaging changes.
- If a router change affects partial swaps, snapshots, scripts, or `g-persist`, call that out explicitly in the PR description.
