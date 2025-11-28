/**
 * Logger utility for Britta application
 * Provides environment-aware logging (debug logs only in development)
 */

const isDev = import.meta.env.DEV;

export const logger = {
    /**
     * Debug logs - only shown in development
     */
    debug: (message: string, ...args: any[]) => {
        if (isDev) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    },

    /**
     * Info logs - shown in all environments
     */
    info: (message: string, ...args: any[]) => {
        console.info(`[INFO] ${message}`, ...args);
    },

    /**
     * Warning logs - shown in all environments
     */
    warn: (message: string, ...args: any[]) => {
        console.warn(`[WARN] ${message}`, ...args);
    },

    /**
     * Error logs - always shown
     */
    error: (message: string, ...args: any[]) => {
        console.error(`[ERROR] ${message}`, ...args);
    },

    /**
     * Success logs - shown in all environments
     */
    success: (message: string, ...args: any[]) => {
        if (isDev) {
            console.log(`%c[SUCCESS] ${message}`, 'color: #00F0FF; font-weight: bold', ...args);
        } else {
            console.log(`[SUCCESS] ${message}`, ...args);
        }
    }
};
