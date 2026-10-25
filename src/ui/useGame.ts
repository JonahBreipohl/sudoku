import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { GameSnapshot, GameStore } from "../state/store";

const GameContext = createContext<GameStore | null>(null);

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return createElement(GameContext.Provider, { value: store }, children);
}

/** Current game snapshot plus the store's dispatch; components never mutate state. */
export function useGame(): { game: GameSnapshot; dispatch: GameStore["dispatch"] } {
  const store = useContext(GameContext);
  if (!store) throw new Error("useGame needs a GameProvider");
  const game = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { game, dispatch: store.dispatch };
}
