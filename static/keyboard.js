/* keyboard.js — Cmd+Enter / Ctrl+Enter submits any form with [data-keyboard-submit]. */
(function () {
  "use strict";
  document.addEventListener("keydown", function (e) {
    if (!(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
    const form = e.target.closest("form[data-keyboard-submit]");
    if (!form) return;
    e.preventDefault();
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  });
})();
