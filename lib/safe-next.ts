/** Keep a `next` destination an in-app path, so a redirect can't be pointed off-site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
