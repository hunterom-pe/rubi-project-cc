(() => {
  const form = document.getElementById("denial-form");
  const claimInput = document.getElementById("claim-text");
  const reasonInput = document.getElementById("reason-text");
  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const mailtoBtn = document.getElementById("mailto-btn");
  const outputEmpty = document.getElementById("output-empty");
  const outputFields = document.getElementById("output-fields");
  const subjectField = document.getElementById("output-subject-field");
  const bodyField = document.getElementById("output-body-field");
  const errorBox = document.getElementById("error-box");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const clearHistoryBtn = document.getElementById("clear-history-btn");

  const DRAFT_KEY = "warrantyDenialDraft";
  const HISTORY_KEY = "warrantyDenialHistory";
  const HISTORY_LIMIT = 10;

  const LOADING_MESSAGES = [
    "Writing the Email",
    "Tending the crops",
    "Asking Lewis for advice",
    "Sharpening the quill",
    "Consulting the almanac",
    "Drafting by candlelight",
  ];
  let loadingMessageTimer = null;

  function saveDraft() {
    try {
      const length = form.querySelector('input[name="length"]:checked').value;
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ claim: claimInput.value, reason: reasonInput.value, length })
      );
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) — not critical, skip silently
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.claim) claimInput.value = draft.claim;
      if (draft.reason) reasonInput.value = draft.reason;
      if (draft.length) {
        const radio = form.querySelector(`input[name="length"][value="${draft.length}"]`);
        if (radio) radio.checked = true;
      }
    } catch (err) {
      // corrupt or inaccessible draft — ignore
    }
  }

  function updateGenerateState() {
    const hasClaim = claimInput.value.trim().length > 0;
    const hasReason = reasonInput.value.trim().length > 0;
    generateBtn.disabled = !(hasClaim && hasReason) || generateBtn.classList.contains("is-loading");
  }

  claimInput.addEventListener("input", () => {
    updateGenerateState();
    saveDraft();
  });
  reasonInput.addEventListener("input", () => {
    updateGenerateState();
    saveDraft();
  });
  form.querySelectorAll('input[name="length"]').forEach((radio) => {
    radio.addEventListener("change", saveDraft);
  });

  function startLoadingMessages() {
    const label = generateBtn.querySelector(".btn__label");
    let i = 0;
    label.textContent = LOADING_MESSAGES[0];
    loadingMessageTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      label.textContent = LOADING_MESSAGES[i];
    }, 1600);
  }

  function stopLoadingMessages() {
    if (loadingMessageTimer) {
      clearInterval(loadingMessageTimer);
      loadingMessageTimer = null;
    }
    generateBtn.querySelector(".btn__label").textContent = "Write the Email";
  }

  function setLoading(isLoading) {
    generateBtn.classList.toggle("is-loading", isLoading);
    generateBtn.disabled = isLoading || !(claimInput.value.trim() && reasonInput.value.trim());
    claimInput.disabled = isLoading;
    reasonInput.disabled = isLoading;

    if (isLoading) {
      startLoadingMessages();
    } else {
      stopLoadingMessages();
    }
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function renderEmail(subject, body) {
    subjectField.value = subject;
    bodyField.value = body;

    outputEmpty.hidden = true;
    outputFields.hidden = false;

    copyBtn.disabled = false;
    mailtoBtn.disabled = false;

    subjectField.focus();
  }

  function renderEmpty() {
    outputEmpty.hidden = false;
    outputFields.hidden = true;
    copyBtn.disabled = true;
    mailtoBtn.disabled = true;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      // localStorage unavailable — history just won't persist this session
    }
  }

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderHistory() {
    const history = loadHistory();

    historyList.querySelectorAll(".history-item").forEach((el) => el.remove());

    if (history.length === 0) {
      historyEmpty.hidden = false;
      clearHistoryBtn.hidden = true;
      return;
    }

    historyEmpty.hidden = true;
    clearHistoryBtn.hidden = false;

    history.forEach((entry) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";

      const subjectEl = document.createElement("span");
      subjectEl.className = "history-item__subject";
      subjectEl.textContent = entry.subject;

      const metaEl = document.createElement("span");
      metaEl.className = "history-item__meta";
      metaEl.textContent = `${formatTimestamp(entry.timestamp)} · ${entry.length}`;

      const snippetEl = document.createElement("span");
      snippetEl.className = "history-item__snippet";
      snippetEl.textContent = entry.body;

      item.appendChild(subjectEl);
      item.appendChild(metaEl);
      item.appendChild(snippetEl);

      item.addEventListener("click", () => {
        clearError();
        renderEmail(entry.subject, entry.body);
      });

      historyList.appendChild(item);
    });
  }

  function addToHistory(subject, body, length) {
    const history = loadHistory();
    history.unshift({ timestamp: Date.now(), subject, body, length });
    saveHistory(history.slice(0, HISTORY_LIMIT));
    renderHistory();
  }

  clearHistoryBtn.addEventListener("click", () => {
    if (!window.confirm("Clear all saved email history? This can't be undone.")) return;
    saveHistory([]);
    renderHistory();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const claim = claimInput.value.trim();
    const reason = reasonInput.value.trim();
    const length = form.querySelector('input[name="length"]:checked').value;

    if (!claim || !reason) {
      updateGenerateState();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/.netlify/functions/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim, reason, length }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (!data || !data.subject || !data.body) {
        throw new Error("Malformed response from server");
      }

      renderEmail(data.subject, data.body);
      addToHistory(data.subject, data.body, length);
    } catch (err) {
      console.error(err);
      renderEmpty();
      showError("Something went wrong generating the email, please try again.");
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (copyBtn.disabled) return;

    const fullText = `Subject: ${subjectField.value}\n\n${bodyField.value}`;

    try {
      await navigator.clipboard.writeText(fullText);
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

  mailtoBtn.addEventListener("click", () => {
    if (mailtoBtn.disabled) return;

    const subject = encodeURIComponent(subjectField.value);
    const body = encodeURIComponent(bodyField.value);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });

  restoreDraft();
  updateGenerateState();
  renderHistory();
})();
