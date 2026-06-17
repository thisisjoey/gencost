const PRICING_JSON_URL = 'https://raw.githubusercontent.com/thisisjoey/gencost/main/pricing.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = 'pricingCache';

// ---------------------------------------------------------------------------
// Pricing fetch / cache
// ---------------------------------------------------------------------------

async function fetchRemote() {
  const res = await fetch(PRICING_JSON_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchBundled() {
  const res = await fetch(chrome.runtime.getURL('pricing.json'));
  if (!res.ok) throw new Error('bundled pricing.json missing');
  return res.json();
}

async function getPricing() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  const cache = stored[CACHE_KEY];

  // Return cache if fresh
  if (cache && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }

  // Try remote
  try {
    const data = await fetchRemote();
    await chrome.storage.local.set({ [CACHE_KEY]: { data, fetchedAt: Date.now() } });
    return data;
  } catch (_) {
    // Fall through: return stale cache if available, else bundled fallback
  }

  if (cache) return cache.data;
  return fetchBundled();
}

// ---------------------------------------------------------------------------
// Domain matching
// ---------------------------------------------------------------------------

function domainMatches(tabHostname, siteDomain) {
  // tabHostname: 'www.klingai.com' or 'klingai.com'
  // siteDomain:  'klingai.com'
  const host = tabHostname.replace(/^www\./, '');
  const site = siteDomain.replace(/^www\./, '');
  return host === site || host.endsWith('.' + site);
}

// ---------------------------------------------------------------------------
// Dynamic injection
// ---------------------------------------------------------------------------

const CONTENT_FILES = [
  'content/strategies.js',
  'content/badge.js',
  'content/index.js',
];

async function tryInject(tabId, url) {
  if (!url || !url.startsWith('http')) return;

  let hostname;
  try { hostname = new URL(url).hostname; } catch (_) { return; }

  const pricing = await getPricing().catch(() => null);
  if (!pricing || !pricing.sites) return;

  const matched = pricing.sites.find(s => domainMatches(hostname, s.domain));
  if (!matched) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES,
    });
  } catch (_) {
    // Tab may be non-injectable (chrome:// pages, PDFs, etc.)
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    tryInject(tabId, tab.url);
  }
});

// Re-check when the user switches to an already-loaded tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.url && tab.status === 'complete') {
    tryInject(tabId, tab.url);
  }
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getPricing') {
    getPricing()
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true; // keep channel open for async response
  }

  if (msg.type === 'openPopup') {
    // Chrome 127+: works without a user gesture from the service worker.
    // Best-effort; if it fails the badge tooltip guides the user.
    chrome.action.openPopup().catch(() => {});
    return false;
  }
});
