import { parseInspectionReport } from "./pdf-report-parser.js";
import { buildInspectionDocxBlob, buildInspectionFilename } from "./docx-builder.js";
import saveAs from "https://cdn.jsdelivr.net/npm/file-saver@2.0.5/+esm";

const fileInput = document.getElementById("inspection-file-input");
const fileHint = document.getElementById("inspection-file-hint");
const generateBtn = document.getElementById("inspection-generate-btn");
const errorBox = document.getElementById("inspection-error-box");
const progressPanel = document.getElementById("inspection-progress-panel");
const progressAddress = document.getElementById("inspection-progress-address");
const progressFill = document.getElementById("inspection-progress-fill");
const progressText = document.getElementById("inspection-progress-text");
const cancelBtn = document.getElementById("inspection-cancel-btn");
const resultPanel = document.getElementById("inspection-result-panel");
const resultSummary = document.getElementById("inspection-result-summary");
const downloadBtn = document.getElementById("inspection-download-btn");

const SUMMARY_BATCH_SIZE = 30;
const DEFAULT_FILE_HINT = "No file selected, or drop a PDF here. Reports up to ~30MB are supported.";

let pendingBlob = null;
let pendingFilename = "inspection-report-defect-summary.docx";
let activeController = null;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resetResult() {
  resultPanel.hidden = true;
  resultSummary.innerHTML = "";
  pendingBlob = null;
}

function updateFileHint() {
  const file = fileInput.files[0];
  if (file) {
    fileHint.textContent = `${file.name} (${formatBytes(file.size)})`;
    generateBtn.disabled = false;
  } else {
    fileHint.textContent = DEFAULT_FILE_HINT;
    generateBtn.disabled = true;
  }
}

fileInput.addEventListener("change", () => {
  // A newly chosen file invalidates whatever was generated before it —
  // otherwise the old Download button would still be sitting there ready
  // to hand her the previous report's docx.
  clearError();
  resetResult();
  updateFileHint();
});

// Drag-and-drop support: dropping a PDF onto the file input behaves the
// same as picking it from the native dialog.
["dragenter", "dragover"].forEach((evt) => {
  fileInput.addEventListener(evt, (e) => {
    e.preventDefault();
    fileInput.classList.add("file-input--dragover");
  });
});
["dragleave", "dragend", "drop"].forEach((evt) => {
  fileInput.addEventListener(evt, () => {
    fileInput.classList.remove("file-input--dragover");
  });
});
fileInput.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
});

function showError(message, { notice = false } = {}) {
  errorBox.textContent = message;
  errorBox.classList.toggle("error-box--notice", notice);
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
  errorBox.classList.remove("error-box--notice");
}

function setProgress(fraction, text) {
  progressFill.classList.remove("is-indeterminate");
  progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  progressText.textContent = text;
}

function setProgressIndeterminate(text) {
  progressFill.classList.add("is-indeterminate");
  progressText.textContent = text;
}

async function summarizeItems(items, signal) {
  const batches = [];
  for (let i = 0; i < items.length; i += SUMMARY_BATCH_SIZE) {
    batches.push(items.slice(i, i + SUMMARY_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const response = await fetch("/.netlify/functions/summarize-defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
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

function renderResultSummary(report) {
  const redCount = report.items.filter((it) => it.severity === "Red").length;
  const orangeCount = report.items.filter((it) => it.severity === "Orange").length;
  const photoCount = report.items
    .filter((it) => it.severity === "Red")
    .reduce((sum, it) => sum + it.photos.length, 0);

  resultSummary.innerHTML =
    `Found <span class="result-count--red">${redCount} Red</span> and ` +
    `<span class="result-count--orange">${orangeCount} Orange</span> defect item${
      redCount + orangeCount === 1 ? "" : "s"
    } (${photoCount} photo${photoCount === 1 ? "" : "s"} on Red items). Ready to download.`;
}

async function handleGenerate() {
  const file = fileInput.files[0];
  if (!file) return;

  clearError();
  resetResult();

  const controller = new AbortController();
  activeController = controller;

  generateBtn.disabled = true;
  generateBtn.classList.add("is-loading");
  fileInput.disabled = true;
  progressPanel.hidden = false;
  progressAddress.hidden = true;
  progressAddress.textContent = "";
  setProgress(0, "Reading the PDF…");

  try {
    const arrayBuffer = await file.arrayBuffer();

    const report = await parseInspectionReport(
      arrayBuffer,
      (update) => {
        if (update.stage === "cover") {
          if (update.address || update.clientName) {
            progressAddress.textContent = `Found: ${[update.address, update.clientName].filter(Boolean).join(" — ")}`;
            progressAddress.hidden = false;
          }
          return;
        }
        setProgress(update.page / update.totalPages, `Reading page ${update.page} of ${update.totalPages}…`);
      },
      controller.signal
    );

    setProgressIndeterminate(`Summarizing ${report.items.length} defect item${report.items.length === 1 ? "" : "s"}…`);
    const summaryMap = await summarizeItems(report.items, controller.signal);
    for (const item of report.items) {
      item.summary = summaryMap.get(item.itemNumber) || item.description;
    }

    setProgressIndeterminate("Building the Word document…");
    const blob = await buildInspectionDocxBlob(report);

    pendingBlob = blob;
    pendingFilename = buildInspectionFilename(report);
    renderResultSummary(report);

    progressPanel.hidden = true;
    resultPanel.hidden = false;
  } catch (err) {
    progressPanel.hidden = true;
    if (err && err.name === "AbortError") {
      showError("Cancelled — no changes were made. Pick a file and generate whenever you're ready.", { notice: true });
    } else {
      console.error(err);
      showError(err && err.message ? err.message : "Something went wrong generating the summary, please try again.");
    }
  } finally {
    activeController = null;
    generateBtn.disabled = !fileInput.files[0];
    generateBtn.classList.remove("is-loading");
    fileInput.disabled = false;
  }
}

generateBtn.addEventListener("click", handleGenerate);

cancelBtn.addEventListener("click", () => {
  if (activeController) activeController.abort();
});

downloadBtn.addEventListener("click", () => {
  if (!pendingBlob) return;
  saveAs(pendingBlob, pendingFilename);
});

updateFileHint();
