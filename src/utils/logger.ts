const isDev = __DEV__;

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SyncWake] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[SyncWake] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (isDev) console.error(`[SyncWake] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) console.debug(`[SyncWake] ${message}`, ...args);
  },
};
