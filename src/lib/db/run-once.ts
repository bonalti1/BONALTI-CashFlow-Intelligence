// Share one in-flight schema task per process. A failure clears the slot so the
// next caller can retry; a success is reused for the life of the process.
export function runOnce(task: () => Promise<void>) {
  let pending: Promise<void> | null = null;

  return () => {
    pending ??= task().catch((error) => {
      pending = null;
      throw error;
    });

    return pending;
  };
}
