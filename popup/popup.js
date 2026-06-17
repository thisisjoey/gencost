// GenCost — popup controller

let pricing = null;
let currentSiteId = null;
let isNestedSite = false;

const siteSelect         = document.getElementById('site-select');
const planTypeField      = document.getElementById('plan-type-field');
const planTypeSelect     = document.getElementById('plan-type-select');
const billingCycleField  = document.getElementById('billing-cycle-field');
const planField          = document.getElementById('plan-field');
const planSelect         = document.getElementById('plan-select');
const rateField          = document.getElementById('rate-field');
const preview            = document.getElementById('preview');
const todoNote           = document.getElementById('todo-note');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  pricing = await chrome.runtime.sendMessage({ type: 'getPricing' });
  if (!pricing || !pricing.sites) return;

  for (const site of pricing.sites) {
    siteSelect.appendChild(new Option(site.displayName, site.id));
  }

  const detectedId = await detectCurrentSite();
  if (detectedId) siteSelect.value = detectedId;

  siteSelect.addEventListener('change', () => onSiteChange(siteSelect.value));
  planTypeSelect.addEventListener('change', onPlanTypeChange);
  document.querySelectorAll('input[name="billing"]').forEach(r =>
    r.addEventListener('change', onBillingCycleChange)
  );
  planSelect.addEventListener('change', onPlanChange);
  document.querySelectorAll('input[name="rate"]').forEach(r =>
    r.addEventListener('change', onRateChange)
  );

  onSiteChange(siteSelect.value);
}

async function detectCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
    const match = pricing.sites.find(s => {
      const site = s.domain.replace(/^www\./, '');
      return hostname === site || hostname.endsWith('.' + site);
    });
    return match ? match.id : null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Site change
// ---------------------------------------------------------------------------

async function onSiteChange(siteId) {
  currentSiteId = siteId;

  planTypeField.hidden     = true;
  billingCycleField.hidden = true;
  planField.hidden         = true;
  rateField.hidden         = true;
  preview.hidden           = true;
  todoNote.hidden          = true;

  if (!siteId) return;

  const site = pricing.sites.find(s => s.id === siteId);
  if (!site) return;

  isNestedSite = !!site.planTypes;

  if (isNestedSite) {
    await renderNestedPlanUI(site);
  } else {
    await renderFlatPlanUI(site);
  }
}

// ---------------------------------------------------------------------------
// Flat plan UI (e.g. Kling)
// ---------------------------------------------------------------------------

async function renderFlatPlanUI(site) {
  planTypeField.hidden     = true;
  billingCycleField.hidden = true;

  const stored = await chrome.storage.local.get(['plans', 'useTopUp']);
  const savedPlanId   = (stored.plans    || {})[site.id];
  const savedUseTopUp = (stored.useTopUp || {})[site.id] || false;

  planSelect.innerHTML = '';
  for (const plan of site.plans) {
    planSelect.appendChild(new Option(plan.name, plan.id));
  }
  if (savedPlanId && typeof savedPlanId === 'string') planSelect.value = savedPlanId;

  planField.hidden = false;

  if (site.topUp && site.topUp.creditValueUSD !== null) {
    rateField.hidden = false;
    document.querySelectorAll('input[name="rate"]').forEach(r => {
      r.checked = (r.value === (savedUseTopUp ? 'topup' : 'plan'));
    });
  }

  renderPreview();
}

// ---------------------------------------------------------------------------
// Nested plan UI (e.g. Higgsfield)
// ---------------------------------------------------------------------------

async function renderNestedPlanUI(site) {
  const stored = await chrome.storage.local.get('plans');
  const saved  = (stored.plans || {})[site.id];
  const isObj  = saved && typeof saved === 'object';

  const savedPlanType    = isObj ? saved.planType    : 'individual';
  const savedBillingCycle = isObj ? saved.billingCycle : 'annual';
  const savedTier        = isObj ? saved.tier        : null;

  // Populate plan-type dropdown from schema keys
  planTypeSelect.innerHTML = '';
  for (const key of Object.keys(site.planTypes)) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    planTypeSelect.appendChild(new Option(label, key));
  }
  planTypeSelect.value = savedPlanType;
  planTypeField.hidden = false;

  // Set billing cycle toggle
  document.querySelectorAll('input[name="billing"]').forEach(r => {
    r.checked = (r.value === savedBillingCycle);
  });
  billingCycleField.hidden = false;

  renderTiers(site, savedPlanType, savedBillingCycle, savedTier);
}

