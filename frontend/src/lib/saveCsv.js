/**
 * saveCsv — hand a CSV to the person: the share sheet on Android, a download
 * on the web. Dismissing the share sheet is not a failure.
 */
import { Capacitor } from '@capacitor/core';

/** The same for a PDF blob. */
export async function savePdf(filename, blob, title) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) throw err;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveCsv(filename, text, title) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const written = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) throw err;
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
