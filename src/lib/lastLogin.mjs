const key = 'ieces-portal-last-login';

export function loadLastLogin() {
  try { return localStorage.getItem(key) || ''; }
  catch { return ''; }
}

export function saveLastLogin(identifier) {
  // Device storage being unavailable must not prevent sign-in.
  try { localStorage.setItem(key, identifier); }
  catch { }
}
