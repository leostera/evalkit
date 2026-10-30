import type { MouseEvent } from 'react';

/**
 * Makes a whole table row open the page its `data-row-link` anchor points to.
 * The anchor stays the real link, so keyboard users, screen readers, and
 * "open in new tab" all work; the row only forwards plain clicks to it.
 * Clicks on other links, buttons, or inputs in the row keep their own
 * meaning, and selecting text does not navigate.
 */
export const rowLinkProps = {
  className: 'row-link cursor-pointer hover:bg-kumo-tint',
  onClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, label, textarea')) return;
    if (window.getSelection()?.toString()) return;
    const link =
      event.currentTarget.querySelector<HTMLAnchorElement>('a[data-row-link]');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.button === 1)
      window.open(link.href, '_blank', 'noopener');
    else link.click();
  },
};
