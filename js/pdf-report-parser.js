import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

const ITEM_HEADING_RE = /^(\d+)\.(\d+)\.(\d+)\s+(.+)$/;
const TOC_LINE_RE = /^(\d+):\s+(.+)$/;
const SECTION_HEADER_RE = /^(\d+):\s+([A-Z0-9][A-Z0-9 &/,'-]*)$/;
const DIVIDER_TEXT = "possible defect, contractor recommendation";
const RED_MARKER_TEXT = "significant and/or safety concern";
const ICON_MAX_DIM = 400;
const PHOTO_MAX_DIM = 1000;
const PHOTO_JPEG_QUALITY = 0.82;
const CAPTION_MAX_LEN = 220;
const NULLCHAR = "\u0000";

// Some embedded report fonts lack ToUnicode entries for ligature glyphs
// (fi/ff/fl/ffi/ffl), so pdf.js decodes them as U+0000. We can't always know
// which ligature was intended, but a domain word list covers the common
// cases; anything left over defaults to "fi", the most frequent ligature.
const LIGATURE_FIXES = [
  ["significant", "fi"], ["significantly", "fi"], ["significance", "fi"], ["insignificant", "fi"],
  ["roofing", "fi"], ["roofed", "fi"],
  ["office", "ffi"], ["officer", "ffi"], ["official", "ffi"],
  ["difficult", "ff"], ["difficulty", "ff"], ["differ", "ff"], ["different", "ff"], ["difference", "ff"],
  ["efficient", "ffi"], ["efficiently", "ffi"], ["efficiency", "ffi"],
  ["sufficient", "ffi"], ["sufficiently", "ffi"], ["insufficient", "ffi"],
  ["deficient", "fi"], ["deficiency", "fi"], ["deficiencies", "fi"],
  ["fixture", "fi"], ["fixtures", "fi"], ["fix", "fi"], ["fixed", "fi"], ["fixing", "fi"],
  ["unfinished", "fi"], ["finished", "fi"], ["finish", "fi"], ["finishing", "fi"],
  ["fireplace", "fi"], ["fire", "fi"],
  ["qualified", "fi"], ["qualification", "fi"],
  ["identified", "fi"], ["identification", "fi"], ["verified", "fi"], ["verification", "fi"],
  ["confirm", "fi"], ["confirmed", "fi"], ["configuration", "fi"],
  ["modification", "fi"], ["modified", "fi"], ["classification", "fi"],
  ["specific", "fi"], ["specifically", "fi"],
  ["benefit", "fi"], ["beneficial", "fi"],
  ["unfit", "fi"], ["staff", "ff"], ["staffing", "ff"],
  ["off", "ff"], ["offset", "ff"], ["offshoot", "ff"], ["cutoff", "ff"], ["takeoff", "ff"],
  ["first", "fi"], ["fifty", "fi"], ["fifth", "fi"], ["fifteen", "fi"],
  ["effective", "ff"], ["effectively", "ff"], ["effectiveness", "ff"],
  ["ineffective", "ff"], ["ineffectively", "ff"], ["ineffectiveness", "ff"],
  ["inefficient", "ffi"], ["inefficiently", "ffi"], ["inefficiency", "ffi"], ["inefficiencies", "ffi"],
];

function ligaturePatternFromWord(word, ligature) {
  const li = word.indexOf(ligature);
  if (li === -1) return word;
  return word.slice(0, li) + NULLCHAR + word.slice(li + ligature.length);
}

const LIGATURE_PATTERNS = LIGATURE_FIXES.map(([word, ligature]) => [ligaturePatternFromWord(word, ligature), word])
  .filter(([broken]) => broken.includes(NULLCHAR))
  .sort((a, b) => b[0].length - a[0].length);

export function fixLigatures(text) {
  if (!text || !text.includes(NULLCHAR)) return text;
  let result = text;

  for (const [broken, fixed] of LIGATURE_PATTERNS) {
    const startsWithLetter = /^[a-zA-Z]/.test(broken);
    const endsWithLetter = /[a-zA-Z]$/.test(broken);
    const prefix = startsWithLetter ? "(?<![a-zA-Z])" : "";
    const suffix = endsWithLetter ? "(?![a-zA-Z])" : "";
    const re = new RegExp(prefix + broken + suffix, "gi");
    result = result.replace(re, (match) => {
      // Ignore the null placeholder when reading case: for a word-initial
      // ligature, match[0] would be the null char itself, which trivially
      // "uppercases to itself" and would wrongly force capitalization.
      const letters = match.replace(/[^a-zA-Z]/g, "");
      if (letters && letters === letters.toUpperCase()) return fixed.toUpperCase();
      const firstLetter = letters[0];
      if (firstLetter && firstLetter === firstLetter.toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
      return fixed;
    });
  }

  // Anything left over is an unrecognized word — but not every U+0000 glyph
  // is actually a ligature; some report templates use a standalone icon
  // glyph (e.g. a "recommended service" icon) that also decodes to U+0000.
  // Treat it as a ligature whenever it touches a letter on either side
  // (word-initial, word-final, or mid-word); only a fully isolated
  // occurrence (letters on neither side) is dropped.
  result = result.replace(/([a-zA-Z]?)\u0000([a-zA-Z]?)/g, (match, before, after) => {
    if (before || after) return `${before}fi${after}`;
    return `${before}${after}`;
  });
  return result;
}

/**
 * Group a page's text content items into visual lines, sorted top-to-bottom
 * then left-to-right, using Y-proximity clustering.
 */
export function groupTextIntoLines(textContent, viewportHeight) {
  const items = textContent.items
    .filter((it) => it.str && it.str.trim().length > 0)
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      width: it.width || 0,
    }));

  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  const Y_TOLERANCE = 3;
  for (const item of items) {
    let line = lines.find((l) => Math.abs(l.y - item.y) <= Y_TOLERANCE);
    if (!line) {
      line = { y: item.y, parts: [] };
      lines.push(line);
    }
    line.parts.push(item);
  }

  lines.sort((a, b) => b.y - a.y);

  const CLUSTER_GAP = 15;

  return lines.map((line) => {
    line.parts.sort((a, b) => a.x - b.x);

    // Only insert a space between items when there's an actual visual gap —
    // a ligature glyph (fi/ff/fl) that pdf.js can't decode often arrives as
    // its own tiny text item flush against its neighbors, and naively
    // joining every item with " " would wrongly split words around it.
    // A much bigger gap (CLUSTER_GAP) marks a new visual cluster — e.g.
    // separate photo captions that happen to sit on the same text row.
    let joined = "";
    let prevEndX = null;
    const clusters = [];
    let currentCluster = "";
    for (const part of line.parts) {
      if (prevEndX !== null) {
        const gap = part.x - prevEndX;
        if (gap > CLUSTER_GAP) {
          clusters.push(currentCluster.trim());
          currentCluster = "";
          joined += " ";
        } else if (gap > 1) {
          joined += " ";
          currentCluster += " ";
        }
      }
      joined += part.str;
      currentCluster += part.str;
      prevEndX = part.x + part.width;
    }
    if (currentCluster.trim()) clusters.push(currentCluster.trim());

    const rawText = joined.replace(/\s+/g, " ").trim();
    const text = fixLigatures(rawText);
    const fixedClusters = clusters.map((c) => fixLigatures(c.replace(/\s+/g, " ").trim())).filter(Boolean);
    const marginRatio = 1 - line.y / viewportHeight;
    return {
      y: line.y,
      text,
      clusters: fixedClusters,
      isNearTopOrBottom: marginRatio < 0.06 || marginRatio > 0.94,
    };
  });
}

