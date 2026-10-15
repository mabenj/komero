/**
 * The Undo for a toast shown at the tap, before the server has answered the
 * `change` it reports. If the change fails, `onFailed` runs, to take the toast
 * away (Convex has already rolled back the change on screen). Undo waits for
 * the change and undoes it with what the server returned, or does nothing if
 * it failed, since then nothing changed.
 */
export function undoOnceDone<R>(change: R | Promise<R>, undo: (done: R) => unknown, onFailed: () => void) {
  const done = Promise.resolve(change);
  done.catch(onFailed);
  return async () => {
    const result = await done.then(
      (value) => ({ value }),
      () => null,
    );
    if (result) await undo(result.value);
  };
}
