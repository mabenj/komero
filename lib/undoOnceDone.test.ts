import { describe, expect, test, vi } from "vitest";
import { undoOnceDone } from "./undoOnceDone";

/** A change sent to the server that hasn't been answered yet. */
function pending<R>() {
  let answer!: (result: R) => void;
  let fail!: (error: Error) => void;
  const change = new Promise<R>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { change, answer, fail };
}

describe("a toast shown before the server answers", () => {
  test("Undo after the change went through undoes it with what the server returned", async () => {
    const undo = vi.fn();
    const failed = vi.fn();

    await undoOnceDone(Promise.resolve({ entryId: "e1" }), undo, failed)();

    expect(undo).toHaveBeenCalledWith({ entryId: "e1" });
    expect(failed).not.toHaveBeenCalled();
  });

  test("Undo tapped before the server answers waits for the change, then undoes it", async () => {
    const { change, answer } = pending<string>();
    const undo = vi.fn();

    const undone = undoOnceDone(change, undo, () => {})();
    expect(undo).not.toHaveBeenCalled();
    answer("e1");
    await undone;

    expect(undo).toHaveBeenCalledWith("e1");
  });

  test("a change that fails takes the toast away, and its Undo does nothing", async () => {
    const { change, fail } = pending<string>();
    const undo = vi.fn();
    const failed = vi.fn();

    const undoTapped = undoOnceDone(change, undo, failed);
    const undone = undoTapped();
    fail(new Error("offline too long"));
    await undone;
    await undoTapped();

    expect(failed).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  test("a change the server has already answered (a scan) is undone with that answer", async () => {
    const undo = vi.fn();

    await undoOnceDone({ entryId: "e1", quantity: 2 }, undo, () => {})();

    expect(undo).toHaveBeenCalledWith({ entryId: "e1", quantity: 2 });
  });
});
