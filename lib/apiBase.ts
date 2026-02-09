/**
 * API base URL - used for all API calls.
 * Does NOT throw at import; logs once if missing and falls back to empty string.
 * Throws only when apiUrl() is called for an actual request and base is missing.
 */

let _logged = false;
function warnOnce() {
  if (typeof window !== 'undefined' && !_logged) {
    _logged = true;
    console.error(
      '[Crown] Missing NEXT_PUBLIC_API_BASE_URL. Set in Vercel env or .env.local (e.g. NEXT_PUBLIC_API_BASE_URL=https://crown-api-xxx.run.app)'
    );
  }
}

// Support both NEXT_PUBLIC_API_BASE_URL (correct) and NEXT_PUBLIC_API_URL (common typo/alias)
const raw = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
const _base = raw && typeof raw === 'string' && raw.trim() ? raw.replace(/\/$/, '') : '';

if (!_base) warnOnce();

/** API origin (no trailing slash). Empty if env missing. */
export const API_BASE = _base;

/** Full API base including /api path. Empty if env missing. */
export const API_BASE_URL = _base ? `${_base}/api` : '';

/**
 * Build full API URL. Use this for ALL API calls.
 * @throws Error if API_BASE is not configured (when making a request)
 */
export function apiUrl(path: string): string {
  if (!_base) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not set. Set in Vercel env or .env.local'
    );
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.startsWith('/api') ? `${_base}${p}` : `${_base}/api${p}`;
}

/** Dev-only: log API base (client-side) */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('API BASE:', process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '(not set)');
}