/**
 * Walk a page's operator list, tracking the CTM, to find embedded raster
 * images (not vector-drawn shapes). Returns [{ y, canvas, width, height }].
 */
async function extractPageImages(page, opList) {
  const results = [];
  let stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  function multiply(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  }

  const { OPS } = pdfjsLib;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || ctm;
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args);
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const objId = args[0];
      let imgObj;
      try {
        imgObj = await new Promise((resolve) => {
          if (page.objs.has(objId)) {
            resolve(page.objs.get(objId));
          } else {
            page.objs.get(objId, resolve);
          }
        });
      } catch (err) {
        continue;
      }
      if (!imgObj) continue;

      const width = imgObj.width;
      const height = imgObj.height;
      if (!width || !height) continue;

      // Approximate page-space Y of the image (unit square mapped through CTM).
      const topY = ctm[3] + ctm[5];
      const bottomY = ctm[5];
      const approxY = (topY + bottomY) / 2;

      const canvas = imageObjToCanvas(imgObj, width, height);
      if (!canvas) continue;

      results.push({ y: approxY, canvas, width, height });
    }
  }

  return results;
}

function imageObjToCanvas(imgObj, width, height) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (imgObj.bitmap) {
      ctx.drawImage(imgObj.bitmap, 0, 0, width, height);
      return canvas;
    }

    if (imgObj.data) {
      const pixelCount = width * height;
      const data = imgObj.data;
      let rgba;
      if (data.length === pixelCount * 4) {
        rgba = new Uint8ClampedArray(data);
      } else if (data.length === pixelCount * 3) {
        rgba = new Uint8ClampedArray(pixelCount * 4);
        for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
          rgba[j] = data[i];
          rgba[j + 1] = data[i + 1];
          rgba[j + 2] = data[i + 2];
          rgba[j + 3] = 255;
        }
      } else {
        return null;
      }
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      return canvas;
    }

    return null;
  } catch (err) {
    return null;
  }
}

