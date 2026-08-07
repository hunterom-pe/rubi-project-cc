(() => {
  const tabs = [
    { btn: document.getElementById("tab-btn-denial"), panel: document.getElementById("tab-denial") },
    { btn: document.getElementById("tab-btn-inspection"), panel: document.getElementById("tab-inspection") },
  ];

  function activate(target) {
    tabs.forEach(({ btn, panel }) => {
      const isActive = btn === target;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      panel.hidden = !isActive;
    });
  }

  tabs.forEach(({ btn }) => {
    btn.addEventListener("click", () => activate(btn));
  });
})();
