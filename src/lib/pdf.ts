import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** jsPDF standard fonts cannot render ₨ / most currency glyphs — use a safe ASCII prefix. */
export function pdfMoney(n: number | string | null | undefined, prefix = "") {
  const num = Number(n ?? 0);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${prefix}${abs}`;
}

export const pdfDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const pdfDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${pdfDate(dt)} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

export const dayName = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { weekday: "long" });
};

const INK: [number, number, number] = [30, 41, 59];
const LINE: [number, number, number] = [203, 213, 225];

export function newDoc() {
  return new jsPDF({ unit: "mm", format: "a4" });
}

/** Excel-style banner + meta grid. Returns the y position to continue from. */
export function docHeader(
  doc: jsPDF,
  opts: { business?: string; title: string; meta?: Array<[string, string]> },
) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(10, 10, W - 20, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.title.toUpperCase(), W / 2, 18, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let y = 22;
  const meta = (opts.meta ?? []).filter(([, v]) => v);
  if (meta.length) {
    const colW = (W - 20) / 2;
    doc.setFontSize(9);
    meta.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 10 + col * colW;
      const ry = y + row * 7;
      doc.setDrawColor(...LINE);
      doc.rect(x, ry, colW, 7);
      doc.setFont("helvetica", "bold");
      doc.text(label, x + 2, ry + 4.8);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), x + colW - 2, ry + 4.8, { align: "right" });
    });
    y += Math.ceil(meta.length / 2) * 7;
  }
  if (opts.business) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(opts.business, 10, y + 5);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }
  return y + 4;
}

export function sectionTitle(doc: jsPDF, y: number, text: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, 10, y + 4);
  return y + 6;
}

type Cell = string | number;

export function table(
  doc: jsPDF,
  y: number,
  head: Cell[],
  body: Cell[][],
  foot?: Cell[][],
  opts?: { align?: Record<number, "left" | "right"> },
) {
  const columnStyles: Record<number, { halign: "left" | "right" }> = {};
  Object.entries(opts?.align ?? {}).forEach(([k, v]) => (columnStyles[Number(k)] = { halign: v }));
  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.length ? body : [[{ content: "No records", colSpan: head.length, styles: { halign: "center", textColor: 130 } } as never]],
    foot,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [255, 249, 196], textColor: 0, fontStyle: "bold" },
    columnStyles,
    margin: { left: 10, right: 10 },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
}

/** Highlighted summary strip (mirrors the yellow/blue totals block in the Excel sheet). */
export function summaryRows(doc: jsPDF, y: number, rows: Array<[string, string, boolean?]>) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(9.5);
  rows.forEach(([label, value, highlight], i) => {
    const ry = y + i * 8;
    if (highlight) doc.setFillColor(255, 249, 196);
    else doc.setFillColor(241, 245, 249);
    doc.setDrawColor(...LINE);
    doc.rect(10, ry, W - 20, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.text(label, 12, ry + 5.4);
    doc.text(value, W - 12, ry + 5.4, { align: "right" });
  });
  return y + rows.length * 8 + 6;
}

export function save(doc: jsPDF, name: string) {
  doc.save(`${name.replace(/[^\w\-]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
