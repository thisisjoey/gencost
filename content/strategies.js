// GenCost — DOM cost-reading strategies
// Each strategy receives (selectors, buttonContainer) and returns a Number or null.
// selectors is the site's selectors object from pricing.json.
// buttonContainer is the element matched by selectors.buttonContainer.
//
// To support a new site without code changes, pick the strategy whose name
// matches the site's DOM pattern and set costReaderStrategy in pricing.json.

window.GenCost = window.GenCost || {};

window.GenCost.strategies = {

  // Read textContent of a specific element.
  // Required selector key: costElement
  // Used by: Kling (span.value inside div.price.none-strike)
  'text-content': function (selectors, buttonContainer) {
    const el = buttonContainer.querySelector(selectors.costElement);
    if (!el) return null;
    return GenCost.strategies._parseNumber(el.textContent);
  },

  // Find the last non-empty direct text node inside a container.
  // Required selector key: costContainer
  // Used by: Higgsfield (bare text node after the struck-price span)
  'last-text-node': function (selectors, buttonContainer) {
    const container = selectors.costContainer
      ? buttonContainer.querySelector(selectors.costContainer)
      : buttonContainer;
    if (!container) return null;

    const nodes = Array.from(container.childNodes);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].nodeType === Node.TEXT_NODE) {
        const n = GenCost.strategies._parseNumber(nodes[i].textContent);
        if (n !== null) return n;
      }
    }
    return null;
  },

  // Read a data-* attribute on an element.
  // Required selector keys: costElement, costDataAttribute
  // Example: <button data-cost="36"> with costDataAttribute: "data-cost"
  'data-attribute': function (selectors, buttonContainer) {
    if (!selectors.costDataAttribute) return null;
    const el = buttonContainer.querySelector(selectors.costElement);
    if (!el) return null;
    return GenCost.strategies._parseNumber(el.getAttribute(selectors.costDataAttribute));
  },

  // Read the value property of an <input> or <select>.
  // Required selector key: costElement
  'input-value': function (selectors, buttonContainer) {
    const el = buttonContainer.querySelector(selectors.costElement);
    if (!el) return null;
    return GenCost.strategies._parseNumber(el.value);
  },

  // Parse a number from an element's aria-label attribute.
  // Required selector key: costElement
  // The first numeric capture in the aria-label string is used.
  'aria-label': function (selectors, buttonContainer) {
    const el = buttonContainer.querySelector(selectors.costElement);
    if (!el) return null;
    const label = el.getAttribute('aria-label') || '';
    const match = label.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  },

  // Find the last <span> whose trimmed textContent is a pure number.
  // Skips struck-through prices and label text. No extra selector keys needed.
  // Used by: Higgsfield (last numeric span in the generate button)
  'last-numeric-span': function (selectors, buttonContainer) {
    const spans = Array.from(buttonContainer.querySelectorAll('span'));
    for (let i = spans.length - 1; i >= 0; i--) {
      const text = spans[i].textContent.trim();
      if (/^\d+(\.\d+)?$/.test(text)) {
        const n = GenCost.strategies._parseNumber(text);
        if (n !== null) return n;
      }
    }
    return null;
  },

  // Apply a regex to the textContent of a container; capture group 1 is the number.
  // Required selector keys: costContainer (or falls back to buttonContainer), costRegex
  // Example: costRegex: "(\\d+) credits?" matches "32 credits"
  'regex': function (selectors, buttonContainer) {
    if (!selectors.costRegex) return null;
    const container = selectors.costContainer
      ? buttonContainer.querySelector(selectors.costContainer)
      : buttonContainer;
    if (!container) return null;
    const match = container.textContent.match(new RegExp(selectors.costRegex));
    return match && match[1] ? parseFloat(match[1]) : null;
  },

  // -------------------------------------------------------------------------
  // Internal helper
  // -------------------------------------------------------------------------
  _parseNumber: function (raw) {
    if (raw == null) return null;
    // Strip everything except digits and decimal point, then parse.
    const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  },
};
