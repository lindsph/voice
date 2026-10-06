import { PDFParse } from "pdf-parse";

export const PDF_TEXT_MAX_BYTES = 8 * 1024 * 1024;

export function isPdfUpload(fileName: string, mime: string): boolean {
  const name = fileName.trim().toLowerCase();
  const type = mime.trim().toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf" || type === "application/x-pdf";
}

export async function textFromPdf(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength < 5 || Buffer.from(bytes.slice(0, 5)).toString("latin1") !== "%PDF-") {
    throw new Error("File must be a PDF");
  }
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
