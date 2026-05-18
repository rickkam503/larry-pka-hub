/* tag-input.js — chip-input + autocomplete + explicit "create new tag".
 *
 * Wren's Pattern 2 spec, applied to every entity form. No build step,
 * no framework — vanilla JS that progressively enhances the noscript
 * textarea fallback in `_tag_input.html`.
 *
 * Keyboard contract (per Wren's spec):
 *   - typing filters the dropdown by case-insensitive substring on the
 *     normalized form;
 *   - Enter/Tab/comma commits a chip ONLY if the typed term matches an
 *     existing tag after normalization;
 *   - new tags require explicit click on the "+ Create new tag: …" row,
 *     or Down-arrow-then-Enter onto it. Plain Enter never spawns a new
 *     tag;
 *   - backspace on empty input removes the last chip;
 *   - chip ×-button removes that chip.
 *
 * Form submit posts hidden <input name="tags" value="…"> for each chip;
 * the server consumes form.getlist("tags") and passes the list to
 * `pkm.inserts.create_*` / `pkm.updates.update_*`.
 */
(function () {
  "use strict";

  const MAX_TAGS = 10;
  const TAG_MAX_LEN = 30;

  // Normalization: lowercase, ASCII, hyphenated, trimmed, ≤30 chars.
  // Mirrors the rules in Library/tag-vocabulary.md so the chip the user
  // sees is what the server will store.
  function normalize(raw) {
    if (raw == null) return "";
    let s = String(raw).trim().toLowerCase();
    // strip accents → ASCII
    s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    // anything not [a-z0-9] becomes a hyphen
    s = s.replace(/[^a-z0-9]+/g, "-");
    // collapse multiple hyphens, trim leading/trailing
    s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    if (s.length > TAG_MAX_LEN) s = s.slice(0, TAG_MAX_LEN).replace(/-+$/, "");
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c];
    });
  }

  function init(wrap) {
    const noscript = wrap.querySelector("noscript");
    const ui = wrap.querySelector(".tag-input");
    if (!ui) return;
    ui.hidden = false;
    if (noscript) noscript.remove();

    let existing;
    try {
      existing = JSON.parse(wrap.dataset.existingTags || "[]");
    } catch (_) {
      existing = [];
    }
    const existingSet = new Set(existing.map((t) => normalize(t)));

    const chipsList = ui.querySelector(".tag-chips");
    const entry = ui.querySelector(".tag-input__entry");
    const suggestions = ui.querySelector(".tag-input__suggestions");
    let highlighted = -1; // index into the visible suggestion items

    function currentChips() {
      return Array.from(chipsList.querySelectorAll(".tag-chip"))
        .map((li) => li.querySelector("input[name='tags']").value);
    }

    function addChip(name) {
      const norm = normalize(name);
      if (!norm) return false;
      if (currentChips().includes(norm)) return false;
      if (currentChips().length >= MAX_TAGS) return false;
      const li = document.createElement("li");
      li.className = "tag-chip";
      li.innerHTML =
        "<span>" + escapeHtml(norm) + "</span>" +
        "<button type='button' class='tag-chip__remove' aria-label='remove tag " +
        escapeHtml(norm) + "'>&times;</button>" +
        "<input type='hidden' name='tags' value='" + escapeHtml(norm) + "' />";
      li.querySelector(".tag-chip__remove").addEventListener("click", function () {
        li.remove();
      });
      chipsList.appendChild(li);
      return true;
    }

    function removeLastChip() {
      const chips = chipsList.querySelectorAll(".tag-chip");
      if (chips.length) chips[chips.length - 1].remove();
    }

    function renderSuggestions() {
      const raw = entry.value;
      const norm = normalize(raw);
      suggestions.innerHTML = "";
      highlighted = -1;
      if (!raw) {
        suggestions.hidden = true;
        return;
      }
      const taken = new Set(currentChips());
      const matches = existing
        .filter((t) => {
          const tn = normalize(t);
          return !taken.has(tn) && tn.indexOf(norm) !== -1;
        })
        .slice(0, 8);
      matches.forEach(function (t, i) {
        const li = document.createElement("li");
        li.className = "tag-suggestion";
        li.dataset.kind = "existing";
        li.dataset.value = normalize(t);
        li.textContent = normalize(t);
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          commitFromSuggestion(li);
        });
        suggestions.appendChild(li);
      });
      // "+ Create new tag: <normalized>" affordance — only if the
      // normalized term isn't already an existing tag and isn't already
      // chipped. Wren's spec: this row commits ONLY on explicit click
      // or Down-arrow-then-Enter, never on plain Enter / comma / Tab.
      if (norm && !existingSet.has(norm) && !taken.has(norm)) {
        const li = document.createElement("li");
        li.className = "tag-suggestion tag-suggestion--create";
        li.dataset.kind = "create";
        li.dataset.value = norm;
        li.textContent = "+ Create new tag: “" + norm + "”";
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          commitFromSuggestion(li);
        });
        suggestions.appendChild(li);
      }
      suggestions.hidden = !suggestions.children.length;
    }

    function visibleSuggestions() {
      return Array.from(suggestions.querySelectorAll(".tag-suggestion"));
    }

    function setHighlight(idx) {
      const items = visibleSuggestions();
      items.forEach((el, i) => el.classList.toggle("is-highlighted", i === idx));
      highlighted = idx;
    }

    function commitFromSuggestion(li) {
      addChip(li.dataset.value);
      entry.value = "";
      renderSuggestions();
    }

    function tryCommitTypedAsExisting() {
      const norm = normalize(entry.value);
      if (!norm) return false;
      if (!existingSet.has(norm)) return false; // existing-only on Enter/Tab/comma
      if (addChip(norm)) {
        entry.value = "";
        renderSuggestions();
        return true;
      }
      entry.value = "";
      renderSuggestions();
      return false;
    }

    entry.addEventListener("input", renderSuggestions);

    entry.addEventListener("keydown", function (e) {
      const items = visibleSuggestions();
      if (e.key === "ArrowDown") {
        if (!items.length) return;
        e.preventDefault();
        setHighlight((highlighted + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        setHighlight((highlighted - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        // If the user has highlighted a suggestion (including the
        // "+ Create new tag" row), commit that. Otherwise, only commit
        // typed text if it's an existing tag — never spawn a new tag
        // on plain Enter.
        if (highlighted >= 0 && items[highlighted]) {
          e.preventDefault();
          commitFromSuggestion(items[highlighted]);
          return;
        }
        const norm = normalize(entry.value);
        if (!norm) return; // let the form submit
        e.preventDefault();
        tryCommitTypedAsExisting();
      } else if (e.key === "," || e.key === "Tab") {
        const norm = normalize(entry.value);
        if (!norm) return;
        // comma/Tab also commit only if it's an existing tag.
        if (existingSet.has(norm)) {
          e.preventDefault();
          tryCommitTypedAsExisting();
        } else if (e.key === ",") {
          // Eat the comma; don't let it appear in the input. Don't
          // spawn the tag either. The user must use the Create row.
          e.preventDefault();
        }
        // Tab on a non-existing term: let it pass — the user is leaving
        // the field on purpose; we drop the in-flight typed text.
      } else if (e.key === "Backspace" && !entry.value) {
        e.preventDefault();
        removeLastChip();
      } else if (e.key === "Escape") {
        suggestions.hidden = true;
        setHighlight(-1);
      }
    });

    // Hide suggestions when blurring away. Use mousedown handler on
    // suggestions for clicks so we keep focus on the entry while
    // committing.
    entry.addEventListener("blur", function () {
      window.setTimeout(function () { suggestions.hidden = true; }, 100);
    });

    // Wire ×-buttons on chips that were rendered server-side.
    chipsList.querySelectorAll(".tag-chip__remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".tag-chip").remove();
      });
    });
  }

  function initAll() {
    document.querySelectorAll("[data-tag-input]").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
