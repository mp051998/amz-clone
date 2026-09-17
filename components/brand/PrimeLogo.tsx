import { cn } from '../lib/cn';

/**
 * Amazon Prime "prime" wordmark — lowercase with the smile swoosh arcing beneath
 * from the 'p' to the 'e', arrowhead flicking up at the end. `tone='blue'` (default)
 * for light surfaces; `tone='white'` for dark heroes. Drawn inline (text + curve) so
 * no image is needed. Unofficial demo clone — not affiliated.
 */
export function PrimeLogo({ className, tone = 'blue' }: { className?: string; tone?: 'blue' | 'white' }) {
  const color = tone === 'white' ? '#FFFFFF' : '#1399FF';
  return (
    <svg
      className={cn('block h-[22px] w-auto select-none', className)}
      viewBox="0 0 232 150"
      fill="none"
      role="img"
      aria-label="Prime"
    >
      <text
        x="2"
        y="78"
        fontFamily="'Amazon Ember', 'Helvetica Neue', Arial, sans-serif"
        fontSize="100"
        fontWeight="700"
        letterSpacing="-5"
        fill={color}
      >
        prime
      </text>
      {/* smile swoosh + arrowhead */}
      <path d="M14 106c48 33 150 33 194 3" stroke={color} strokeWidth="13" strokeLinecap="round" />
      <path d="M198 98l24 9-13 21z" fill={color} />
    </svg>
  );
}
