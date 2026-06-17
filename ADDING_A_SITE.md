# Adding a new site to GenCost

Adding site #3 or beyond requires **only two changes**:
1. A new entry in `pricing.json`
2. One new line in `manifest.json`

No JavaScript changes needed unless the site's DOM pattern isn't covered by the pre-built strategies.

---

## Step 1 — Add an entry to `pricing.json`

Copy the template below into the `sites` array and fill in every field.

```json
{
  "id": "mysite",
  "domain": "mysite.com",
  "displayName": "My Site",
  "plans": [
    {
      "id": "pro_monthly",
      "name": "Pro (Monthly)",
      "billingCycle": "monthly",
      "monthlyPrice": 20,
      "monthlyCredits": 500,
      "creditValueUSD": 0.04
    }
  ],
  "topUp": {
    "creditValueUSD": null
  },
  "costTable": null,
  "selectors": {
    "buttonContainer": "CSS selector for the stable wrapper around the generate button",
    "generateButton":  "CSS selector for the button itself (inside buttonContainer)",
    "costContainer":   "CSS selector for the element that contains the credit number",
    "costElement":     "CSS selector for the exact element whose text IS the number (or null)",
    "costReaderStrategy": "text-content",
    "badgeAnchor":        "CSS selector for the element the badge is inserted next to",
    "badgeInsertPosition": "afterend",
    "costDataAttribute": null,
    "costRegex": null
  }
}
```

### Selector tips

- **Use `buttonContainer`** — a stable, site-assigned selector like `[data-testid="generate-wrapper"]`
  or an `id`. Avoid auto-generated class names (Tailwind, CSS Modules, React Aria).
- **All other selectors are scoped** to `buttonContainer` at runtime, so they only need to be
  unique within that container, not the whole page.
- Open DevTools → right-click the generate button → Inspect.
  Look for `data-*`, `id`, or semantic class names on or near the button.

### Choosing a `costReaderStrategy`

| Strategy | When to use | Extra selector needed |
|---|---|---|
| `text-content` | Credit number is the `textContent` of a single element | `costElement` |
| `last-text-node` | Credit number is a bare text node after a struck-through span | `costContainer` |
| `data-attribute` | Number is stored in a `data-*` attribute | `costElement` + `costDataAttribute` |
| `input-value` | Number is the `value` of an `<input>` | `costElement` |
| `aria-label` | Number is embedded in an `aria-label` string | `costElement` |
| `regex` | None of the above — apply a regex to a container's text | `costContainer` + `costRegex` (capture group 1 = number) |

### `badgeInsertPosition` values

`afterend` (default) — badge appears immediately after the anchor element, as a sibling.
`beforeend` — badge is appended as the last child inside the anchor.
`afterbegin` — badge is prepended as the first child inside the anchor.
`beforebegin` — badge appears immediately before the anchor element.

---

## Step 2 — Add the domain to `manifest.json`

`manifest.json` already uses `"*://*/*"` for `host_permissions`, so **no manifest change
is needed for host permissions**.

The content script is injected dynamically by the service worker for any domain listed in
`pricing.json`. Pushing the updated `pricing.json` to GitHub is enough — the extension
picks it up within 24 hours (or immediately on next force-refresh of the cache).

> **Note:** If you ever narrow `host_permissions` to specific domains (e.g. for a store
> submission), adding a new site will require adding its domain there and releasing a new
> version.

---

## Step 3 — Push `pricing.json` to GitHub

```bash
git add pricing.json
git commit -m "add mysite.com"
git push
```

The extension fetches `https://raw.githubusercontent.com/thisisjoey/gencost/main/pricing.json`
and caches it for 24 hours. Existing users get the update automatically on next cache expiry.

---

## If the site needs a new strategy

If none of the six pre-built strategies fits the site's DOM, add a new named function to
`content/strategies.js`:

```js
window.GenCost.strategies['my-strategy'] = function (selectors, buttonContainer) {
  // return a Number or null
};
```

Then set `"costReaderStrategy": "my-strategy"` in `pricing.json` for that site.
This is the only case that requires a code change and a new extension release.
