// The rules for swiping a Koti row left for Need More (spec #19 "Swipe for
// Need More"), kept apart from the row so they can be tested without a browser.

/** Where the pointer was (px) and when (ms). */
export type PointerSample = { x: number; y: number; t: number };

export type Swipe = {
  /** Whether the gesture is a swipe of the row or a scroll of the page; decided once. */
  lock: "undecided" | "swipe" | "scroll";
  /** How far the row is moved (px, negative is left). */
  offset: number;
  /** Whether letting go now does Need More. */
  commits: boolean;
  /** The finger's horizontal speed (px/s, negative is left), for springing the row back. */
  velocity: number;
};

// How far the finger moves before the gesture is decided.
const SLOP = 10;
// How far the row follows the finger 1:1 before it starts to resist.
const LIMIT = 120;
// How far left the row would come to rest for letting go to do Need More.
const THRESHOLD = 80;
// How far past the limit the row can ever be pulled, however far the finger goes.
const STRETCH = 60;
const VELOCITY_WINDOW_MS = 100;
// How much of its speed a released row would keep each millisecond, as in UIScrollView.
const DECELERATION = 0.998;

/** How far left the row moves for the finger's distance: 1:1 up to the limit, then rubber-banded. */
function band(distance: number) {
  if (distance <= LIMIT) return distance;
  const past = distance - LIMIT;
  return LIMIT + STRETCH * (1 - 1 / (1 + (0.55 * past) / STRETCH));
}

/** The finger's horizontal speed in px/ms over its last 100 ms. */
function speedOf(samples: PointerSample[]) {
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS)!;
  return last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
}

/**
 * Reads a drag from its pointer samples so far, starting with the one where
 * the finger came down. `from` is where the row was when it was grabbed, if it
 * was still springing back from an earlier swipe.
 */
export function readSwipe(samples: PointerSample[], from = 0): Swipe {
  const [start] = samples;
  const last = samples[samples.length - 1];
  const decided = samples.find((s) => Math.hypot(s.x - start.x, s.y - start.y) >= SLOP);
  if (!decided) return { lock: "undecided", offset: from, commits: false, velocity: 0 };

  const dx = decided.x - start.x;
  const dy = decided.y - start.y;
  if (dx >= 0 || Math.abs(dy) >= Math.abs(dx)) return { lock: "scroll", offset: 0, commits: false, velocity: 0 };

  const distance = Math.max(0, start.x - last.x - from);
  const speed = speedOf(samples);
  // Where the row would come to rest if it kept gliding after letting go.
  const projected = distance - (speed * DECELERATION) / (1 - DECELERATION);
  return {
    lock: "swipe",
    offset: distance === 0 ? 0 : -band(distance),
    commits: speed <= 0 && projected >= THRESHOLD,
    velocity: speed * 1000,
  };
}
