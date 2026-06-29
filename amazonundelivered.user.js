// ==UserScript==
// @name         Amazon Orders – Show Only Undelivered
// @namespace    https://github.com/cpettit/Amazon-Undelivered-Order-Filter
// @version      1.3.2
// @description  Filters the Amazon "Your Orders" page to hide delivered AND cancelled orders, showing only the ones still in progress. Adds a toggle plus an optional "Load all pages" button that merges those orders from every page onto one screen.
// @author       cpettit
// @homepageURL  https://github.com/cpettit/Amazon-Undelivered-Order-Filter
// @supportURL   https://github.com/cpettit/Amazon-Undelivered-Order-Filter/issues
// @downloadURL  https://raw.githubusercontent.com/cpettit/Amazon-Undelivered-Order-Filter/refs/heads/main/amazonundelivered.user.js
// @updateURL    https://raw.githubusercontent.com/cpettit/Amazon-Undelivered-Order-Filter/refs/heads/main/amazonundelivered.user.js
// @match        https://www.amazon.com/gp/css/order-history*
// @match        https://www.amazon.com/gp/your-account/order-history*
// @match        https://www.amazon.com/your-orders/*
// @match        https://www.amazon.com/-/en/gp/css/order-history*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.3.2';
  const LOG = (...args) => console.log('[Amazon Undelivered]', ...args);

  LOG(`v${VERSION} loaded on`, location.href);

  // ============================ CONFIG ==================================
  // Status-line phrases that mean "hide this order".
  //  - START_PHRASES match when a short status line STARTS WITH the phrase.
  //    Good for "Delivered June 28" while ignoring promos that merely contain
  //    the word, e.g. "Get it delivered Friday".
  //  - CONTAINS_PHRASES match when a short status line CONTAINS the phrase.
  //    Used for cancelled orders. This is safe from the "Cancel items" /
  //    "Cancel order" buttons on active orders, because those contain
  //    "cancel" but NOT "cancelled" / "canceled".
  // Non-English Amazon? Swap these for your locale's words.
  const START_PHRASES = ['delivered'];
  const CONTAINS_PHRASES = ['cancelled', 'canceled', 'return received', 'return completed'];

  // Candidate wrappers for a single order "card". The FIRST selector that
  // matches at least one element wins. If Amazon changes its markup and the
  // script stops working, open DevTools, inspect one order block, and add
  // its class/selector to the TOP of this list.
  const ORDER_CARD_SELECTORS = [
    '.order-card',
    '.js-order-card',
    '[class*="order-card"]',
    '.order',
    '.a-box-group.order',
  ];

  // Max length of a string we'll treat as a "status line". Keeps us from
  // matching the word "delivered" buried inside product titles or promos.
  const STATUS_MAX_LEN = 40;

  // "Load all pages" settings. Amazon paginates with ?startIndex= in steps
  // of PAGE_STEP. Fetches are sequential and gently delayed so we don't
  // hammer Amazon (and risk a CAPTCHA). MAX_PAGES is a safety cap.
  const PAGE_STEP = 10;
  const FETCH_DELAY_MS = 600;
  const MAX_PAGES = 40;

  const STORAGE_KEY = 'amzn-undelivered-only';
  // =====================================================================

  // Default ON (undelivered only). Persisted across page loads.
  let undeliveredOnly = localStorage.getItem(STORAGE_KEY) !== 'false';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findOrderCards(root = document) {
    for (const sel of ORDER_CARD_SELECTORS) {
      const els = root.querySelectorAll(sel);
      if (els.length) return Array.from(els);
    }
    // Fallback: no known selector matched (Amazon changed its class names).
    // Find cards structurally by anchoring on the "Order placed" header label
    // that every order card contains, then climbing to the smallest ancestor
    // that also holds the "Order #" line and a status word.
    return findOrderCardsByText(root);
  }

  function findOrderCardsByText(root = document) {
    const STATUS_RE = /(arriving|delivered|shipped|out for delivery|preparing for shipment|not yet shipped|ordered|refunded|return|cancell?ed)/i;
    const labels = Array.from(root.querySelectorAll('span, div')).filter(
      (el) => /^order placed$/i.test(el.textContent.trim())
    );
    const cards = new Set();
    for (const label of labels) {
      let node = label.parentElement;
      for (let i = 0; i < 8 && node && node !== root.body; i++) {
        const txt = node.textContent;
        if (/order\s*#/i.test(txt) && STATUS_RE.test(txt)) {
          cards.add(node);
          break;
        }
        node = node.parentElement;
      }
    }
    return Array.from(cards);
  }

  function shouldHide(card) {
    // Scan leaf-ish text nodes for a short status line that marks the order
    // as delivered or cancelled. Long strings are skipped on purpose so we
    // don't match these words inside product titles or promos.
    const candidates = card.querySelectorAll('span, div, h1, h2, h3, p, a');
    for (const el of candidates) {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      if (!text || text.length > STATUS_MAX_LEN) continue;
      const lower = text.toLowerCase();
      if (START_PHRASES.some((p) => lower.startsWith(p))) return true;
      if (CONTAINS_PHRASES.some((p) => lower.includes(p))) return true;
    }
    return false;
  }

  function getOrderNumber(card) {
    const m = card.textContent.match(/ORDER\s*#\s*([0-9][0-9-]+)/i);
    return m ? m[1] : null;
  }

  function apply() {
    const cards = findOrderCards();
    let shown = 0;
    let hidden = 0;
    for (const card of cards) {
      const hide = undeliveredOnly && shouldHide(card);
      card.style.display = hide ? 'none' : '';
      if (hide) hidden++;
      else shown++;
    }
    updateButton(shown, hidden, cards.length);
    return { shown, hidden, total: cards.length };
  }

  // -------------------------- UI: base styling -------------------------
  function styleButton(btn) {
    Object.assign(btn.style, {
      position: 'fixed',
      right: '20px',
      zIndex: '99999',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px solid rgba(0,0,0,.15)',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      fontFamily: 'Arial, sans-serif',
      color: '#0f1111',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    });
  }

  function buildButton() {
    if (document.getElementById('amzn-undelivered-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'amzn-undelivered-toggle';
    styleButton(btn);
    btn.style.bottom = '20px';
    btn.addEventListener('click', () => {
      undeliveredOnly = !undeliveredOnly;
      localStorage.setItem(STORAGE_KEY, String(undeliveredOnly));
      LOG('Toggled undeliveredOnly =', undeliveredOnly);
      run();
    });
    document.body.appendChild(btn);
  }

  function updateButton(shown, hidden, total) {
    const btn = document.getElementById('amzn-undelivered-toggle');
    if (!btn) return;
    if (total === 0) {
      btn.textContent = '📦 No orders detected — see script comments';
      btn.style.background = '#f0c14b';
      return;
    }
    if (undeliveredOnly) {
      btn.textContent = `📦 Undelivered only — ${shown} shown, ${hidden} hidden`;
      btn.style.background = '#ffd814';
    } else {
      btn.textContent = `📦 Showing all ${total} orders`;
      btn.style.background = '#e7e9ec';
    }
  }

  // ------------------- "Load all pages" consolidation ------------------
  function buildConsolidateButton() {
    if (document.getElementById('amzn-consolidate-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'amzn-consolidate-btn';
    styleButton(btn);
    btn.style.bottom = '64px';
    btn.style.background = '#dde7ff';
    btn.textContent = '📚 Load all pages';
    let running = false;
    btn.addEventListener('click', async () => {
      if (running) return;
      running = true;
      btn.disabled = true;
      try {
        await consolidateAllPages(btn);
      } catch (e) {
        LOG('Consolidation error:', e);
        btn.textContent = '⚠️ Error — see console';
      } finally {
        running = false;
        btn.disabled = false;
      }
    });
    document.body.appendChild(btn);
  }

  function buildPageUrl(startIndex) {
    const url = new URL(location.href);
    url.searchParams.set('startIndex', String(startIndex));
    url.searchParams.delete('ref_'); // drop the page-specific ref token
    return url.toString();
  }

  function detectMaxStartIndex() {
    // Page-number links in the paginator are <a> elements with pure-digit
    // text. The largest one tells us the last page. (Loop-until-empty below
    // is the real terminator; this is just for nicer progress text.)
    const nums = Array.from(document.querySelectorAll('a'))
      .map((a) => a.textContent.trim())
      .filter((t) => /^\d+$/.test(t))
      .map(Number)
      .filter((n) => n > 0 && n <= 200);
    if (!nums.length) return null;
    return (Math.max(...nums) - 1) * PAGE_STEP;
  }

  async function consolidateAllPages(btn) {
    const liveCards = findOrderCards();
    if (!liveCards.length) {
      btn.textContent = '⚠️ No orders found on this page';
      return;
    }

    // Switch to undelivered-only so the merged view is coherent.
    undeliveredOnly = true;
    localStorage.setItem(STORAGE_KEY, 'true');
    apply();

    let anchor = liveCards[liveCards.length - 1]; // insert new cards after here
    const seen = new Set(liveCards.map(getOrderNumber).filter(Boolean));
    const currentStart = Number(
      new URL(location.href).searchParams.get('startIndex') || 0
    );
    const maxStart = detectMaxStartIndex();
    const totalPages = maxStart != null ? maxStart / PAGE_STEP + 1 : null;

    LOG('Consolidation start. Current startIndex =', currentStart,
        '| detected last page =', totalPages ?? 'unknown');

    let added = 0;
    for (let start = 0; start < MAX_PAGES * PAGE_STEP; start += PAGE_STEP) {
      if (start === currentStart) continue; // page already shown live
      if (maxStart != null && start > maxStart) break;

      const pageNo = start / PAGE_STEP + 1;
      btn.textContent = `⏳ Loading page ${pageNo}${totalPages ? '/' + totalPages : ''}…`;

      let doc;
      try {
        const res = await fetch(buildPageUrl(start), { credentials: 'include' });
        if (!res.ok) {
          LOG('Page', pageNo, 'HTTP', res.status);
          if (res.status === 404) break;
          continue;
        }
        doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      } catch (e) {
        LOG('Fetch failed for page', pageNo, e);
        continue;
      }

      const pageCards = findOrderCards(doc);
      if (!pageCards.length) {
        // No orders parsed: past the last page, or Amazon served a
        // sign-in / robot-check page. Either way, stop here.
        LOG('Page', pageNo, 'had 0 order cards — stopping.');
        break;
      }

      let addedThisPage = 0;
      for (const card of pageCards) {
        if (shouldHide(card)) continue;
        const num = getOrderNumber(card);
        if (num && seen.has(num)) continue;
        if (num) seen.add(num);
        const imported = document.importNode(card, true);
        anchor.after(imported);
        anchor = imported;
        added++;
        addedThisPage++;
      }
      LOG(`Page ${pageNo}: +${addedThisPage} undelivered`);
      await sleep(FETCH_DELAY_MS);
    }

    apply(); // re-filter so imported cards are styled consistently
    btn.textContent = `✅ Added ${added} undelivered from other pages`;
    LOG('Consolidation done. Total added:', added);
  }

  // ----------------------------- runner --------------------------------
  // Disconnect the observer while we mutate the DOM, so our own changes
  // don't retrigger the observer in a loop.
  let observer = null;
  function run() {
    if (observer) observer.disconnect();
    buildButton();
    buildConsolidateButton();
    apply();
    if (observer) observer.observe(document.body, { childList: true, subtree: true });
  }

  // Re-run on dynamic / lazy-loaded content, debounced.
  let timer = null;
  observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });

  run();
  LOG('Initialized. undeliveredOnly =', undeliveredOnly);
})();
