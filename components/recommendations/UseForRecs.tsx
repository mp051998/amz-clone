import { setUseForRecommendations } from '@/app/actions/history';
import type { Product } from '@/lib/types';

/** "Don't use for recommendations" on a product viewed or bought, or use it again (`skipped`). */
export function UseForRecs({ product, skipped }: { product: Pick<Product, 'id' | 'title'>; skipped: boolean }) {
  return (
    <form action={setUseForRecommendations}>
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="use" value={skipped ? '1' : '0'} />
      <button
        type="submit"
        className="border-0 bg-transparent p-1 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
        aria-label={`${skipped ? 'Use' : 'Don’t use'} ${product.title} for recommendations`}
      >
        {skipped ? 'Use for recommendations' : 'Don’t use for recommendations'}
      </button>
    </form>
  );
}
