# Built with GyosJS

These four standalone applications explore different kinds of interaction with published GyosJS packages, plain HTML/CSS/JavaScript and Vite. Their source, tests and implementation notes are available to read and run locally. They are maintained reference projects, not claims of independent adoption or a general performance benchmark.

For a small interactive form, start with ordinary scope fields. These projects use separate domain modules where game rules, document history or an external loop benefit from independent ownership and testing. GyosJS connects that state to HTML; it does not need to own every computation.

| Project | User experience | GyosJS boundary to study |
| --- | --- | --- |
| [Bloomfall](https://github.com/hohphu8/bloomfall) | Match-three game with cascades, held-piece drag, undo and replay | Keyed tile identity, animation cancellation and reactive view projections |
| [Rivergate](https://github.com/hohphu8/rivergate) | Xiangqi against a basic bot or a friend on one device | Worker replies, stale-result guards, history and keyed pieces |
| [Sumboard](https://github.com/hohphu8/sumboard) | Cost planning with committed edits, totals and undo/redo | Immutable snapshots, computed views, keyed inputs and storage boundaries |
| [Mosswatch](https://github.com/hohphu8/mosswatch) | Canvas tower defense with building, upgrades and five waves | Plain simulation, a bounded frame loop and a small reactive UI bridge |

## Bloomfall: animation with stable DOM identity

Swap pieces on an 8 × 8 board, resolve cascades, undo a move or share a seeded replay. Mouse dragging previews a swap before release; touch and keyboard input use the same rules. Settled moves can be restored from browser storage.

The [engine](https://github.com/hohphu8/bloomfall/blob/main/src/engine.js) owns deterministic rules and replay validation. The [scope adapter](https://github.com/hohphu8/bloomfall/blob/main/src/main.js) projects animation frames, cancels superseded runs and binds stable piece IDs with `g-key`. A cancelled animation must not commit a later move. Direct pointer feedback need not rebuild the tile list on every pointer event.

Read the [findings and measured workload](https://github.com/hohphu8/bloomfall/blob/main/docs/GYOSJS-DOGFOOD.md). Node identity and mutation counts answer different questions: a moved node is not necessarily a newly created node. The historical timing samples are not a promise of 60 FPS on every device. There is no guaranteed offline cold start; saves are local to one browser origin.

## Rivergate: asynchronous work with a clear owner

Play Xiangqi, undo, inspect or replay history, and import/export a game. A basic bot searches in a module Worker so computation is separated from the board UI.

The [game controller](https://github.com/hohphu8/rivergate/blob/main/src/game.js) separates the live position from historical viewing. The [Worker client](https://github.com/hohphu8/rivergate/blob/main/src/bot-client.js) terminates obsolete work, checks request/position identity and validates a returned move against the current game. Reactive state alone cannot decide whether an asynchronous answer is still relevant. Piece IDs preserve DOM identity while pieces move.

See [validation](https://github.com/hohphu8/rivergate/blob/main/docs/VALIDATION.md) and [framework findings](https://github.com/hohphu8/rivergate/blob/main/docs/DOGFOOD.md). Rivergate uses documented casual repetition rules, not full tournament check/chase adjudication. Its bot is not a rated engine; there is no online multiplayer.

## Sumboard: edits as validated document changes

Edit quantities and VND prices, filter/sort rows, inspect totals, undo/redo and export a backup. Text being typed is a draft; a successful commit validates and replaces the document snapshot.

The [domain model](https://github.com/hohphu8/sumboard/blob/main/src/model.js) owns validation and history. The [reactive controller](https://github.com/hohphu8/sumboard/blob/main/src/sheet.js) derives totals and visible rows from signals. Stable row keys preserve inputs while sorting. File imports and browser storage have their own failure and stale-result handling.

Try the smaller [editor with undo/redo recipe](./editor-history). The [validation report](https://github.com/hohphu8/sumboard/blob/main/docs/VALIDATION.md) covers a 500-row workload, not an arbitrary spreadsheet capacity. There are no formulas or cloud sync. Browser storage is not transactional: use one editing tab and export JSON backups.

## Mosswatch: Canvas and HTML at different rates

Place three tower types, upgrade/sell them, pause to plan and defend a beacon through five waves. Canvas draws enemies and projectiles; HTML shows money, health, selection and controls.

The [engine](https://github.com/hohphu8/mosswatch/blob/main/src/engine.js) stays independent of GyosJS. Its [loop](https://github.com/hohphu8/mosswatch/blob/main/src/loop.js) advances fixed simulation steps and draws frames. The [scope](https://github.com/hohphu8/mosswatch/blob/main/src/main.js) publishes small changed snapshots at a slower check frequency and immediately after commands. Restart reuses the scheduler; unmount releases frames, listeners and observers.

Start with the [engine integration recipe](./external-engines), then read [validation and limits](https://github.com/hohphu8/mosswatch/blob/main/docs/VALIDATION.md). This is one authored map, not a general game engine. Matches are not saved. Automated browser checks do not replace physical touch-device usability testing.

## Run and explore

Each repository's README provides its pinned dependencies, Node requirement, local ports, build steps and tests. Start there; a source link is not a hosted game link. These four entries currently link to source only.

For a server-rendered example, [Inventory Desk](https://demo-inventory.gyosjs.dev) is the hosted Laravel reference app: filters, fragments, validated forms, redirects and MPA history. Read the [Boost form lifecycle guide](./boost-form-lifecycle) for that integration.

These applications led to concrete regressions and documentation improvements, including callable-signal binding in scopes and keyed-list placement work. They also exposed ordinary application bugs. Reproduce a suspected framework issue independently before proposing a new core API. See [scope ownership](./what-is-gscope) and [lifecycle](./layouts-scripts-lifecycle) when adapting the patterns.
