# Amazon Orders – Show Only Undelivered

A Tampermonkey/Greasemonkey userscript that filters your Amazon **Your Orders** page to hide **delivered** and **cancelled** orders, leaving only the orders still in progress (arriving, shipped, out for delivery, preparing for shipment, not yet shipped).

It adds two small floating buttons to the paage: a toggle to switch filtering on/off, and an optional **Load all pages** button that pulls in-progress orders from *every* page of your order history onto a single screen.

> Works on `amazon.com`. For other locales (e.g. `.co.uk`, `.de`), see [Configuration](#configuration).

---

## Features

- **Hides delivered orders** — anything whose status starts with "Delivered".
- **Hides cancelled orders** — both `cancelled` (UK) and `canceled` (US) spellings, without false-matching the "Cancel items" button on active orders.
- **One-click toggle** — switch between "in-progress only" and "show everything"; your choice is remembered between visits.
- **Consolidated view** *(optional)* — merge in-progress orders from all paginated pages into one list.
- **Resilient to Amazon's markup changes** — matches on visible **status text**, not on Amazon's obfuscated CSS class names, with a structural fallback if the class selectors ever stop matching.
- **Runs entirely in your browser** — no external servers, no data collection. See [Privacy](#privacy).

---

## Installation

### 1. Install a userscript manager

- [Tampermonkey](https://www.tampermonkey.net/) (recommended), or
- [Violentmonkey](https://violentmonkey.github.io/)

### 2. Install the script

Open `amazon-undelivered-only.user.js` (the raw file) in your browser and your userscript manager will prompt you to install it. If you've forked or cloned this repo, the raw URL looks like:

```
https://raw.githubusercontent.com/cpettit/Amazon-Undelivered-Order-Filter/refs/heads/main/amazonundelivered.js
```

Alternatively, open the Tampermonkey dashboard → **+** (Create a new script) → paste the file contents → **File → Save**.

### 3. ⚠️ Enable userscript execution in Chrome (required)

This is the single most common reason a freshly installed userscript "does nothing." On Chrome-based browsers (Chrome, Edge, Brave, Vivaldi, Opera), Chrome requires an extra permission before any userscript will run — and Tampermonkey's own warning banner points at the *wrong* setting, so it's easy to miss.

Do **one** of the following:

- **Chrome 138+:** Right-click the Tampermonkey icon → **Manage Extension** → turn on the **Allow user scripts** toggle. *(This is the one that matters on recent Chrome.)*
- **Older Chrome / if you don't see that toggle:** Go to `chrome://extensions` → enable **Developer mode** (top-right).

Then reload the Amazon orders tab.

Firefox and Safari users can skip this step.

---

## Usage

Open your orders page, e.g.:

- `https://www.amazon.com/gp/css/order-history`
- `https://www.amazon.com/your-orders/orders`

Two buttons appear in the **bottom-right** of the page:

| Button | What it does |
| --- | --- |
| 📦 **Undelivered only — X shown, Y hidden** | Toggles filtering. Click to flip between hiding delivered/cancelled orders and showing everything. The label shows the live counts. |
| 📚 **Load all pages** | Fetches every page of your order history in the background and merges the in-progress orders into one continuous list. |

Your filter preference persists across page loads (stored in `localStorage`).

> **Note:** Amazon paginates and defaults to "past 3 months." Use the time-range dropdown to choose how far back to look; the script filters whatever range you have selected.

---

## How it works

Amazon's order-page CSS class names are obfuscated and change frequently, so the script keys off the **visible status text** of each order card instead:

- An order is hidden if a short status line **starts with** `delivered` (e.g. "Delivered June 28"). Starts-with matching avoids hiding active orders that merely contain the word in a promo like "Get it delivered Friday."
- An order is hidden if a short status line **contains** `cancelled`/`canceled`. Contains-matching is safe here because the **Cancel items** / **Cancel order** buttons on active orders contain "cancel" but never "cancelled"/"canceled."

To locate order cards, the script tries a list of known selectors (`.order-card`, `.js-order-card`, …). If none match — i.e. Amazon changed its markup — it falls back to a **structural** search: it finds the "Order placed" header label present on every card and climbs to the enclosing card element. This makes the script survive most layout changes without edits.

A debounced `MutationObserver` re-applies the filter when the page updates dynamically.

### Consolidated view

The **Load all pages** button walks Amazon's pagination (`?startIndex=0,10,20,…`), fetching each page sequentially with a short delay, parsing out the in-progress orders, de-duplicating by order number, and appending them to the current page. It stops automatically when it reaches the end of your order history.

---

## Configuration

All settings live in a clearly marked `CONFIG` block at the top of the script.

**Change which statuses get hidden** (e.g. to also hide "Refunded", or to translate for a non-English store):

```js
const START_PHRASES   = ['delivered'];            // matched at the START of a status line
const CONTAINS_PHRASES = ['cancelled', 'canceled']; // matched ANYWHERE in a status line
```

For example, for German Amazon you might use `['zugestellt']` and `['storniert']`; for French, `['livré']` and `['annulé']`.

**Add support for a non-`.com` store** by adding `@match` lines near the top:

```
// @match        https://www.amazon.co.uk/gp/css/order-history*
// @match        https://www.amazon.co.uk/your-orders/*
```

**Adjust the background-fetch behaviour** for the consolidated view:

```js
const PAGE_STEP      = 10;   // Amazon's startIndex step (orders per page)
const FETCH_DELAY_MS = 600;  // delay between page fetches (be gentle on Amazon)
const MAX_PAGES      = 40;   // safety cap
```

**If the script can't find order cards** after an Amazon redesign, inspect one order block in DevTools and add its selector to the **top** of:

```js
const ORDER_CARD_SELECTORS = [ '.order-card', '.js-order-card', /* ... */ ];
```

---

## Limitations & known behaviour

- **Per-page by default.** Without clicking *Load all pages*, the filter only acts on the orders Amazon loaded onto the current page. Hidden orders aren't deleted — there are just fewer per page, so you may still click through pagination.
- **Merged-in cards are static copies.** In the consolidated view, plain links (Track package, View order details/invoice) work, but JavaScript-driven widgets ("Ask Alexa", "Buy it again") on the *merged-in* cards may not be interactive. The buttons on your actual current page are unaffected.
- **Possible robot-check on rapid fetches.** If Amazon serves a sign-in or CAPTCHA page during the background fetches, the affected page parses as zero orders and the script stops early (logged to the console) rather than breaking. Unlikely for normal personal use, which is why fetches are sequential and delayed.
- **English `amazon.com` out of the box.** Other locales need the phrase and `@match` tweaks described above.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No buttons appear; console is empty | Userscript isn't injecting. Enable **Allow user scripts** / **Developer mode** (see [Installation step 3](#3-️-enable-userscript-execution-in-chrome-required)), confirm the script is toggled **on** in the Tampermonkey dashboard, then reload. |
| Button says "No orders detected" | Amazon changed its card markup. Add the current order-card selector to `ORDER_CARD_SELECTORS`. |
| A cancelled/delivered order still shows | Amazon's status wording differs from the defaults. Check the exact status text and add it to `START_PHRASES` / `CONTAINS_PHRASES`. |
| An active order got wrongly hidden | A status line matched a phrase unexpectedly. Tighten the relevant phrase. |

**To confirm the script is running:** open DevTools → Console, type `Amazon Undelivered` into the filter box, and reload. You should see `[Amazon Undelivered] vX.Y.Z loaded…`. (Other errors in the console — Dashlane WebAuthn warnings, ad/tracker `ERR_CONNECTION_REFUSED` lines, Amazon's own page errors — are unrelated to this script.)

---

## Privacy

The script runs entirely in your browser. It reads the order data already on your Amazon orders page and, only when you press **Load all pages**, fetches additional pages of *your own* order history directly from `www.amazon.com` using your existing login session. No data is sent to any third party, and there is no analytics or telemetry of any kind.

---

## Contributing

Issues and pull requests welcome — especially:

- Selectors or status phrases for non-`.com` Amazon stores.
- Updated `ORDER_CARD_SELECTORS` after an Amazon redesign.

---

## Disclaimer

This is an unofficial, personal-use tool and is not affiliated with or endorsed by Amazon. It only changes how the orders page is displayed in your own browser. Amazon may change its page structure at any time, which can break the script until selectors/phrases are updated.

## License

[MIT](LICENSE) — replace with your preferred license.