function isLikelyIcon(width, height) {
  return width <= ICON_MAX_DIM && height <= ICON_MAX_DIM;
}

function downscaleCanvas(canvas, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", PHOTO_JPEG_QUALITY);
  });
}

function extractSectionMap(pageLines) {
  const sectionMap = new Map();
  const order = [];
  for (const line of pageLines) {
    const m = line.text.match(TOC_LINE_RE);
    if (!m) continue;
    const number = m[1];
    const name = m[2].replace(/\s*\d+\s*$/, "").trim();
    if (!name) continue;
    if (!sectionMap.has(number)) {
      sectionMap.set(number, name);
      order.push(number);
    }
  }
  return { sectionMap, order };
}

function extractCoverInfo(pageLines) {
  const texts = pageLines.map((l) => l.text);
  let address = "";
  let clientName = "";
  let generatedDate = "";

  const dateIndex = texts.findIndex((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t));
  const titleIndex = texts.findIndex((t) => /home\s+inspection\s+report/i.test(t));

  if (dateIndex > 0) {
    generatedDate = texts[dateIndex];
    clientName = texts[dateIndex - 1] || "";
  }

  if (titleIndex >= 0) {
    const addrLines = [];
    for (let i = titleIndex + 1; i < (dateIndex > 0 ? dateIndex - 1 : texts.length); i++) {
      if (!texts[i]) continue;
      addrLines.push(texts[i]);
    }
    address = addrLines.join(", ");
  }

  return { address, clientName, generatedDate };
}

async function buildPageEvents(page) {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const lines = groupTextIntoLines(textContent, viewport.height);

  const opList = await page.getOperatorList();
  const images = await extractPageImages(page, opList);

  const events = [];
  for (const line of lines) {
    events.push({
      type: "line",
      y: line.y,
      text: line.text,
      clusters: line.clusters,
      isNearTopOrBottom: line.isNearTopOrBottom,
    });
  }
  for (const img of images) {
    events.push({ type: "image", y: img.y, canvas: img.canvas, width: img.width, height: img.height });
  }
  events.sort((a, b) => b.y - a.y);

  return { events };
}