function renderTiers(site, planType, billingCycle, savedTier) {
  const tiers = site.planTypes[planType]?.[billingCycle];
  if (!tiers) return;

  planSelect.innerHTML = '';
  for (const [tierId, tier] of Object.entries(tiers)) {
    const label = tier._badge ? `${tier.name} (${tier._badge})` : tier.name;
    planSelect.appendChild(new Option(label, tierId));
  }

  if (savedTier && planSelect.querySelector(`option[value="${savedTier}"]`)) {
    planSelect.value = savedTier;
  }

  planField.hidden = false;
  renderPreview();
}

// ---------------------------------------------------------------------------
// Change handlers
// ---------------------------------------------------------------------------

async function onPlanTypeChange() {
  if (!isNestedSite) return;
  const site = pricing.sites.find(s => s.id === currentSiteId);
  if (!site) return;

  const planType     = planTypeSelect.value;
  const billingCycle = document.querySelector('input[name="billing"]:checked')?.value || 'annual';

  await saveNestedSelection(planType, billingCycle, null);
  renderTiers(site, planType, billingCycle, null);
}

async function onBillingCycleChange() {
  if (!isNestedSite) return;
  const site = pricing.sites.find(s => s.id === currentSiteId);
  if (!site) return;

  const planType     = planTypeSelect.value;
  const billingCycle = document.querySelector('input[name="billing"]:checked')?.value || 'annual';

  await saveNestedSelection(planType, billingCycle, null);
  renderTiers(site, planType, billingCycle, null);
}

async function onPlanChange() {
  if (isNestedSite) {
    const planType     = planTypeSelect.value;
    const billingCycle = document.querySelector('input[name="billing"]:checked')?.value || 'annual';
    await saveNestedSelection(planType, billingCycle, planSelect.value);
  } else {
    const stored = await chrome.storage.local.get('plans');
    const plans  = stored.plans || {};
    plans[currentSiteId] = planSelect.value;
    await chrome.storage.local.set({ plans });
  }
  renderPreview();
}

async function saveNestedSelection(planType, billingCycle, tier) {
  const stored = await chrome.storage.local.get('plans');
  const plans  = stored.plans || {};
  plans[currentSiteId] = { planType, billingCycle, tier };
  await chrome.storage.local.set({ plans });
}

async function onRateChange() {
  const checked  = document.querySelector('input[name="rate"]:checked');
  const useTopUp = checked && checked.value === 'topup';
  const stored   = await chrome.storage.local.get('useTopUp');
  const map      = stored.useTopUp || {};
  map[currentSiteId] = useTopUp;
  await chrome.storage.local.set({ useTopUp: map });
  renderPreview();
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

async function renderPreview() {
  preview.hidden  = true;
  todoNote.hidden = true;

  if (!currentSiteId) return;

  const site = pricing.sites.find(s => s.id === currentSiteId);
  if (!site) return;

  let creditValueUSD = null;
  let isEnterprise   = false;

  if (isNestedSite) {
    const planType     = planTypeSelect.value;
    const billingCycle = document.querySelector('input[name="billing"]:checked')?.value || 'annual';
    const tierId       = planSelect.value;
    const tier         = site.planTypes[planType]?.[billingCycle]?.[tierId];
    if (!tier) return;
    isEnterprise   = (tierId === 'enterprise');
    creditValueUSD = tier.creditValueUSD;
  } else {
    const stored   = await chrome.storage.local.get('useTopUp');
    const useTopUp = (stored.useTopUp || {})[currentSiteId] || false;
    const plan     = site.plans.find(p => p.id === planSelect.value);
    if (!plan) return;

    if (useTopUp && site.topUp && site.topUp.creditValueUSD !== null) {
      creditValueUSD = site.topUp.creditValueUSD;
    } else {
      creditValueUSD = plan.creditValueUSD;
    }
  }

  preview.hidden = false;

  if (isEnterprise) {
    preview.textContent = 'Custom pricing \u2014 contact sales';
  } else if (creditValueUSD === null) {
    preview.textContent = '1 credit \u2248 \u2014';
    todoNote.hidden     = false;
    todoNote.textContent = 'Credit value not set for this plan yet. Fill in pricing.json and push to GitHub.';
  } else {
    preview.textContent = `1 credit \u2248 $${creditValueUSD.toFixed(5)}`;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init().catch(console.error);
