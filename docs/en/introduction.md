# Introduction to GyosJS

GyosJS is a small JavaScript library for developers who want interactive, server-rendered pages without turning the whole project into a SPA.

It focuses on two things:

- reactive HTML for local UI state
- boosted MPA navigation for links and forms

That combination makes GyosJS useful when Alpine-style authoring feels right, but you also want smoother page-to-page navigation similar to Turbo or Hotwire.

## What Problem It Solves

Traditional MPA applications are simple to reason about, simple to deploy, and work naturally with backend-rendered HTML. The pain usually appears later:

- full-page reloads on every navigation
- scroll position jumps
- interactive widgets reset
- scripts and UI state need to be reattached after every page load
- simple interface behavior still turns into more JavaScript than expected

On the other side, a full SPA often asks for more architecture, tooling, hydration, and client-side ownership than many projects actually need.

GyosJS sits between those two extremes. It keeps the MPA model intact, then adds a small client runtime to make the UI feel more alive.

## What GyosJS Gives You

- `g-scope` for local reactive state close to HTML
- bindings, directives, loops, and conditional rendering
- signals and effects when you want explicit reactive primitives
- an attribute-driven router for MPA boost
- persist islands for players, timers, or other UI that should survive navigation
- optional browser auto-init build for no-build setups

## Who It Is For

GyosJS is designed for developers building:

- PHP, Laravel, Rails, MVC, and other server-rendered apps
- content-heavy sites with interactive sections
- admin dashboards and internal tools
- legacy MPAs that need better UX without a rewrite
- projects where HTML should stay readable and central

## What It Is Not Trying To Be

GyosJS is not a full SPA framework. It does not try to replace React, Vue, or Angular for applications that genuinely need large client-side architectures.

If your app depends on deep client-side routing, large client-owned state graphs, or component compilation as the primary model, you will probably want a different tool.

## Design Direction

The project is guided by a few practical rules:

- MPA first, not SPA disguised as MPA
- HTML first, not component syntax first
- progressive enhancement over rewrites
- readable markup over abstraction-heavy patterns
- enough reactivity to solve real UI problems, not every possible problem

## Recommended Next Reading

- [Getting Started](./getting-started.md)
- [What Is G-Scope](./what-is-gscope.md)
- [Reactivity and Signals](./reactivity-signals.md)
- [Template Syntax](./template-syntax.md)
- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
