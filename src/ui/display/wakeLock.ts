/** Minimal shapes of the Screen Wake Lock API, so tests can mock it without a DOM. */
export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}
export interface WakeLockApi {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}
export interface VisibilityDoc {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export function wakeLockSupported(nav: { wakeLock?: WakeLockApi } | undefined): boolean {
  return !!nav && typeof nav.wakeLock?.request === "function";
}

export interface WakeLockController {
  /** Turn on: acquire now and keep re-acquiring after the page becomes visible. Resolves to whether held. */
  enable(): Promise<boolean>;
  disable(): Promise<void>;
  isEnabled(): boolean;
  dispose(): void;
}

/**
 * The browser drops a wake lock whenever the page is hidden, so while the user wants it on we
 * re-request on every return to visible. `onChange` reports whether a lock is actually held.
 */
export function createWakeLock(
  api: WakeLockApi,
  doc: VisibilityDoc,
  onChange: (held: boolean) => void = () => {},
): WakeLockController {
  let wanted = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let pending: Promise<boolean> | null = null;

  const acquire = (): Promise<boolean> => {
    if (sentinel) return Promise.resolve(true);
    if (pending) return pending;
    pending = api
      .request("screen")
      .then((s) => {
        if (!wanted) {
          void s.release().catch(() => {});
          return false;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) {
            sentinel = null;
            onChange(false);
          }
        });
        onChange(true);
        return true;
      })
      .catch(() => false) // denied (low battery, policy): stay off quietly
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  const onVisibility = () => {
    if (wanted && doc.visibilityState === "visible") void acquire();
  };
  doc.addEventListener("visibilitychange", onVisibility);

  return {
    async enable() {
      wanted = true;
      if (doc.visibilityState !== "visible") return false; // acquired on next visible
      return acquire();
    },
    async disable() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      onChange(false);
      if (s) await s.release().catch(() => {});
    },
    isEnabled: () => wanted,
    dispose() {
      wanted = false;
      doc.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => {});
    },
  };
}

export function fullscreenSupported(doc: { fullscreenEnabled?: boolean } | undefined): boolean {
  return !!doc && doc.fullscreenEnabled === true;
}
