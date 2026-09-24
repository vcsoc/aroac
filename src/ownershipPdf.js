import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { api } from "./lib";
import { imageDimensions } from "../shared/media";
export const bytes64 = (data) =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
export function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
async function previewImage(pdf, bytes, mime) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    if (bitmap.width * bitmap.height > 16000000)
      throw Error("Preview too large");
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.93),
    );
    if (!blob) throw Error("Preview unavailable");
    return await pdf.embedJpg(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
export async function ownershipPdf(user, account, devices) {
  if (
    devices.reduce(
      (n, d) => n + d.invoices.reduce((s, i) => s + i.size, 0),
      0,
    ) >
    32 * 1024 * 1024
  )
    throw Error("Attachments exceed 32 MiB; use per-device exports.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const response = await fetch("/fonts/report-sans.ttf");
  if (!response.ok) throw Error("Bundled report font unavailable.");
  const font = await pdf.embedFont(await response.arrayBuffer(), {
      subset: true,
    }),
    chars = new Set(font.getCharacterSet());
  let page, y;
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 795;
  };
  const clean = (s) =>
    [...String(s)]
      .map((c) =>
        c === "\n"
          ? c
          : chars.has(c.codePointAt(0))
            ? c
            : `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`,
      )
      .join("");
  const line = (s, size = 10) => {
    if (!page || y < 55) newPage();
    page.drawText(s, { x: 40, y, size, font, color: rgb(0.08, 0.1, 0.13) });
    y -= size + 6;
  };
  const text = (s, size = 10) => {
    let part = "";
    for (const c of clean(s)) {
      if (c === "\n" || font.widthOfTextAtSize(part + c, size) > 510) {
        line(part, size);
        part = "";
        if (c === "\n") continue;
      }
      part += c;
    }
    if (part) line(part, size);
  };
  newPage();
  text("AROAC — Equipment ownership record", 19);
  text("Generated: " + new Date().toISOString());
  text("Operator: " + user.callsign + " · " + account.name, 13);
  for (const key of [
    "firstName",
    "lastName",
    "mobile",
    "email",
    "address",
    "grid",
  ])
    if (account[key]) text(key + ": " + account[key]);
  text(
    "Owner-entered information, not certified ownership or a warranty approval. Original invoice files are embedded attachments. PDF invoices require an attachment-capable viewer; image invoices also appear as orientation-corrected/downscaled page previews within size limits. Originals remain unchanged.",
  );
  text(
    "Original UTF-8 metadata is attached. Unsupported font glyphs are written as Unicode code points.",
  );
  let previewPixels = 0;
  for (const d of devices) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    newPage();
    text(d.name, 17);
    for (const [key, value] of Object.entries(d)) {
      if (!["id", "invoices"].includes(key) && value) text(key + ": " + value);
    }
    for (const invoice of d.invoices) {
      const f = await api(`/devices/${d.id}/invoices/${invoice.id}`);
      const bytes = bytes64(f.data);
      const filename = `device-${d.id}-invoice-${invoice.id}-${f.name.replace(/[<>:"|?*]/g, "_")}`;
      await pdf.attach(bytes, filename, {
        mimeType: f.mime,
        description:
          "Original user-supplied invoice, not independently verified",
      });
      text("Invoice attached: " + filename);
      if (f.mime !== "application/pdf") {
        const dim = imageDimensions(bytes, f.mime),
          pixels = dim ? dim.width * dim.height : Infinity;
        if (pixels > 16000000 || previewPixels + pixels > 32000000) {
          text(
            "Image preview omitted to bound memory; the unchanged original is attached.",
          );
          continue;
        }
        previewPixels += pixels;
        let image;
        try {
          image = await previewImage(pdf, bytes, f.mime);
        } catch {
          text(
            "Image preview unavailable; the unchanged original is attached.",
          );
          continue;
        }
        newPage();
        text("Invoice: " + f.name, 12);
        const scale = Math.min(510 / image.width, 680 / image.height);
        page.drawImage(image, {
          x: 40,
          y: y - image.height * scale,
          width: image.width * scale,
          height: image.height * scale,
        });
        y -= image.height * scale + 15;
      }
    }
  }
  await pdf.attach(
    new TextEncoder().encode(
      JSON.stringify(
        {
          format: "oar-ownership-record",
          version: 1,
          generatedAt: new Date().toISOString(),
          callsign: user.callsign,
          account,
          devices,
        },
        null,
        2,
      ),
    ),
    "ownership-record.json",
    { mimeType: "application/json" },
  );
  return base64(await pdf.save());
}
