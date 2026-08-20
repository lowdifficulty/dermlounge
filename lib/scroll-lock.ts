let lockCount = 0;
let savedScrollY = 0;

type SavedStyles = {
  htmlOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflow: string;
};

let saved: SavedStyles | null = null;

/** Lock page scroll without shifting layout when the scrollbar hides. */
export function lockPageScroll(): () => void {
  lockCount += 1;
  if (lockCount > 1) {
    return () => {
      lockCount -= 1;
    };
  }

  savedScrollY = window.scrollY;
  const html = document.documentElement;
  const body = document.body;

  saved = {
    htmlOverflow: html.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverflow: body.style.overflow,
  };

  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";

  return () => {
    lockCount -= 1;
    if (lockCount > 0 || !saved) return;

    const styles = saved;
    saved = null;

    html.style.overflow = styles.htmlOverflow;
    body.style.position = styles.bodyPosition;
    body.style.top = styles.bodyTop;
    body.style.left = styles.bodyLeft;
    body.style.right = styles.bodyRight;
    body.style.width = styles.bodyWidth;
    body.style.overflow = styles.bodyOverflow;

    window.scrollTo(0, savedScrollY);
  };
}
