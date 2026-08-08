(() => {
  const input = document.getElementById("rewrite-input");
  const charCount = document.getElementById("rewrite-char-count");
  const rewriteBtn = document.getElementById("rewrite-btn");
  const errorBox = document.getElementById("rewrite-error-box");
  const outputEmpty = document.getElementById("rewrite-output-empty");
  const outputFields = document.getElementById("rewrite-output-fields");
  const outputField = document.getElementById("rewrite-output-field");
  const outputStats = document.getElementById("rewrite-output-stats");
  const copyBtn = document.getElementById("rewrite-copy-btn");
  const refineBtn = document.getElementById("rewrite-refine-btn");

  const DRAFT_KEY = "textRewriterDraft";
  const MAX_LENGTH = 20000;

  const LOADING_MESSAGES = [
    "Rewrite",
    "Polishing the prose",
    "Sharpening the pencil",
    "Tidying up the sentences",
    "Ironing out the wrinkles",
    "Dusting off the thesaurus",
  ];
  let loadingMessageTimer = null;

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: input.value }));
    } catch (err) {
      // localStorage unavailable — not critical, skip silently
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.text) input.value = draft.text;
    } catch (err) {
      // corrupt or inaccessible draft — ignore
    }
  }

  function isOverLimit() {
    return input.value.length > MAX_LENGTH;
  }

  function updateCharCount() {
    const length = input.value.length;
    charCount.textContent = `${length.toLocaleString()} / ${MAX_LENGTH.toLocaleString()} characters`;
    charCount.classList.toggle("field-hint--warning", length > MAX_LENGTH);
  }

  function updateButtonState() {
    rewriteBtn.disabled =
      input.value.trim().length === 0 || isOverLimit() || rewriteBtn.classList.contains("is-loading");
  }

  input.addEventListener("input", () => {
    updateCharCount();
    updateButtonState();
    saveDraft();
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function startLoadingMessages() {
    const label = rewriteBtn.querySelector(".btn__label");
    let i = 0;
    label.textContent = LOADING_MESSAGES[0];
    loadingMessageTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      label.textContent = LOADING_MESSAGES[i];
    }, 1400);
  }

  function stopLoadingMessages() {
    if (loadingMessageTimer) {
      clearInterval(loadingMessageTimer);
      loadingMessageTimer = null;
    }
    rewriteBtn.querySelector(".btn__label").textContent = "Rewrite";
  }

  function setLoading(isLoading) {
    rewriteBtn.classList.toggle("is-loading", isLoading);
    rewriteBtn.disabled = isLoading || !input.value.trim() || isOverLimit();
    input.disabled = isLoading;

    if (isLoading) {
      startLoadingMessages();
    } else {
      stopLoadingMessages();
    }
  }

  function renderEmpty() {
    outputEmpty.hidden = false;
    outputFields.hidden = true;
    copyBtn.disabled = true;
    refineBtn.disabled = true;
  }

  function wordCount(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  async function handleRewrite() {
    const text = input.value.trim();
    if (!text || isOverLimit()) return;

    clearError();
    setLoading(true);

    try {
      const response = await fetch("/.netlify/functions/rewrite-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.rewritten) {
        throw new Error("Malformed response from server");
      }

      outputField.value = data.rewritten;
      outputStats.textContent = `${wordCount(data.rewritten)} words, ${data.rewritten.length.toLocaleString()} characters`;
      outputEmpty.hidden = true;
      outputFields.hidden = false;
      copyBtn.disabled = false;
      refineBtn.disabled = false;
      outputField.focus();
    } catch (err) {
      console.error(err);
      renderEmpty();
      showError("Something went wrong rewriting the text, please try again.");
    } finally {
      setLoading(false);
    }
  }

  rewriteBtn.addEventListener("click", handleRewrite);

  copyBtn.addEventListener("click", async () => {
    if (copyBtn.disabled) return;

    try {
      await navigator.clipboard.writeText(outputField.value);
      const label = copyBtn.querySelector(".btn__label");
      const originalText = label.textContent;
      copyBtn.classList.add("btn--copied");
      label.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.classList.remove("btn--copied");
        label.textContent = originalText;
      }, 1600);
    } catch (err) {
      console.error("Copy failed", err);
      showError("Couldn't copy to clipboard — please select and copy the text manually.");
    }
  });

  refineBtn.addEventListener("click", () => {
    if (refineBtn.disabled) return;

    input.value = outputField.value;
    updateCharCount();
    updateButtonState();
    saveDraft();
    renderEmpty();
    clearError();
    input.focus();
  });

  restoreDraft();
  updateCharCount();
  updateButtonState();
})();
