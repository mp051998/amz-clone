import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { removeSavedCard } from '@/lib/data/wallet';

/** DELETE /api/v1/me/cards/:id — remove a saved card. `404 card_not_found` unless it's the caller's. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  await removeSavedCard(user.id, id);
  return noContent();
});

export const OPTIONS = preflight;
