import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Line icons: 1.5px stroke, 24 viewBox, currentColor (design.md §10). aria-hidden unless an aria-label is passed. */
function Line({ children, ...props }: IconProps) {
  const labelled = props['aria-label'] != null;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} {...props}>
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (<Line {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Line>);
/** Amazon shopping cart: left handle sweeping up, open trapezoidal basket (wider at top),
 *  two wheels — the recognizable amazon.com nav-cart silhouette. */
export const IconCart = (props: IconProps) => {
  const labelled = props['aria-label'] != null;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} {...props}>
      <path d="M2.4 4.3h2.2l.7 2.5" />
      <path d="M5.3 6.8H21l-2.3 6.7H7.5z" />
      <path d="M7.5 13.5l.6 2.2M18.7 13.5l-.6 2.2" />
      <circle cx="8.7" cy="18.2" r="1.4" />
      <circle cx="17.3" cy="18.2" r="1.4" />
    </svg>
  );
};
export const IconPin = (p: IconProps) => (<Line {...p}><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></Line>);
export const IconChevronDown = (p: IconProps) => (<Line {...p}><path d="m6 9 6 6 6-6" /></Line>);
export const IconChevronRight = (p: IconProps) => (<Line {...p}><path d="m9 6 6 6-6 6" /></Line>);
export const IconClose = (p: IconProps) => (<Line {...p}><path d="M6 6l12 12M18 6 6 18" /></Line>);
export const IconMenu = (p: IconProps) => (<Line {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Line>);
export const IconUser = (p: IconProps) => (<Line {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></Line>);
export const IconLock = (p: IconProps) => (<Line {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Line>);
export const IconTruck = (p: IconProps) => (<Line {...p}><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.4" /><circle cx="17" cy="18" r="1.4" /></Line>);

/** Filled star for ratings (design.md §2.5, §5 Stars). */
export const IconStar = (props: IconProps) => {
  const labelled = props['aria-label'] != null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} {...props}>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.9 6.1 20.6l1.2-6.6L2.5 9.4l6.6-.9z" />
    </svg>
  );
};
