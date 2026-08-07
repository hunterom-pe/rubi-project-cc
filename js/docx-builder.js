import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  PageBreak,
} from "https://cdn.jsdelivr.net/npm/docx@9.7.1/+esm";

const MAX_DISPLAY_WIDTH = 350;

async function blobToUint8Array(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function displayDims(width, height) {
  const w = Math.min(MAX_DISPLAY_WIDTH, width);
  const h = Math.round(w * (height / width));
  return { width: w, height: h };
}

function groupBySection(items, sectionOrder) {
  const bySection = new Map();
  for (const item of items) {
    if (!bySection.has(item.majorSection)) bySection.set(item.majorSection, []);
    bySection.get(item.majorSection).push(item);
  }

  const ordered = [];
  const seen = new Set();
  for (const { number, name } of sectionOrder) {
    if (bySection.has(number)) {
      ordered.push({ number, name, items: bySection.get(number) });
      seen.add(number);
    }
  }
  for (const [number, sectionItems] of bySection) {
    if (!seen.has(number)) {
      ordered.push({ number, name: sectionItems[0].sectionName, items: sectionItems });
    }
  }

  for (const section of ordered) {
    section.items.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }));
  }

  return ordered;
}

async function buildItemParagraphs(item, includePhotos) {
  const paragraphs = [
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun(`${item.itemNumber} — ${item.title}`)],
    }),
    new Paragraph({
      children: [new TextRun(item.summary || item.description || "")],
    }),
  ];

  if (includePhotos) {
    for (const photo of item.photos) {
      try {
        const data = await blobToUint8Array(photo.blob);
        const { width, height } = displayDims(photo.width, photo.height);
        paragraphs.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: "jpg",
                data,
                transformation: { width, height },
              }),
            ],
          })
        );
        if (photo.caption) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: photo.caption, italics: true, size: 18 })],
            })
          );
        }
      } catch (err) {
        // Skip a photo that fails to embed rather than aborting the whole document.
      }
    }
  }

  paragraphs.push(new Paragraph({ children: [] }));
  return paragraphs;
}

async function buildSeverityBlock(title, sections, includePhotos) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(title)],
    }),
  ];

  if (sections.length === 0) {
    children.push(new Paragraph({ children: [new TextRun("None found.")] }));
    return children;
  }

  for (const section of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(section.name)],
      })
    );
    for (const item of section.items) {
      const itemParas = await buildItemParagraphs(item, includePhotos);
      children.push(...itemParas);
    }
  }

  return children;
}

export async function buildInspectionDocument(report) {
  const redItems = report.items.filter((it) => it.severity === "Red");
  const orangeItems = report.items.filter((it) => it.severity === "Orange");

  const redSections = groupBySection(redItems, report.sectionOrder);
  const orangeSections = groupBySection(orangeItems, report.sectionOrder);

  const coverChildren = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun("Home Inspection Defect Summary")],
    }),
    new Paragraph({
      children: [new TextRun({ text: report.address || "Address not found", bold: true })],
    }),
    new Paragraph({
      children: [new TextRun(report.clientName ? `Client: ${report.clientName}` : "")],
    }),
    new Paragraph({
      children: [new TextRun(report.generatedDate ? `Inspection Date: ${report.generatedDate}` : "")],
    }),
    new Paragraph({
      children: [new TextRun(`Summary Generated: ${new Date().toLocaleDateString()}`)],
    }),
    new Paragraph({
      children: [
        new TextRun(
          `${redItems.length} Red (Significant and/or Safety Concern) item${redItems.length === 1 ? "" : "s"}, ${orangeItems.length} Orange (Possible Defect) item${orangeItems.length === 1 ? "" : "s"}.`
        ),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const redChildren = await buildSeverityBlock("Red Defects — Significant and/or Safety Concern", redSections, true);
  const orangeChildren = await buildSeverityBlock("Orange Defects — Possible Defect", orangeSections, false);

  const doc = new Document({
    sections: [
      {
        children: [...coverChildren, ...redChildren, new Paragraph({ children: [new PageBreak()] }), ...orangeChildren],
      },
    ],
  });

  return doc;
}

export async function buildInspectionDocxBlob(report) {
  const doc = await buildInspectionDocument(report);
  return Packer.toBlob(doc);
}

export function buildInspectionFilename(report) {
  const base = (report.address || "inspection-report").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "inspection-report"}-defect-summary.docx`;
}
