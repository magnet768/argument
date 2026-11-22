import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

// ★管理者へのコメント投稿時にメール通知を送るための Formspree エンドポイントURL
// 例: "https://formspree.io/f/xxxxxxxx" （空欄の場合は通知をスキップします）
const ADMIN_NOTIFY_ENDPOINT = "https://formspree.io/f/xdegwegn";
const TOPIC_COMMENT_COORD = "__topic__";
const LEGACY_TOPIC_ID = "antinatalism";
const MEMO_STORAGE_KEY = "arg_explorer_private_memos_v1";
const BIB_ICON = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em;" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></svg>`;

const DEFAULT_STAGES_OBJ = typeof STAGES !== "undefined" ? STAGES : {};
const DEFAULT_ARGUMENTS = typeof ARGUMENTS !== "undefined" ? ARGUMENTS : [];
const DEFAULT_TOPIC = { id: "relativism", title: "相対主義と絶対主義：細分化論証エクスプローラー", plusLabel: "相対主義", minusLabel: "絶対主義", order: 1, useLegacyRoot: false };
const DEFAULT_PROFILE = { name: "", role: "" };

const isFirebaseConfigured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("ここに");
let auth = null;
let db = null;
if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const state = {
  page: "explorer", drawerOpen: false, profile: { ...DEFAULT_PROFILE },
  adminComments: [], adminCommentsLoading: false, editingAdminCommentId: null,
  topics: [], topicsInDb: false, currentTopicId: DEFAULT_TOPIC.id,
  stages: [], stagesInDb: false, rawArguments: [], arguments: [],
  commentCounts: {},
  topicComments: [], topicCommentsLoading: false, editingTopicCommentId: null,
  memos: {}, editingMemoKey: null, openMemoCards: {},
  openSections: { coordMemo: false, coordComments: false, topicMemo: false, topicComments: false },
  pcPanelOpen: false,
  stage: "1", mode: "plus", selectedCoord: "", evaluations: {}, query: "",
  currentUid: null, isAdmin: false, comments: [], commentsLoading: false,
  editingCommentId: null, editingTopicId: null, editingCoord: null, editingStageId: null,
  detailOpen: false, savedListScrollY: 0, pushedDetailHistory: false
};

let referencedByMap = new Map();
const $ = (id) => document.getElementById(id);

const els = {
  siteHeader: document.querySelector(".site-header"),
  menuOpenBtn: $("menu-open-btn"), menuCloseBtn: $("menu-close-btn"), navDrawer: $("nav-drawer"), navBackdrop: $("nav-backdrop"),
  drawerNavButtons: document.querySelectorAll(".drawer-nav-btn"), drawerAdminStatus: $("drawer-admin-status"),
  topTopicControls: $("top-topic-controls"), topPageLabel: $("top-page-label"),
  explorerHeaderPanel: $("explorer-header-panel"), explorerAdminBar: $("explorer-admin-bar"),
  explorerView: $("explorer-view"), guideView: $("guide-view"), profileView: $("profile-view"), profileContent: $("profile-content"),
  topicSelect: $("topic-select"), editTopicBtn: $("edit-topic-btn"), addTopicBtn: $("add-topic-btn"),
  stageTabs: $("stage-tabs"), stageBanner: $("stage-banner"), argList: $("argument-list"), comparePanel: $("compare-panel"),
  topicMemoSection: $("topic-memo-section"),
  topicCommentsSection: $("topic-comments-section"),
  searchInput: $("search-input"), modeButtons: document.querySelectorAll(".mode-btn"), statusNotice: $("status-notice"),
  adminBadge: $("admin-badge"), addStageBtn: $("add-stage-btn"), addArgBtn: $("add-arg-btn"), backupOpenBtn: $("backup-open-btn"),
  loginOpenBtn: $("login-open-btn"), logoutBtn: $("logout-btn"),
  loginDialog: $("login-dialog"), loginForm: $("login-form"), loginEmail: $("login-email"), loginPassword: $("login-password"), loginError: $("login-error"),
  profileDialog: $("profile-dialog"), profileForm: $("profile-form"), profileName: $("profile-name"), profileRole: $("profile-role"), profileError: $("profile-error"),
  topicDialog: $("topic-dialog"), topicDialogTitle: $("topic-dialog-title"), topicForm: $("topic-form"), topicId: $("topic-id"),
  topicTitle: $("topic-title"), topicPlusLabel: $("topic-plus-label"), topicMinusLabel: $("topic-minus-label"), topicDeleteBtn: $("topic-delete-btn"), topicError: $("topic-error"),
  argDialog: $("arg-dialog"), argDialogTitle: $("arg-dialog-title"), argForm: $("arg-form"), argCoord: $("arg-coord"), argStage: $("arg-stage"),
  inlineAddStageBtn: $("inline-add-stage-btn"), argTopic: $("arg-topic"), argPlusHeading: $("arg-plus-heading"), argMinusHeading: $("arg-minus-heading"),
  argPlusTitle: $("arg-plus-title"), argPlusBody: $("arg-plus-body"), argMinusTitle: $("arg-minus-title"), argMinusBody: $("arg-minus-body"),
  argRefs: $("arg-refs"), argDeleteBtn: $("arg-delete-btn"), argError: $("arg-error"),
  stageDialog: $("stage-dialog"), stageDialogTitle: $("stage-dialog-title"), stageForm: $("stage-form"), stageId: $("stage-id"),
  stageLabel: $("stage-label"), stagePlusLabelText: $("stage-plus-label-text"), stageMinusLabelText: $("stage-minus-label-text"),
  stagePlus: $("stage-plus"), stageMinus: $("stage-minus"), stageDeleteBtn: $("stage-delete-btn"), stageError: $("stage-error"),
  backupDialog: $("backup-dialog"), backupExportCurrentBtn: $("backup-export-current-btn"), backupExportAllBtn: $("backup-export-all-btn"),
  backupFileInput: $("backup-file-input"), backupImportText: $("backup-import-text"), backupPreview: $("backup-preview"),
  backupError: $("backup-error"), backupRestoreBtn: $("backup-restore-btn")
};

