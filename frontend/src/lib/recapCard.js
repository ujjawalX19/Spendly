/**
 * recapCard — the weekly recap share image (1080 × 1350), drawn on the phone
 * from the server's `share` object only: counts, XP, Points, best run, level
 * and a plain-words budget result. No amounts, categories, merchants or goal
 * names are available to it, so none can end up in the image.
 *
 * Sharing is always the user's choice: they see the card first, then tap
 * Share. On Android the image goes to the system share sheet; on the web it
 * uses the browser's share sheet, or downloads the image.
 */

import { Capacitor } from '@capacitor/core';
import { shareCardLines } from './rewardsDisplay';

export const CARD = { width: 1080, height: 1350 };

const FONT = "'Inter Variable', Inter, system-ui, sans-serif";

/** Draw the card onto a canvas. */
export function drawRecapCard(canvas, share) {
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const g = canvas.getContext('2d');
  const W = CARD.width;

  // Near-black, with the brand's maroon-to-orange glow at the top.
  g.fillStyle = '#000000';
  g.fillRect(0, 0, W, CARD.height);
  const glow = g.createLinearGradient(0, 0, W, 520);
  glow.addColorStop(0, '#2E1613');
  glow.addColorStop(0.55, '#A32716');
  glow.addColorStop(1, '#F87000');
  roundRect(g, 60, 60, W - 120, 420, 48);
  g.fillStyle = glow;
  g.fill();

  g.fillStyle = '#FFFFFF';
  g.font = `600 40px ${FONT}`;
  g.fillText('Vittova', 110, 150);
  g.font = `700 64px ${FONT}`;
  wrap(g, share.title.replace(/^My Vittova week · /, 'My week · '), 110, 260, W - 220, 76);
  g.font = `500 38px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.86)';
  g.fillText(share.level, 110, 420);

  // The numbers.
  const lines = shareCardLines(share);
  let y = 590;
  for (const line of lines) {
    g.fillStyle = '#171717';
    roundRect(g, 60, y - 70, W - 120, 118, 28);
    g.fill();
    g.fillStyle = '#B1B1B1';
    g.font = `500 36px ${FONT}`;
    g.fillText(line.label, 110, y + 6);
    g.fillStyle = '#FFFFFF';
    g.font = `700 44px ${FONT}`;
    const w = g.measureText(line.value).width;
    g.fillText(line.value, W - 110 - w, y + 8);
    y += 138;
  }

  g.fillStyle = '#7E7E7E';
  g.font = `500 32px ${FONT}`;
  g.fillText('Building better money habits · vittova.in', 110, CARD.height - 80);
  return canvas;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) {
      g.fillText(line, x, y + row * lineHeight);
      line = word;
      row += 1;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + row * lineHeight);
}

/**
 * Share the card. Returns 'shared' | 'downloaded' | 'cancelled' | 'failed'.
 * @param {HTMLCanvasElement} canvas  a canvas drawn by drawRecapCard
 * @param {string} text               shareCardText(share), sent with the image
 */
export async function shareRecapCard(canvas, text) {
  const filename = 'vittova-week.png';
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const data = canvas.toDataURL('image/png').split(',')[1];
      const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
      try {
        await Share.share({ title: 'My Vittova week', text, files: [written.uri], dialogTitle: 'Share your week' });
        return 'shared';
      } catch (err) {
        return /cancel/i.test(err?.message || '') ? 'cancelled' : 'failed';
      }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = blob ? new File([blob], filename, { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text, title: 'My Vittova week' });
        return 'shared';
      } catch (err) {
        return err?.name === 'AbortError' ? 'cancelled' : 'failed';
      }
    }
    if (!blob) return 'failed';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
