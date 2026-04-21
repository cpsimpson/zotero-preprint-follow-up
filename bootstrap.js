/* global Zotero, APP_SHUTDOWN, ChromeUtils */

"use strict";

const { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");

const ADDON_NAME = "Preprint Follow-Up";
const MENU_ITEM_ID = "preprint-follow-up-find-peer-reviewed";
const NOTE_MARKER = "data-preprint-follow-up-note";
const CROSSREF_BASE = "https://api.crossref.org/works";
const MAX_SEARCH_RESULTS = 20;
const MIN_ACCEPTED_SCORE = 0.62;

const state = {
  windows: new WeakMap(),
};

const windowListener = {
  onOpenWindow(xulWindow) {
    const win = xulWindow.docShell?.domWindow;
    if (!win) {
      return;
    }

    const onLoad = () => {
      win.removeEventListener("load", onLoad, false);
      attachMenuToWindow(win);
    };
    win.addEventListener("load", onLoad, false);
  },
  onCloseWindow() {},
  onWindowTitleChange() {},
};

function install() {}

async function startup() {
  await Zotero.initializationPromise;
  Services.wm.addListener(windowListener);
  attachMenuToAllOpenWindows();
  Zotero.debug(`${ADDON_NAME}: started`);
}

function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  Services.wm.removeListener(windowListener);
  detachMenuFromAllOpenWindows();
  Zotero.debug(`${ADDON_NAME}: stopped`);
}

function uninstall() {}

function attachMenuToAllOpenWindows() {
  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    attachMenuToWindow(win);
  }
}

function detachMenuFromAllOpenWindows() {
  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    detachMenuFromWindow(win);
  }
}

function attachMenuToWindow(win) {
  if (!win || !win.document || !win.ZoteroPane) {
    return;
  }
  if (state.windows.has(win)) {
    return;
  }

  const popup = win.document.getElementById("zotero-itemmenu");
  if (!popup) {
    return;
  }

  const menuItem = win.document.createXULElement("menuitem");
  menuItem.id = MENU_ITEM_ID;
  menuItem.setAttribute("label", "Find Peer-Reviewed Version");

  const onPopupShowing = () => {
    menuItem.hidden = !hasSearchableSelection(win);
  };
  const onCommand = () => {
    void runLookupFromWindow(win);
  };

  menuItem.addEventListener("command", onCommand, false);
  popup.addEventListener("popupshowing", onPopupShowing, false);
  popup.appendChild(menuItem);

  state.windows.set(win, {
    popup,
    menuItem,
    onPopupShowing,
    onCommand,
  });
}

function detachMenuFromWindow(win) {
  const entry = state.windows.get(win);
  if (!entry) {
    return;
  }
  entry.menuItem.removeEventListener("command", entry.onCommand, false);
  entry.popup.removeEventListener("popupshowing", entry.onPopupShowing, false);
  entry.menuItem.remove();
  state.windows.delete(win);
}

function hasSearchableSelection(win) {
  const selectedItems = getSelectedRegularItems(win);
  return selectedItems.length > 0;
}

function getSelectedRegularItems(win) {
  if (!win?.ZoteroPane) {
    return [];
  }
  return win.ZoteroPane.getSelectedItems().filter((item) => {
    return item?.isRegularItem?.() && item.getField("title");
  });
}

async function runLookupFromWindow(win) {
  const items = getSelectedRegularItems(win);
  if (!items.length) {
    Services.prompt.alert(win, ADDON_NAME, "Select at least one regular item with a title.");
    return;
  }

  const found = [];
  const notFound = [];
  const failed = [];

  for (const item of items) {
    try {
      const match = await findPublishedVersion(item);
      if (!match) {
        notFound.push(item);
        continue;
      }

      await upsertResultNote(item, match);
      await tagItem(item, "peer-reviewed-version-found");
      found.push({ item, match });
    }
    catch (error) {
      Zotero.logError(error);
      failed.push(item);
    }
  }

  Services.prompt.alert(win, ADDON_NAME, buildSummaryMessage(found, notFound, failed));
}

