// GenCost — content script entry point
// Generic: all site-specific behaviour is driven by pricing.json selectors.
// Guards against double-injection from the service worker.

(function () {
  if (window.__gencostInjected) return;
  window.__gencostInjected = true;

  const DEBOUNCE_MS = 300;

  let siteConfig = null;
  let badge = null;
  let observer = null;
  let debounceTimer = null;

  // -------------------------------------------------------------------------
  // Context invalidation handling
  // Called when the extension reloads while this content script is still live.
  // -------------------------------------------------------------------------

  function teardown() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(debounceTimer);
    if (badge) { badge.remove(); badge = null; }
    siteConfig = null;
  }

  function isContextInvalidated(err) {
    return err && typeof err.message === 'string' &&
      err.message.includes('Extension context invalidated');
  }

  function handleError(err) {
    if (isContextInvalidated(err)) teardown();
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  async function init() {
    const pricing = await chrome.runtime.sendMessage({ type: 'getPricing' });
    if (!pricing || !pricing.sites) return;

    const hostname = location.hostname.replace(/^www\./, '');
    siteConfig = pricing.sites.find(s => {
      const site = s.domain.replace(/^www\./, '');
      return hostname === site || hostname.endsWith('.' + site);
    });
    if (!siteConfig) return;

    badge = new window.GenCost.Badge();
    patchHistory();
    startObserver();
    await update();
  }

  // -------------------------------------------------------------------------
  // Button container resolution (selector-based or DOM scan)
  // -------------------------------------------------------------------------

  function resolveButtonContainer() {
    const sel = siteConfig.selectors;
    if (sel.buttonContainerFinder === 'scan-for-credits') {
      return scanForCreditsButton(sel);
    }
    return sel.buttonContainer ? document.querySelector(sel.buttonContainer) : null;
  }

  // Walk every button/role=button on the page and return the first whose
  // textContent matches the credit pattern defined in pricing.json.
  function scanForCreditsButton(sel) {
    const pattern = new RegExp(sel.creditScanPattern || '\\d+\\s*credits?', 'i');
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (pattern.test(el.textContent)) return el;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Credit cost reader
  // -------------------------------------------------------------------------

  function readCreditCost() {
    const sel = siteConfig.selectors;
    const buttonContainer = resolveButtonContainer();
    if (!buttonContainer) return null;

    const strategy = window.GenCost.strategies[sel.costReaderStrategy];
    if (!strategy) return null;

    return strategy(sel, buttonContainer);
  }

  // -------------------------------------------------------------------------
  // Badge mounting
  // -------------------------------------------------------------------------

  function mountBadge() {
    if (badge.isAttached()) return;
    const sel = siteConfig.selectors;
    const buttonContainer = resolveButtonContainer();
    if (!buttonContainer) return;
    // badgeAnchor: null means use the buttonContainer itself as the anchor.
    const anchor = sel.badgeAnchor
      ? buttonContainer.querySelector(sel.badgeAnchor)
      : buttonContainer;
    if (!anchor) return;
    badge.mount(anchor, sel.badgeInsertPosition);
  }

  // -------------------------------------------------------------------------
  // Update cycle — entire body is wrapped so no rejection ever escapes
  // -------------------------------------------------------------------------

  async function update() {
    try {
      if (!siteConfig || !badge) return;

      mountBadge();
      if (!badge.isAttached()) return;

      const stored = await chrome.storage.local.get(['plans', 'useTopUp']);

      // siteConfig may have been cleared by teardown() while we awaited above
      if (!siteConfig || !badge) return;

      const savedPlan = (stored.plans    || {})[siteConfig.id];
      const useTopUp  = (stored.useTopUp || {})[siteConfig.id] || false;

      if (!savedPlan) { badge.showNoPlan(); return; }

      let creditValueUSD = null;
      if (siteConfig.planTypes) {
        // Nested plan structure (e.g. Higgsfield)
        const { planType, billingCycle, tier } = (typeof savedPlan === 'object') ? savedPlan : {};
        if (!planType || !billingCycle || !tier) { badge.showNoPlan(); return; }
        const tierData = siteConfig.planTypes[planType]?.[billingCycle]?.[tier];
        creditValueUSD = tierData ? tierData.creditValueUSD : null;
      } else if (useTopUp && siteConfig.topUp && siteConfig.topUp.creditValueUSD !== null) {
        creditValueUSD = siteConfig.topUp.creditValueUSD;
      } else {
        const plan = siteConfig.plans.find(p => p.id === savedPlan);
        creditValueUSD = plan ? plan.creditValueUSD : null;
      }

      if (creditValueUSD === null) { badge.showNoPlan(); return; }

      const credits = readCreditCost();
      if (credits === null) { badge.showError(); return; }

      badge.showCost(credits * creditValueUSD);
    } catch (err) {
      handleError(err);
    }
  }

  // Always attach .catch() so the returned Promise never goes unhandled
  function safeUpdate() {
    return update().catch(handleError);
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(safeUpdate, DEBOUNCE_MS);
  }

  // -------------------------------------------------------------------------
  // SPA navigation detection
  // Higgsfield (and most React apps) navigate via history.pushState without
  // triggering a page load, so the MutationObserver alone isn't enough to
  // catch a route change before the new DOM arrives.  Wrapping pushState /
  // replaceState fires scheduleUpdate() immediately on navigation, and the
  // debounce means the actual update runs after React has finished rendering
  // the new page's DOM.
  // -------------------------------------------------------------------------

  function patchHistory() {
    const wrap = (orig) => function (...args) {
      const result = orig.apply(this, args);
      scheduleUpdate();
      return result;
    };
    history.pushState    = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', scheduleUpdate);
  }

  // -------------------------------------------------------------------------
  // MutationObserver
  // -------------------------------------------------------------------------

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // -------------------------------------------------------------------------
  // Re-render when the user changes their plan or rate in the popup
  // -------------------------------------------------------------------------

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && ('plans' in changes || 'useTopUp' in changes)) {
        safeUpdate();
      }
    });
  } catch (_) { /* context already gone on listener registration */ }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  init().catch(handleError);
})();
