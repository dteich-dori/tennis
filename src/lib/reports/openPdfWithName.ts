import type jsPDF from "jspdf";

/**
 * Open a jsPDF document in a new browser tab and set PDF metadata so
 * the browser's "Save As" dialog suggests a meaningful filename.
 *
 * Usage:
 *   openPdfWithName(doc, "Games-By-Date-2026-2027", "Brooklake games schedule");
 *
 * @param doc        The jsPDF document (already built).
 * @param baseName   Filename without extension (e.g. "Players-List-2026-2027").
 *                   This also becomes the PDF's `/Title` metadata, which
 *                   Chrome/Edge use as the default Save-As filename.
 * @param subject    Optional PDF metadata subject (human-readable description).
 */
export function openPdfWithName(
  doc: jsPDF,
  baseName: string,
  subject?: string
): void {
  doc.setProperties({
    title: baseName,
    subject: subject ?? baseName,
    author: "Tennis Scheduler",
  });

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);

  // Use an anchor with `download` as a filename hint.
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = `${baseName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
