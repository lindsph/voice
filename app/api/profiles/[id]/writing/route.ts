import { NextResponse } from "next/server";
import { z } from "zod";

import { authorize } from "@/lib/auth";
import { passagesFromHerWriting } from "@/lib/her-writing";
import { isPdfUpload, PDF_TEXT_MAX_BYTES, textFromPdf } from "@/lib/pdf-text";
import { addHerWriting, getProfile } from "@/lib/store";

const jsonSchema = z.object({
  text: z.string().default(""),
  sourceTitle: z.string().optional().default(""),
  surface: z.string().optional().default(""),
});

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const profile = await getProfile(id);
    const incoming = await readWriting(request);
    const surface = incoming.surface || profile.surfaces[0]?.id || "";
    const passages = passagesFromHerWriting(incoming.text);
    if (passages.length === 0) {
      return NextResponse.json(
        { error: "No usable sentences in that writing." },
        { status: 400 },
      );
    }
    const saved = await addHerWriting({
      profileId: id,
      passages,
      sourceTitle: incoming.sourceTitle,
      surface,
    });
    return NextResponse.json({ ...saved, kept: passages.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add her writing";
    const status = /unknown profile/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readWriting(request: Request): Promise<{
  text: string;
  sourceTitle: string;
  surface: string;
}> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const pasted = String(form.get("text") ?? "");
    const sourceTitle = String(form.get("sourceTitle") ?? "");
    const surface = String(form.get("surface") ?? "");
    const file = form.get("file");
    let pdfText = "";
    if (file instanceof File && file.size > 0) {
      if (file.size > PDF_TEXT_MAX_BYTES) throw new Error("PDF must be 8 MB or smaller");
      if (!isPdfUpload(file.name, file.type)) throw new Error("File must be a PDF");
      pdfText = await textFromPdf(new Uint8Array(await file.arrayBuffer()));
    }
    const text = [pdfText, pasted].map((part) => part.trim()).filter(Boolean).join("\n\n");
    if (!text) throw new Error("Add a PDF or paste her writing.");
    return { text, sourceTitle, surface };
  }
  const input = jsonSchema.parse(await request.json());
  if (!input.text.trim()) throw new Error("Add a PDF or paste her writing.");
  return input;
}
