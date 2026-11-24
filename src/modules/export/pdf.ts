import { layoutPages, PAGE, type DrawOp, type Font, type PdfContent } from "./pdf-layout";

/** 200 dots per inch: sharp on paper, and a page stays a few hundred KB. */
const SCALE = 200 / 72;

/**
 * The list as a PDF file, made in the browser: each page is drawn on a canvas (which
 * handles right-to-left text, the app's font and the categories' emoji) and added to
 * the PDF as an image. For the iPhone's home screen app, where the print dialog never
 * opens (spec 11.2).
 */
export async function makePdf(content: PdfContent, fontFamily: string): Promise<Blob> {
  const fontOf = (font: Font) => `${font.bold ? 700 : 400} ${font.size}px ${fontFamily}`;
  // The text is drawn in the app's font only once it has loaded.
  await Promise.all([
    document.fonts.load(fontOf({ size: 12, bold: false }), "א"),
    document.fonts.load(fontOf({ size: 12, bold: true }), "א"),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE.width * SCALE);
  canvas.height = Math.round(PAGE.height * SCALE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.direction = "rtl";

  const measure = (text: string, font: Font) => {
    context.font = fontOf(font);
    return context.measureText(text).width;
  };
  const pages = layoutPages(content, measure);

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(content.title);
  pdf.setLanguage("he");
  for (const ops of pages) {
    draw(context, ops, fontOf);
    const image = await pdf.embedJpg(await jpeg(canvas));
    pdf
      .addPage([PAGE.width, PAGE.height])
      .drawImage(image, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function draw(context: CanvasRenderingContext2D, ops: DrawOp[], fontOf: (font: Font) => string) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  context.fillStyle = "#000000";
  context.strokeStyle = "#000000";
  context.textBaseline = "alphabetic";

  for (const op of ops) {
    if (op.kind === "text") {
      context.font = fontOf(op.font);
      context.textAlign = op.align;
      context.fillText(op.text, op.x, op.y);
    } else if (op.kind === "line") {
      context.strokeStyle = op.width >= 1 ? "#000000" : "#888888";
      context.lineWidth = op.width;
      context.beginPath();
      context.moveTo(op.x1, op.y);
      context.lineTo(op.x2, op.y);
      context.stroke();
    } else {
      context.strokeStyle = "#000000";
      context.lineWidth = 1.5;
      context.strokeRect(op.x, op.y, op.size, op.size);
    }
  }
}

function jpeg(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error("No image"))),
      "image/jpeg",
      0.9,
    );
  });
}
