/**
 * keepFieldVisible — the field being typed in stays above the on-screen keyboard.
 *
 * On a phone the keyboard either shrinks the page or slides over it. Found on
 * a device: on the sign-in screen the password field ended up under the
 * keyboard. After the keyboard has settled, the focused field is scrolled to
 * the middle of what is still visible, and the keyboard's height is published
 * as --v-kb so a screen can leave room to scroll (see AuthLayout).
 *
 * The two small functions are pure, so they are unit tested in plain Node
 * (tests/keepFieldVisible.test.js).
 */

const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
const SETTLE_MS = 320; // the keyboard's own slide

/** Height of the part of the window the keyboard covers, in px (0 when it shrinks the page instead). */
export function keyboardInset({ innerHeight, visualViewport }) {
  if (!visualViewport) return 0;
  const covered = Number(innerHeight) - Number(visualViewport.height) - Number(visualViewport.offsetTop || 0);
  return Number.isFinite(covered) && covered > 0 ? Math.round(covered) : 0;
}

/** True when a field at `rect` is not comfortably inside the visible height. */
export function needsScroll(rect, visibleHeight, margin = 16) {
  return rect.bottom > visibleHeight - margin || rect.top < margin;
}

/** Starts watching; returns a function that stops. */
export function installKeepFieldVisible(win = window) {
  const doc = win.document;
  let timer;
  const settle = () => {
    doc.documentElement.style.setProperty('--v-kb', `${keyboardInset(win)}px`);
    const el = doc.activeElement;
    if (!el || !FIELD.test(el.tagName)) return;
    const visible = win.visualViewport?.height ?? win.innerHeight;
    if (needsScroll(el.getBoundingClientRect(), visible)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(settle, SETTLE_MS); };
  doc.addEventListener('focusin', later);
  doc.addEventListener('focusout', later);
  win.addEventListener('resize', later);
  win.visualViewport?.addEventListener('resize', later);
  return () => {
    clearTimeout(timer);
    doc.removeEventListener('focusin', later);
    doc.removeEventListener('focusout', later);
    win.removeEventListener('resize', later);
    win.visualViewport?.removeEventListener('resize', later);
  };
}
