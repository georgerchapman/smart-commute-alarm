const isDev = __DEV__;

// Category tags make it easy to grep specific subsystems in the Expo Go terminal:
//   grep "\[SW:UI\]"      → user interactions
//   grep "\[SW:ALARM\]"   → alarm state transitions
//   grep "\[SW:TRAFFIC\]" → traffic API calls and decisions
//   grep "\[SW:NOTIF\]"   → notification scheduling / cancellation
//   grep "\[SW:BG\]"      → background task execution
//   grep "\[SW:INFO\]"    → general info
//   grep "\[SW:WARN\]"    → warnings
//   grep "\[SW:ERR\]"     → errors

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:INFO]  ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[SW:WARN]  ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (isDev) console.error(`[SW:ERR]   ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) console.debug(`[SW:DEBUG] ${message}`, ...args);
  },
  ui: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:UI]    ${message}`, ...args);
  },
  alarm: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:ALARM] ${message}`, ...args);
  },
  traffic: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:TRAFFIC] ${message}`, ...args);
  },
  notif: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:NOTIF] ${message}`, ...args);
  },
  bg: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[SW:BG]    ${message}`, ...args);
  },
};
