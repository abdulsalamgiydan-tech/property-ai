/**
 * Coles category page extractor — run on a Coles browse/category page in the browser console.
 * Excludes multi-product wrapper/container nodes by keeping only minimal tile roots (one product URL per subtree).
 *
 * Usage: load/paste this file, then run: runColesCategoryExtractor()
 */
(function () {
  "use strict";

  const PRODUCT_PATH = "/product/";

  function normalizeProductUrl(href) {
    try {
      const u = new URL(href, location.origin);
      if (!u.pathname.includes(PRODUCT_PATH)) return null;
      u.hash = "";
      u.search = "";
      const base = `${u.origin}${u.pathname.replace(/\/$/, "") || u.pathname}`;
      return base;
    } catch {
      return null;
    }
  }

  function collectDistinctProductUrls(scope) {
    const set = new Set();
    if (!scope || !scope.querySelectorAll) return set;
    scope.querySelectorAll("a[href]").forEach((a) => {
      const n = normalizeProductUrl(a.href);
      if (n) set.add(n);
    });
    return set;
  }

  /**
   * Walk up from the product anchor: the tile root is the highest ancestor whose subtree
   * still contains exactly one distinct product URL (this one). Any parent that contains
   * multiple product URLs is a grid/wrapper — we stop before it, yielding a leaf card.
   */
  function findMinimalProductTileRoot(anchor) {
    const target = normalizeProductUrl(anchor.href);
    if (!target) return anchor.parentElement || anchor;

    let tile = anchor;
    let el = anchor;
    while (el.parentElement) {
      el = el.parentElement;
      const urls = collectDistinctProductUrls(el);
      if (urls.size === 1 && urls.has(target)) {
        tile = el;
      } else {
        break;
      }
    }
    return tile;
  }

  function isInsideProcessedTile(node, processedTiles) {
    for (let i = 0; i < processedTiles.length; i++) {
      if (processedTiles[i].contains(node)) return true;
    }
    return false;
  }

  function parseVisibleTotalResults() {
    const t = document.body?.innerText || "";
    const m = t.match(/\d+\s*-\s*\d+\s+of\s+(\d+)\s+results/i);
    if (m) return Number(m[1]);
    const m2 = t.match(/of\s+(\d+)\s+results/i);
    if (m2) return Number(m2[1]);
    return null;
  }

  function totalResultsTextFromPage() {
    const t = document.body?.innerText || "";
    const m = t.match(/\d+\s*-\s*\d+\s+of\s+\d+\s+results/i);
    if (m) return m[0].trim();
    const m2 = t.match(/\d+\s+of\s+\d+\s+results/i);
    if (m2) return m2[0].trim();
    return "";
  }

  function extractPriceText(tile) {
    const txt = tile.textContent || "";
    const m = txt.match(/\$\s*\d+(?:\.\d{2})?/);
    return m ? m[0].replace(/\s+/g, "") : "";
  }

  function extractImageUrl(tile) {
    const imgs = tile.querySelectorAll("img[src]");
    for (const img of imgs) {
      const s = img.getAttribute("src") || "";
      if (s.includes("productimages") || s.includes("_next/image") || s.includes("cdn.")) {
        try {
          return new URL(s, location.origin).href;
        } catch {
          return s;
        }
      }
    }
    for (const img of imgs) {
      const s = img.getAttribute("src") || "";
      if (s) {
        try {
          return new URL(s, location.origin).href;
        } catch {
          return s;
        }
      }
    }
    return "";
  }

  function extractProductName(tile, anchor) {
    const t = (anchor.textContent || "").trim().replace(/\s+/g, " ");
    if (t.length > 2) return t.slice(0, 500);
    const h = tile.querySelector("h2, h3, [class*='ProductTitle'], [data-testid*='title' i]");
    if (h) return (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 500);
    return (tile.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200);
  }

  function gatherProductAnchors() {
    const out = [];
    document.querySelectorAll(`a[href*="${PRODUCT_PATH}"]`).forEach((a) => {
      if (normalizeProductUrl(a.href)) out.push(a);
    });
    return out;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function runColesCategoryExtractor() {
    const allAnchors = gatherProductAnchors();
    const extracted_raw_count = allAnchors.length;

    const distinctUrlsFromAnchors = new Set();
    allAnchors.forEach((a) => {
      const u = normalizeProductUrl(a.href);
      if (u) distinctUrlsFromAnchors.add(u);
    });
    const duplicate_count = Math.max(0, extracted_raw_count - distinctUrlsFromAnchors.size);

    const visible_total_results = parseVisibleTotalResults();
    const total_results_text = totalResultsTextFromPage() || null;

    const processedTiles = [];
    const byUrl = new Map();
    let skipped_wrapper_count = 0;
    let domOrder = 0;

    for (const anchor of allAnchors) {
      const product_url = normalizeProductUrl(anchor.href);
      if (!product_url) continue;

      if (byUrl.has(product_url)) continue;

      const tile = findMinimalProductTileRoot(anchor);
      const urlsInTile = collectDistinctProductUrls(tile);

      if (urlsInTile.size !== 1 || !urlsInTile.has(product_url)) {
        skipped_wrapper_count++;
        continue;
      }

      if (isInsideProcessedTile(anchor, processedTiles)) {
        skipped_wrapper_count++;
        continue;
      }

      if (tile.textContent && tile.textContent.length > 12000) {
        skipped_wrapper_count++;
        continue;
      }

      processedTiles.push(tile);
      byUrl.set(product_url, {
        product_url,
        product_name: extractProductName(tile, anchor),
        visible_price_text: extractPriceText(tile),
        image_url: extractImageUrl(tile),
        _order: domOrder++,
      });
    }

    const products = Array.from(byUrl.values())
      .sort((a, b) => a._order - b._order)
      .map((row, i) => ({
        product_name: row.product_name,
        product_url: row.product_url,
        visible_price_text: row.visible_price_text,
        image_url: row.image_url,
        position_in_page: i + 1,
      }));

    const extracted_unique_count = products.length;
    const extraction_clean =
      visible_total_results != null &&
      Number.isFinite(visible_total_results) &&
      visible_total_results === extracted_unique_count;

    const extraction_warning = extraction_clean
      ? null
      : visible_total_results != null
        ? `Page text indicates ${visible_total_results} results, but ${extracted_unique_count} unique product URLs were extracted after wrapper filtering and deduplication.`
        : `Could not parse visible total from page text; extracted ${extracted_unique_count} unique product URLs. Verify counts manually.`;

    const slug =
      (location.pathname || "category").split("/").filter(Boolean).pop() || "category";
    const safeSlug = slug.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    const payload = {
      store_name: "coles",
      source_category_url: location.href.split("#")[0],
      current_page_url: location.href,
      page_title: document.title,
      total_results_text: total_results_text || null,
      visible_total_results,
      extracted_raw_count,
      extracted_unique_count,
      duplicate_count,
      skipped_wrapper_count,
      extraction_clean,
      extraction_warning,
      captured_at: new Date().toISOString(),
      products,
    };

    const filename = `coles_${safeSlug}_page-1_${stamp}.json`;
    downloadJson(filename, payload);

    console.log("Coles category extract:", {
      filename,
      visible_total_results,
      extracted_raw_count,
      extracted_unique_count,
      duplicate_count,
      skipped_wrapper_count,
      extraction_clean,
    });

    return payload;
  }

  globalThis.runColesCategoryExtractor = runColesCategoryExtractor;
})();
