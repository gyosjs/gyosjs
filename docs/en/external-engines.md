# Integrating an engine or external library

[Mosswatch](https://github.com/hohphu8/mosswatch) runs a tower-defense simulation and Canvas renderer beside GyosJS controls. The engine owns moving objects; GyosJS owns the UI projection. This recipe reduces that boundary to a marker moving across a Canvas over ten simulation seconds.

Use this structure when a game engine, chart, editor or media library already owns its internal state. A simple form can still start with `Gyos.scope('Profile', { name: '' })`: ordinary scope fields are already reactive. There is no requirement to extract a controller or use explicit signals everywhere.

## Run the example

In a Vite vanilla JavaScript project, install `gyosjs@0.5.5`. Put the following markup in `index.html` and the JavaScript in `src/motion.js`. This uses the manual CSP entry: register the scope, then call `Gyos.mountAll()`. Do not also load the auto build.

```html
<section g-scope="Motion">
  <canvas g-ref="canvas" width="360" height="80"
    style="max-width: 100%; height: auto;"
    aria-label="Marker moving along a ten-second track">
    The elapsed time is also shown below.
  </canvas>
  <p><output>{elapsed()}</output> / 10 seconds — {status()}</p>
  <button @click="start()" :disabled="state().running || !!error()">Start</button>
  <button @click="pause()" :disabled="!state().running">Pause</button>
  <button @click="reset()" :disabled="!!error()">Reset</button>
  <p role="alert">{error()}</p>
</section>
<script type="module" src="/src/motion.js"></script>
```

```js
import Gyos from 'gyosjs/csp';

class MotionEngine {
  elapsed = 0;
  running = false;
  step(seconds) {
    if (!this.running) return;
    this.elapsed = Math.min(10, this.elapsed + seconds);
    if (this.elapsed >= 10) this.running = false;
  }
  snapshot() {
    return Object.freeze({ seconds: Math.floor(this.elapsed), running: this.running });
  }
}

Gyos.scope('Motion', () => {
  const engine = new MotionEngine();
  const state = Gyos.signal(engine.snapshot());
  const error = Gyos.signal('');
  const elapsed = Gyos.computed(() => state().seconds);
  const status = Gyos.computed(() => state().running ? 'Running' : 'Stopped');
  const lifetime = new AbortController();
  let context = null, frame = null, previous = null, lastCheck = 0, alive = true;

  function publish() {
    const next = engine.snapshot(), current = state.peek;
    if (next.seconds !== current.seconds || next.running !== current.running) state(next);
  }
  function draw() {
    if (!context) return;
    context.clearRect(0, 0, 360, 80);
    context.fillStyle = '#d5e4db';
    context.fillRect(10, 36, 340, 8);
    context.fillStyle = '#185c3b';
    context.fillRect(10 + engine.elapsed / 10 * 320, 24, 20, 32);
  }
  function schedule() {
    if (alive && engine.running && frame === null) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = null;
    if (!alive || !engine.running) return;
    const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1);
    previous = now;
    engine.step(delta);
    draw();
    // Check a small UI snapshot at most once per 100 ms while moving.
    // Completion, like a command, publishes immediately.
    if (now - lastCheck >= 100 || !engine.running) {
      lastCheck = now;
      publish();
    }
    schedule();
  }
  function cancelFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previous = null;
  }
  function start() {
    if (!alive || !context || document.hidden || engine.running) return;
    if (engine.elapsed >= 10) engine.elapsed = 0;
    engine.running = true;
    previous = null;
    lastCheck = performance.now();
    publish();
    draw();
    schedule();
  }
  function pause() {
    if (!alive) return;
    engine.running = false;
    cancelFrame();
    publish();
    draw();
  }
  function reset() {
    if (!alive) return;
    engine.elapsed = 0;
    pause();
  }
  return {
    state, elapsed, status, error, start, pause, reset,
    onMount() {
      context = this.$refs.canvas.getContext('2d');
      if (!context) {
        error('Canvas is unavailable in this browser.');
        return;
      }
      draw();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause();
      }, { signal: lifetime.signal });
    },
    onUnmount() {
      alive = false;
      engine.running = false;
      cancelFrame();
      lifetime.abort();
      context = null;
    }
  };
});
Gyos.mountAll();
```

Start moves the marker; the text shows whole elapsed seconds. Pause freezes both, Reset returns to zero, and Start after completion replays. Leaving the tab pauses; returning requires Start. Duplicate the section, keeping only one script tag, for two independent instances.

## Three responsibilities, two update rates

1. **Engine:** `elapsed` changes every simulation step in plain JavaScript. Canvas reads it directly. GyosJS does not observe the engine object or intercept its mutations.
2. **Bridge:** `publish()` copies only whole seconds and running status into a frozen snapshot. A frame checks for changes at most once per 100 ms; unchanged values cause no signal write. Start, pause, reset and completion publish immediately. That means a maximum check frequency during motion, not ten DOM updates per second. These writes also do not promise a synchronous browser paint.
3. **Template:** `computed` derives labels from the snapshot. Native controls stay in HTML; Canvas owns the marker. Avoid giving both the external library and GyosJS ownership of the same DOM children. For a DOM-based widget, dedicate a `g-ignore` container to the library. Put a ref on its outer wrapper, then find the ignored container from that ref in `onMount`: directives inside the ignored boundary are not initialized.

The frame loop requests at most one pending callback. Pausing cancels it; a stopped scene is drawn only when a command changes it. The example caps a frame gap at 100 ms and discards excess time. It is a small variable-step animation, **not** a deterministic physics clock or wall-clock timer. A ten-second run may take longer on a slow device. For an actual countdown, derive elapsed time from a timestamp instead.

## Own the lifetime, not just the state

The factory gives each mount its own engine, frame handle and AbortController. `onMount` accesses refs after the DOM exists. `onUnmount` stops scheduling and removes the visibility listener. Before manually removing a mounted root, call `Gyos.cleanup(root)`; normal Gyos-managed removal already performs cleanup. A fresh mount needs a fresh factory instance, not an already aborted controller.

The same boundary applies beyond games: subscribe to a chart/editor's change events, copy the fields the UI needs, and unsubscribe or destroy the instance at unmount. Prefer events over a frame loop when the library emits them. Keep a DOM widget in its own container. For asynchronous work, cancellation and a request/generation check are separate protections: a late result must be rejected after reset, a newer request or cleanup. Rivergate's [Worker client](https://github.com/hohphu8/rivergate/blob/main/src/bot-client.js) demonstrates that extra boundary.

## From this recipe to Mosswatch

- [Engine](https://github.com/hohphu8/mosswatch/blob/main/src/engine.js): combat and economy without GyosJS or Canvas; moving enemies and projectiles stay plain.
- [Loop](https://github.com/hohphu8/mosswatch/blob/main/src/loop.js): fixed 1/60-second steps, 1×/2×/3× speed, bounded catch-up and drawing on demand while stopped. Unlike the small example, the game needs a fixed simulation step.
- [Scope adapter](https://github.com/hohphu8/mosswatch/blob/main/src/main.js): small snapshots, computed tower controls, immediate command publication, visibility pause and cleanup of listeners, frames and observers.
- [Renderer](https://github.com/hohphu8/mosswatch/blob/main/src/renderer.js): cached Canvas artwork, scaled hit testing and reduced-motion behavior.
- [Validation and limits](https://github.com/hohphu8/mosswatch/blob/main/docs/VALIDATION.md): gameplay, repeated restart/remount and production checks. A tested local workload is not a universal FPS or memory guarantee.

Neither this recipe nor Mosswatch saves an in-progress run. Neither requires a new GyosJS API. Choose snapshot size and update frequency from your UI's needs; profile a real workload before making every coordinate reactive or adding a framework-level engine abstraction.

Continue with [Built with GyosJS](./built-with-gyosjs), [editor history](./editor-history), [reactivity](./reactivity-signals), or [lifecycle](./layouts-scripts-lifecycle).
