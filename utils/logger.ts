
export type LogType = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: LogType;
}

type Listener = (entry: LogEntry) => void;
const listeners: Set<Listener> = new Set();

export const logger = {
  log: (message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      message,
      type
    };
    
    // Also log to browser console for traditional debugging
    const prefix = `[AppDebug]`;
    switch(type) {
        case 'error': console.error(prefix, message); break;
        case 'warn': console.warn(prefix, message); break;
        case 'success': console.log(`%c${prefix} ${message}`, 'color: green'); break;
        default: console.log(prefix, message);
    }

    listeners.forEach(l => l(entry));
  },
  info: (msg: string) => logger.log(msg, 'info'),
  warn: (msg: string) => logger.log(msg, 'warn'),
  error: (msg: string) => logger.log(msg, 'error'),
  success: (msg: string) => logger.log(msg, 'success'),
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
