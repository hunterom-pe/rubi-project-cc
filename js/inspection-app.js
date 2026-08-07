import { parseInspectionReport } from "./pdf-report-parser.js";
import { buildInspectionDocxBlob, buildInspectionFilename } from "./docx-builder.js";
import saveAs from "https://cdn.jsdelivr.net/npm/file-saver@2.0.5/+esm";

const fileInput = document.getElementById("inspection-file-input");
const fileHint = document.getElementById("inspection-file-hint");
const generateBtn = document.getElementById("inspection-generate-btn");
const errorBox = document.getElementById("inspection-error-box");
const progressPanel = document.getElementById("inspection-progress-panel");
const progressFill = document.getElementById("inspection-progress-fill");
const progressText = document.getElementById("inspection-progress-text");
const resultPanel = document.getElementById("inspection-result-panel");
const resultSummary = document.getElementById("inspection-result-summary");
const downloadBtn = document.getElementById("inspection-download-btn");

const SUMMARY_BATCH_SIZE = 30;

let pendingBlob = null;
let pendingFilename = "inspection-report-defect-summary.docx";

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    fileHint.textContent = `${file.name} (${formatBytes(file.size)})`;
    generateBtn.disabled = false;
  } else {
    fileHint.textContent = "No file selected. Reports up to ~30MB are supported.";
    generateBtn.disabled = true;
  }
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function setProgress(fraction, text) {
  progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  progressText.textContent = text;
}

async function summarizeItems(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += SUMMARY_BATCH_SIZE) {
    batches.push(items.slice(i, i + SUMMARY_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const response = await fetch("/.netlify/functions/summarize-defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: batch.map((it) => ({
            itemNumber: it.itemNumber,
            title: it.title,
            description: it.description,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Summarization request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.summaries)) {
        throw new Error("Malformed summarization response");
      }
      return data.summaries;
    })
  );

  const summaryMap = new Map();
  for (const batchResult of results) {
    for (const { itemNumber, summary } of batchResult) {
      summaryMap.set(itemNumber, summary);
    }
  }
  return summaryMap;
}

async function handleGenerate() {
  const file = fileInput.files[0];
  if (!file) return;

  clearError();
  resultPanel.hidden = true;
  pendingBlob = null;

  generateBtn.disabled = true;
  generateBtn.classList.add("is-loading");
  fileInput.disabled = true;
  progressPanel.hidden = false;
  setProgress(0, "Reading the PDF…");

  try {
    const arrayBuffer = await file.arrayBuffer();

    const report = await parseInspectionReport(arrayBuffer, ({ page, totalPages }) => {
      setProgress(page / totalPages, `Reading page ${page} of ${totalPages}…`);
    });

    setProgress(1, `Summarizing ${report.items.length} defect item${report.items.length === 1 ? "" : "s"}…`);
    const summaryMap = await summarizeItems(report.items);
    for (const item of report.items) {
      item.summary = summaryMap.get(item.itemNumber) || item.description;
    }

    setProgress(1, "Building the Word document…");
    const blob = await buildInspectionDocxBlob(report);

    pendingBlob = blob;
    pendingFilename = buildInspectionFilename(report);

    const redCount = report.items.filter((it) => it.severity === "Red").length;
    const orangeCount = report.items.filter((it) => it.severity === "Orange").length;
    const photoCount = report.items
      .filter((it) => it.severity === "Red")
      .reduce((sum, it) => sum + it.photos.length, 0);

    resultSummary.textContent = `Found ${redCount} Red and ${orangeCount} Orange defect item${
      redCount + orangeCount === 1 ? "" : "s"
    } (${photoCount} photo${photoCount === 1 ? "" : "s"} on Red items). Ready to download.`;

    progressPanel.hidden = true;
    resultPanel.hidden = false;
  } catch (err) {
    console.error(err);
    progressPanel.hidden = true;
    showError(err && err.message ? err.message : "Something went wrong generating the summary, please try again.");
  } finally {
    generateBtn.disabled = !fileInput.files[0];
    generateBtn.classList.remove("is-loading");
    fileInput.disabled = false;
  }
}

generateBtn.addEventListener("click", handleGenerate);

downloadBtn.addEventListener("click", () => {
  if (!pendingBlob) return;
  saveAs(pendingBlob, pendingFilename);
});
