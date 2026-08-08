(() => {
  const input = document.getElementById("rewrite-input");
  const rewriteBtn = document.getElementById("rewrite-btn");
  const errorBox = document.getElementById("rewrite-error-box");
  const outputEmpty = document.getElementById("rewrite-output-empty");
  const outputFields = document.getElementById("rewrite-output-fields");
  const outputField = document.getElementById("rewrite-output-field");
  const copyBtn = document.getElementById("rewrite-copy-btn");

  function updateButtonState() {
    rewriteBtn.disabled = input.value.trim().length === 0 || rewriteBtn.classList.contains("is-loading");
  }

  input.addEventListener("input", updateButtonState);

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function setLoading(isLoading) {
    rewriteBtn.classList.toggle("is-loading", isLoading);
    rewriteBtn.disabled = isLoading || !input.value.trim();
    input.disabled = isLoading;
  }

  function renderEmpty() {
    outputEmpty.hidden = false;
    outputFields.hidden = true;
    copyBtn.disabled = true;
  }

  async function handleRewrite() {
    const text = input.value.trim();
    if (!text) return;

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
      outputEmpty.hidden = true;
      outputFields.hidden = false;
      copyBtn.disabled = false;
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

  updateButtonState();
})();
