(() => {
  const form = document.getElementById("denial-form");
  const claimInput = document.getElementById("claim-text");
  const reasonInput = document.getElementById("reason-text");
  const generateBtn = document.getElementById("generate-btn");
  const copyBtn = document.getElementById("copy-btn");
  const outputBox = document.getElementById("output-box");
  const errorBox = document.getElementById("error-box");

  let lastEmail = null; // { subject, body }

  function updateGenerateState() {
    const hasClaim = claimInput.value.trim().length > 0;
    const hasReason = reasonInput.value.trim().length > 0;
    generateBtn.disabled = !(hasClaim && hasReason) || generateBtn.classList.contains("is-loading");
  }

  claimInput.addEventListener("input", updateGenerateState);
  reasonInput.addEventListener("input", updateGenerateState);

  function setLoading(isLoading) {
    generateBtn.classList.toggle("is-loading", isLoading);
    generateBtn.disabled = isLoading || !(claimInput.value.trim() && reasonInput.value.trim());
    claimInput.disabled = isLoading;
    reasonInput.disabled = isLoading;
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
    outputBox.innerHTML = "";

    const subjectEl = document.createElement("p");
    subjectEl.className = "output-subject";
    subjectEl.textContent = `Subject: ${subject}`;

    const bodyEl = document.createElement("p");
    bodyEl.className = "output-body";
    bodyEl.textContent = body;

    outputBox.appendChild(subjectEl);
    outputBox.appendChild(bodyEl);

    copyBtn.disabled = false;
  }

  function renderEmpty() {
    outputBox.innerHTML = '<p class="output-empty">🌱 Your generated email will sprout here once you fill in the claim and reason, then click "Write the Email".</p>';
    copyBtn.disabled = true;
  }

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

      lastEmail = { subject: data.subject, body: data.body };
      renderEmail(data.subject, data.body);
    } catch (err) {
      console.error(err);
      lastEmail = null;
      renderEmpty();
      showError("Something went wrong generating the email, please try again.");
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!lastEmail) return;

    const fullText = `Subject: ${lastEmail.subject}\n\n${lastEmail.body}`;

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

  updateGenerateState();
})();
