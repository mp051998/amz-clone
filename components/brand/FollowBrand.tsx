import { setBrandFollowed } from '@/app/actions/brands';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/**
 * Amazon's "Follow" on a brand's store: a toggle that follows the brand in this store, or (once
 * "Following") stops. `next` is where to come back to, without the store prefix.
 */
export function FollowBrand({ brand, following, next, size }: { brand: string; following: boolean; next: string; size?: 'sm' }) {
  return (
    <form action={setBrandFollowed}>
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="follow" value={following ? '0' : '1'} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton aria-pressed={following} variant={following ? 'secondary' : 'primary'} size={size}>
        {following ? (
          <>
            <span aria-hidden>✓ </span>Following
          </>
        ) : (
          'Follow'
        )}
      </SubmitButton>
    </form>
  );
}
