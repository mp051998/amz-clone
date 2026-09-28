import { getRatingSummary } from '@/lib/data/catalog';
import { listReviews, type ReviewPage } from '@/lib/data/reviews';
import type { Db } from '@/lib/db/client';
import type { RatingSummary } from '@/lib/types';
import { ReviewsPanel, type ReviewsPanelProps } from './ReviewsPanel';

/** Reviews loaded per page — enough for client-side filter chips over real data. */
export const REVIEW_PAGE = 30;

export interface ReviewData {
  summary: RatingSummary;
  page: ReviewPage;
}

/** Rating summary + the first page of written reviews (most helpful first, viewer's own pinned). */
export async function loadReviewData(client: Db, productId: string, viewerId: string | null): Promise<ReviewData> {
  const [summary, page] = await Promise.all([
    getRatingSummary(client, productId),
    listReviews(client, productId, viewerId, { limit: REVIEW_PAGE }),
  ]);
  return { summary, page };
}

export interface ReviewsProps extends Omit<ReviewsPanelProps, 'summary' | 'initial' | 'total' | 'mine'> {
  data: ReviewData;
}

/** PDP "What buyers actually think" + "Explore reviews", from preloaded database data. */
export function Reviews({ data, ...rest }: ReviewsProps) {
  return <ReviewsPanel {...rest} summary={data.summary} initial={data.page.items} total={data.page.total} mine={data.page.mine} />;
}