function buildSummaryMessage(found, notFound, failed) {
  let message = `Processed ${found.length + notFound.length + failed.length} item(s).\n`;
  message += `Found likely peer-reviewed versions: ${found.length}\n`;
  message += `No match found: ${notFound.length}\n`;
  message += `Errors: ${failed.length}\n`;

  if (found.length) {
    const lines = found.slice(0, 5).map(({ item, match }) => {
      return `- ${truncate(item.getField("title"), 70)} -> ${truncate(match.title, 70)} (${match.year || "n.d."})`;
    });
    message += `\nTop matches:\n${lines.join("\n")}`;
  }

  return message;
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || "";
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

async function tagItem(item, tag) {
  item.addTag(tag);
  await item.saveTx();
}

async function upsertResultNote(item, match) {
  const noteHTML = buildResultNoteHTML(item, match);
  const childNoteIDs = item.getNotes();

  let existingNote = null;
  for (const noteID of childNoteIDs) {
    const noteItem = Zotero.Items.get(noteID);
    if (noteItem && noteItem.getNote().includes(NOTE_MARKER)) {
      existingNote = noteItem;
      break;
    }
  }

  if (!existingNote) {
    existingNote = new Zotero.Item("note");
    existingNote.parentID = item.id;
  }

  existingNote.setNote(noteHTML);
  await existingNote.saveTx();
}

function buildResultNoteHTML(item, match) {
  const sourceTitle = escapeHTML(item.getField("title"));
  const matchedTitle = escapeHTML(match.title || "Unknown title");
  const journal = escapeHTML(match.journal || "Unknown journal");
  const doi = escapeHTML(match.doi || "");
  const url = escapeHTML(match.url || "");
  const score = match.score.toFixed(2);
  const foundOn = escapeHTML(new Date().toISOString().slice(0, 10));

  return [
    `<p><strong>Peer-reviewed match candidate</strong> <span ${NOTE_MARKER}="true"></span></p>`,
    `<p>Source preprint: ${sourceTitle}</p>`,
    `<p>Matched title: ${matchedTitle}</p>`,
    `<p>Journal: ${journal}</p>`,
    `<p>Year: ${match.year || "Unknown"}</p>`,
    `<p>DOI: ${doi || "Unavailable"}</p>`,
    url ? `<p>URL: <a href="${url}">${url}</a></p>` : "",
    `<p>Confidence score: ${score}</p>`,
    `<p>Checked on: ${foundOn}</p>`,
    `<p>Source: Crossref</p>`,
  ].filter(Boolean).join("");
}

function escapeHTML(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function findPublishedVersion(item) {
  const source = getSourceMetadata(item);
  if (!source.title) {
    return null;
  }

  const candidates = new Map();

  if (source.doi) {
    const preprintWork = await fetchWorkByDOI(source.doi);
    const relatedDOIs = extractRelatedDOIs(preprintWork?.relation || {});
    for (const relatedDOI of relatedDOIs) {
      const relatedWork = await fetchWorkByDOI(relatedDOI);
      const relatedCandidate = normalizeCandidate(relatedWork);
      if (relatedCandidate) {
        addCandidate(candidates, relatedCandidate);
      }
    }
  }

  const titleSearchWorks = await searchWorksByTitle(source.title);
  for (const work of titleSearchWorks) {
    const candidate = normalizeCandidate(work);
    if (candidate) {
      addCandidate(candidates, candidate);
    }
  }

  let best = null;
  for (const candidate of candidates.values()) {
    const score = scoreCandidate(candidate, source);
    if (score < MIN_ACCEPTED_SCORE) {
      continue;
    }
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best;
}

function addCandidate(map, candidate) {
  const key = candidate.doi ? `doi:${candidate.doi}` : `title:${normalizeText(candidate.title)}`;
  if (!map.has(key)) {
    map.set(key, candidate);
  }
}

function getSourceMetadata(item) {
  const creators = item.getCreators();
  const firstCreator = creators.find((creator) => creator.lastName || creator.name);
  const creatorName = (firstCreator?.lastName || firstCreator?.name || "").toLowerCase();

  return {
    title: item.getField("title") || "",
    normalizedTitle: normalizeText(item.getField("title") || ""),
    doi: normalizeDOI(item.getField("DOI") || ""),
    firstAuthorLastName: creatorName,
    year: extractYear(item.getField("date") || ""),
  };
}

function normalizeDOI(value) {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

function normalizeCandidate(work) {
  if (!work) {
    return null;
  }

  const title = Array.isArray(work.title) ? work.title[0] : work.title;
  if (!title) {
    return null;
  }

  const candidate = {
    title,
    normalizedTitle: normalizeText(title),
    doi: normalizeDOI(work.DOI || ""),
    type: work.type || "",
    subtype: work.subtype || "",
    journal: Array.isArray(work["container-title"]) ? work["container-title"][0] : "",
    firstAuthorLastName: (work.author?.[0]?.family || work.author?.[0]?.name || "").toLowerCase(),
    year: extractCrossrefYear(work),
    url: work.URL || "",
  };

  if (!candidate.normalizedTitle) {
    return null;
  }
  return candidate;
}

function extractCrossrefYear(work) {
  const sources = [
    work.issued,
    work["published-online"],
    work["published-print"],
    work.published,
    work.created,
  ];
  for (const source of sources) {
    const year = source?.["date-parts"]?.[0]?.[0];
    if (Number.isInteger(year)) {
      return year;
    }
  }
  return null;
}

function extractRelatedDOIs(data) {
  const serialized = JSON.stringify(data || {});
  const matches = serialized.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi) || [];
  return [...new Set(matches.map((match) => normalizeDOI(match)))];
}

function scoreCandidate(candidate, source) {
  if (candidate.doi && source.doi && candidate.doi === source.doi) {
    return -1;
  }
  if (looksLikePreprint(candidate)) {
    return -1;
  }

  const similarity = titleSimilarity(source.normalizedTitle, candidate.normalizedTitle);
  if (similarity < 0.45) {
    return -1;
  }

  let score = similarity * 0.72;

  if (candidate.type === "journal-article") {
    score += 0.12;
  }
  if (candidate.journal) {
    score += 0.06;
  }

  if (source.firstAuthorLastName && candidate.firstAuthorLastName) {
    if (source.firstAuthorLastName === candidate.firstAuthorLastName) {
      score += 0.1;
    }
  }

  if (source.year && candidate.year) {
    const delta = Math.abs(candidate.year - source.year);
    if (delta <= 1) {
      score += 0.08;
    }
    else if (delta <= 3) {
      score += 0.03;
    }
  }

  return score;
}

function looksLikePreprint(candidate) {
  const content = `${candidate.title} ${candidate.journal} ${candidate.type} ${candidate.subtype}`.toLowerCase();
  const markers = [
    "preprint",
    "arxiv",
    "biorxiv",
    "medrxiv",
    "ssrn",
    "research square",
    "posted-content",
  ];
  return markers.some((marker) => content.includes(marker));
}

function titleSimilarity(normalizedA, normalizedB) {
  if (!normalizedA || !normalizedB) {
    return 0;
  }
  if (normalizedA === normalizedB) {
    return 1;
  }

  const aTokens = normalizedA.split(" ").filter(Boolean);
  const bTokens = normalizedB.split(" ").filter(Boolean);
  if (!aTokens.length || !bTokens.length) {
    return 0;
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...aSet, ...bSet]).size;
  const jaccard = intersection / union;
  const overlap = intersection / Math.min(aSet.size, bSet.size);
  return Math.max(jaccard, overlap * 0.9);
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(value) {
  const match = (value || "").match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }
  return Number(match[0]);
}

async function fetchWorkByDOI(doi) {
  const normalizedDOI = normalizeDOI(doi);
  if (!normalizedDOI) {
    return null;
  }

  try {
    const response = await httpGetJSON(`${CROSSREF_BASE}/${encodeURIComponent(normalizedDOI)}`);
    return response?.message || null;
  }
  catch (error) {
    Zotero.debug(`${ADDON_NAME}: DOI lookup failed (${normalizedDOI}) - ${error}`);
    return null;
  }
}

async function searchWorksByTitle(title) {
  const encodedTitle = encodeURIComponent(title);
  const url = `${CROSSREF_BASE}?query.title=${encodedTitle}&rows=${MAX_SEARCH_RESULTS}&sort=relevance&order=desc`;

  try {
    const response = await httpGetJSON(url);
    return response?.message?.items || [];
  }
  catch (error) {
    Zotero.logError(error);
    return [];
  }
}

async function httpGetJSON(url) {
  const request = await Zotero.HTTP.request("GET", url, {
    headers: {
      Accept: "application/json",
    },
    timeout: 15000,
  });
  return JSON.parse(request.responseText);
}
