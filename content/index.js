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
    startObserver();
    await update();
  }

  // -------------------------------------------------------------------------
  // Credit cost reader
  // -------------------------------------------------------------------------

  function readCreditCost() {
    const sel = siteConfig.selectors;
    const buttonContainer = document.querySelector(sel.buttonContainer);
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
    const buttonContainer = document.querySelector(sel.buttonContainer);
    if (!buttonContainer) return;
    const anchor = buttonContainer.querySelector(sel.badgeAnchor);
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
