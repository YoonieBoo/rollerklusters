import type { jsPDF } from 'jspdf';

const toBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// jsPDF's built-in fonts (Helvetica, Times, ...) only cover Latin/WinAnsi
// characters. Any Thai text — creator names, handles, bios, all common in
// this app's real data — renders as garbled placeholder glyphs with those
// fonts instead of throwing an error, so the bug is easy to miss until
// someone actually opens the exported PDF. Sarabun (SIL Open Font License)
// has full Thai + Latin coverage; embedding it here lets any PDF export
// render Thai text correctly. Returns the font family name to pass to
// pdf.setFont().
export const registerThaiFont = async (pdf: jsPDF): Promise<string> => {
  const [regular, bold] = await Promise.all([
    fetch('/fonts/Sarabun-Regular.ttf').then((res) => res.arrayBuffer()),
    fetch('/fonts/Sarabun-Bold.ttf').then((res) => res.arrayBuffer()),
  ]);

  pdf.addFileToVFS('Sarabun-Regular.ttf', toBase64(regular));
  pdf.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  pdf.addFileToVFS('Sarabun-Bold.ttf', toBase64(bold));
  pdf.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');

  return 'Sarabun';
};
