/**
 * Report export helpers - dynamic imports only (no top-level).
 * Call ONLY from client-side (e.g. button click handlers).
 * Sanitizes cloned DOM to avoid html2canvas "oklab" / modern CSS parse errors.
 */

const SAFE_BG = '#0a0a0f';
const SAFE_TEXT = '#e5e7eb';
const SAFE_BORDER = 'rgba(255,255,255,0.12)';

function sanitizeClone(clonedDoc: Document, _captureRoot: HTMLElement): void {
  const root = clonedDoc.body || clonedDoc.documentElement;
  if (root && (root as HTMLElement).style) {
    const r = root as HTMLElement;
    r.style.backgroundColor = SAFE_BG;
    r.style.backgroundImage = 'none';
    r.style.boxShadow = 'none';
    r.style.filter = 'none';
    r.style.backdropFilter = 'none';
  }
  clonedDoc.querySelectorAll('*').forEach((el) => {
    const style = (el as HTMLElement).style;
    if (!style) return;
    style.backgroundImage = 'none';
    style.boxShadow = 'none';
    style.filter = 'none';
    style.backdropFilter = 'none';
    style.mixBlendMode = '';
    try {
      const computed = clonedDoc.defaultView?.getComputedStyle(el);
      if (computed) {
        const color = computed.color || '';
        if (/oklab|oklch|color-mix/i.test(color)) style.color = SAFE_TEXT;
        const bg = computed.backgroundColor || '';
        if (/oklab|oklch|color-mix/i.test(bg)) style.backgroundColor = SAFE_BG;
        const border = computed.borderColor || '';
        if (/oklab|oklch|color-mix/i.test(border)) style.borderColor = SAFE_BORDER;
      }
    } catch (_) {}
    const noPrint = el.classList?.contains('no-print') || el.classList?.contains('print:hidden');
    const tag = (el as Element).tagName?.toLowerCase();
    if (noPrint || tag === 'nav' || tag === 'aside') (el as HTMLElement).style.display = 'none';
  });
}

export async function exportReportToPDF(element: HTMLElement, filename: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: SAFE_BG,
      onclone: (clonedDoc, clonedElement) => {
        sanitizeClone(clonedDoc, clonedElement);
      },
    });
  } catch (err) {
    throw err;
  }
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  } else {
    let y = 0;
    let remaining = imgHeight;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, y, imgWidth, imgHeight);
      remaining -= pageHeight;
      if (remaining > 0) {
        pdf.addPage();
        y -= pageHeight;
      }
    }
  }
  pdf.save(filename);
}

export async function exportReportToCSV(csvText: string, filename: string): Promise<void> {
  const BOM = '\uFEFF';
  const csv = csvText.startsWith(BOM) ? csvText : BOM + csvText;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReportToExcel(
  sheets: { name: string; rows: any[][] }[],
  filename: string
): Promise<void> {
  const mod = await import('xlsx');
  const XLSX = mod.default || mod;
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, (s.name || 'Sheet').slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
