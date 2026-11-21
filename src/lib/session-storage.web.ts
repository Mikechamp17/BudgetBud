/**
 * Stores the Supabase session in the browser's localStorage.
 * During static rendering there is no window, so no storage is used.
 */
export const sessionStorage = typeof window === 'undefined' ? undefined : window.localStorage;
