import { getRatingSummary } from '@/lib/data/catalog';
import { listReviews, reviewFacets, type ReviewFacets, type ReviewPage } from '@/lib/data/reviews';
import { customerImages, type CustomerImage } from '@/lib/data/review-photos';
import type { Db } from '@/lib/db/client';
import type { RatingSummary } from '@/lib/types';
import { REVIEW_PAGE } from './reviewFilters';
import { ReviewsPanel, type ReviewsPanelProps } from './ReviewsPanel';

export { REVIEW_PAGE };

export interface ReviewData {
  summary: RatingSummary;
  page: ReviewPage;
  /** written reviews per star, for exact filter counts */
  facets: ReviewFacets;
  /** the newest photos from its reviews */
  images: CustomerImage[];
}

/** Rating summary + the first page of written reviews (most helpful first, viewer's own pinned) + their facets and photos. */
export async function loadReviewData(client: Db, productId: string, viewerId: string | null): Promise<ReviewData> {
  const [summary, page, facets, images] = await Promise.all([
    getRatingSummary(client, productId),
    listReviews(client, productId, viewerId, { limit: REVIEW_PAGE }),
    reviewFacets(client, productId),
    customerImages(client, productId).catch(() => []),
  ]);
  return { summary, page, facets, images };
}

export interface ReviewsProps extends Omit<ReviewsPanelProps, 'summary' | 'initial' | 'total' | 'mine' | 'facets' | 'customerImages'> {
  data: ReviewData;
}

/** PDP "What buyers actually think" + "Explore reviews", from preloaded database data. */
export function Reviews({ data, ...rest }: ReviewsProps) {
  return <ReviewsPanel {...rest} summary={data.summary} initial={data.page.items} total={data.page.total} mine={data.page.mine} facets={data.facets} customerImages={data.images} />;
}
