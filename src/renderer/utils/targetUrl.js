/**
 * Validates URL field before Start (mirror main ensureHttpScheme loosely).
 * @returns {null|'empty'|'invalid'}
 */
export function classifyTargetUrl(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return 'empty';
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withScheme);
    if (!u.hostname || u.hostname.length < 1) return 'invalid';
    return null;
  } catch {
    return 'invalid';
  }
}
