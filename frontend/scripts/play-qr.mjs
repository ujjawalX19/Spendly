// Writes public/play-qr.svg: a QR code for the Google Play listing (placement "qr").
// Run after changing the listing URL: node scripts/play-qr.mjs
import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

const url = `https://play.google.com/store/apps/details?id=com.vittova.app&referrer=${encodeURIComponent('utm_source=vittova.in&utm_medium=website&utm_campaign=qr')}`;
const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
writeFileSync(new URL('../public/play-qr.svg', import.meta.url), svg);
console.log('play-qr.svg written for', url);
