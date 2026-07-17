import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ────────────────────────────────────────────────
// XLSX builder
// ────────────────────────────────────────────────

export async function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Overlay Bets';

  // Excel sheet names are limited to 31 characters.
  const safeSheetName = sheetName.slice(0, 31);
  const ws = wb.addWorksheet(safeSheetName);

  // Header row
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F6FEB' },
  };
  headerRow.alignment = {
    vertical: 'middle',
    horizontal: 'center',
  };

  // Data rows
  for (const row of rows) {
    ws.addRow(row.map((v) => (v == null ? '' : v)));
  }

  // Auto-fit columns
  ws.columns.forEach((col, i) => {
    let maxLen = headers[i]?.length ?? 10;

    for (const row of rows) {
      const val = row[i];
      if (val != null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }

    col.width = Math.min(maxLen + 3, 60);
  });

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}

// ────────────────────────────────────────────────
// CSV builder
// ────────────────────────────────────────────────

export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const escape = (v: unknown): string => {
    if (v == null) return '';

    const s = String(v);

    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
  };

  const lines: string[] = [headers.map(escape).join(',')];

  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────
// PDF builder
// ────────────────────────────────────────────────

export async function buildPdf(
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
    });

    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', reject);

    // Title
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(title, { align: 'center' });

    doc.moveDown(0.5);

    // Subtitle
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#666')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`, {
        align: 'center',
      });

    doc.moveDown(1);

    // Table sizing
    const pageWidth = doc.page.width - 80;
    const colCount = headers.length;
    const colWidth = Math.max(60, pageWidth / colCount);
    const rowHeight = 18;
    const headerBg = '#1F6FEB';

    let y = doc.y;

    // Header
    doc.rect(40, y, pageWidth, rowHeight).fill(headerBg);

    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);

    let x = 40;

    for (const h of headers) {
      doc.text(h, x + 3, y + 4, {
        width: colWidth - 6,
        align: 'left',
        ellipsis: true,
      });

      x += colWidth;
    }

    y += rowHeight;

    // Rows
    doc.fillColor('#000').font('Helvetica').fontSize(7);

    let rowNum = 0;

    for (const row of rows) {
      if (y + rowHeight > doc.page.height - 40) {
        doc.addPage();

        y = 40;

        doc.rect(40, y, pageWidth, rowHeight).fill(headerBg);

        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);

        let hx = 40;

        for (const h of headers) {
          doc.text(h, hx + 3, y + 4, {
            width: colWidth - 6,
            align: 'left',
            ellipsis: true,
          });

          hx += colWidth;
        }

        y += rowHeight;

        doc.fillColor('#000').font('Helvetica').fontSize(7);
      }

      if (rowNum % 2 === 1) {
        doc.rect(40, y, pageWidth, rowHeight).fill('#F0F4F8');
      }

      doc.fillColor('#000');

      let cx = 40;

      for (const cell of row) {
        const value = cell == null ? '' : String(cell);

        doc.text(value, cx + 3, y + 4, {
          width: colWidth - 6,
          align: 'left',
          ellipsis: true,
        });

        cx += colWidth;
      }

      y += rowHeight;
      rowNum++;
    }

    doc.end();
  });
}