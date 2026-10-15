import { describe, expect, test } from "vitest";
import { type PointerSample, readSwipe } from "./swipe";

/** A drag from (0, 0) to (dx, dy) at a steady speed over `ms` milliseconds, sampled every 16 ms. */
function drag(dx: number, dy: number, ms: number): PointerSample[] {
  const steps = Math.max(1, Math.round(ms / 16));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: (dx * i) / steps,
    y: (dy * i) / steps,
    t: (ms * i) / steps,
  }));
}

describe("Telling a swipe from a scroll", () => {
  test("is undecided while the finger has barely moved", () => {
    const swipe = readSwipe(drag(-6, 4, 100));
    expect(swipe.lock).toBe("undecided");
    expect(swipe.offset).toBe(0);
  });

  test("locks to a swipe when the finger moves mostly left, and the row follows it 1:1", () => {
    const swipe = readSwipe(drag(-50, 12, 200));
    expect(swipe.lock).toBe("swipe");
    expect(swipe.offset).toBe(-50);
  });

  test("locks to a scroll when the finger moves mostly up or down", () => {
    const swipe = readSwipe(drag(-8, 40, 200));
    expect(swipe.lock).toBe("scroll");
    expect(swipe.offset).toBe(0);
  });

  test("stays a scroll when the finger then moves sideways", () => {
    const scroll = drag(-3, 20, 100);
    const sideways = drag(-120, 0, 200).map((s) => ({ x: s.x - 3, y: 20, t: s.t + 100 }));
    const swipe = readSwipe([...scroll, ...sideways.slice(1)]);
    expect(swipe.lock).toBe("scroll");
    expect(swipe.offset).toBe(0);
    expect(swipe.commits).toBe(false);
  });
});

describe("Dragging past the limit", () => {
  test("keeps moving the row, but more and more slowly", () => {
    const offsets = [120, 160, 200, 240, 280].map((distance) => -readSwipe(drag(-distance, 0, 600)).offset);
    expect(offsets[0]).toBe(120);
    const steps = offsets.slice(1).map((offset, i) => offset - offsets[i]);
    for (const [i, step] of steps.entries()) {
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(i === 0 ? 40 : steps[i - 1]);
    }
  });
});

describe("Letting go", () => {
  test("does Need More after a long, slow drag", () => {
    expect(readSwipe(drag(-110, 0, 1500)).commits).toBe(true);
  });

  test("doesn't do Need More after a short, slow drag", () => {
    expect(readSwipe(drag(-50, 0, 1000)).commits).toBe(false);
  });

  test("does Need More after a short, quick flick", () => {
    expect(readSwipe(drag(-40, 0, 64)).commits).toBe(true);
  });

  test("never does Need More after a flick to the right", () => {
    const swipe = readSwipe(drag(120, 0, 64));
    expect(swipe.offset).toBe(0);
    expect(swipe.commits).toBe(false);
  });

  test("never does Need More when let go while moving back to the right", () => {
    const left = drag(-150, 0, 600);
    const back = drag(10, 0, 400).map((s) => ({ x: s.x - 150, y: 0, t: s.t + 600 }));
    expect(readSwipe([...left, ...back.slice(1)]).commits).toBe(false);
  });

  test("tells the speed the finger let go at, so the row springs back at it", () => {
    expect(readSwipe(drag(-40, 0, 64)).velocity).toBeCloseTo(-625);
    expect(readSwipe(drag(-50, 0, 1000)).velocity).toBeCloseTo(-50);
  });
});

describe("Catching a row while it springs back", () => {
  test("holds it where it was until the gesture is decided", () => {
    expect(readSwipe(drag(-4, 0, 50), -50).offset).toBe(-50);
  });

  test("carries on from where it was, following the finger 1:1", () => {
    expect(readSwipe(drag(-30, 0, 300), -50).offset).toBe(-80);
  });
});
