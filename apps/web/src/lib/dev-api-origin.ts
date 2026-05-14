/**
 * When the web app runs on the Vite dev server (port 5173), API calls and the
 * realtime socket must target the Nest origin explicitly. Default is
 * hostname:3001; override with `VITE_DEV_API_ORIGIN` (e.g. http://localhost:3011).
 */
export function devServerApiOrigin(): string {
  if (typeof window === 'undefined') return ''
  if (window.location.port !== '5173') return ''
  const fromEnv = import.meta.env.VITE_DEV_API_ORIGIN
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '')
  }
  return `${window.location.protocol}//${window.location.hostname}:3001`
}
