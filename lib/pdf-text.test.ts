import { describe, expect, it } from "vitest";

import { isPdfUpload, textFromPdf } from "./pdf-text";

describe("pdf text", () => {
  it("accepts a pdf name or mime", () => {
    expect(isPdfUpload("Guide.PDF", "")).toBe(true);
    expect(isPdfUpload("guide", "application/pdf")).toBe(true);
    expect(isPdfUpload("guide", "application/x-pdf")).toBe(true);
    expect(isPdfUpload("notes.txt", "text/plain")).toBe(false);
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(textFromPdf(new TextEncoder().encode("hello"))).rejects.toThrow("File must be a PDF");
  });

  it("reads the sentence from a one-page PDF", async () => {
    const text = await textFromPdf(onePagePdf("Wool pellets hold moisture in the soil."));
    expect(text).toContain("Wool pellets hold moisture in the soil.");
  });
});

function onePagePdf(sentence: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${sentence}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}
