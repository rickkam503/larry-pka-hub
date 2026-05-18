// One delegated click handler for any .dash-try-copy button on the page.
// Reads the button's data-copy attribute, writes it to the clipboard, and
// flips the button into a transient "copied" state so Rick sees feedback.
// Plain vanilla — no framework, no build step, in keeping with the local
// stack discipline.
(function () {
  "use strict";

  var COPIED_MS = 1200;

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".dash-try-copy");
    if (!button) return;

    event.preventDefault();

    var text = button.getAttribute("data-copy") || "";
    if (!text) return;

    var done = function () {
      var original = button.getAttribute("data-original-label") || button.textContent;
      button.setAttribute("data-original-label", original);
      button.textContent = "copied";
      button.classList.add("is-copied");
      window.setTimeout(function () {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, COPIED_MS);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        // Clipboard API can fail under non-secure contexts; surface a
        // muted hint rather than swallowing silently.
        button.textContent = "copy failed";
        window.setTimeout(function () {
          button.textContent = button.getAttribute("data-original-label") || "copy";
        }, COPIED_MS);
      });
    } else {
      // Older browser fallback — local-only UI, unlikely but cheap.
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (e) {
        button.textContent = "copy failed";
      }
      document.body.removeChild(ta);
    }
  });
})();
