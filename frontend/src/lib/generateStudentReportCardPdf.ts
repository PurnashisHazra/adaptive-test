import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const RENDER_WAIT_MS = 900;

export async function waitForChartsReady(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, RENDER_WAIT_MS));
}

/** Capture a full-height analytics DOM node into a multi-page A4 PDF. */
export async function captureElementToPdf(element: HTMLElement, title: string): Promise<Blob> {
  await waitForChartsReady();

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    height: element.scrollHeight,
    windowHeight: element.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  pdf.setProperties({ title });

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}

export function openStudentReportCardPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error("Popup blocked — allow popups for this site to view the PDF.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
