// Production-safe logging utility
const isDevelopment = import.meta.env.DEV;

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDevelopment) {
      console.error(message, error);
    }
    // In production, you can send to error monitoring service (e.g., Sentry)
    // Example:
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error);
    // }
  },
  
  warn: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.warn(message, data);
    }
  },
  
  info: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.info(message, data);
    }
  },
  
  log: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(message, data);
    }
  },
  
  debug: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.debug(message, data);
    }
  },
};