const isMobileViewport = () => window.matchMedia("(max-width: 980px)").matches;
const escapeHtml = (str) => String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (url) => (/^https?:\/\//i.test(String(url ?? "").trim()) ? String(url).trim() : "");
const compareNatural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
const normalizeCoordInput = (str) => String(str ?? "").trim()
  .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
  .replace(/[．。]/g, ".")
  .replace(/＋/g, "+")
  .replace(/[－ー―]/g, "-");
const formatBasicProp = (text) => String(text ?? "").replace(/^(\s*\([+-]\d+)(\))/, "$1.00$2").replace(/^(\s*[+-]\d+)(?=\s|$)/, "$1.00");
const stripBasicCoordPrefix = (text) => {
  const s = String(text ?? "").trim();
  const stripped = s.replace(/^(?:\([+-]\d+(?:\.\d+)?\)|[+-]\d+(?:\.\d+)?)\s*/, "").trim();
  return stripped || s;
};

const normalizeProfile = (raw = {}) => ({
  name: String(raw.name ?? "").trim(),
  role: String(raw.role ?? "").trim()
});

const normalizeTopic = (raw) => {
  const id = String(raw.id).trim();
  return {
    id, title: String(raw.title ?? id).trim(),
    plusLabel: String(raw.plusLabel ?? "肯定側").trim() || "肯定側",
    minusLabel: String(raw.minusLabel ?? "反論側").trim() || "反論側",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 9999,
    useLegacyRoot: typeof raw.useLegacyRoot === "boolean" ? raw.useLegacyRoot : id === LEGACY_TOPIC_ID
  };
};

const normalizeStage = (raw) => ({ id: String(raw.id).trim(), label: String(raw.label ?? "").trim(), plus: String(raw.plus ?? "").trim(), minus: String(raw.minus ?? "").trim() });
const getDefaultStagesList = () => Object.entries(DEFAULT_STAGES_OBJ).map(([id, info]) => normalizeStage({ id, ...info })).sort((a, b) => compareNatural(a.id, b.id));
const normalizeArg = (raw) => ({
  coord: String(raw.coord).trim(), stage: String(raw.stage ?? "1").trim(), topic: String(raw.topic ?? "").trim(),
  plusTitle: String(raw.plusTitle ?? "").trim(), plusBody: String(raw.plusBody ?? "").trim(),
  minusTitle: String(raw.minusTitle ?? "").trim(), minusBody: String(raw.minusBody ?? "").trim(),
  refs: Array.isArray(raw.refs) ? raw.refs.filter(Boolean) : [],
  bibliography: Array.isArray(raw.bibliography) ? raw.bibliography : []
});

const findTopic = (id) => state.topics.find((t) => t.id === id);
const getCurrentTopic = () => findTopic(state.currentTopicId) || state.topics[0] || DEFAULT_TOPIC;
const isLegacyTopic = (topicId = state.currentTopicId) => Boolean(findTopic(topicId) ? findTopic(topicId).useLegacyRoot : topicId === LEGACY_TOPIC_ID);
const stagesCollection = (tid = state.currentTopicId) => isLegacyTopic(tid) ? collection(db, "stages") : collection(db, "topics", tid, "stages");
const stageDoc = (sid, tid = state.currentTopicId) => isLegacyTopic(tid) ? doc(db, "stages", sid) : doc(db, "topics", tid, "stages", sid);
const argumentsCollection = (tid = state.currentTopicId) => isLegacyTopic(tid) ? collection(db, "arguments") : collection(db, "topics", tid, "arguments");
const argumentDoc = (c, tid = state.currentTopicId) => isLegacyTopic(tid) ? doc(db, "arguments", c) : doc(db, "topics", tid, "arguments", c);
const commentsCollection = (tid = state.currentTopicId) => isLegacyTopic(tid) ? collection(db, "comments") : collection(db, "topics", tid, "comments");
const commentDoc = (cid, tid = state.currentTopicId) => isLegacyTopic(tid) ? doc(db, "comments", cid) : doc(db, "topics", tid, "comments", cid);

function rebuildReferencedByMap() {
  referencedByMap = new Map();
  for (const item of state.arguments) referencedByMap.set(item.coord, []);
  for (const item of state.arguments) {
    for (const refCoord of item.refs) {
      if (referencedByMap.has(refCoord)) referencedByMap.get(refCoord).push(item.coord);
    }
  }
}

function rebuildArgumentsWithBasicProps() {
  const byCoord = new Map();
  for (const raw of state.rawArguments) {
    byCoord.set(raw.coord, { ...raw, isAutoBasic: false });
  }
  for (const st of state.stages) {
    const basicCoord = `${st.id}.00`;
    if (!byCoord.has(basicCoord) && (st.plus || st.minus)) {
      byCoord.set(basicCoord, {
        coord: basicCoord,
        stage: st.id,
        topic: `${basicCoord} 基本命題`,
        plusTitle: "基本命題",
        plusBody: stripBasicCoordPrefix(st.plus),
        minusTitle: "基本命題",
        minusBody: stripBasicCoordPrefix(st.minus),
        refs: [],
        bibliography: [],
        isAutoBasic: true
      });
    }
  }
  state.arguments = Array.from(byCoord.values()).sort((a, b) => compareNatural(a.coord, b.coord));
  rebuildReferencedByMap();
}

const findStage = (id) => state.stages.find((s) => s.id === String(id));
const findArg = (coord) => state.arguments.find((a) => a.coord === coord);
const isCommentOwner = (c) => Boolean(state.currentUid && c && c.authorUid && c.authorUid === state.currentUid);
const showNotice = (msg) => { els.statusNotice.hidden = !msg; els.statusNotice.textContent = msg || ""; syncComparePanelStickyTop(); };

// === メモ・コメント欄の折りたたみトグル ===
function renderCollapsibleHeader(sectionKey, titleText, count) {
  const isOpen = Boolean(state.openSections[sectionKey]);
  return `<h3 class="panel-section-title is-collapsible">
    <button type="button" class="section-toggle-btn js-toggle-section" data-section-key="${escapeHtml(sectionKey)}" aria-expanded="${isOpen ? "true" : "false"}">
      <span>${escapeHtml(titleText)}</span>
      <span class="section-toggle-right">
        <span class="bib-count-pill">${count}件</span>
        <span class="section-toggle-chevron" aria-hidden="true">▾</span>
      </span>
    </button>
  </h3>`;
}

function handleSectionToggleClick(e) {
  const btn = e.target.closest(".js-toggle-section");
  if (!btn) return false;
  const key = btn.dataset.sectionKey;
  if (!(key in state.openSections)) return false;
  state.openSections[key] = !state.openSections[key];
  if (key === "coordMemo" || key === "coordComments") renderComparePanel();
  else if (key === "topicMemo") renderTopicMemoSection();
  else if (key === "topicComments") renderTopicCommentsSection();
  requestAnimationFrame(syncComparePanelStickyTop);
  return true;
}

// === 共通ショートカット検出・ジャンプ（自分用メモ・公開コメント・管理者へのコメント） ===
function findTopicMentionsInText(raw) {
  const hits = [];
  for (const t of state.topics) {
    const shortTitle = t.title.split(/[：:]/)[0].trim();
    const fullIdx = raw.indexOf(t.title);
    const shortIdx = shortTitle.length >= 3 ? raw.indexOf(shortTitle) : -1;
    let firstIdx = -1;
    if (fullIdx >= 0 && shortIdx >= 0) firstIdx = Math.min(fullIdx, shortIdx);
    else if (fullIdx >= 0) firstIdx = fullIdx;
    else if (shortIdx >= 0) firstIdx = shortIdx;
    if (firstIdx >= 0) hits.push({ index: firstIdx, topic: t });
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function extractTextShortcuts(body, { baseTopicId = null, selfCoord = null } = {}) {
  const raw = String(body ?? "");
  if (!raw) return [];
  const normalized = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, ".")
    .replace(/＋/g, "+")
    .replace(/[－ー―]/g, "-")
    .replace(/／/g, "/");

  const results = [];
  const seen = new Set();
  const pushShortcut = ({ topicId, coord = "", mode = "", label }) => {
    const key = `${topicId}|${coord}|${mode}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ topicId, coord, mode, label });
  };

  const topicHits = findTopicMentionsInText(raw);

  // 1. 「論題ID/座標」形式（例：relativism/+1.10）
  const topicCoordRegex = /([a-zA-Z0-9_-]+)\/([±+-]?\d+\.\d+[a-zA-Z]?)/g;
  for (const m of normalized.matchAll(topicCoordRegex)) {
    const tid = m[1];
    const topicObj = findTopic(tid);
    if (!topicObj) continue;
    const token = m[2];
    const mode = token.startsWith("+") ? "plus" : token.startsWith("-") ? "minus" : "";
    const coord = token.replace(/^[±+-]/, "");
    const shortTitle = topicObj.title.split(/[：:]/)[0].trim();
    pushShortcut({ topicId: tid, coord, mode, label: `${shortTitle} / ${token}` });
  }

  // 2. 座標トークン（例：+1.10, -2.11, ±1.20, 1.10）
  const coordRegex = /(?<![a-zA-Z0-9_/.\d])([±+-]?)(\d+\.\d+[a-zA-Z]?)(?![a-zA-Z0-9_\d])/g;
  for (const m of normalized.matchAll(coordRegex)) {
    const sign = m[1];
    const coord = m[2];
    const mode = sign === "+" ? "plus" : sign === "-" ? "minus" : "";
    const dispCoord = sign ? `${sign}${coord}` : coord;

    if (baseTopicId) {
      if (coord === selfCoord && !mode) continue;
      if (baseTopicId === state.currentTopicId) {
        if (findArg(coord)) {
          pushShortcut({ topicId: baseTopicId, coord, mode, label: dispCoord });
        } else {
          const priorOther = topicHits.filter((h) => h.index < m.index && h.topic.id !== baseTopicId).pop();
          if (priorOther) {
            const shortTitle = priorOther.topic.title.split(/[：:]/)[0].trim();
            pushShortcut({ topicId: priorOther.topic.id, coord, mode, label: `${shortTitle} / ${dispCoord}` });
          }
        }
      } else {
        pushShortcut({ topicId: baseTopicId, coord, mode, label: dispCoord });
      }
    } else {
      const priorTopic = topicHits.filter((h) => h.index < m.index).pop() || topicHits[0] || null;
      if (priorTopic) {
        const shortTitle = priorTopic.topic.title.split(/[：:]/)[0].trim();
        pushShortcut({ topicId: priorTopic.topic.id, coord, mode, label: `${shortTitle} / ${dispCoord}` });
      } else if (findArg(coord)) {
        pushShortcut({ topicId: state.currentTopicId, coord, mode, label: dispCoord });
      }
    }
  }

  // 3. 論題名への言及
  for (const { topic: t } of topicHits) {
    if (baseTopicId && t.id === baseTopicId && selfCoord === TOPIC_COMMENT_COORD) continue;
    pushShortcut({ topicId: t.id, coord: "", mode: "", label: t.title });
  }

  return results;
}

function renderShortcutsHtml(body, { baseTopicId = null, selfCoord = null } = {}) {
  const shortcuts = extractTextShortcuts(body, { baseTopicId, selfCoord });
  if (shortcuts.length === 0) return "";
  return `<div class="shortcut-row"><span>ショートカット:</span>${shortcuts.map((s) =>
    `<button type="button" class="ref-chip js-jump-shortcut" data-topic-id="${escapeHtml(s.topicId)}" data-coord="${escapeHtml(s.coord)}" data-mode="${escapeHtml(s.mode)}">${escapeHtml(s.label)}</button>`
  ).join("")}</div>`;
}

async function jumpToShortcutTarget(topicId, coord = "", targetMode = "") {
  const tid = topicId && findTopic(topicId) ? topicId : state.currentTopicId;
  if (tid !== state.currentTopicId) {
    state.page = "explorer";
    await switchTopic(tid);
  }

  if (coord) {
    const cleanCoord = normalizeCoordInput(coord).replace(/^[±+-]/, "");
    const found = findArg(cleanCoord);
    if (found) {
      if (state.query) { state.query = ""; els.searchInput.value = ""; }
      const nextMode = (targetMode === "plus" || targetMode === "minus")
        ? targetMode
        : (state.mode === "memo" ? "split" : state.mode);
      state.page = "explorer";
      if (isMobileViewport()) {
        state.stage = found.stage;
        state.mode = nextMode;
        openDetailView(found.coord, { resetScroll: true });
      } else {
        jumpTo(found.coord, nextMode);
      }
      return;
    }
  }

  state.page = "explorer";
  if (state.mode === "memo") state.mode = "plus";
  if (state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; applyDetailBodyClass(); }
  state.pcPanelOpen = false;
  showSiteHeader();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openMemoCardTarget(topicId, coord = "") {
  const tid = topicId && findTopic(topicId) ? topicId : state.currentTopicId;
  const switched = tid !== state.currentTopicId;

  if (coord) {
    if (switched) {
      state.page = "explorer";
      await switchTopic(tid);
    }
    const found = findArg(coord);
    if (!found) return;
    if (state.stage !== "all" && found.stage !== state.stage) state.stage = found.stage;
    if (isMobileViewport()) {
      openDetailView(found.coord, { resetScroll: switched });
    } else {
      selectCoord(found.coord);
    }
    return;
  }

  state.page = "explorer";
  state.mode = "plus";
  state.pcPanelOpen = false;
  if (switched) {
    await switchTopic(tid);
    return;
  }
  showSiteHeader();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openCoordAndScrollToSection(coord, section) {
  if (!findArg(coord)) return;
  const targetKey = section === "memo" ? "coordMemo" : section === "comments" ? "coordComments" : null;
  const sectionId = section === "bib" ? "detail-bib-section" : section === "memo" ? "detail-memo-section" : "detail-comments-section";
  const changed = state.selectedCoord !== coord;
  const wasDetailOpen = state.detailOpen;

  if (isMobileViewport()) {
    openDetailView(coord, { reloadComments: false });
    if (targetKey) {
      state.openSections[targetKey] = true;
      renderComparePanel();
    }
    if (changed || !wasDetailOpen) await loadCommentsForCoord(coord);
    requestAnimationFrame(() => {
      const target = $(sectionId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } else {
    selectCoord(coord, { reloadComments: false, scrollPanelTop: false });
    if (targetKey) {
      state.openSections[targetKey] = true;
      renderComparePanel();
    }
    if (changed) await loadCommentsForCoord(coord);
    requestAnimationFrame(() => {
      syncComparePanelStickyTop();
      const target = $(sectionId);
      if (!target) return;
      if (state.detailOpen) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const panel = els.comparePanel;
        const panelRect = panel.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = panel.scrollTop + (targetRect.top - panelRect.top) - 12;
        panel.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
      }
    });
  }
}

// === 自分用メモ（非公開・localStorage 保存） ===
function loadMemos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY) || "{}");
    state.memos = parsed && typeof parsed === "object" ? parsed : {};
  } catch { state.memos = {}; }
}

function saveMemos() {
  try { localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(state.memos)); } catch {}
}

function getMemosFor(topicId, coord = TOPIC_COMMENT_COORD) {
  const bucket = state.memos[topicId];
  if (!bucket || !Array.isArray(bucket[coord])) return [];
  return bucket[coord];
}

function makeMemoCardKey(topicId, coord) {
  return `${topicId}::${coord}`;
}

function makeMemoEditKey(topicId, coord, memoId) {
  return `${topicId}::${coord}::${memoId}`;
}

function isMemoCardOpen(topicId, coord, { hasQuery = false } = {}) {
  if (hasQuery) return true;
  const cardKey = makeMemoCardKey(topicId, coord);
  if (state.editingMemoKey && state.editingMemoKey.startsWith(`${cardKey}::`)) return true;
  return Boolean(state.openMemoCards[cardKey]);
}

function buildMemoMetaSnapshot(topicId, coord) {
  const topicObj = findTopic(topicId);
  const meta = { topicTitle: topicObj ? topicObj.title : topicId };
  if (coord !== TOPIC_COMMENT_COORD && topicId === state.currentTopicId) {
    const item = findArg(coord);
    if (item) {
      meta.stage = item.stage;
      meta.argTopic = item.topic;
      meta.plusTitle = item.plusTitle;
      meta.minusTitle = item.minusTitle;
    }
  }
  return meta;
}

function addPrivateMemo(topicId, coord, body) {
  const cleanBody = String(body ?? "").trim();
  if (!topicId || !coord || !cleanBody) return;
  if (!state.memos[topicId] || typeof state.memos[topicId] !== "object") state.memos[topicId] = {};
  if (!Array.isArray(state.memos[topicId][coord])) state.memos[topicId][coord] = [];
  const meta = buildMemoMetaSnapshot(topicId, coord);
  const entry = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    body: cleanBody,
    createdAt: Date.now(),
    updatedAt: null,
    ...meta
  };
  state.memos[topicId][coord].unshift(entry);
  saveMemos();
}

function updatePrivateMemo(topicId, coord, memoId, body) {
  const cleanBody = String(body ?? "").trim();
  if (!cleanBody) return;
  const list = getMemosFor(topicId, coord);
  const target = list.find((m) => m.id === memoId);
  if (!target) return;
  target.body = cleanBody;
  target.updatedAt = Date.now();
  Object.assign(target, buildMemoMetaSnapshot(topicId, coord));
  saveMemos();
}

function deletePrivateMemo(topicId, coord, memoId) {
  const list = getMemosFor(topicId, coord);
  if (list.length === 0) return;
  const next = list.filter((m) => m.id !== memoId);
  if (next.length > 0) state.memos[topicId][coord] = next;
  else {
    delete state.memos[topicId][coord];
    if (Object.keys(state.memos[topicId]).length === 0) delete state.memos[topicId];
  }
  saveMemos();
}

function deleteTopicMemos(topicId) {
  if (state.memos[topicId]) {
    delete state.memos[topicId];
    saveMemos();
  }
}

function deleteStageMemos(topicId, coordsSet) {
  const bucket = state.memos[topicId];
  if (!bucket) return;
  let changed = false;
  for (const c of coordsSet) {
    if (bucket[c]) { delete bucket[c]; changed = true; }
  }
  if (changed) {
    if (Object.keys(bucket).length === 0) delete state.memos[topicId];
    saveMemos();
  }
}

function renderMemoItemsListHtml(topicId, coord, memos) {
  if (!memos || memos.length === 0) return "";
  return `<ul class="comment-list">${memos.map((m) => {
    const editKey = makeMemoEditKey(topicId, coord, m.id);
    if (state.editingMemoKey === editKey) {
      return `<li class="comment-item memo-item"><form class="mini-form js-memo-edit-form" data-topic-id="${escapeHtml(topicId)}" data-coord="${escapeHtml(coord)}" data-id="${escapeHtml(m.id)}">
        <textarea name="body" rows="3" maxlength="2000" required>${escapeHtml(m.body)}</textarea>
        <div class="comment-edit-actions">
          <button type="button" class="btn-secondary js-cancel-edit-memo">キャンセル</button>
          <button type="submit" class="btn-primary">メモを保存</button>
        </div>
      </form></li>`;
    }
    const shortcutsHtml = renderShortcutsHtml(m.body, { baseTopicId: topicId, selfCoord: coord });
    return `<li class="comment-item memo-item"><div class="comment-meta"><div>
        <span class="memo-private-badge">自分用</span>
        <span>${escapeHtml(formatDate(m.createdAt))}</span>
        ${m.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
      </div><div class="comment-actions">
        <button type="button" class="btn-xs-edit js-edit-memo" data-topic-id="${escapeHtml(topicId)}" data-coord="${escapeHtml(coord)}" data-id="${escapeHtml(m.id)}">編集</button>
        <button type="button" class="btn-xs-danger js-delete-memo" data-topic-id="${escapeHtml(topicId)}" data-coord="${escapeHtml(coord)}" data-id="${escapeHtml(m.id)}">削除</button>
      </div></div>
      <p class="memo-body">${escapeHtml(m.body)}</p>
      ${shortcutsHtml}</li>`;
  }).join("")}</ul>`;
}

// === PC版：右側詳細パネルの初期位置と高さを一覧と揃えて固定 ===
let lastStickyTopStr = "";
let lastPanelHeightStr = "";

function syncComparePanelStickyTop() {
  const panel = els.comparePanel;
  if (!panel) return;
  const layoutEl = panel.parentElement;
  if (isMobileViewport() || state.page !== "explorer" || state.detailOpen || !state.pcPanelOpen || !layoutEl || layoutEl.offsetParent === null) {
    return;
  }
  const layoutRect = layoutEl.getBoundingClientRect();
  const exactTop = Math.max(0, layoutRect.top + window.scrollY);
  if (exactTop > 0) {
    const topStr = `${exactTop.toFixed(2)}px`;
    if (topStr !== lastStickyTopStr) {
      document.documentElement.style.setProperty("--compare-sticky-top", topStr);
      lastStickyTopStr = topStr;
    }
  }

  const viewportAvailable = Math.max(220, window.innerHeight - exactTop - 20);
  const cards = els.argList ? els.argList.querySelectorAll(".arg-card, .memo-card") : [];
  const lastCard = cards.length > 0 ? cards[cards.length - 1] : null;
  let panelHeight = viewportAvailable;
  if (lastCard) {
    const listBottomHeight = Math.max(0, lastCard.getBoundingClientRect().bottom - layoutRect.top);
    if (listBottomHeight > 0) {
      panelHeight = Math.min(viewportAvailable, listBottomHeight);
    }
  }
  const heightStr = `${panelHeight.toFixed(2)}px`;
  if (heightStr !== lastPanelHeightStr) {
    document.documentElement.style.setProperty("--compare-panel-height", heightStr);
    lastPanelHeightStr = heightStr;
  }
}

function initPcStickyComparePanel() {
  const scheduleSync = () => {
    applyDetailBodyClass();
    requestAnimationFrame(syncComparePanelStickyTop);
  };
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("load", scheduleSync);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(scheduleSync);
    [els.siteHeader, els.stageBanner, els.statusNotice, els.argList].forEach((el) => { if (el) ro.observe(el); });
  }
  scheduleSync();
}

// === スマホ用スクロール連動ヘッダー（指の動きに合わせて滑らかに出入り） ===
let resetMobileHeader = () => {};

function showSiteHeader({ animate = true } = {}) {
  resetMobileHeader(animate);
}

function initMobileSmartHeader() {
  const header = els.siteHeader;
  if (!header) return;

  let lastY = Math.max(0, window.scrollY);
  let offset = 0;
  let upDeadzone = 0;
  let snapTimer = null;
  let ticking = false;
  const UP_DEADZONE_PX = 28;

  const getMaxHide = () => header.offsetHeight + 8;

  const applyTransform = (nextOffset, { animate = false } = {}) => {
    const maxHide = getMaxHide();
    offset = Math.max(-maxHide, Math.min(0, nextOffset));
    header.classList.toggle("is-header-snapping", animate);
    if (!isMobileViewport()) {
      header.style.transform = "";
      header.classList.remove("is-header-hidden", "is-header-snapping");
      offset = 0;
      return;
    }
    header.style.transform = offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
    header.classList.toggle("is-header-hidden", offset <= -maxHide + 1);
  };

  resetMobileHeader = (animate = false) => {
    clearTimeout(snapTimer);
    upDeadzone = 0;
    lastY = Math.max(0, window.scrollY);
    applyTransform(0, { animate });
  };

  const scheduleSnap = () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (!isMobileViewport() || state.page !== "explorer" || state.detailOpen || state.drawerOpen) return;
      const maxHide = getMaxHide();
      if (offset === 0 || offset <= -maxHide) return;
      const currentY = Math.max(0, window.scrollY);
      if (currentY <= maxHide) {
        applyTransform(0, { animate: true });
        return;
      }
      const visibleRatio = 1 + offset / maxHide;
      applyTransform(visibleRatio >= 0.35 ? 0 : -maxHide, { animate: true });
    }, 160);
  };

  const update = () => {
    ticking = false;
    if (!isMobileViewport() || state.page !== "explorer" || state.detailOpen || state.drawerOpen) {
      resetMobileHeader(false);
      return;
    }

    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - lastY;
    lastY = currentY;
    if (delta === 0) return;

    const maxHide = getMaxHide();
    const activeEl = document.activeElement;
    const isEditingInHeader = Boolean(
      activeEl &&
      header.contains(activeEl) &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName)
    );

    if (currentY <= 4 || isEditingInHeader) {
      clearTimeout(snapTimer);
      upDeadzone = 0;
      applyTransform(0, { animate: false });
      return;
    }

    if (delta > 0) {
      upDeadzone = 0;
      const minAllowed = -Math.min(currentY, maxHide);
      const nextOffset = Math.max(minAllowed, offset - delta);
      applyTransform(nextOffset, { animate: false });
      scheduleSnap();
    } else {
      const upDist = -delta;
      let moveUp = upDist;
      if (offset <= -maxHide + 1) {
        if (upDeadzone < UP_DEADZONE_PX) {
          const remain = UP_DEADZONE_PX - upDeadzone;
          if (upDist <= remain) {
            upDeadzone += upDist;
            return;
          }
          upDeadzone = UP_DEADZONE_PX;
          moveUp = upDist - remain;
        }
      }
      const nextOffset = currentY <= maxHide
        ? Math.min(0, Math.max(offset + moveUp, -currentY))
        : Math.min(0, offset + moveUp);
      applyTransform(nextOffset, { animate: false });
      scheduleSnap();
    }
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (!isMobileViewport()) resetMobileHeader(false);
  });
}

// === テキストバックアップの作成（エクスポート）と復元（インポート） ===
async function fetchTopicBundleForBackup(topic) {
  const legacy = Boolean(topic.useLegacyRoot);
  if (!db) {
    return {
      topic,
      stages: legacy ? getDefaultStagesList() : [],
      arguments: legacy ? DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord)) : []
    };
  }
  const [stSnap, argSnap] = await Promise.all([
    getDocs(stagesCollection(topic.id)),
    getDocs(argumentsCollection(topic.id))
  ]);
  let stages = [];
  if (stSnap.empty) stages = legacy ? getDefaultStagesList() : [];
  else {
    stSnap.forEach((d) => stages.push(normalizeStage({ id: d.id, ...d.data() })));
    stages.sort((a, b) => compareNatural(a.id, b.id));
  }
  let args = [];
  if (argSnap.empty) args = legacy ? DEFAULT_ARGUMENTS.map(normalizeArg) : [];
  else argSnap.forEach((d) => args.push(normalizeArg({ coord: d.id, ...d.data() })));
  args.sort((a, b) => compareNatural(a.coord, b.coord));
  return { topic, stages, arguments: args };
}

function serializeBackupBundlesToMarkdown(bundles) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const lines = [
    "# 双方向インデックス論証エクスプローラー バックアップ",
    `出力日時: ${stamp}`,
    ""
  ];

  for (const { topic, stages, arguments: args } of bundles) {
    lines.push("================================================================================");
    lines.push(`# 論題: ${topic.title}`);
    lines.push(`- 論題ID: ${topic.id}`);
    lines.push(`- +側呼称: ${topic.plusLabel}`);
    lines.push(`- -側呼称: ${topic.minusLabel}`);
    lines.push(`- 表示順: ${topic.order}`);
    lines.push("");

    const stageIds = new Set(stages.map((s) => s.id));
    const argsByStage = new Map();
    for (const s of stages) argsByStage.set(s.id, []);
    const orphanArgs = [];
    for (const a of args) {
      if (stageIds.has(a.stage)) argsByStage.get(a.stage).push(a);
      else orphanArgs.push(a);
    }

    const pushArgBlock = (item) => {
      lines.push(`### 座標 ${item.coord} | トピック: ${item.topic}`);
      if (item.refs.length > 0) lines.push(`- 前提: ${item.refs.join(", ")}`);
      lines.push("");
      lines.push(`#### +${item.coord} ${item.plusTitle}`.trimEnd());
      lines.push(item.plusBody);
      lines.push("");
      lines.push(`#### -${item.coord} ${item.minusTitle}`.trimEnd());
      lines.push(item.minusBody);
      lines.push("");
      if (item.bibliography.length > 0) {
        lines.push("#### 参考文献");
        for (const b of item.bibliography) {
          lines.push(`- ${b.citation}`);
          if (b.url) lines.push(`  - URL: ${b.url}`);
          if (b.note) lines.push(`  - メモ: ${b.note}`);
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    };

    for (const st of stages) {
      lines.push(`## 水準 ${st.id}: ${st.label}`);
      lines.push("");
      if (st.plus) {
        lines.push(`#### +${st.id}.00 基本命題`);
        lines.push(formatBasicProp(st.plus));
        lines.push("");
      }
      if (st.minus) {
        lines.push(`#### -${st.id}.00 基本命題`);
        lines.push(formatBasicProp(st.minus));
        lines.push("");
      }
      for (const item of argsByStage.get(st.id) || []) pushArgBlock(item);
    }

    if (orphanArgs.length > 0) {
      const grouped = new Map();
      for (const a of orphanArgs) {
        if (!grouped.has(a.stage)) grouped.set(a.stage, []);
        grouped.get(a.stage).push(a);
      }
      for (const [sid, list] of grouped.entries()) {
        lines.push(`## 水準 ${sid}: 水準 ${sid}`);
        lines.push("");
        for (const item of list) pushArgBlock(item);
      }
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function parseBackupMarkdown(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const bundles = [];
  let currentBundle = null;
  let currentStage = null;
  let currentArg = null;
  let section = null;
  let buffer = [];

  const flush = () => {
    if (!section || section === "bib") { buffer = []; return; }
    let start = 0;
    let end = buffer.length;
    while (start < end && buffer[start].trim() === "") start++;
    while (end > start && buffer[end - 1].trim() === "") end--;
    const content = buffer.slice(start, end).join("\n");
    if (section === "stagePlus" && currentStage) currentStage.plus = content;
    else if (section === "stageMinus" && currentStage) currentStage.minus = content;
    else if (section === "argPlus" && currentArg) currentArg.plusBody = content;
    else if (section === "argMinus" && currentArg) currentArg.minusBody = content;
    buffer = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (/^={10,}$/.test(trimmed) || trimmed === "---") {
      flush();
      section = null;
      continue;
    }

    const topicMatch = trimmed.match(/^#\s+論題[:：]\s*(.+)$/);
    if (topicMatch) {
      flush();
      currentBundle = {
        topic: {
          id: "",
          title: topicMatch[1].trim(),
          plusLabel: "肯定側",
          minusLabel: "反論側",
          order: bundles.length + 1
        },
        stages: [],
        arguments: []
      };
      bundles.push(currentBundle);
      currentStage = null;
      currentArg = null;
      section = null;
      continue;
    }

    if (!currentBundle) continue;

    const stageMatch = trimmed.match(/^##\s+水準\s+([^\s:：]+)\s*[:：]\s*(.*)$/);
    if (stageMatch) {
      flush();
      currentStage = { id: stageMatch[1].trim(), label: stageMatch[2].trim() || `水準 ${stageMatch[1].trim()}`, plus: "", minus: "" };
      currentBundle.stages.push(currentStage);
      currentArg = null;
      section = null;
      continue;
    }

    const coordMatch = trimmed.match(/^###\s+座標\s+([^\s|｜]+)(?:\s*[|｜]\s*トピック[:：]\s*(.*))?$/);
    if (coordMatch) {
      flush();
      const coord = coordMatch[1].trim();
      const inferredStage = currentStage ? currentStage.id : (coord.split(".")[0] || "1");
      currentArg = {
        coord,
        stage: inferredStage,
        topic: (coordMatch[2] || "").trim(),
        plusTitle: "",
        plusBody: "",
        minusTitle: "",
        minusBody: "",
        refs: [],
        bibliography: []
      };
      currentBundle.arguments.push(currentArg);
      section = null;
      continue;
    }

    if (/^####\s+参考文献\s*$/.test(trimmed)) {
      flush();
      section = currentArg ? "bib" : null;
      continue;
    }

    const plusHeadMatch = trimmed.match(/^####\s+\+([^\s]+)(?:\s+(.*))?$/);
    if (plusHeadMatch) {
      flush();
      if (currentArg) {
        currentArg.plusTitle = (plusHeadMatch[2] || "").trim();
        section = "argPlus";
      } else if (currentStage) {
        section = "stagePlus";
      }
      continue;
    }

    const minusHeadMatch = trimmed.match(/^####\s+-([^\s]+)(?:\s+(.*))?$/);
    if (minusHeadMatch) {
      flush();
      if (currentArg) {
        currentArg.minusTitle = (minusHeadMatch[2] || "").trim();
        section = "argMinus";
      } else if (currentStage) {
        section = "stageMinus";
      }
      continue;
    }

    if (!currentStage && !currentArg && !section) {
      const idM = trimmed.match(/^-\s*論題ID[:：]\s*(.+)$/);
      if (idM) { currentBundle.topic.id = idM[1].trim(); continue; }
      const plusM = trimmed.match(/^-\s*\+側呼称[:：]\s*(.+)$/);
      if (plusM) { currentBundle.topic.plusLabel = plusM[1].trim(); continue; }
      const minusM = trimmed.match(/^-\s*-側呼称[:：]\s*(.+)$/);
      if (minusM) { currentBundle.topic.minusLabel = minusM[1].trim(); continue; }
      const orderM = trimmed.match(/^-\s*表示順[:：]\s*(\d+)$/);
      if (orderM) { currentBundle.topic.order = Number(orderM[1]); continue; }
    }

    if (currentArg && !section) {
      const refM = trimmed.match(/^-\s*前提[:：]\s*(.*)$/);
      if (refM) {
        const val = refM[1].trim();
        if (val && val !== "なし") {
          currentArg.refs = val.split(/[,、]/).map((s) => s.trim().replace(/^[±+-]/, "")).filter(Boolean);
        }
        continue;
      }
    }

    if (section === "bib" && currentArg) {
      const urlM = rawLine.match(/^\s+-\s*URL[:：]\s*(.+)$/i);
      if (urlM && currentArg.bibliography.length > 0) {
        currentArg.bibliography[currentArg.bibliography.length - 1].url = urlM[1].trim();
        continue;
      }
      const noteM = rawLine.match(/^\s+-\s*メモ[:：]\s*(.+)$/);
      if (noteM && currentArg.bibliography.length > 0) {
        currentArg.bibliography[currentArg.bibliography.length - 1].note = noteM[1].trim();
        continue;
      }
      const citM = rawLine.match(/^-\s+(.+)$/);
      if (citM) {
        currentArg.bibliography.push({ citation: citM[1].trim(), url: "", note: "" });
        continue;
      }
      continue;
    }

    if (section === "stagePlus" || section === "stageMinus" || section === "argPlus" || section === "argMinus") {
      buffer.push(rawLine);
    }
  }
  flush();

  if (bundles.length === 0) {
    throw new Error("論題が見つかりませんでした。「# 論題: ...」の形式で記述されたバックアップテキストを指定してください。");
  }
  for (const b of bundles) {
    if (!b.topic.id || !/^[a-zA-Z0-9_-]+$/.test(b.topic.id) || b.topic.id === "guide" || b.topic.id === "profile") {
      throw new Error(`論題「${b.topic.title}」の論題ID（${b.topic.id || "未設定"}）が不正です。半角英数字・ハイフン・アンダースコアで指定してください。`);
    }
    for (const s of b.stages) {
      if (!s.id || s.id === "all" || s.id.includes("/")) {
        throw new Error(`論題「${b.topic.title}」の水準番号（${s.id}）が不正です。`);
      }
    }
    for (const a of b.arguments) {
      if (!a.coord || a.coord.includes("/")) {
        throw new Error(`論題「${b.topic.title}」の座標（${a.coord}）が不正です。`);
      }
    }
  }
  return bundles;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleBackupExport(scope) {
  if (!state.isAdmin) return;
  els.backupError.hidden = true;
  const targetBtn = scope === "all" ? els.backupExportAllBtn : els.backupExportCurrentBtn;
  const origLabel = targetBtn.textContent;
  targetBtn.disabled = true;
  targetBtn.textContent = "作成中...";
  try {
    const targetTopics = scope === "all" ? state.topics : [getCurrentTopic()];
    const bundles = [];
    for (const t of targetTopics) bundles.push(await fetchTopicBundleForBackup(t));
    const md = serializeBackupBundlesToMarkdown(bundles);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fname = scope === "all" ? `arguments-backup-all-${stamp}.md` : `arguments-backup-${targetTopics[0].id}-${stamp}.md`;
    downloadTextFile(fname, md);
  } catch (err) {
    console.error(err);
    els.backupError.textContent = "バックアップの作成に失敗しました。";
    els.backupError.hidden = false;
  } finally {
    targetBtn.disabled = false;
    targetBtn.textContent = origLabel;
  }
}

function updateBackupPreview() {
  const raw = els.backupImportText.value.trim();
  els.backupError.hidden = true;
  if (!raw) {
    els.backupPreview.hidden = true;
    els.backupPreview.textContent = "";
    return;
  }
  try {
    const bundles = parseBackupMarkdown(raw);
    const stageCount = bundles.reduce((n, b) => n + b.stages.length, 0);
    const argCount = bundles.reduce((n, b) => n + b.arguments.length, 0);
    const names = bundles.map((b) => `「${b.topic.title}」`).join("・");
    els.backupPreview.textContent = `検出結果：論題 ${bundles.length}件（${names}） / 水準 ${stageCount}件 / 命題 ${argCount}件`;
    els.backupPreview.hidden = false;
  } catch (err) {
    els.backupPreview.hidden = true;
    els.backupError.textContent = err.message || "バックアップ形式の解析に失敗しました。";
    els.backupError.hidden = false;
  }
}

async function handleBackupRestore() {
  if (!db || !state.isAdmin) {
    els.backupError.textContent = "データベースに接続されていないか、管理者権限がありません。";
    els.backupError.hidden = false;
    return;
  }
  els.backupError.hidden = true;
  const raw = els.backupImportText.value.trim();
  if (!raw) {
    els.backupError.textContent = "復元するバックアップテキストを選択または貼り付けてください。";
    els.backupError.hidden = false;
    return;
  }
  let bundles;
  try {
    bundles = parseBackupMarkdown(raw);
  } catch (err) {
    els.backupError.textContent = err.message || "テキストの解析に失敗しました。";
    els.backupError.hidden = false;
    return;
  }

  const stageCount = bundles.reduce((n, b) => n + b.stages.length, 0);
  const argCount = bundles.reduce((n, b) => n + b.arguments.length, 0);
  if (!confirm(`論題 ${bundles.length}件・水準 ${stageCount}件・命題 ${argCount}件をデータベースへ復元しますか？（同じID・座標のデータは上書きされます）`)) {
    return;
  }

  els.backupRestoreBtn.disabled = true;
  els.backupRestoreBtn.textContent = "復元中...";
  try {
    await ensureTopicsSeededInDb();
    for (const b of bundles) {
      const existing = findTopic(b.topic.id);
      const useLegacyRoot = existing ? Boolean(existing.useLegacyRoot) : (b.topic.id === LEGACY_TOPIC_ID);
      const topicPayload = {
        id: b.topic.id,
        title: b.topic.title,
        plusLabel: b.topic.plusLabel || "肯定側",
        minusLabel: b.topic.minusLabel || "反論側",
        order: b.topic.order,
        useLegacyRoot,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "topics", b.topic.id), topicPayload);

      const getStageRef = (sid) => useLegacyRoot ? doc(db, "stages", sid) : doc(db, "topics", b.topic.id, "stages", sid);
      const getArgRef = (c) => useLegacyRoot ? doc(db, "arguments", c) : doc(db, "topics", b.topic.id, "arguments", c);

      for (const st of b.stages) {
        await setDoc(getStageRef(st.id), {
          id: st.id,
          label: st.label,
          plus: formatBasicProp(st.plus),
          minus: formatBasicProp(st.minus),
          updatedAt: serverTimestamp()
        });
      }
      for (const a of b.arguments) {
        await setDoc(getArgRef(a.coord), {
          coord: a.coord,
          stage: a.stage,
          topic: a.topic,
          plusTitle: a.plusTitle,
          plusBody: a.plusBody,
          minusTitle: a.minusTitle,
          minusBody: a.minusBody,
          refs: a.refs,
          bibliography: a.bibliography,
          updatedAt: serverTimestamp()
        });
      }
    }

    await loadTopics();
    const nextTopicId = findTopic(state.currentTopicId) ? state.currentTopicId : bundles[0].topic.id;
    state.currentTopicId = nextTopicId;
    await Promise.all([loadStages(), loadArguments(), loadCommentCounts(), loadTopicComments()]);
    if (state.stage !== "all" && !findStage(state.stage)) {
      state.stage = state.stages[0]?.id || "all";
    }
    if (!findArg(state.selectedCoord)) {
      state.selectedCoord = "";
      state.pcPanelOpen = false;
    }
    els.backupDialog.close();
    renderAll();
    if (state.selectedCoord) await loadCommentsForCoord(state.selectedCoord);
    alert(`復元が完了しました（論題 ${bundles.length}件・水準 ${stageCount}件・命題 ${argCount}件）。`);
  } catch (err) {
    console.error(err);
    els.backupError.textContent = "データベースへの復元に失敗しました。Firestoreのルールと管理者ログイン状態を確認してください。";
    els.backupError.hidden = false;
  } finally {
    els.backupRestoreBtn.disabled = false;
    els.backupRestoreBtn.textContent = "この内容でDBへ復元";
  }
}

function openBackupDialog() {
  if (!state.isAdmin) return;
  els.backupError.hidden = true;
  els.backupPreview.hidden = true;
  els.backupFileInput.value = "";
  els.backupImportText.value = "";
  els.backupDialog.showModal();
}

// === 管理者コメント投稿時のメール通知（Formspree） ===
async function notifyAdminByEmail({ category, author, body }) {
  const endpoint = String(ADMIN_NOTIFY_ENDPOINT ?? "").trim();
  if (!endpoint) return;
  const catLabelMap = {
    bibliography: "参考文献の修正提案",
    correction: "命題・論証の修正提案",
    other: "サイト全体へのご意見・その他"
  };
  const catLabel = catLabelMap[category] || category || "その他";
  const authorText = author || "匿名";

  const formData = new FormData();
  formData.append("_subject", `【管理者ページ】新しいコメント（${catLabel}）`);
  formData.append("category", catLabel);
  formData.append("author", authorText);
  formData.append("message", `【種別】${catLabel}\n【投稿者】${authorText}\n\n${body}`);
  formData.append("page_url", window.location.href);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`管理者メール通知に失敗しました (HTTP ${res.status}):`, detail);
    }
  } catch (err) {
    console.warn("管理者メール通知の送信に失敗しました:", err);
  }
}

// === 主張の評価（localStorage 保存・前提→帰結の一方向連動） ===
const evalStorageKey = (tid = state.currentTopicId) => `arg_explorer_evals_${tid}`;
function loadEvaluations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(evalStorageKey()) || "{}");
    state.evaluations = parsed && typeof parsed === "object" ? parsed : {};
  } catch { state.evaluations = {}; }
}
function saveEvaluations() {
  try { localStorage.setItem(evalStorageKey(), JSON.stringify(state.evaluations)); } catch {}
}
function getEvaluation(coord) {
  const v = state.evaluations[coord];
  return v === "plus" || v === "minus" ? v : "hold";
}
function getConsequenceCoords(startCoord) {
  const visited = new Set([startCoord]);
  const queue = [startCoord];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of referencedByMap.get(cur) || []) {
      if (next && !visited.has(next) && findArg(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return Array.from(visited);
}
function setEvaluation(coord, value) {
  if (!["plus", "hold", "minus"].includes(value)) return;
  for (const c of getConsequenceCoords(coord)) {
    if (value === "hold") delete state.evaluations[c];
    else state.evaluations[c] = value;
  }
  saveEvaluations();
  renderList();
  renderComparePanel();
  requestAnimationFrame(syncComparePanelStickyTop);
}
function renderEvalControl(coord, { isPanel = false } = {}) {
  const topic = getCurrentTopic();
  const cur = getEvaluation(coord);
  const curLabel = cur === "plus" ? topic.plusLabel : cur === "minus" ? topic.minusLabel : "保留";
  return `
    <div class="eval-row ${isPanel ? "is-panel" : ""}">
      <span class="eval-label">自説：${escapeHtml(curLabel)}</span>
      <div class="eval-group" role="group" aria-label="主張の評価">
        <button type="button" class="eval-btn js-eval-btn ${cur === "plus" ? "is-active" : ""}" data-coord="${escapeHtml(coord)}" data-eval="plus" title="${escapeHtml(topic.plusLabel)}" aria-label="${escapeHtml(topic.plusLabel)}">+</button>
        <button type="button" class="eval-btn js-eval-btn ${cur === "hold" ? "is-active" : ""}" data-coord="${escapeHtml(coord)}" data-eval="hold" title="保留" aria-label="保留">=</button>
        <button type="button" class="eval-btn js-eval-btn ${cur === "minus" ? "is-active" : ""}" data-coord="${escapeHtml(coord)}" data-eval="minus" title="${escapeHtml(topic.minusLabel)}" aria-label="${escapeHtml(topic.minusLabel)}">-</button>
      </div>
    </div>`;
}

function formatDate(ts) {
  if (!ts) return "たった今";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function getCurrentHash() {
  if (state.page === "guide") return "#guide";
  if (state.page === "profile") return "#profile";
  if (!state.currentTopicId) return "";
  const isShowingDetail = state.detailOpen || (!isMobileViewport() && state.pcPanelOpen);
  if (!isShowingDetail || !state.selectedCoord) return `#${encodeURIComponent(state.currentTopicId)}`;
  const p = state.mode === "plus" ? "+" : state.mode === "minus" ? "-" : "";
  return `#${encodeURIComponent(state.currentTopicId)}/${p}${state.selectedCoord}`;
}
function syncUrlHash() {
  const h = getCurrentHash();
  if (h) { try { history.replaceState(history.state, "", h); } catch {} }
}
function parseUrlHashTokens() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (!raw) return { page: "explorer", topicId: null, coordToken: "" };
  if (raw === "guide" || raw === "profile") return { page: raw, topicId: null, coordToken: "" };
  if (raw.includes("/")) {
    const [maybeTopic, ...rest] = raw.split("/");
    return { page: "explorer", topicId: maybeTopic.trim(), coordToken: rest.join("/").trim() };
  }
  if (findTopic(raw)) return { page: "explorer", topicId: raw, coordToken: "" };
  return { page: "explorer", topicId: null, coordToken: raw };
}
function applyCoordToken(coordToken) {
  if (!coordToken) return false;
  let mode = state.mode;
  let coord = coordToken;
  if (coordToken.startsWith("+")) { mode = "plus"; coord = coordToken.slice(1); }
  else if (coordToken.startsWith("-")) { mode = "minus"; coord = coordToken.slice(1); }
  const found = findArg(coord);
  if (!found) return false;
  state.stage = found.stage;
  state.mode = mode;
  state.selectedCoord = found.coord;
  return true;
}
async function applyUrlHashState() {
  const { page, topicId, coordToken } = parseUrlHashTokens();
  if (page !== "explorer") {
    state.page = page;
    state.detailOpen = false;
    state.pushedDetailHistory = false;
    renderAll();
    if (page === "profile") await loadAdminComments();
    return;
  }

  state.page = "explorer";
  if (topicId && findTopic(topicId) && topicId !== state.currentTopicId) {
    await switchTopic(topicId, { scrollTop: false });
  }

  if (coordToken && applyCoordToken(coordToken)) {
    if (isMobileViewport()) {
      openDetailView(state.selectedCoord, { pushBrowserHistory: false });
    } else {
      state.detailOpen = false;
      state.pcPanelOpen = true;
      state.openSections.coordMemo = false;
      state.openSections.coordComments = false;
      renderAll();
      if (els.comparePanel) els.comparePanel.scrollTop = 0;
      focusCard(state.selectedCoord);
      await loadCommentsForCoord(state.selectedCoord);
    }
  } else {
    state.detailOpen = false;
    state.pushedDetailHistory = false;
    state.pcPanelOpen = false;
    renderAll();
  }
}
function focusCard(coord) {
  if (state.detailOpen || state.page !== "explorer") return;
  requestAnimationFrame(() => {
    const card = els.argList.querySelector(`[data-coord="${CSS.escape(coord)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
  });
}

// === ドロワー・ページ切替・詳細ビュー ===
function openNavDrawer() {
  state.drawerOpen = true;
  showSiteHeader({ animate: false });
  els.navBackdrop.hidden = false;
  els.navDrawer.classList.add("is-open");
  els.navDrawer.setAttribute("aria-hidden", "false");
  els.menuOpenBtn.setAttribute("aria-expanded", "true");
}
function closeNavDrawer() {
  state.drawerOpen = false;
  els.navBackdrop.hidden = true;
  els.navDrawer.classList.remove("is-open");
  els.navDrawer.setAttribute("aria-hidden", "true");
  els.menuOpenBtn.setAttribute("aria-expanded", "false");
}
const applyDetailBodyClass = () => {
  const open = state.page === "explorer" && state.detailOpen;
  const pcHidden = !isMobileViewport() && state.page === "explorer" && !state.detailOpen && !state.pcPanelOpen;
  document.body.classList.toggle("is-detail-view", open);
  document.body.classList.toggle("is-pc-panel-hidden", pcHidden);
  if (els.topicCommentsSection) els.topicCommentsSection.hidden = open;
  if (els.topicMemoSection) els.topicMemoSection.hidden = open;
};

function switchPage(nextPage) {
  if (!["explorer", "guide", "profile"].includes(nextPage)) return;
  closeNavDrawer();
  showSiteHeader({ animate: false });
  state.page = nextPage;
  state.editingCommentId = null;
  state.editingTopicCommentId = null;
  state.editingAdminCommentId = null;
  state.editingMemoKey = null;
  if (nextPage !== "explorer" && state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; }
  renderAll();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (nextPage === "profile") loadAdminComments();
}
function openDetailView(coord, { pushBrowserHistory = true, resetScroll = false, reloadComments = true } = {}) {
  if (!findArg(coord)) return;
  const wasOpen = state.detailOpen;
  const wasExplorer = state.page === "explorer";
  if (!wasOpen) state.savedListScrollY = (!wasExplorer || resetScroll) ? 0 : window.scrollY;
  const changed = state.selectedCoord !== coord;
  state.page = "explorer";
  state.selectedCoord = coord;
  state.pcPanelOpen = true;
  state.editingCommentId = null;
  state.editingMemoKey = null;
  if (changed || !wasOpen) {
    state.openSections.coordMemo = false;
    state.openSections.coordComments = false;
  }
  state.detailOpen = true;
  showSiteHeader({ animate: false });
  applyDetailBodyClass();
  renderPageVisibility();
  if (pushBrowserHistory && !wasOpen) {
    try { history.pushState({ detailOpen: true, coord }, "", getCurrentHash()); state.pushedDetailHistory = true; }
    catch { state.pushedDetailHistory = false; }
  } else syncUrlHash();
  renderTopicBar();
  renderTabs();
  renderModeButtons();
  renderStageBanner();
  renderList();
  renderComparePanel();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (reloadComments && (changed || !wasOpen)) loadCommentsForCoord(coord);
}
function closeDetailView({ restoreScroll = true } = {}) {
  if (!state.detailOpen) return;
  state.detailOpen = false;
  state.pushedDetailHistory = false;
  state.editingCommentId = null;
  state.editingMemoKey = null;
  showSiteHeader({ animate: false });
  applyDetailBodyClass();
  renderAll();
  if (restoreScroll) requestAnimationFrame(() => window.scrollTo({ top: state.savedListScrollY, behavior: "instant" }));
}
const requestCloseDetailView = () => (state.pushedDetailHistory ? history.back() : closeDetailView({ restoreScroll: true }));

// === Firestore データ操作 ===
async function ensureSignedInUid() {
  if (!auth) return null;
  if (auth.currentUser) { state.currentUid = auth.currentUser.uid; return auth.currentUser.uid; }
  const cred = await signInAnonymously(auth);
  state.currentUid = cred.user.uid;
  return cred.user.uid;
}
async function loadProfile() {
  if (!db) { state.profile = { ...DEFAULT_PROFILE }; return; }
  try {
    const snap = await getDoc(doc(db, "siteMeta", "profile"));
    state.profile = snap.exists() ? normalizeProfile(snap.data()) : { ...DEFAULT_PROFILE };
  } catch (err) { console.error(err); state.profile = { ...DEFAULT_PROFILE }; }
}
async function loadAdminComments() {
  if (!db) { state.adminComments = []; state.adminCommentsLoading = false; renderProfilePage(); return; }
  state.adminCommentsLoading = true;
  renderProfilePage();
  try {
    const snap = await getDocs(collection(db, "adminComments"));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    state.adminComments = list;
  } catch (err) { console.error(err); state.adminComments = []; }
  finally { state.adminCommentsLoading = false; renderProfilePage(); }
}
async function loadTopics() {
  if (!db) { state.topics = [normalizeTopic(DEFAULT_TOPIC)]; state.topicsInDb = false; return; }
  try {
    const snap = await getDocs(collection(db, "topics"));
    if (snap.empty) { state.topics = [normalizeTopic(DEFAULT_TOPIC)]; state.topicsInDb = false; }
    else {
      const rows = [];
      snap.forEach((d) => rows.push(normalizeTopic({ id: d.id, ...d.data() })));
      state.topics = rows.sort((a, b) => a.order - b.order || compareNatural(a.id, b.id));
      state.topicsInDb = true;
    }
  } catch (err) { console.error(err); state.topics = [normalizeTopic(DEFAULT_TOPIC)]; state.topicsInDb = false; }
}
async function ensureTopicsSeededInDb() {
  if (!db || !state.isAdmin || state.topicsInDb) return;
  await setDoc(doc(db, "topics", DEFAULT_TOPIC.id), { ...DEFAULT_TOPIC, updatedAt: serverTimestamp() });
  state.topicsInDb = true;
}
async function loadStages() {
  const fallback = isLegacyTopic(state.currentTopicId) ? getDefaultStagesList() : [];
  if (!db) { state.stages = fallback; state.stagesInDb = false; rebuildArgumentsWithBasicProps(); return; }
  try {
    const snap = await getDocs(stagesCollection());
    if (snap.empty) { state.stages = fallback; state.stagesInDb = false; }
    else {
      const rows = [];
      snap.forEach((d) => rows.push(normalizeStage({ id: d.id, ...d.data() })));
      state.stages = rows.sort((a, b) => compareNatural(a.id, b.id));
      state.stagesInDb = true;
    }
  } catch (err) { console.error(err); state.stages = fallback; state.stagesInDb = false; }
  rebuildArgumentsWithBasicProps();
}
async function ensureStagesSeededInDb() {
  if (!db || !state.isAdmin || state.stagesInDb || !isLegacyTopic()) return;
  for (const st of getDefaultStagesList()) await setDoc(stageDoc(st.id), { ...st, updatedAt: serverTimestamp() });
  state.stagesInDb = true;
}
async function loadArguments() {
  const legacy = isLegacyTopic(state.currentTopicId);
  if (!db) {
    state.rawArguments = legacy ? DEFAULT_ARGUMENTS.map(normalizeArg) : [];
    rebuildArgumentsWithBasicProps();
    showNotice("firebase-config.js が未設定のため、ローカルの初期データのみで閲覧モード表示しています。");
    return;
  }
  try {
    const snap = await getDocs(argumentsCollection());
    if (snap.empty) {
      if (legacy) {
        state.rawArguments = DEFAULT_ARGUMENTS.map(normalizeArg);
        showNotice("データベースに命題が未登録です。左上のメニューから管理者ログイン後、「バックアップ / 復元」または「+ 新規命題を追加」から登録できます。");
      } else { state.rawArguments = []; showNotice(""); }
    } else {
      const rows = [];
      snap.forEach((d) => rows.push(normalizeArg({ coord: d.id, ...d.data() })));
      state.rawArguments = rows;
      showNotice("");
    }
    rebuildArgumentsWithBasicProps();
  } catch (err) {
    console.error(err);
    state.rawArguments = legacy ? DEFAULT_ARGUMENTS.map(normalizeArg) : [];
    rebuildArgumentsWithBasicProps();
    showNotice("データベースの読み込みに失敗しました。Firebaseの設定とルールを確認してください。");
  }
}
async function loadCommentCounts() {
  if (!db) { state.commentCounts = {}; return; }
  const tid = state.currentTopicId;
  try {
    const snap = await getDocs(commentsCollection(tid));
    const counts = {};
    snap.forEach((d) => {
      const c = String(d.data()?.coord ?? "").trim();
      if (c && c !== TOPIC_COMMENT_COORD) counts[c] = (counts[c] || 0) + 1;
    });
    if (state.currentTopicId === tid) state.commentCounts = counts;
  } catch (err) {
    console.error(err);
    if (state.currentTopicId === tid) state.commentCounts = {};
  }
}
async function loadTopicComments() {
  if (!db) { state.topicComments = []; state.topicCommentsLoading = false; renderTopicCommentsSection(); return; }
  const tid = state.currentTopicId;
  state.topicCommentsLoading = true;
  state.editingTopicCommentId = null;
  renderTopicCommentsSection();
  try {
    const snap = await getDocs(query(commentsCollection(tid), where("coord", "==", TOPIC_COMMENT_COORD)));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (state.currentTopicId === tid) state.topicComments = list;
  } catch (err) { console.error(err); if (state.currentTopicId === tid) state.topicComments = []; }
  finally { state.topicCommentsLoading = false; renderTopicCommentsSection(); }
}
async function loadCommentsForCoord(coord) {
  if (!db || !coord) { state.comments = []; state.commentsLoading = false; state.editingCommentId = null; renderComparePanel(); return; }
  const tid = state.currentTopicId;
  state.commentsLoading = true;
  state.editingCommentId = null;
  renderComparePanel();
  try {
    const snap = await getDocs(query(commentsCollection(tid), where("coord", "==", coord)));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (state.currentTopicId === tid && state.selectedCoord === coord) {
      state.comments = list;
      state.commentCounts[coord] = list.length;
    }
  } catch (err) { console.error(err); state.comments = []; }
  finally { state.commentsLoading = false; renderList(); renderComparePanel(); }
}
async function switchTopic(topicId, { scrollTop = true } = {}) {
  if (!findTopic(topicId)) return;
  state.currentTopicId = topicId;
  state.query = "";
  els.searchInput.value = "";
  state.comments = [];
  state.topicComments = [];
  state.commentCounts = {};
  state.editingCommentId = null;
  state.editingTopicCommentId = null;
  state.editingMemoKey = null;
  state.pcPanelOpen = false;
  state.selectedCoord = "";
  state.openSections.coordMemo = false;
  state.openSections.coordComments = false;
  state.openSections.topicMemo = false;
  state.openSections.topicComments = false;
  showSiteHeader();
  if (state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; applyDetailBodyClass(); }
  await Promise.all([loadStages(), loadArguments(), loadCommentCounts(), loadTopicComments()]);
  loadEvaluations();
  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  renderAll();
  if (els.comparePanel && !isMobileViewport()) els.comparePanel.scrollTop = 0;
  if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
}

// === 描画関数 ===
function getFilteredArguments() {
  const q = state.query.trim().toLowerCase();
  return state.arguments.filter((item) => {
    if (state.stage !== "all" && item.stage !== state.stage) return false;
    if (!q) return true;
    const bib = item.bibliography.map((b) => `${b.citation} ${b.note}`).join(" ");
    const memosText = getMemosFor(state.currentTopicId, item.coord).map((m) => m.body).join(" ");
    return [item.coord, `+${item.coord}`, `-${item.coord}`, item.topic, item.plusTitle, item.plusBody, item.minusTitle, item.minusBody, bib, memosText].join(" ").toLowerCase().includes(q);
  });
}
function populateStageSelect(selectedId) {
  if (state.stages.length === 0) { els.argStage.innerHTML = `<option value="">（先に「+ 水準を新規追加」してください）</option>`; return; }
  els.argStage.innerHTML = state.stages.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join("");
  els.argStage.value = selectedId && findStage(selectedId) ? String(selectedId) : state.stages[0].id;
}
function renderPageVisibility() {
  const isExplorer = state.page === "explorer", isGuide = state.page === "guide", isProfile = state.page === "profile";
  els.drawerNavButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.page === state.page));
  els.topTopicControls.hidden = !isExplorer;
  els.topPageLabel.hidden = isExplorer;
  if (isGuide) els.topPageLabel.textContent = "このサイトの使い方";
  else if (isProfile) els.topPageLabel.textContent = "管理者ページ";
  els.explorerHeaderPanel.hidden = !isExplorer;
  els.explorerView.hidden = !isExplorer;
  els.guideView.hidden = !isGuide;
  els.profileView.hidden = !isProfile;
  const t = getCurrentTopic();
  document.title = isGuide ? `使い方 | ${t.title}` : isProfile ? `管理者ページ | ${t.title}` : t.title;
}

function renderAdminCommentsSection() {
  const catMap = {
    bibliography: { text: "参考文献の修正提案", cls: "is-bibliography" },
    correction: { text: "命題・論証の修正提案", cls: "is-correction" },
    other: { text: "サイト全体へのご意見・その他", cls: "is-other" }
  };
  let bodyHtml = "";
  if (!db) bodyHtml = `<p class="empty-muted">Firebase を設定すると、管理者へのコメント機能が有効になります。</p>`;
  else if (state.adminCommentsLoading) bodyHtml = `<p class="empty-muted">コメントを読み込み中...</p>`;
  else if (state.adminComments.length === 0) bodyHtml = `<p class="empty-muted">管理者へのコメントはまだありません。</p>`;
  else {
    bodyHtml = `<ul class="comment-list">${state.adminComments.map((c) => {
      const cat = catMap[c.category] || catMap.other, owner = isCommentOwner(c), canDel = owner || state.isAdmin;
      if (owner && state.editingAdminCommentId === c.id) {
        return `<li class="comment-item"><form class="mini-form js-admin-comment-edit-form" data-id="${escapeHtml(c.id)}">
          <div class="form-grid-2">
            <input type="text" name="author" maxlength="40" value="${escapeHtml(c.author === "匿名" ? "" : c.author || "")}" placeholder="お名前（空欄で匿名）" />
            <select name="category">
              <option value="bibliography" ${c.category === "bibliography" ? "selected" : ""}>参考文献の修正提案</option>
              <option value="correction" ${c.category === "correction" ? "selected" : ""}>命題・論証の修正提案</option>
              <option value="other" ${c.category === "other" ? "selected" : ""}>サイト全体へのご意見・その他</option>
            </select>
          </div>
          <textarea name="body" rows="4" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
          <div class="comment-edit-actions">
            <button type="button" class="btn-secondary js-cancel-edit-admin-comment">キャンセル</button>
            <button type="submit" class="btn-primary">変更を保存</button>
          </div></form></li>`;
      }
      const shortcutsHtml = renderShortcutsHtml(c.body, { baseTopicId: null, selfCoord: null });
      return `<li class="comment-item"><div class="comment-meta"><div>
          <span class="admin-comment-cat ${cat.cls}">${escapeHtml(cat.text)}</span>
          <span class="comment-author">${escapeHtml(c.author || "匿名")}</span><span>・${escapeHtml(formatDate(c.createdAt))}</span>
          ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
        </div><div class="comment-actions">
          ${owner ? `<button type="button" class="btn-xs-edit js-edit-admin-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
          ${canDel ? `<button type="button" class="btn-xs-danger js-delete-admin-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
        </div></div>
        <p class="comment-body">${escapeHtml(c.body)}</p>
        ${shortcutsHtml}</li>`;
    }).join("")}</ul>`;
  }
  const formHtml = db ? `<form id="admin-comment-add-form" class="mini-form">
    <div class="form-grid-2">
      <input type="text" id="admin-comment-author" maxlength="40" placeholder="お名前（空欄で匿名）" />
      <select id="admin-comment-category">
        <option value="bibliography">参考文献の修正提案</option>
        <option value="correction">命題・論証の修正提案</option>
        <option value="other">サイト全体へのご意見・その他</option>
      </select>
    </div>
    <textarea id="admin-comment-body" rows="4" maxlength="1000" required placeholder="参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などをご記入ください（最大1000文字）"></textarea>
    <button type="submit" class="btn-primary">管理者へコメントを投稿</button>
  </form>` : "";
  return `<section class="doc-section panel-section" id="admin-comments-section">
    <h3 class="panel-section-title"><span>💬 管理者へのコメント（修正提案・サイト全体へのご意見）</span><span class="bib-count-pill">${state.adminComments.length}件</span></h3>
    <p class="admin-comments-lead">各座標の参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などがあればこちらからご連絡ください。投稿したコメントは、同じ端末・ブラウザから本人のみ編集・削除できます。本文に論題名や座標（例：<code>+1.10</code>）を書くとショートカットが自動で作成されます。</p>
    ${bodyHtml}${formHtml}
  </section>`;
}

function renderProfilePage() {
  const p = state.profile;
  const editBtn = state.isAdmin ? `<button type="button" class="admin-action-btn js-open-profile-edit">管理者情報を編集</button>` : "";
  const commentsHtml = renderAdminCommentsSection();

  els.profileContent.innerHTML = `
    <header class="doc-header">
      <div class="doc-header-row">
        <div>
          <h2>${escapeHtml(p.name || "管理者ページ")}</h2>
          ${p.role ? `<p class="profile-role">${escapeHtml(p.role)}</p>` : ""}
        </div>
        ${editBtn}
      </div>
    </header>
    ${commentsHtml}
    <div class="doc-footer-actions">
      <button type="button" class="btn-primary js-go-explorer">← 命題一覧へ戻る</button>
    </div>`;
}

function renderTopicMemoSection() {
  if (!els.topicMemoSection) return;
  const topic = getCurrentTopic();
  const memos = getMemosFor(topic.id, TOPIC_COMMENT_COORD);
  const isOpen = Boolean(state.openSections.topicMemo);
  const listHtml = memos.length === 0
    ? `<p class="empty-muted">この論題への自分用メモはまだありません。</p>`
    : renderMemoItemsListHtml(topic.id, TOPIC_COMMENT_COORD, memos);

  els.topicMemoSection.innerHTML = `
    <section class="panel-section" style="margin-top: 0; padding-top: 0; border-top: none;">
      ${renderCollapsibleHeader("topicMemo", "✎ この論題への自分用メモ（非公開）", memos.length)}
      <div class="section-collapsible-body" ${isOpen ? "" : "hidden"}>
        <p class="memo-section-lead">このメモはお使いのブラウザ内のみに保存され、他の閲覧者には見えません。本文に座標（例：<code>+1.10</code>）や他の論題名を書くとショートカットが自動で作成されます。</p>
        ${listHtml}
        <form class="mini-form js-memo-add-form" data-topic-id="${escapeHtml(topic.id)}" data-coord="${TOPIC_COMMENT_COORD}">
          <textarea name="body" rows="3" maxlength="2000" required placeholder="論題「${escapeHtml(topic.title)}」に関する自分用の覚え書きを記入（最大2000文字）"></textarea>
          <button type="submit" class="btn-primary">自分用メモを追加</button>
        </form>
      </div>
    </section>`;
}

function renderTopicCommentsSection() {
  if (!els.topicCommentsSection) return;
  const topic = getCurrentTopic();
  const isOpen = Boolean(state.openSections.topicComments);
  const stanceMap = {
    both: { text: "論題全体", cls: "is-both" },
    plus: { text: `${topic.plusLabel}へ`, cls: "is-plus" },
    minus: { text: `${topic.minusLabel}へ`, cls: "is-minus" }
  };
  let bodyHtml = "";
  if (!db) bodyHtml = `<p class="empty-muted">Firebase を設定すると、論題への公開コメント機能が有効になります。</p>`;
  else if (state.topicCommentsLoading) bodyHtml = `<p class="empty-muted">公開コメントを読み込み中...</p>`;
  else if (state.topicComments.length === 0) bodyHtml = `<p class="empty-muted">この論題全体への公開コメントはまだありません。</p>`;
  else {
    bodyHtml = `<ul class="comment-list">${state.topicComments.map((c) => {
      const st = stanceMap[c.stance] || stanceMap.both, owner = isCommentOwner(c), canDel = owner || state.isAdmin;
      if (owner && state.editingTopicCommentId === c.id) {
        return `<li class="comment-item"><form class="mini-form js-topic-comment-edit-form" data-id="${escapeHtml(c.id)}">
          <div class="form-grid-2">
            <input type="text" name="author" maxlength="40" value="${escapeHtml(c.author === "匿名" ? "" : c.author || "")}" placeholder="お名前（空欄で匿名）" />
            <select name="stance">
              <option value="both" ${c.stance === "both" ? "selected" : ""}>論題全体</option>
              <option value="plus" ${c.stance === "plus" ? "selected" : ""}>${escapeHtml(topic.plusLabel)}について</option>
              <option value="minus" ${c.stance === "minus" ? "selected" : ""}>${escapeHtml(topic.minusLabel)}について</option>
            </select>
          </div>
          <textarea name="body" rows="3" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
          <div class="comment-edit-actions"><button type="button" class="btn-secondary js-cancel-edit-topic-comment">キャンセル</button><button type="submit" class="btn-primary">変更を保存</button></div>
        </form></li>`;
      }
      const shortcutsHtml = renderShortcutsHtml(c.body, { baseTopicId: topic.id, selfCoord: TOPIC_COMMENT_COORD });
      return `<li class="comment-item"><div class="comment-meta"><div>
          <span class="comment-stance ${st.cls}">${escapeHtml(st.text)}</span><span class="comment-author">${escapeHtml(c.author || "匿名")}</span><span>・${escapeHtml(formatDate(c.createdAt))}</span>
          ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
        </div><div class="comment-actions">
          ${owner ? `<button type="button" class="btn-xs-edit js-edit-topic-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
          ${canDel ? `<button type="button" class="btn-xs-danger js-delete-topic-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
        </div></div><p class="comment-body">${escapeHtml(c.body)}</p>${shortcutsHtml}</li>`;
    }).join("")}</ul>`;
  }
  const formHtml = db ? `<form id="topic-comment-add-form" class="mini-form">
    <div class="form-grid-2">
      <input type="text" id="topic-comment-author" maxlength="40" placeholder="お名前（空欄で匿名）" />
      <select id="topic-comment-stance">
        <option value="both">論題全体への公開コメント</option>
        <option value="plus">${escapeHtml(topic.plusLabel)}についての公開コメント</option>
        <option value="minus">${escapeHtml(topic.minusLabel)}についての公開コメント</option>
      </select>
    </div>
    <textarea id="topic-comment-body" rows="3" maxlength="1000" required placeholder="この論題全体に対する補足・疑問・感想などを記入（最大1000文字）"></textarea>
    <button type="submit" class="btn-primary">論題へ公開コメントを投稿</button>
  </form>` : "";

  els.topicCommentsSection.innerHTML = `
    <section class="panel-section" style="margin-top: 0; padding-top: 0; border-top: none;">
      ${renderCollapsibleHeader("topicComments", "💬 この論題全体への公開コメント", state.topicComments.length)}
      <div class="section-collapsible-body" ${isOpen ? "" : "hidden"}>
        <p class="memo-section-lead">投稿した公開コメントは、同じ端末・ブラウザから本人のみ編集・削除できます。本文に座標（例：<code>+1.10</code>）や他の論題名を書くとショートカットが自動で作成されます。</p>
        ${bodyHtml}
        ${formHtml}
      </div>
    </section>`;
}

function renderTopicBar() {
  const topic = getCurrentTopic();
  els.topicSelect.innerHTML = state.topics.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join("");
  els.topicSelect.value = topic.id;
}
function renderAdminBar() {
  els.adminBadge.hidden = !state.isAdmin;
  els.drawerAdminStatus.hidden = !state.isAdmin;
  els.explorerAdminBar.hidden = !state.isAdmin;
  els.editTopicBtn.hidden = !state.isAdmin;
  els.addTopicBtn.hidden = !state.isAdmin;
  els.addStageBtn.hidden = !state.isAdmin;
  els.addArgBtn.hidden = !state.isAdmin;
  els.backupOpenBtn.hidden = !state.isAdmin;
  els.logoutBtn.hidden = !state.isAdmin;
  els.loginOpenBtn.hidden = state.isAdmin || !isFirebaseConfigured;
}
function renderTabs() {
  const defs = [{ id: "all", label: `全${state.arguments.length}命題` }, ...state.stages.map((s) => ({ id: s.id, label: s.label }))];
  els.stageTabs.innerHTML = defs.map((t) => `<button type="button" class="tab-btn ${state.stage === t.id ? "is-active" : ""}" data-stage="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`).join("");
}
function renderModeButtons() {
  const topic = getCurrentTopic();
  els.modeButtons.forEach((btn) => {
    const m = btn.dataset.mode;
    if (m === "plus") btn.textContent = `+ ${topic.plusLabel}`;
    if (m === "minus") btn.textContent = `- ${topic.minusLabel}`;
    if (m === "split") btn.textContent = "⇄ 比較";
    if (m === "mine") btn.textContent = "☆ 自説";
    if (m === "memo") btn.textContent = "✎ メモ";
    btn.classList.toggle("is-active", m === state.mode);
  });
}
function renderStageBanner() {
  if (!state.isAdmin || state.stage === "all") {
    els.stageBanner.hidden = true;
    els.stageBanner.innerHTML = "";
    return;
  }
  const info = findStage(state.stage);
  if (!info) {
    els.stageBanner.hidden = true;
    els.stageBanner.innerHTML = "";
    return;
  }
  els.stageBanner.hidden = false;
  els.stageBanner.innerHTML = `<div style="display:flex;justify-content:flex-end;"><button type="button" class="admin-action-btn is-secondary js-edit-stage" data-stage-id="${escapeHtml(info.id)}">水準 ${escapeHtml(info.id)} のタブ・基本設定を編集</button></div>`;
}
function renderRefChips(refs, label) {
  if (!refs || refs.length === 0) return "";
  return `<div class="ref-row"><span>${escapeHtml(label)}:</span>${refs.map((c) => `<button type="button" class="ref-chip js-ref-btn" data-ref="${escapeHtml(c)}">±${escapeHtml(c)}</button>`).join("")}</div>`;
}

function renderMemoCardToggleHtml(topicId, coord, count, isOpen) {
  const cardKey = makeMemoCardKey(topicId, coord);
  return `<button type="button" class="bib-count-pill memo-card-toggle-btn js-toggle-memo-card" data-memo-card-key="${escapeHtml(cardKey)}" aria-expanded="${isOpen ? "true" : "false"}" title="${isOpen ? "メモをたたむ" : "メモを開く"}">
    <span>✎ ${count}件</span>
    <span class="section-toggle-chevron" aria-hidden="true">▾</span>
  </button>`;
}

function renderMemoModeList() {
  const topic = getCurrentTopic();
  const q = state.query.trim().toLowerCase();
  const hasQuery = Boolean(q);
  const matchesQuery = (texts) => !q || texts.join(" ").toLowerCase().includes(q);
  const showSelected = isMobileViewport() || state.pcPanelOpen;
  let html = "";

  // 1. 現在の論題へのメモ（書き込まれている場合のみ表示）
  const topicMemos = getMemosFor(topic.id, TOPIC_COMMENT_COORD).filter((m) => matchesQuery([topic.title, m.body]));
  if (topicMemos.length > 0) {
    const isOpen = isMemoCardOpen(topic.id, TOPIC_COMMENT_COORD, { hasQuery });
    html += `<div class="topic-group"><h3 class="topic-heading">論題への自分用メモ</h3>
      <article class="memo-card js-memo-card" data-topic-id="${escapeHtml(topic.id)}" data-coord="">
        <div class="memo-target-head ${isOpen ? "" : "is-collapsed"}">
          <div class="memo-target-kicker">
            <span class="memo-private-badge">論題メモ</span>
            ${renderMemoCardToggleHtml(topic.id, TOPIC_COMMENT_COORD, topicMemos.length, isOpen)}
          </div>
          <h4 class="memo-target-title">${escapeHtml(topic.title)}</h4>
        </div>
        <div class="memo-card-body" ${isOpen ? "" : "hidden"}>
          ${renderMemoItemsListHtml(topic.id, TOPIC_COMMENT_COORD, topicMemos)}
        </div>
      </article>
    </div>`;
  }

  // 2. 現在の論題の命題メモ（書き込まれているもののみ表示）
  const currentBucket = state.memos[topic.id] || {};
  const coordEntries = Object.keys(currentBucket)
    .filter((c) => c !== TOPIC_COMMENT_COORD && Array.isArray(currentBucket[c]) && currentBucket[c].length > 0)
    .sort(compareNatural);

  const visibleCoordCards = [];
  for (const coord of coordEntries) {
    const item = findArg(coord);
    const memos = currentBucket[coord];
    const stageId = item ? item.stage : (memos[0]?.stage || coord.split(".")[0] || "");
    if (state.stage !== "all" && stageId !== state.stage) continue;

    const argTopic = item ? item.topic : (memos[0]?.argTopic || "");
    const plusTitle = item ? item.plusTitle : (memos[0]?.plusTitle || "");
    const minusTitle = item ? item.minusTitle : (memos[0]?.minusTitle || "");
    const filteredMemos = memos.filter((m) => matchesQuery([coord, `+${coord}`, `-${coord}`, argTopic, plusTitle, minusTitle, m.body]));
    if (filteredMemos.length === 0) continue;

    const sel = showSelected && coord === state.selectedCoord ? "is-selected" : "";
    const isOpen = isMemoCardOpen(topic.id, coord, { hasQuery });
    const propHeadingsHtml = (plusTitle || minusTitle) ? `<div class="memo-prop-headings">
      ${plusTitle ? `<div class="memo-prop-heading-line"><span class="memo-prop-sign is-plus">+${escapeHtml(coord)}</span><span>${escapeHtml(plusTitle)}</span></div>` : ""}
      ${minusTitle ? `<div class="memo-prop-heading-line"><span class="memo-prop-sign is-minus">-${escapeHtml(coord)}</span><span>${escapeHtml(minusTitle)}</span></div>` : ""}
    </div>` : "";

    visibleCoordCards.push(`<article class="memo-card js-memo-card ${sel}" data-topic-id="${escapeHtml(topic.id)}" data-coord="${escapeHtml(coord)}">
      <div class="memo-target-head ${isOpen ? "" : "is-collapsed"}">
        <div class="memo-target-kicker">
          <span class="coord-badge is-neutral">座標 ${escapeHtml(coord)}</span>
          ${renderMemoCardToggleHtml(topic.id, coord, filteredMemos.length, isOpen)}
        </div>
        <h4 class="memo-target-title">${escapeHtml(argTopic || `座標 ${coord}`)}</h4>
        ${propHeadingsHtml}
      </div>
      <div class="memo-card-body" ${isOpen ? "" : "hidden"}>
        ${renderMemoItemsListHtml(topic.id, coord, filteredMemos)}
      </div>
    </article>`);
  }

  if (visibleCoordCards.length > 0) {
    html += `<div class="topic-group"><h3 class="topic-heading">この論題の命題メモ${state.stage !== "all" ? `（水準 ${escapeHtml(state.stage)}）` : ""}</h3>${visibleCoordCards.join("")}</div>`;
  }

  // 3. 他の論題のメモ（存在する場合のみ表示）
  const otherTopicIds = Object.keys(state.memos).filter((tid) => tid !== topic.id);
  const otherCards = [];
  for (const tid of otherTopicIds) {
    const bucket = state.memos[tid];
    if (!bucket || typeof bucket !== "object") continue;
    const tObj = findTopic(tid);
    const tTitle = tObj ? tObj.title : (Object.values(bucket).flat()[0]?.topicTitle || tid);
    const keys = Object.keys(bucket).filter((k) => Array.isArray(bucket[k]) && bucket[k].length > 0);
    keys.sort((a, b) => (a === TOPIC_COMMENT_COORD ? -1 : b === TOPIC_COMMENT_COORD ? 1 : compareNatural(a, b)));

    for (const k of keys) {
      const memos = bucket[k];
      const isTopicMemo = k === TOPIC_COMMENT_COORD;
      const argTopic = !isTopicMemo ? (memos[0]?.argTopic || "") : "";
      const plusTitle = !isTopicMemo ? (memos[0]?.plusTitle || "") : "";
      const minusTitle = !isTopicMemo ? (memos[0]?.minusTitle || "") : "";
      const filteredMemos = memos.filter((m) => matchesQuery([tTitle, tid, isTopicMemo ? "" : k, argTopic, plusTitle, minusTitle, m.body]));
      if (filteredMemos.length === 0) continue;

      const isOpen = isMemoCardOpen(tid, k, { hasQuery });
      const headingText = isTopicMemo ? tTitle : `${tTitle} / ${argTopic || `座標 ${k}`}`;
      const propHeadingsHtml = (!isTopicMemo && (plusTitle || minusTitle)) ? `<div class="memo-prop-headings">
        ${plusTitle ? `<div class="memo-prop-heading-line"><span class="memo-prop-sign is-plus">+${escapeHtml(k)}</span><span>${escapeHtml(plusTitle)}</span></div>` : ""}
        ${minusTitle ? `<div class="memo-prop-heading-line"><span class="memo-prop-sign is-minus">-${escapeHtml(k)}</span><span>${escapeHtml(minusTitle)}</span></div>` : ""}
      </div>` : "";

      otherCards.push(`<article class="memo-card js-memo-card" data-topic-id="${escapeHtml(tid)}" data-coord="${isTopicMemo ? "" : escapeHtml(k)}">
        <div class="memo-target-head ${isOpen ? "" : "is-collapsed"}">
          <div class="memo-target-kicker">
            <span class="memo-private-badge">${isTopicMemo ? "他論題メモ" : `他論題・座標 ${escapeHtml(k)}`}</span>
            ${renderMemoCardToggleHtml(tid, k, filteredMemos.length, isOpen)}
          </div>
          <h4 class="memo-target-title">${escapeHtml(headingText)}</h4>
          ${propHeadingsHtml}
        </div>
        <div class="memo-card-body" ${isOpen ? "" : "hidden"}>
          ${renderMemoItemsListHtml(tid, k, filteredMemos)}
        </div>
      </article>`);
    }
  }

  if (otherCards.length > 0) {
    html += `<div class="topic-group"><h3 class="topic-heading">他の論題の自分用メモ</h3>${otherCards.join("")}</div>`;
  }

  if (!html) {
    const emptyMsg = q
      ? "検索条件に一致する自分用メモがありません。"
      : "この範囲の自分用メモはまだありません。各命題の詳細パネルやページ下部の「自分用メモ」から作成できます。";
    html = `<div class="empty-state">${emptyMsg}</div>`;
  }

  els.argList.innerHTML = html;
}

function renderList() {
  if (state.mode === "memo") {
    renderMemoModeList();
    return;
  }

  const filtered = getFilteredArguments();
  if (filtered.length === 0) {
    let hint = "条件に一致する命題がありません。";
    if (!state.query) {
      if (state.stages.length === 0) {
        hint = state.isAdmin ? "この論題にはまだ水準がありません。上部の「+ 水準を追加」から最初の水準（例：1）を作成してください。" : "この論題にはまだ命題が登録されていません。";
      } else {
        hint = state.isAdmin ? "この水準にはまだ命題がありません。上部の「+ 新規命題を追加」から追加できます。" : "この水準にはまだ命題が登録されていません。";
      }
    }
    els.argList.innerHTML = `<div class="empty-state">${hint}</div>`;
    return;
  }

  const groups = new Map();
  for (const item of filtered) {
    const key = item.topic || `水準 ${item.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const showSelected = isMobileViewport() || state.pcPanelOpen;
  let html = "";
  for (const [heading, items] of groups.entries()) {
    html += `<div class="topic-group"><h3 class="topic-heading">${escapeHtml(heading)}</h3>`;
    for (const item of items) {
      const sel = showSelected && item.coord === state.selectedCoord ? "is-selected" : "";
      const bib = item.bibliography.length ? `<span role="button" tabindex="0" class="bib-count-pill js-jump-section js-count-pill" data-coord="${escapeHtml(item.coord)}" data-section="bib" title="参考文献 ${item.bibliography.length}件へ移動"><span class="pill-icon" aria-hidden="true">${BIB_ICON}</span><span>${item.bibliography.length}</span></span>` : "";
      const commentCount = state.commentCounts[item.coord] || 0;
      const commentPill = commentCount > 0 ? `<span role="button" tabindex="0" class="bib-count-pill js-jump-section js-count-pill" data-coord="${escapeHtml(item.coord)}" data-section="comments" title="公開コメント ${commentCount}件へ移動"><span class="pill-icon" aria-hidden="true">💬</span><span>${commentCount}</span></span>` : "";
      const memoCount = getMemosFor(state.currentTopicId, item.coord).length;
      const memoPill = memoCount > 0 ? `<span role="button" tabindex="0" class="bib-count-pill js-jump-section js-count-pill" data-coord="${escapeHtml(item.coord)}" data-section="memo" title="自分用メモ ${memoCount}件へ移動"><span class="pill-icon" aria-hidden="true">✎</span><span>${memoCount}</span></span>` : "";
      const refsHtml = renderRefChips(item.refs, "前提命題");
      const evalHtml = renderEvalControl(item.coord);
      const ev = getEvaluation(item.coord);

      if (state.mode === "split" || (state.mode === "mine" && ev === "hold")) {
        html += `<article class="arg-card is-split ${sel}" data-coord="${escapeHtml(item.coord)}">
          <div class="card-header"><div class="card-title-wrap"><span class="coord-badge is-neutral">座標 ${escapeHtml(item.coord)}</span>${bib}${commentPill}${memoPill}</div></div>
          <div class="split-grid">
            <div class="split-col is-plus"><span class="coord-badge is-plus">+${escapeHtml(item.coord)}</span><div class="split-col-title">${escapeHtml(item.plusTitle)}</div><div>${escapeHtml(item.plusBody)}</div></div>
            <div class="split-col is-minus"><span class="coord-badge is-minus">-${escapeHtml(item.coord)}</span><div class="split-col-title">${escapeHtml(item.minusTitle)}</div><div>${escapeHtml(item.minusBody)}</div></div>
          </div>${refsHtml}${evalHtml}</article>`;
      } else {
        const isPlus = state.mode === "mine" ? ev === "plus" : state.mode === "plus";
        const sign = isPlus ? "+" : "-", oppSign = isPlus ? "-" : "+", oppMode = isPlus ? "minus" : "plus";
        const title = isPlus ? item.plusTitle : item.minusTitle, body = isPlus ? item.plusBody : item.minusBody;
        html += `<article class="arg-card ${isPlus ? "is-plus" : "is-minus"} ${sel}" data-coord="${escapeHtml(item.coord)}">
          <div class="card-header"><div class="card-title-wrap"><span class="coord-badge ${isPlus ? "is-plus" : "is-minus"}">${sign}${escapeHtml(item.coord)}</span><h4 class="card-title">${escapeHtml(title)}</h4>${bib}${commentPill}${memoPill}</div>
          <button type="button" class="flip-btn js-flip-btn" data-coord="${escapeHtml(item.coord)}" data-target-mode="${oppMode}">⇄ ${oppSign}${escapeHtml(item.coord)} へ反転</button></div>
          <p class="card-body">${escapeHtml(body)}</p>${refsHtml}${evalHtml}</article>`;
      }
    }
    html += `</div>`;
  }
  els.argList.innerHTML = html;
}

function renderBibliographySection(item) {
  const listHtml = item.bibliography.length === 0
    ? `<p class="empty-muted">この座標に登録された参考文献はまだありません。</p>`
    : `<ul class="bib-list">${item.bibliography.map((b, i) => {
        const href = safeUrl(b.url);
        return `<li class="bib-item"><div class="bib-item-head"><span class="bib-citation">${escapeHtml(b.citation)}</span>
          ${state.isAdmin ? `<button type="button" class="btn-xs-danger js-delete-bib" data-index="${i}">削除</button>` : ""}</div>
          ${b.note ? `<p class="bib-note">${escapeHtml(b.note)}</p>` : ""}
          ${href ? `<a class="bib-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>` : ""}</li>`;
      }).join("")}</ul>`;
  const formHtml = state.isAdmin ? `<form id="bib-add-form" class="mini-form">
    <input type="text" id="bib-citation" required placeholder="書誌情報（例：著者名『書名』出版年）" />
    <input type="url" id="bib-url" placeholder="参照URL（任意・https://...）" />
    <input type="text" id="bib-note" placeholder="関連箇所・メモ（任意）" />
    <button type="submit" class="btn-primary">参考文献を追加</button></form>` : "";
  return `<section class="panel-section" id="detail-bib-section"><h3 class="panel-section-title"><span>${BIB_ICON} 参考文献</span><span class="bib-count-pill">${item.bibliography.length}件</span></h3>${listHtml}${formHtml}</section>`;
}

function renderCoordMemoSection(item) {
  const topicId = state.currentTopicId;
  const memos = getMemosFor(topicId, item.coord);
  const isOpen = Boolean(state.openSections.coordMemo);
  const listHtml = memos.length === 0
    ? `<p class="empty-muted">この座標への自分用メモはまだありません。</p>`
    : renderMemoItemsListHtml(topicId, item.coord, memos);

  return `<section class="panel-section" id="detail-memo-section">
    ${renderCollapsibleHeader("coordMemo", "✎ 自分用メモ（非公開）", memos.length)}
    <div class="section-collapsible-body" ${isOpen ? "" : "hidden"}>
      <p class="memo-section-lead">この端末・ブラウザのみに保存されます。本文に座標（例：<code>+1.10</code>）や他の論題名を書くとショートカットが自動で作成されます。</p>
      ${listHtml}
      <form class="mini-form js-memo-add-form" data-topic-id="${escapeHtml(topicId)}" data-coord="${escapeHtml(item.coord)}">
        <textarea name="body" rows="3" maxlength="2000" required placeholder="座標 ${escapeHtml(item.coord)} に関する自分用メモを記入（最大2000文字）"></textarea>
        <button type="submit" class="btn-primary">自分用メモを追加</button>
      </form>
    </div>
  </section>`;
}

function renderCommentsSection(item) {
  const topic = getCurrentTopic();
  const isOpen = Boolean(state.openSections.coordComments);
  const stanceMap = { both: { text: "座標全体", cls: "is-both" }, plus: { text: `+${item.coord} へ`, cls: "is-plus" }, minus: { text: `-${item.coord} へ`, cls: "is-minus" } };
  let bodyHtml = "";
  if (!db) bodyHtml = `<p class="empty-muted">Firebase を設定すると、公開コメント機能が有効になります。</p>`;
  else if (state.commentsLoading) bodyHtml = `<p class="empty-muted">公開コメントを読み込み中...</p>`;
  else if (state.comments.length === 0) bodyHtml = `<p class="empty-muted">この座標への公開コメントはまだありません。</p>`;
  else {
    bodyHtml = `<ul class="comment-list">${state.comments.map((c) => {
      const st = stanceMap[c.stance] || stanceMap.both, owner = isCommentOwner(c), canDel = owner || state.isAdmin;
      if (owner && state.editingCommentId === c.id) {
        return `<li class="comment-item"><form class="mini-form js-comment-edit-form" data-id="${escapeHtml(c.id)}">
          <div class="form-grid-2">
            <input type="text" name="author" maxlength="40" value="${escapeHtml(c.author === "匿名" ? "" : c.author || "")}" placeholder="お名前（空欄で匿名）" />
            <select name="stance">
              <option value="both" ${c.stance === "both" ? "selected" : ""}>座標 ${escapeHtml(item.coord)} 全体</option>
              <option value="plus" ${c.stance === "plus" ? "selected" : ""}>+${escapeHtml(item.coord)}（${escapeHtml(topic.plusLabel)}）</option>
              <option value="minus" ${c.stance === "minus" ? "selected" : ""}>-${escapeHtml(item.coord)}（${escapeHtml(topic.minusLabel)}）</option>
            </select>
          </div>
          <textarea name="body" rows="3" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
          <div class="comment-edit-actions"><button type="button" class="btn-secondary js-cancel-edit-comment">キャンセル</button><button type="submit" class="btn-primary">変更を保存</button></div>
        </form></li>`;
      }
      const shortcutsHtml = renderShortcutsHtml(c.body, { baseTopicId: topic.id, selfCoord: item.coord });
      return `<li class="comment-item"><div class="comment-meta"><div>
          <span class="comment-stance ${st.cls}">${escapeHtml(st.text)}</span><span class="comment-author">${escapeHtml(c.author || "匿名")}</span><span>・${escapeHtml(formatDate(c.createdAt))}</span>
          ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
        </div><div class="comment-actions">
          ${owner ? `<button type="button" class="btn-xs-edit js-edit-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
          ${canDel ? `<button type="button" class="btn-xs-danger js-delete-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
        </div></div><p class="comment-body">${escapeHtml(c.body)}</p>${shortcutsHtml}</li>`;
    }).join("")}</ul>`;
  }
  const formHtml = db ? `<form id="comment-add-form" class="mini-form">
    <div class="form-grid-2">
      <input type="text" id="comment-author" maxlength="40" placeholder="お名前（空欄で匿名）" />
      <select id="comment-stance">
        <option value="both">座標 ${escapeHtml(item.coord)} 全体への公開コメント</option>
        <option value="plus">+${escapeHtml(item.coord)}（${escapeHtml(topic.plusLabel)}）への公開コメント</option>
        <option value="minus">-${escapeHtml(item.coord)}（${escapeHtml(topic.minusLabel)}）への公開コメント</option>
      </select>
    </div>
    <textarea id="comment-body" rows="3" maxlength="1000" required placeholder="この命題に対する補足・反論・疑問などを記入（最大1000文字）"></textarea>
    <button type="submit" class="btn-primary">公開コメントを投稿</button>
  </form>` : "";
  return `<section class="panel-section" id="detail-comments-section">
    ${renderCollapsibleHeader("coordComments", "💬 公開コメント", state.comments.length)}
    <div class="section-collapsible-body" ${isOpen ? "" : "hidden"}>
      <p class="memo-section-lead">投稿した公開コメントは、同じ端末・ブラウザから本人のみ編集・削除できます。本文に座標（例：<code>+1.10</code>）や他の論題名を書くとショートカットが自動で作成されます。</p>
      ${bodyHtml}
      ${formHtml}
    </div>
  </section>`;
}

function renderComparePanel() {
  const item = findArg(state.selectedCoord) || state.arguments[0];
  if (!item) { els.comparePanel.innerHTML = `<p class="empty-muted">この論題にはまだ表示する命題がありません。</p>`; return; }
  const backRefs = referencedByMap.get(item.coord) || [];
  const list = getFilteredArguments();
  const idx = list.findIndex((a) => a.coord === item.coord);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  els.comparePanel.innerHTML = `
    <div class="detail-topbar">
      <div class="detail-topbar-left">
        <button type="button" class="detail-back-btn js-close-detail">← 一覧</button>
      </div>
      <div class="detail-topbar-right">
        ${state.isAdmin ? `<button type="button" class="admin-action-btn js-edit-arg" data-coord="${escapeHtml(item.coord)}">編集</button>` : ""}
      </div>
    </div>
    <div class="detail-body">
      <div class="compare-head">
        <h2>${escapeHtml(item.coord)}</h2>
        <div class="compare-head-actions">
          <button type="button" class="flip-btn js-expand-detail" data-coord="${escapeHtml(item.coord)}">⤢ 拡大</button>
          ${state.isAdmin ? `<button type="button" class="admin-action-btn js-edit-arg" data-coord="${escapeHtml(item.coord)}">編集</button>` : ""}
        </div>
      </div>
      <div class="compare-topic">${escapeHtml(item.topic)}</div>
      ${renderEvalControl(item.coord, { isPanel: true })}
      <div class="compare-box is-plus">
        <div class="compare-box-head"><span class="coord-badge is-plus">+${escapeHtml(item.coord)}</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">一覧で表示</button></div>
        <h3>${escapeHtml(item.plusTitle)}</h3><p>${escapeHtml(item.plusBody)}</p>
      </div>
      <div class="compare-box is-minus">
        <div class="compare-box-head"><span class="coord-badge is-minus">-${escapeHtml(item.coord)}</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">一覧で表示</button></div>
        <h3>${escapeHtml(item.minusTitle)}</h3><p>${escapeHtml(item.minusBody)}</p>
      </div>
      ${renderRefChips(item.refs, "この命題が参照する前提")}
      ${renderRefChips(backRefs, "この命題を参照している命題")}
      ${renderBibliographySection(item)}
      ${renderCoordMemoSection(item)}
      ${renderCommentsSection(item)}
      <div class="detail-pager">
        <button type="button" class="pager-btn js-pager-nav" data-coord="${prev ? escapeHtml(prev.coord) : ""}" ${prev ? "" : "disabled"}>${prev ? `← 前の座標 (${escapeHtml(prev.coord)})` : "← 前の座標なし"}</button>
        <button type="button" class="pager-btn js-pager-nav" data-coord="${next ? escapeHtml(next.coord) : ""}" ${next ? "" : "disabled"}>${next ? `次の座標 (${escapeHtml(next.coord)}) →` : "次の座標なし →"}</button>
      </div>
    </div>`;
}

function renderAll() {
  applyDetailBodyClass();
  renderPageVisibility();
  renderTopicBar();
  renderAdminBar();
  renderTabs();
  renderModeButtons();
  renderStageBanner();
  renderList();
  renderComparePanel();
  renderTopicMemoSection();
  renderTopicCommentsSection();
  renderProfilePage();
  syncUrlHash();
  requestAnimationFrame(syncComparePanelStickyTop);
}

function selectCoord(coord, { reloadComments = true, scrollPanelTop = true } = {}) {
  const changed = state.selectedCoord !== coord;
  const wasClosed = !state.pcPanelOpen;
  state.selectedCoord = coord;
  state.pcPanelOpen = true;
  if (changed) {
    state.editingCommentId = null;
    state.editingMemoKey = null;
    state.openSections.coordMemo = false;
    state.openSections.coordComments = false;
  }
  applyDetailBodyClass();
  renderList();
  renderComparePanel();
  if (scrollPanelTop && els.comparePanel && !isMobileViewport() && !state.detailOpen) {
    els.comparePanel.scrollTop = 0;
  }
  if (wasClosed) requestAnimationFrame(syncComparePanelStickyTop);
  syncUrlHash();
  if (reloadComments && changed) loadCommentsForCoord(coord);
}
function jumpTo(coord, targetMode, { closeDetail = false } = {}) {
  const item = findArg(coord);
  if (!item) return;
  if (state.stage !== "all" && item.stage !== state.stage) state.stage = item.stage;
  if (targetMode) state.mode = targetMode;
  if (state.query) { state.query = ""; els.searchInput.value = ""; }
  if (closeDetail && state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; applyDetailBodyClass(); }
  const changed = state.selectedCoord !== coord;
  state.selectedCoord = coord;
  state.pcPanelOpen = true;
  if (changed) {
    state.editingCommentId = null;
    state.editingMemoKey = null;
    state.openSections.coordMemo = false;
    state.openSections.coordComments = false;
  }
  renderAll();
  if (state.detailOpen) window.scrollTo({ top: 0, behavior: "smooth" });
  else {
    if (els.comparePanel && !isMobileViewport()) els.comparePanel.scrollTop = 0;
    focusCard(coord);
  }
  if (changed) loadCommentsForCoord(coord);
}

// === 管理者モーダル ===
function openProfileDialog() {
  const p = state.profile;
  els.profileError.hidden = true;
  els.profileName.value = p.name;
  els.profileRole.value = p.role;
  els.profileDialog.showModal();
}
function openTopicDialog(topicId = null) {
  els.topicError.hidden = true;
  state.editingTopicId = topicId;
  if (topicId) {
    const info = findTopic(topicId);
    if (!info) return;
    els.topicDialogTitle.textContent = "現在の論題を編集";
    els.topicId.value = info.id; els.topicId.readOnly = true;
    els.topicTitle.value = info.title; els.topicPlusLabel.value = info.plusLabel; els.topicMinusLabel.value = info.minusLabel;
    els.topicDeleteBtn.hidden = false;
  } else {
    els.topicDialogTitle.textContent = "新しい論題を追加";
    els.topicForm.reset(); els.topicId.readOnly = false;
    els.topicPlusLabel.value = "肯定側"; els.topicMinusLabel.value = "反論側";
    els.topicDeleteBtn.hidden = true;
  }
  els.topicDialog.showModal();
}
function openArgDialog(coord = null) {
  const topic = getCurrentTopic();
  els.argError.hidden = true;
  els.argPlusHeading.textContent = `${topic.plusLabel} (+)`;
  els.argMinusHeading.textContent = `${topic.minusLabel} (-)`;
  state.editingCoord = coord;
  if (coord) {
    const item = findArg(coord);
    if (!item) return;
    populateStageSelect(item.stage);
    els.argDialogTitle.textContent = `座標 ${coord} の命題を編集`;
    els.argCoord.value = item.coord; els.argCoord.readOnly = true;
    els.argTopic.value = item.topic;
    els.argPlusTitle.value = item.plusTitle; els.argPlusBody.value = item.plusBody;
    els.argMinusTitle.value = item.minusTitle; els.argMinusBody.value = item.minusBody;
    els.argRefs.value = item.refs.join(", ");
    els.argDeleteBtn.hidden = Boolean(item.isAutoBasic);
  } else {
    els.argDialogTitle.textContent = "新しい座標の命題を追加";
    els.argForm.reset();
    populateStageSelect(state.stage === "all" ? state.stages[0]?.id || "" : state.stage);
    els.argCoord.readOnly = false;
    els.argDeleteBtn.hidden = true;
  }
  els.argDialog.showModal();
}
function openStageDialog(stageId = null) {
  const topic = getCurrentTopic();
  els.stageError.hidden = true;
  els.stagePlusLabelText.textContent = `${topic.plusLabel}の基本命題 (+N.00)`;
  els.stageMinusLabelText.textContent = `${topic.minusLabel}の基本命題 (-N.00)`;
  state.editingStageId = stageId;
  if (stageId) {
    const info = findStage(stageId);
    if (!info) return;
    els.stageDialogTitle.textContent = `水準 ${stageId} を編集`;
    els.stageId.value = info.id; els.stageId.readOnly = true;
    els.stageLabel.value = info.label;
    els.stagePlus.value = formatBasicProp(info.plus);
    els.stageMinus.value = formatBasicProp(info.minus);
    els.stageDeleteBtn.hidden = false;
  } else {
    const nums = state.stages.map((s) => Number(s.id)).filter((n) => Number.isInteger(n) && n >= 0);
    const nextId = nums.length ? String(Math.max(...nums) + 1) : "1";
    els.stageDialogTitle.textContent = "新しい水準を追加";
    els.stageForm.reset(); els.stageId.readOnly = false; els.stageId.value = nextId;
    els.stageLabel.placeholder = `${nextId}. 新しい水準の名称`;
    els.stagePlus.placeholder = `(+${nextId}.00) ${topic.plusLabel}の基本命題を記入`;
    els.stageMinus.placeholder = `(-${nextId}.00) ${topic.minusLabel}の基本命題を記入`;
    els.stageDeleteBtn.hidden = true;
  }
  els.stageDialog.showModal();
}

// === ショートカット・自分用メモ共通イベントハンドラ ===
function handleShortcutClick(e) {
  const jumpBtn = e.target.closest(".js-jump-shortcut");
  if (jumpBtn) {
    e.stopPropagation();
    jumpToShortcutTarget(jumpBtn.dataset.topicId, jumpBtn.dataset.coord, jumpBtn.dataset.mode);
    return true;
  }
  return false;
}

function handleMemoClick(e) {
  if (handleShortcutClick(e)) return true;
  const editBtn = e.target.closest(".js-edit-memo");
  if (editBtn) {
    e.stopPropagation();
    state.editingMemoKey = makeMemoEditKey(editBtn.dataset.topicId, editBtn.dataset.coord, editBtn.dataset.id);
    renderList();
    renderComparePanel();
    renderTopicMemoSection();
    requestAnimationFrame(syncComparePanelStickyTop);
    return true;
  }
  if (e.target.closest(".js-cancel-edit-memo")) {
    e.stopPropagation();
    state.editingMemoKey = null;
    renderList();
    renderComparePanel();
    renderTopicMemoSection();
    requestAnimationFrame(syncComparePanelStickyTop);
    return true;
  }
  const delBtn = e.target.closest(".js-delete-memo");
  if (delBtn) {
    e.stopPropagation();
    if (!confirm("この自分用メモを削除しますか？")) return;
    const key = makeMemoEditKey(delBtn.dataset.topicId, delBtn.dataset.coord, delBtn.dataset.id);
    if (state.editingMemoKey === key) state.editingMemoKey = null;
    deletePrivateMemo(delBtn.dataset.topicId, delBtn.dataset.coord, delBtn.dataset.id);
    renderList();
    renderComparePanel();
    renderTopicMemoSection();
    requestAnimationFrame(syncComparePanelStickyTop);
    return true;
  }
  return false;
}

function handleMemoSubmit(e) {
  if (e.target.classList.contains("js-memo-add-form")) {
    e.preventDefault();
    const { topicId, coord } = e.target.dataset;
    const bodyEl = e.target.elements.body;
    const body = bodyEl.value.trim();
    if (!body) return;
    addPrivateMemo(topicId, coord, body);
    bodyEl.value = "";
    renderList();
    renderComparePanel();
    renderTopicMemoSection();
    requestAnimationFrame(syncComparePanelStickyTop);
    return true;
  }
  if (e.target.classList.contains("js-memo-edit-form")) {
    e.preventDefault();
    const { topicId, coord, id } = e.target.dataset;
    const body = e.target.elements.body.value.trim();
    if (!body) return;
    updatePrivateMemo(topicId, coord, id, body);
    state.editingMemoKey = null;
    renderList();
    renderComparePanel();
    renderTopicMemoSection();
    requestAnimationFrame(syncComparePanelStickyTop);
    return true;
  }
  return false;
}

// === イベント登録 ===
els.menuOpenBtn.addEventListener("click", openNavDrawer);
els.menuCloseBtn.addEventListener("click", closeNavDrawer);
els.navBackdrop.addEventListener("click", closeNavDrawer);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.drawerOpen) closeNavDrawer(); });
window.addEventListener("popstate", () => { if (state.detailOpen) closeDetailView({ restoreScroll: true }); });
window.addEventListener("hashchange", () => {
  const current = decodeURIComponent(window.location.hash || "");
  if (current === decodeURIComponent(getCurrentHash())) return;
  applyUrlHashState();
});
els.drawerNavButtons.forEach((b) => b.addEventListener("click", () => switchPage(b.dataset.page)));
document.addEventListener("click", (e) => {
  if (e.target.closest(".js-go-explorer")) { switchPage("explorer"); return; }
  if (e.target.closest(".js-go-profile")) { switchPage("profile"); return; }
  if (e.target.closest(".js-open-profile-edit")) { openProfileDialog(); return; }

  // PC版：背景クリックで右側詳細パネルを非表示にし、命題一覧を全幅表示にする
  if (
    !isMobileViewport() &&
    state.page === "explorer" &&
    !state.detailOpen &&
    state.pcPanelOpen &&
    !state.drawerOpen &&
    !document.querySelector("dialog[open]") &&
    e.target instanceof Element &&
    e.target.isConnected
  ) {
    const selText = window.getSelection ? window.getSelection().toString().trim() : "";
    if (selText) return;
    const hitInteractive = e.target.closest(
      ".arg-card, .memo-card, .compare-panel, .site-header, .nav-drawer, .nav-backdrop, .doc-card, .stage-banner, .status-notice, .empty-state, dialog, button, a, input, textarea, select, label"
    );
    if (!hitInteractive) {
      state.pcPanelOpen = false;
      applyDetailBodyClass();
      renderList();
      syncUrlHash();
    }
  }
});
document.querySelectorAll(".js-close-dialog").forEach((b) => b.addEventListener("click", () => b.closest("dialog")?.close()));
els.topicSelect.addEventListener("change", (e) => switchTopic(e.target.value));
els.editTopicBtn.addEventListener("click", () => openTopicDialog(state.currentTopicId));
els.addTopicBtn.addEventListener("click", () => openTopicDialog(null));
els.loginOpenBtn.addEventListener("click", () => { closeNavDrawer(); els.loginError.hidden = true; els.loginForm.reset(); els.loginDialog.showModal(); });
els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!auth) return;
  els.loginError.hidden = true;
  try { await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value); els.loginDialog.close(); }
  catch (err) { console.error(err); els.loginError.textContent = "メールアドレスまたはパスワードが正しくありません。"; els.loginError.hidden = false; }
});
els.logoutBtn.addEventListener("click", async () => { if (!auth) return; closeNavDrawer(); await signOut(auth); });

els.profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  els.profileError.hidden = true;
  const payload = {
    name: els.profileName.value.trim(),
    role: els.profileRole.value.trim(),
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, "siteMeta", "profile"), payload);
    state.profile = normalizeProfile(payload);
    els.profileDialog.close();
    renderProfilePage();
  } catch (err) {
    console.error(err);
    els.profileError.textContent = "保存に失敗しました。Firestoreのルールを確認してください。";
    els.profileError.hidden = false;
  }
});

els.profileContent.addEventListener("click", async (e) => {
  if (handleShortcutClick(e)) return;
  const editBtn = e.target.closest(".js-edit-admin-comment");
  if (editBtn) {
    const t = state.adminComments.find((c) => c.id === editBtn.dataset.id);
    if (isCommentOwner(t)) { state.editingAdminCommentId = t.id; renderProfilePage(); }
    return;
  }
  if (e.target.closest(".js-cancel-edit-admin-comment")) { state.editingAdminCommentId = null; renderProfilePage(); return; }
  const delBtn = e.target.closest(".js-delete-admin-comment");
  if (delBtn && db) {
    const t = state.adminComments.find((c) => c.id === delBtn.dataset.id);
    if (!t || (!isCommentOwner(t) && !state.isAdmin) || !confirm("このコメントを削除しますか？")) return;
    try { await deleteDoc(doc(db, "adminComments", t.id)); if (state.editingAdminCommentId === t.id) state.editingAdminCommentId = null; await loadAdminComments(); }
    catch (err) { console.error(err); alert("コメントの削除に失敗しました。"); }
  }
});

els.profileContent.addEventListener("submit", async (e) => {
  if (e.target.classList.contains("js-admin-comment-edit-form")) {
    e.preventDefault();
    if (!db) return;
    const id = e.target.dataset.id, t = state.adminComments.find((c) => c.id === id);
    if (!isCommentOwner(t)) return;
    const body = e.target.elements.body.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "保存中...";
    try {
      await updateDoc(doc(db, "adminComments", id), {
        author: e.target.elements.author.value.trim() || "匿名",
        category: e.target.elements.category.value,
        targetRef: "",
        body,
        updatedAt: serverTimestamp()
      });
      state.editingAdminCommentId = null;
      await loadAdminComments();
    } catch (err) { console.error(err); alert("コメントの更新に失敗しました。"); }
    finally { btn.disabled = false; btn.textContent = "変更を保存"; }
    return;
  }
  if (e.target.id === "admin-comment-add-form") {
    e.preventDefault();
    if (!db) return;
    const bodyEl = $("admin-comment-body");
    const body = bodyEl.value.trim();
    if (!body) return;
    const category = $("admin-comment-category").value;
    const author = $("admin-comment-author").value.trim() || "匿名";
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(collection(db, "adminComments"), {
        category, targetRef: "", author, body,
        authorUid: uid, createdAt: serverTimestamp()
      });
      bodyEl.value = "";
      await Promise.all([
        notifyAdminByEmail({ category, author, body }),
        loadAdminComments()
      ]);
    } catch (err) {
      console.error(err);
      alert(err?.code === "auth/operation-not-allowed" ? "Firebase Authentication で「匿名」ログインを有効にしてください。" : "コメントの投稿に失敗しました。");
    } finally { btn.disabled = false; btn.textContent = "管理者へコメントを投稿"; }
  }
});

// === 論題メモセクションイベント ===
els.topicMemoSection?.addEventListener("click", (e) => {
  if (handleSectionToggleClick(e)) return;
  handleMemoClick(e);
});
els.topicMemoSection?.addEventListener("submit", (e) => { handleMemoSubmit(e); });

// === 論題全体への公開コメントイベント ===
els.topicCommentsSection.addEventListener("click", async (e) => {
  if (handleSectionToggleClick(e)) return;
  if (handleShortcutClick(e)) return;
  const editBtn = e.target.closest(".js-edit-topic-comment");
  if (editBtn) {
    const t = state.topicComments.find((c) => c.id === editBtn.dataset.id);
    if (isCommentOwner(t)) { state.editingTopicCommentId = t.id; renderTopicCommentsSection(); }
    return;
  }
  if (e.target.closest(".js-cancel-edit-topic-comment")) { state.editingTopicCommentId = null; renderTopicCommentsSection(); return; }
  const delBtn = e.target.closest(".js-delete-topic-comment");
  if (delBtn && db) {
    const t = state.topicComments.find((c) => c.id === delBtn.dataset.id);
    if (!t || (!isCommentOwner(t) && !state.isAdmin) || !confirm("この公開コメントを削除しますか？")) return;
    try { await deleteDoc(commentDoc(t.id)); if (state.editingTopicCommentId === t.id) state.editingTopicCommentId = null; await loadTopicComments(); }
    catch (err) { console.error(err); alert("公開コメントの削除に失敗しました。"); }
  }
});

els.topicCommentsSection.addEventListener("submit", async (e) => {
  if (e.target.classList.contains("js-topic-comment-edit-form")) {
    e.preventDefault();
    if (!db) return;
    const id = e.target.dataset.id, t = state.topicComments.find((c) => c.id === id);
    if (!isCommentOwner(t)) return;
    const body = e.target.elements.body.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "保存中...";
    try {
      await updateDoc(commentDoc(id), { author: e.target.elements.author.value.trim() || "匿名", stance: e.target.elements.stance.value, body, updatedAt: serverTimestamp() });
      state.editingTopicCommentId = null;
      await loadTopicComments();
    } catch (err) { console.error(err); alert("公開コメントの更新に失敗しました。"); }
    finally { btn.disabled = false; btn.textContent = "変更を保存"; }
    return;
  }
  if (e.target.id === "topic-comment-add-form") {
    e.preventDefault();
    if (!db) return;
    const bodyEl = $("topic-comment-body"), body = bodyEl.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(commentsCollection(), {
        coord: TOPIC_COMMENT_COORD,
        stance: $("topic-comment-stance").value,
        author: $("topic-comment-author").value.trim() || "匿名",
        body, authorUid: uid, createdAt: serverTimestamp()
      });
      bodyEl.value = "";
      await loadTopicComments();
    } catch (err) {
      console.error(err);
      alert(err?.code === "auth/operation-not-allowed" ? "Firebase Authentication で「匿名」ログインを有効にしてください。" : "公開コメントの投稿に失敗しました。");
    } finally { btn.disabled = false; btn.textContent = "論題へ公開コメントを投稿"; }
  }
});

// === バックアップ / 復元イベント ===
els.backupOpenBtn.addEventListener("click", openBackupDialog);
els.backupExportCurrentBtn.addEventListener("click", () => handleBackupExport("current"));
els.backupExportAllBtn.addEventListener("click", () => handleBackupExport("all"));
els.backupFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    els.backupImportText.value = await file.text();
    updateBackupPreview();
  } catch (err) {
    console.error(err);
    els.backupError.textContent = "ファイルの読み込みに失敗しました。";
    els.backupError.hidden = false;
  }
});
els.backupImportText.addEventListener("input", updateBackupPreview);
els.backupRestoreBtn.addEventListener("click", handleBackupRestore);

els.addStageBtn.addEventListener("click", () => openStageDialog(null));
els.inlineAddStageBtn.addEventListener("click", () => openStageDialog(null));
els.addArgBtn.addEventListener("click", () => openArgDialog(null));

els.topicForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const id = els.topicId.value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id === "guide" || id === "profile") {
    els.topicError.textContent = "論題IDには半角英数字・ハイフン・アンダースコアのみ使え、「guide」「profile」は使用できません。";
    els.topicError.hidden = false; return;
  }
  const isCreating = !state.editingTopicId;
  if (isCreating && findTopic(id)) { els.topicError.textContent = `論題ID「${id}」はすでに使われています。`; els.topicError.hidden = false; return; }
  const existing = findTopic(id), maxOrder = state.topics.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const payload = { id, title: els.topicTitle.value.trim(), plusLabel: els.topicPlusLabel.value.trim() || "肯定側", minusLabel: els.topicMinusLabel.value.trim() || "反論側", order: existing ? existing.order : maxOrder + 1, useLegacyRoot: existing ? existing.useLegacyRoot : false, updatedAt: serverTimestamp() };
  try {
    await ensureTopicsSeededInDb();
    await setDoc(doc(db, "topics", id), payload);
    els.topicDialog.close();
    await loadTopics();
    if (isCreating) await switchTopic(id); else renderAll();
  } catch (err) { console.error(err); els.topicError.textContent = "保存に失敗しました。"; els.topicError.hidden = false; }
});

els.topicDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingTopicId) return;
  const targetId = state.editingTopicId;
  els.topicError.hidden = true;
  if (state.topics.length <= 1) {
    els.topicError.textContent = "最後の1件の論題は削除できません。";
    els.topicError.hidden = false;
    return;
  }
  const origLabel = els.topicDeleteBtn.textContent;
  els.topicDeleteBtn.disabled = true;
  els.topicDeleteBtn.textContent = "確認中...";
  try {
    const [stSnap, argSnap, comSnap] = await Promise.all([
      getDocs(stagesCollection(targetId)),
      getDocs(argumentsCollection(targetId)),
      getDocs(commentsCollection(targetId))
    ]);
    const title = findTopic(targetId)?.title || targetId;
    const detail = `水準 ${stSnap.size}件・命題 ${argSnap.size}件・公開コメント ${comSnap.size}件`;
    if (!confirm(`論題「${title}」を削除しますか？\nこの論題に含まれるデータ（${detail}）もすべて一括削除され、元に戻せません。`)) {
      return;
    }
    els.topicDeleteBtn.textContent = "削除中...";
    await ensureTopicsSeededInDb();
    await Promise.all([
      ...argSnap.docs.map((d) => deleteDoc(d.ref)),
      ...stSnap.docs.map((d) => deleteDoc(d.ref)),
      ...comSnap.docs.map((d) => deleteDoc(d.ref))
    ]);
    await deleteDoc(doc(db, "topics", targetId));
    try { localStorage.removeItem(evalStorageKey(targetId)); } catch {}
    deleteTopicMemos(targetId);
    els.topicDialog.close();
    await loadTopics();
    await switchTopic(state.topics[0]?.id || DEFAULT_TOPIC.id);
  } catch (err) {
    console.error(err);
    els.topicError.textContent = "削除に失敗しました。";
    els.topicError.hidden = false;
  } finally {
    els.topicDeleteBtn.disabled = false;
    els.topicDeleteBtn.textContent = origLabel;
  }
});

els.stageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const id = els.stageId.value.trim();
  if (!id || id === "all" || id.includes("/")) { els.stageError.textContent = "水準番号に「all」や「/」は使えません。"; els.stageError.hidden = false; return; }
  if (!state.editingStageId && findStage(id)) { els.stageError.textContent = `水準 ${id} はすでに存在します。`; els.stageError.hidden = false; return; }
  try {
    await ensureStagesSeededInDb();
    await setDoc(stageDoc(id), { id, label: els.stageLabel.value.trim(), plus: formatBasicProp(els.stagePlus.value.trim()), minus: formatBasicProp(els.stageMinus.value.trim()), updatedAt: serverTimestamp() });
    els.stageDialog.close();
    await loadStages();
    if (els.argDialog.open) populateStageSelect(id); else state.stage = id;
    renderAll();
  } catch (err) { console.error(err); els.stageError.textContent = "保存に失敗しました。"; els.stageError.hidden = false; }
});

els.stageDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingStageId) return;
  const targetId = state.editingStageId;
  els.stageError.hidden = true;
  const linkedRawArgs = state.rawArguments.filter((a) => a.stage === targetId);
  const displayArgCount = state.arguments.filter((a) => a.stage === targetId).length;
  const targetCoords = new Set([...linkedRawArgs.map((a) => a.coord), `${targetId}.00`]);
  const msg = displayArgCount > 0
    ? `水準 ${targetId} を削除しますか？\nこの水準に含まれる命題 ${displayArgCount}件と関連コメントもすべて一括削除され、元に戻せません。`
    : `水準 ${targetId} を削除しますか？`;
  if (!confirm(msg)) return;

  const origLabel = els.stageDeleteBtn.textContent;
  els.stageDeleteBtn.disabled = true;
  els.stageDeleteBtn.textContent = "削除中...";
  try {
    await ensureStagesSeededInDb();
    const comSnap = await getDocs(commentsCollection());
    const targetComments = comSnap.docs.filter((d) => targetCoords.has(String(d.data()?.coord ?? "").trim()));
    await Promise.all([
      ...linkedRawArgs.map((a) => deleteDoc(argumentDoc(a.coord))),
      ...targetComments.map((d) => deleteDoc(d.ref))
    ]);
    await deleteDoc(stageDoc(targetId));
    deleteStageMemos(state.currentTopicId, targetCoords);
    els.stageDialog.close();
    await Promise.all([loadStages(), loadArguments(), loadCommentCounts()]);
    if (state.stage === targetId) state.stage = state.stages[0]?.id || "all";
    if (!findArg(state.selectedCoord)) {
      state.selectedCoord = "";
      state.pcPanelOpen = false;
      if (state.detailOpen) closeDetailView({ restoreScroll: false });
    }
    renderAll();
    if (state.selectedCoord) await loadCommentsForCoord(state.selectedCoord);
  } catch (err) {
    console.error(err);
    els.stageError.textContent = "削除に失敗しました。";
    els.stageError.hidden = false;
  } finally {
    els.stageDeleteBtn.disabled = false;
    els.stageDeleteBtn.textContent = origLabel;
  }
});

els.argForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const coord = els.argCoord.value.trim(), stageVal = String(els.argStage.value).trim();
  if (!stageVal) { els.argError.textContent = "先に水準を1つ作成してください。"; els.argError.hidden = false; return; }
  if (!coord || coord.includes("/")) { els.argError.textContent = "座標に「/」は使えません。"; els.argError.hidden = false; return; }
  if (!state.editingCoord && findArg(coord)) { els.argError.textContent = `座標 ${coord} はすでに存在します。`; els.argError.hidden = false; return; }
  const existing = findArg(coord);
  const payload = {
    coord, stage: stageVal, topic: els.argTopic.value.trim(),
    plusTitle: els.argPlusTitle.value.trim(), plusBody: els.argPlusBody.value.trim(),
    minusTitle: els.argMinusTitle.value.trim(), minusBody: els.argMinusBody.value.trim(),
    refs: els.argRefs.value.split(",").map((s) => s.trim()).filter(Boolean),
    bibliography: existing ? existing.bibliography : [], updatedAt: serverTimestamp()
  };
  try {
    await setDoc(argumentDoc(coord), payload);
    els.argDialog.close();
    await loadArguments();
    state.stage = payload.stage; state.selectedCoord = coord; state.pcPanelOpen = true;
    renderAll(); loadCommentsForCoord(coord); focusCard(coord);
  } catch (err) { console.error(err); els.argError.textContent = "保存に失敗しました。"; els.argError.hidden = false; }
});

els.argDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingCoord) return;
  const target = state.editingCoord;
  if (!confirm(`座標 ${target} の命題を削除しますか？`)) return;
  try {
    await deleteDoc(argumentDoc(target));
    els.argDialog.close();
    await loadArguments();
    state.selectedCoord = "";
    state.pcPanelOpen = false;
    if (state.detailOpen) closeDetailView({ restoreScroll: false }); else renderAll();
  } catch (err) { console.error(err); els.argError.textContent = "削除に失敗しました。"; els.argError.hidden = false; }
});

els.stageTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  state.stage = btn.dataset.stage;
  if (state.pcPanelOpen || state.detailOpen) {
    const cur = findArg(state.selectedCoord);
    if (state.stage !== "all" && (!cur || cur.stage !== state.stage)) {
      const first = state.arguments.find((a) => a.stage === state.stage);
      if (first) {
        state.selectedCoord = first.coord;
        state.openSections.coordMemo = false;
        state.openSections.coordComments = false;
        loadCommentsForCoord(first.coord);
      }
    }
  }
  showSiteHeader();
  renderAll();
  if (els.comparePanel && !isMobileViewport()) els.comparePanel.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
els.stageBanner.addEventListener("click", (e) => {
  const b = e.target.closest(".js-edit-stage");
  if (b) openStageDialog(b.dataset.stageId);
});
els.modeButtons.forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  state.editingMemoKey = null;
  showSiteHeader();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}));
els.searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  renderList();
  requestAnimationFrame(syncComparePanelStickyTop);
});

els.argList.addEventListener("click", (e) => {
  const memoToggle = e.target.closest(".js-toggle-memo-card");
  if (memoToggle) {
    e.stopPropagation();
    const key = memoToggle.dataset.memoCardKey;
    state.openMemoCards[key] = !state.openMemoCards[key];
    renderList();
    requestAnimationFrame(syncComparePanelStickyTop);
    return;
  }
  if (handleMemoClick(e)) return;
  const sectionBtn = e.target.closest(".js-jump-section");
  if (sectionBtn) {
    e.stopPropagation();
    openCoordAndScrollToSection(sectionBtn.dataset.coord, sectionBtn.dataset.section);
    return;
  }
  const evalBtn = e.target.closest(".js-eval-btn");
  if (evalBtn) { e.stopPropagation(); setEvaluation(evalBtn.dataset.coord, evalBtn.dataset.eval); return; }
  const flipBtn = e.target.closest(".js-flip-btn, .js-jump-mode");
  if (flipBtn) { e.stopPropagation(); jumpTo(flipBtn.dataset.coord, flipBtn.dataset.targetMode); return; }
  const refBtn = e.target.closest(".js-ref-btn");
  if (refBtn) { e.stopPropagation(); jumpTo(refBtn.dataset.ref, null); return; }
  const memoCard = e.target.closest(".js-memo-card");
  if (memoCard && !e.target.closest("form, button, textarea, input, a")) {
    openMemoCardTarget(memoCard.dataset.topicId, memoCard.dataset.coord);
    return;
  }
  const card = e.target.closest(".arg-card");
  if (card) { if (isMobileViewport()) openDetailView(card.dataset.coord); else selectCoord(card.dataset.coord); }
});

els.argList.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const sectionBtn = e.target.closest(".js-jump-section");
  if (sectionBtn) {
    e.preventDefault();
    e.stopPropagation();
    openCoordAndScrollToSection(sectionBtn.dataset.coord, sectionBtn.dataset.section);
  }
});

els.argList.addEventListener("submit", (e) => { handleMemoSubmit(e); });

els.comparePanel.addEventListener("click", async (e) => {
  if (handleSectionToggleClick(e)) return;
  if (handleMemoClick(e)) return;
  const evalBtn = e.target.closest(".js-eval-btn");
  if (evalBtn) { setEvaluation(evalBtn.dataset.coord, evalBtn.dataset.eval); return; }
  if (e.target.closest(".js-close-detail")) { requestCloseDetailView(); return; }
  const exp = e.target.closest(".js-expand-detail");
  if (exp) { openDetailView(exp.dataset.coord); return; }
  const pager = e.target.closest(".js-pager-nav");
  if (pager && pager.dataset.coord) { openDetailView(pager.dataset.coord, { pushBrowserHistory: false }); return; }
  const edit = e.target.closest(".js-edit-arg");
  if (edit) { openArgDialog(edit.dataset.coord); return; }
  const jump = e.target.closest(".js-jump-mode");
  if (jump) { jumpTo(jump.dataset.coord, jump.dataset.targetMode, { closeDetail: true }); return; }
  const ref = e.target.closest(".js-ref-btn");
  if (ref) { if (state.detailOpen) openDetailView(ref.dataset.ref, { pushBrowserHistory: false }); else jumpTo(ref.dataset.ref, null); return; }
  const delBib = e.target.closest(".js-delete-bib");
  if (delBib && db && state.isAdmin) {
    const item = findArg(state.selectedCoord);
    if (!item) return;
    const { isAutoBasic, ...cleanItem } = item;
    const nextBib = item.bibliography.filter((_, i) => i !== Number(delBib.dataset.index));
    try { await setDoc(argumentDoc(item.coord), { ...cleanItem, bibliography: nextBib, updatedAt: serverTimestamp() }); await loadArguments(); renderList(); renderComparePanel(); }
    catch (err) { console.error(err); alert("参考文献の削除に失敗しました。"); }
    return;
  }
  const editC = e.target.closest(".js-edit-comment");
  if (editC) {
    const t = state.comments.find((c) => c.id === editC.dataset.id);
    if (isCommentOwner(t)) { state.editingCommentId = t.id; renderComparePanel(); }
    return;
  }
  if (e.target.closest(".js-cancel-edit-comment")) { state.editingCommentId = null; renderComparePanel(); return; }
  const delC = e.target.closest(".js-delete-comment");
  if (delC && db) {
    const t = state.comments.find((c) => c.id === delC.dataset.id);
    if (!t || (!isCommentOwner(t) && !state.isAdmin) || !confirm("この公開コメントを削除しますか？")) return;
    try { await deleteDoc(commentDoc(t.id)); if (state.editingCommentId === t.id) state.editingCommentId = null; await loadCommentsForCoord(state.selectedCoord); }
    catch (err) { console.error(err); alert("公開コメントの削除に失敗しました。"); }
  }
});

els.comparePanel.addEventListener("submit", async (e) => {
  if (handleMemoSubmit(e)) return;
  if (e.target.id === "bib-add-form") {
    e.preventDefault();
    if (!db || !state.isAdmin) return;
    const item = findArg(state.selectedCoord), citation = $("bib-citation").value.trim();
    if (!item || !citation) return;
    const { isAutoBasic, ...cleanItem } = item;
    const nextBib = [...item.bibliography, { citation, url: $("bib-url").value.trim(), note: $("bib-note").value.trim() }];
    try { await setDoc(argumentDoc(item.coord), { ...cleanItem, bibliography: nextBib, updatedAt: serverTimestamp() }); await loadArguments(); renderList(); renderComparePanel(); }
    catch (err) { console.error(err); alert("参考文献の追加に失敗しました。"); }
    return;
  }
  if (e.target.classList.contains("js-comment-edit-form")) {
    e.preventDefault();
    if (!db) return;
    const id = e.target.dataset.id, t = state.comments.find((c) => c.id === id);
    if (!isCommentOwner(t)) return;
    const body = e.target.elements.body.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "保存中...";
    try {
      await updateDoc(commentDoc(id), { author: e.target.elements.author.value.trim() || "匿名", stance: e.target.elements.stance.value, body, updatedAt: serverTimestamp() });
      state.editingCommentId = null;
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) { console.error(err); alert("公開コメントの更新に失敗しました。"); }
    finally { btn.disabled = false; btn.textContent = "変更を保存"; }
    return;
  }
  if (e.target.id === "comment-add-form") {
    e.preventDefault();
    if (!db || !state.selectedCoord) return;
    const bodyEl = $("comment-body"), body = bodyEl.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(commentsCollection(), { coord: state.selectedCoord, stance: $("comment-stance").value, author: $("comment-author").value.trim() || "匿名", body, authorUid: uid, createdAt: serverTimestamp() });
      bodyEl.value = "";
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) {
      console.error(err);
      alert(err?.code === "auth/operation-not-allowed" ? "Firebase Authentication で「匿名」ログインを有効にしてください。" : "公開コメントの投稿に失敗しました。");
    } finally { btn.disabled = false; btn.textContent = "公開コメントを投稿"; }
  }
});

async function init() {
  loadMemos();
  applyDetailBodyClass();
  initPcStickyComparePanel();
  initMobileSmartHeader();
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      state.currentUid = user ? user.uid : null;
      state.isAdmin = Boolean(user && user.uid === ADMIN_UID);
      renderAdminBar(); renderStageBanner(); renderList(); renderComparePanel(); renderTopicMemoSection(); renderTopicCommentsSection(); renderProfilePage();
      requestAnimationFrame(syncComparePanelStickyTop);
    });
  }
  await Promise.all([loadProfile(), loadTopics(), loadAdminComments()]);
  const { page, topicId, coordToken } = parseUrlHashTokens();
  state.page = page;
  state.currentTopicId = topicId && findTopic(topicId) ? topicId : state.topics[0]?.id || DEFAULT_TOPIC.id;
  await Promise.all([loadStages(), loadArguments(), loadCommentCounts(), loadTopicComments()]);
  loadEvaluations();
  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  state.selectedCoord = "";
  const hasCoordInUrl = state.page === "explorer" && applyCoordToken(coordToken);
  if (hasCoordInUrl) {
    if (isMobileViewport()) state.detailOpen = true;
    else state.pcPanelOpen = true;
  } else {
    state.pcPanelOpen = false;
  }
  renderAll();
  if (state.selectedCoord) await loadCommentsForCoord(state.selectedCoord);
}

init();