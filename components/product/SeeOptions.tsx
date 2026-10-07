import { buttonClasses, type ButtonSize, type ButtonVariant } from '../primitives/Button';
import { cn } from '../lib/cn';

/**
 * "See options" in place of a one-tap add: a product that comes in sizes goes in the cart from its
 * own page, once a size is picked there. Sized and styled like the add button it stands in for.
 */
export function SeeOptions({ href, name, block, className, variant = 'secondary', size = 'sm' }: {
  href: string;
  name: string;
  block?: boolean;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <a href={href} aria-label={`See options for ${name}`} className={cn(buttonClasses({ variant, size, block }), 'no-underline', className)}>
      See options
    </a>
  );
}