export async function parseInspectionReport(arrayBuffer, onProgress) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Cover info from page 1.
  let clientName = "";
  let address = "";
  let generatedDate = "";
  try {
    const coverPage = await pdfDoc.getPage(1);
    const coverText = await coverPage.getTextContent();
    const coverViewport = coverPage.getViewport({ scale: 1 });
    const coverLines = groupTextIntoLines(coverText, coverViewport.height);
    const info = extractCoverInfo(coverLines);
    clientName = info.clientName;
    address = info.address;
    generatedDate = info.generatedDate;
  } catch (err) {
    // Non-critical — leave cover fields blank if the template doesn't match.
  }

  // Section map from the first several pages (TOC).
  const sectionMap = new Map();
  const sectionOrder = [];
  const tocScanPages = Math.min(6, numPages);
  for (let p = 1; p <= tocScanPages; p++) {
    const page = await pdfDoc.getPage(p);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const lines = groupTextIntoLines(textContent, viewport.height);
    const { sectionMap: pageMap, order } = extractSectionMap(lines);
    for (const num of order) {
      if (!sectionMap.has(num)) {
        sectionMap.set(num, pageMap.get(num));
        sectionOrder.push(num);
      }
    }
  }

  const items = [];
  let currentItem = null;
  let inDefectZone = false;
  let awaitingTitle = false;
  let capturingDescription = false;
  let awaitingCaption = false;
  let pendingCaptionPhotos = [];

  function finalizeCurrentItem() {
    if (currentItem && currentItem.title) {
      currentItem.description = currentItem.descriptionLines.join(" ").replace(/\s+/g, " ").trim();
      delete currentItem.descriptionLines;
      items.push(currentItem);
    }
    currentItem = null;
    awaitingTitle = false;
    capturingDescription = false;
    awaitingCaption = false;
    pendingCaptionPhotos = [];
  }

  for (let p = 1; p <= numPages; p++) {
    if (onProgress) {
      try {
        onProgress({ page: p, totalPages: numPages });
      } catch (err) {
        // ignore progress callback errors
      }
    }

    // Force a real yield to the event loop so the browser gets a chance to
    // paint the progress bar — awaiting pdf.js calls alone doesn't guarantee
    // that since many resolve via microtasks without a render opportunity.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const page = await pdfDoc.getPage(p);
    const { events } = await buildPageEvents(page);

    for (const event of events) {
      if (event.type === "line") {
        const trimmed = event.text.trim();
        const lower = trimmed.toLowerCase();

        if (lower === DIVIDER_TEXT) {
          inDefectZone = true;
          continue;
        }

        // A new top-level section (e.g. "4: EXTERIOR") closes out whatever
        // item was active and requires a fresh divider before the next
        // section's items are recognized — this stops general/representative
        // photos on a section's info page from bleeding into the previous
        // section's last item.
        const sectionHeaderMatch = trimmed.match(SECTION_HEADER_RE);
        if (sectionHeaderMatch && sectionMap.has(sectionHeaderMatch[1])) {
          finalizeCurrentItem();
          inDefectZone = false;
          continue;
        }

        const headingMatch = trimmed.match(ITEM_HEADING_RE);
        if (headingMatch && inDefectZone) {
          finalizeCurrentItem();

          const [, major, minor, sub] = headingMatch;
          const itemNumber = `${major}.${minor}.${sub}`;
          const isRed = lower.includes(RED_MARKER_TEXT);

          currentItem = {
            itemNumber,
            majorSection: major,
            sectionName: sectionMap.get(major) || `Section ${major}`,
            title: "",
            severity: isRed ? "Red" : "Orange",
            descriptionLines: [],
            photos: [],
          };
          awaitingTitle = true;
          capturingDescription = false;
          awaitingCaption = false;
          pendingCaptionPhotos = [];
          continue;
        }

        if (!currentItem) continue;

        if (awaitingTitle) {
          if (lower.includes(RED_MARKER_TEXT)) {
            currentItem.severity = "Red";
            continue;
          }
          currentItem.title = trimmed;
          awaitingTitle = false;
          capturingDescription = true;
          continue;
        }

        if (event.isNearTopOrBottom) continue;

        if (/^roc standard/i.test(trimmed)) {
          capturingDescription = false;
          awaitingCaption = false;
          pendingCaptionPhotos = [];
          continue;
        }

        if (awaitingCaption && pendingCaptionPhotos.length > 0) {
          awaitingCaption = false;
          if (trimmed.length > 0 && trimmed.length <= CAPTION_MAX_LEN && !/^roc standard/i.test(trimmed)) {
            const captionParts = event.clusters && event.clusters.length > 0 ? event.clusters : [trimmed];
            if (captionParts.length === pendingCaptionPhotos.length) {
              // One caption cluster per pending photo, in left-to-right order.
              pendingCaptionPhotos.forEach((photo, i) => {
                if (!photo.caption) photo.caption = captionParts[i];
              });
            } else {
              // Counts don't line up — fall back to giving the whole line to
              // the most recently added photo rather than guessing wrong.
              const lastPhoto = pendingCaptionPhotos[pendingCaptionPhotos.length - 1];
              if (lastPhoto && !lastPhoto.caption) lastPhoto.caption = trimmed;
            }
            pendingCaptionPhotos = [];
            continue;
          }
          pendingCaptionPhotos = [];
        }

        if (capturingDescription) {
          currentItem.descriptionLines.push(trimmed);
        }
      } else if (event.type === "image") {
        if (!currentItem) continue;
        if (isLikelyIcon(event.width, event.height)) continue;

        const small = downscaleCanvas(event.canvas, PHOTO_MAX_DIM);
        const blob = await canvasToJpegBlob(small);
        if (!blob) continue;

        const photo = { blob, caption: "", width: small.width, height: small.height };
        currentItem.photos.push(photo);
        pendingCaptionPhotos.push(photo);
        awaitingCaption = true;
      }
    }
  }

  finalizeCurrentItem();

  if (items.length === 0) {
    throw new Error(
      "No defect items were found in this PDF. It may not match the expected inspection report format."
    );
  }

  return {
    clientName,
    address,
    generatedDate,
    sectionOrder: sectionOrder.map((num) => ({ number: num, name: sectionMap.get(num) })),
    items,
    numPages,
  };
}
