import { useSyncExternalStore } from "react";

// False during server rendering and hydration, true afterwards — for labels
// that depend on the viewer's own clock or timezone (a deadline, "due in 2
// days"), which the server cannot know and must not guess.
const subscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
