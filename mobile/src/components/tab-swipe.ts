// Swiping a tab page sideways switches to the next or previous page. The tab bar knows the pages
// and their order, so it registers how to move; tab pages (Screen with `tabs`) only ask for a step.

type Step = 1 | -1;
let handler: ((step: Step) => void) | null = null;

/** Called by the tab bar. Returns a function that removes this handler again. */
export function setTabSwipe(next: (step: Step) => void): () => void {
  handler = next;
  return () => { if (handler === next) handler = null; };
}

/** 1 moves to the page on the right, -1 to the page on the left. Does nothing at either end. */
export function swipeTab(step: Step) {
  handler?.(step);
}
