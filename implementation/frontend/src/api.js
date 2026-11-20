// Talks to our own server. Login is a cookie, so nothing secret is kept in the page.
export class AuthError extends Error {}

export async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') throw new AuthError('Please log in');
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}