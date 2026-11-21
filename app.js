import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

// data.js に定義されている初期データを取り出す
const DEFAULT_STAGES_OBJ = typeof STAGES !== "undefined" ? STAGES : {};
const DEFAULT_ARGUMENTS = typeof ARGUMENTS !== "undefined" ? ARGUMENTS : [];

const DEFAULT_TOPIC = {
  id: "antinatalism",
  title: "反出生主義と反論：細分化論証エクスプローラー",
  subtitle: "座標インデックスによる立場別通読・符号反転比較・参考文献・議論コメント",
  plusLabel: "肯定側",
  minusLabel: "反論側",
  order: 1,
  useLegacyRoot: true
};

// === 1. Firebase 初期化 ===
const isFirebaseConfigured =
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("ここに");

let auth = null;
let db = null;

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// === 2. アプリケーション状態 ===
const state = {
  topics: [],
  topicsInDb: false,
  currentTopicId: DEFAULT_TOPIC.id,
  stages: [],
  stagesInDb: false,
  arguments: [],
  stage: "1",
  mode: "plus",           // "plus" | "minus" | "split"
  selectedCoord: "",
  query: "",
  history: [],
  isAdmin: false,
  comments: [],
  commentsLoading: false,
  editingTopicId: null,
  editingCoord: null,
  editingStageId: null,
  detailOpen: false,
  savedListScrollY: 0,
  pushedDetailHistory: false
};

let referencedByMap = new Map();

// DOM 参照
const els = {
  topicSelect: document.getElementById("topic-select"),
  editTopicBtn: document.getElementById("edit-topic-btn"),
  addTopicBtn: document.getElementById("add-topic-btn"),
  siteTitle: document.getElementById("site-title"),
  siteSubtitle: document.getElementById("site-subtitle"),

  stageTabs: document.getElementById("stage-tabs"),
  stageBanner: document.getElementById("stage-banner"),
  argList: document.getElementById("argument-list"),
  comparePanel: document.getElementById("compare-panel"),
  searchInput: document.getElementById("search-input"),
  backBtn: document.getElementById("back-btn"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  statusNotice: document.getElementById("status-notice"),

  adminBadge: document.getElementById("admin-badge"),
  addStageBtn: document.getElementById("add-stage-btn"),
  addArgBtn: document.getElementById("add-arg-btn"),
  seedDbBtn: document.getElementById("seed-db-btn"),
  loginOpenBtn: document.getElementById("login-open-btn"),
  logoutBtn: document.getElementById("logout-btn"),

  loginDialog: document.getElementById("login-dialog"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),

  topicDialog: document.getElementById("topic-dialog"),
  topicDialogTitle: document.getElementById("topic-dialog-title"),
  topicForm: document.getElementById("topic-form"),
  topicId: document.getElementById("topic-id"),
  topicTitle: document.getElementById("topic-title"),
  topicSubtitle: document.getElementById("topic-subtitle"),
  topicPlusLabel: document.getElementById("topic-plus-label"),
  topicMinusLabel: document.getElementById("topic-minus-label"),
  topicDeleteBtn: document.getElementById("topic-delete-btn"),
  topicError: document.getElementById("topic-error"),

  argDialog: document.getElementById("arg-dialog"),
  argDialogTitle: document.getElementById("arg-dialog-title"),
  argForm: document.getElementById("arg-form"),
  argCoord: document.getElementById("arg-coord"),
  argStage: document.getElementById("arg-stage"),
  inlineAddStageBtn: document.getElementById("inline-add-stage-btn"),
  argTopic: document.getElementById("arg-topic"),
  argPlusHeading: document.getElementById("arg-plus-heading"),
  argMinusHeading: document.getElementById("arg-minus-heading"),
  argPlusTitle: document.getElementById("arg-plus-title"),
  argPlusBody: document.getElementById("arg-plus-body"),
  argMinusTitle: document.getElementById("arg-minus-title"),
  argMinusBody: document.getElementById("arg-minus-body"),
  argRefs: document.getElementById("arg-refs"),
  argDeleteBtn: document.getElementById("arg-delete-btn"),
  argError: document.getElementById("arg-error"),

  stageDialog: document.getElementById("stage-dialog"),
  stageDialogTitle: document.getElementById("stage-dialog-title"),
  stageForm: document.getElementById("stage-form"),
  stageId: document.getElementById("stage-id"),
  stageLabel: document.getElementById("stage-label"),
  stagePlusLabelText: document.getElementById("stage-plus-label-text"),
  stageMinusLabelText: document.getElementById("stage-minus-label-text"),
  stagePlus: document.getElementById("stage-plus"),
  stageMinus: document.getElementById("stage-minus"),
  stageDeleteBtn: document.getElementById("stage-delete-btn"),
  stageError: document.getElementById("stage-error")
};

// === 3. ユーティリティ & 論題ごとの参照先解決 ===
function isMobileViewport() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  const trimmed = String(url ?? "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function compareNatural(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function normalizeTopic(raw) {
  const id = String(raw.id).trim();
  return {
    id,
    title: String(raw.title ?? id).trim(),
    subtitle: String(raw.subtitle ?? "").trim(),
    plusLabel: String(raw.plusLabel ?? "肯定側").trim() || "肯定側",
    minusLabel: String(raw.minusLabel ?? "反論側").trim() || "反論側",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 9999,
    useLegacyRoot:
      typeof raw.useLegacyRoot === "boolean"
        ? raw.useLegacyRoot
        : id === DEFAULT_TOPIC.id
  };
}

function normalizeStage(raw) {
  return {
    id: String(raw.id).trim(),
    label: String(raw.label ?? "").trim(),
    plus: String(raw.plus ?? "").trim(),
    minus: String(raw.minus ?? "").trim()
  };
}

function getDefaultStagesList() {
  return Object.entries(DEFAULT_STAGES_OBJ)
    .map(([id, info]) => normalizeStage({ id, ...info }))
    .sort((a, b) => compareNatural(a.id, b.id));
}

function normalizeArg(raw) {
  return {
    coord: String(raw.coord).trim(),
    stage: String(raw.stage ?? "1").trim(),
    topic: String(raw.topic ?? "").trim(),
    plusTitle: String(raw.plusTitle ?? "").trim(),
    plusBody: String(raw.plusBody ?? "").trim(),
    minusTitle: String(raw.minusTitle ?? "").trim(),
    minusBody: String(raw.minusBody ?? "").trim(),
    refs: Array.isArray(raw.refs) ? raw.refs.filter(Boolean) : [],
    bibliography: Array.isArray(raw.bibliography) ? raw.bibliography : []
  };
}

function findTopic(id) {
  return state.topics.find((t) => t.id === id);
}

function getCurrentTopic() {
  return findTopic(state.currentTopicId) || state.topics[0] || DEFAULT_TOPIC;
}

function isLegacyTopic(topicId = state.currentTopicId) {
  const t = findTopic(topicId);
  return Boolean(t ? t.useLegacyRoot : topicId === DEFAULT_TOPIC.id);
}

// 既存データ（初期の反出生主義論題）はルート領域、新規論題は topics/{id} 配下を使用
function stagesCollection(topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? collection(db, "stages")
    : collection(db, "topics", topicId, "stages");
}

function stageDoc(stageId, topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? doc(db, "stages", stageId)
    : doc(db, "topics", topicId, "stages", stageId);
}

function argumentsCollection(topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? collection(db, "arguments")
    : collection(db, "topics", topicId, "arguments");
}

function argumentDoc(coord, topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? doc(db, "arguments", coord)
    : doc(db, "topics", topicId, "arguments", coord);
}

function commentsCollection(topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? collection(db, "comments")
    : collection(db, "topics", topicId, "comments");
}

function commentDoc(commentId, topicId = state.currentTopicId) {
  return isLegacyTopic(topicId)
    ? doc(db, "comments", commentId)
    : doc(db, "topics", topicId, "comments", commentId);
}

function rebuildReferencedByMap() {
  referencedByMap = new Map();
  for (const item of state.arguments) {
    referencedByMap.set(item.coord, []);
  }
  for (const item of state.arguments) {
    for (const refCoord of item.refs) {
      if (referencedByMap.has(refCoord)) {
        referencedByMap.get(refCoord).push(item.coord);
      }
    }
  }
}

function findStage(id) {
  return state.stages.find((s) => s.id === String(id));
}

function findArg(coord) {
  return state.arguments.find((a) => a.coord === coord);
}

function showNotice(message) {
  if (!message) {
    els.statusNotice.hidden = true;
    els.statusNotice.textContent = "";
    return;
  }
  els.statusNotice.hidden = false;
  els.statusNotice.textContent = message;
}

function formatDate(ts) {
  if (!ts) return "たった今";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getCurrentHash() {
  const topicId = state.currentTopicId;
  if (!topicId) return "";
  if (!state.selectedCoord) {
    return `#${encodeURIComponent(topicId)}`;
  }
  const prefix = state.mode === "plus" ? "+" : state.mode === "minus" ? "-" : "";
  return `#${encodeURIComponent(topicId)}/${prefix}${state.selectedCoord}`;
}

function syncUrlHash() {
  const hash = getCurrentHash();
  if (!hash) return;
  try {
    history.replaceState(history.state, "", hash);
  } catch {
    // 制限環境を無視
  }
}

// URLハッシュを「論題ID」と「座標トークン」に分解（旧形式 #+1.10 も互換維持）
function parseUrlHashTokens() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (!raw) return { topicId: null, coordToken: "" };

  if (raw.includes("/")) {
    const [maybeTopic, ...rest] = raw.split("/");
    return { topicId: maybeTopic.trim(), coordToken: rest.join("/").trim() };
  }

  if (findTopic(raw)) {
    return { topicId: raw, coordToken: "" };
  }

  return { topicId: null, coordToken: raw };
}

function applyCoordToken(coordToken) {
  if (!coordToken) return false;
  let mode = state.mode;
  let coord = coordToken;

  if (coordToken.startsWith("+")) {
    mode = "plus";
    coord = coordToken.slice(1);
  } else if (coordToken.startsWith("-")) {
    mode = "minus";
    coord = coordToken.slice(1);
  }

  const found = findArg(coord);
  if (!found) return false;

  state.stage = found.stage;
  state.mode = mode;
  state.selectedCoord = found.coord;
  return true;
}

function focusCard(coord) {
  if (state.detailOpen) return;
  requestAnimationFrame(() => {
    const card = els.argList.querySelector(`[data-coord="${CSS.escape(coord)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
  });
}

// === 4. 専用詳細ページの開閉 ===
function applyDetailBodyClass() {
  document.body.classList.toggle("is-detail-view", state.detailOpen);
}

function openDetailView(coord, { pushBrowserHistory = true } = {}) {
  const item = findArg(coord);
  if (!item) return;

  const wasOpen = state.detailOpen;
  if (!wasOpen) {
    state.savedListScrollY = window.scrollY;
  }

  const coordChanged = state.selectedCoord !== coord;
  state.selectedCoord = coord;
  state.detailOpen = true;
  applyDetailBodyClass();

  if (pushBrowserHistory && !wasOpen) {
    try {
      history.pushState({ detailOpen: true, coord }, "", getCurrentHash());
      state.pushedDetailHistory = true;
    } catch {
      state.pushedDetailHistory = false;
    }
  } else {
    syncUrlHash();
  }

  renderList();
  renderComparePanel();
  window.scrollTo({ top: 0, behavior: "instant" });

  if (coordChanged || !wasOpen) {
    loadCommentsForCoord(coord);
  }
}

function closeDetailView({ restoreScroll = true } = {}) {
  if (!state.detailOpen) return;
  state.detailOpen = false;
  state.pushedDetailHistory = false;
  applyDetailBodyClass();
  renderAll();
  if (restoreScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: state.savedListScrollY, behavior: "instant" });
    });
  }
}

function requestCloseDetailView() {
  if (state.pushedDetailHistory) {
    history.back();
  } else {
    closeDetailView({ restoreScroll: true });
  }
}

// === 5. Firestore データ操作 ===
async function loadTopics() {
  if (!db) {
    state.topics = [normalizeTopic(DEFAULT_TOPIC)];
    state.topicsInDb = false;
    return;
  }

  try {
    const snap = await getDocs(collection(db, "topics"));
    if (snap.empty) {
      state.topics = [normalizeTopic(DEFAULT_TOPIC)];
      state.topicsInDb = false;
    } else {
      const rows = [];
      snap.forEach((docSnap) => {
        rows.push(normalizeTopic({ id: docSnap.id, ...docSnap.data() }));
      });
      state.topics = rows.sort(
        (a, b) => a.order - b.order || compareNatural(a.id, b.id)
      );
      state.topicsInDb = true;
    }
  } catch (err) {
    console.error(err);
    state.topics = [normalizeTopic(DEFAULT_TOPIC)];
    state.topicsInDb = false;
  }
}

async function ensureTopicsSeededInDb() {
  if (!db || !state.isAdmin || state.topicsInDb) return;
  await setDoc(doc(db, "topics", DEFAULT_TOPIC.id), {
    ...DEFAULT_TOPIC,
    updatedAt: serverTimestamp()
  });
  state.topicsInDb = true;
}

async function loadStages() {
  const legacy = isLegacyTopic(state.currentTopicId);
  const fallback = legacy ? getDefaultStagesList() : [];

  if (!db) {
    state.stages = fallback;
    state.stagesInDb = false;
    return;
  }

  try {
    const snap = await getDocs(stagesCollection());
    if (snap.empty) {
      state.stages = fallback;
      state.stagesInDb = false;
    } else {
      const rows = [];
      snap.forEach((docSnap) => {
        rows.push(normalizeStage({ id: docSnap.id, ...docSnap.data() }));
      });
      state.stages = rows.sort((a, b) => compareNatural(a.id, b.id));
      state.stagesInDb = true;
    }
  } catch (err) {
    console.error(err);
    state.stages = fallback;
    state.stagesInDb = false;
  }
}

async function ensureStagesSeededInDb() {
  if (!db || !state.isAdmin || state.stagesInDb || !isLegacyTopic()) return;
  const defaults = getDefaultStagesList();
  for (const st of defaults) {
    await setDoc(stageDoc(st.id), {
      ...st,
      updatedAt: serverTimestamp()
    });
  }
  state.stagesInDb = true;
}

async function loadArguments() {
  const legacy = isLegacyTopic(state.currentTopicId);

  if (!db) {
    state.arguments = legacy
      ? DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord))
      : [];
    rebuildReferencedByMap();
    showNotice("firebase-config.js が未設定のため、ローカルの初期データのみで閲覧モード表示しています。");
    return;
  }

  try {
    const snap = await getDocs(argumentsCollection());
    if (snap.empty) {
      if (legacy) {
        state.arguments = DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) =>
          compareNatural(a.coord, b.coord)
        );
        showNotice("データベースに論証が未登録です。管理者ログイン後、「初期データをDBへ投入」を押すと初期データが登録されます。");
      } else {
        state.arguments = [];
        showNotice("");
      }
      rebuildReferencedByMap();
    } else {
      const rows = [];
      snap.forEach((docSnap) => {
        rows.push(normalizeArg({ coord: docSnap.id, ...docSnap.data() }));
      });
      state.arguments = rows.sort((a, b) => compareNatural(a.coord, b.coord));
      rebuildReferencedByMap();
      showNotice("");
    }
  } catch (err) {
    console.error(err);
    state.arguments = legacy
      ? DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord))
      : [];
    rebuildReferencedByMap();
    showNotice("データベースの読み込みに失敗しました。Firebaseの設定とルールを確認してください。");
  }
}

async function loadCommentsForCoord(coord) {
  if (!db || !coord) {
    state.comments = [];
    state.commentsLoading = false;
    renderComparePanel();
    return;
  }

  const targetTopicId = state.currentTopicId;
  state.commentsLoading = true;
  renderComparePanel();

  try {
    const q = query(commentsCollection(targetTopicId), where("coord", "==", coord));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    if (state.currentTopicId === targetTopicId && state.selectedCoord === coord) {
      state.comments = list;
    }
  } catch (err) {
    console.error(err);
    state.comments = [];
  } finally {
    state.commentsLoading = false;
    renderComparePanel();
  }
}

async function switchTopic(topicId) {
  if (!findTopic(topicId)) return;

  state.currentTopicId = topicId;
  state.history = [];
  state.query = "";
  els.searchInput.value = "";
  state.comments = [];

  if (state.detailOpen) {
    state.detailOpen = false;
    state.pushedDetailHistory = false;
    applyDetailBodyClass();
  }

  await Promise.all([loadStages(), loadArguments()]);

  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  const firstInStage =
    state.stage !== "all"
      ? state.arguments.find((a) => a.stage === state.stage) || state.arguments[0]
      : state.arguments[0];
  state.selectedCoord = firstInStage ? firstInStage.coord : "";

  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}

async function seedInitialDataToFirestore() {
  if (!db || !state.isAdmin || !isLegacyTopic()) return;
  const defaultStages = getDefaultStagesList();
  if (
    !confirm(
      `data.js の初期データ（主張段階 ${defaultStages.length}件・論証 ${DEFAULT_ARGUMENTS.length}件）をデータベースへ書き込みますか？（同じ番号・座標が存在する場合は上書きされます）`
    )
  ) {
    return;
  }

  els.seedDbBtn.disabled = true;
  els.seedDbBtn.textContent = "投入中...";
  try {
    await ensureTopicsSeededInDb();
    for (const st of defaultStages) {
      await setDoc(stageDoc(st.id), {
        ...st,
        updatedAt: serverTimestamp()
      });
    }
    for (const raw of DEFAULT_ARGUMENTS) {
      const item = normalizeArg(raw);
      await setDoc(argumentDoc(item.coord), {
        ...item,
        updatedAt: serverTimestamp()
      });
    }
    await Promise.all([loadTopics(), loadStages(), loadArguments()]);
    renderAll();
    alert("初期データ（論題・主張段階・論証）の投入が完了しました。");
  } catch (err) {
    console.error(err);
    alert("投入に失敗しました。Firestoreのルールと管理者UIDを確認してください。");
  } finally {
    els.seedDbBtn.disabled = false;
    els.seedDbBtn.textContent = "初期データをDBへ投入";
  }
}

// === 6. 描画関数 ===
function getFilteredArguments() {
  const q = state.query.trim().toLowerCase();
  return state.arguments.filter((item) => {
    if (state.stage !== "all" && item.stage !== state.stage) {
      return false;
    }
    if (!q) return true;
    const bibText = item.bibliography.map((b) => `${b.citation} ${b.note}`).join(" ");
    const haystack = [
      item.coord,
      `+${item.coord}`,
      `-${item.coord}`,
      item.topic,
      item.plusTitle,
      item.plusBody,
      item.minusTitle,
      item.minusBody,
      bibText
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function populateStageSelect(selectedId) {
  if (state.stages.length === 0) {
    els.argStage.innerHTML = `<option value="">（先に「+ 段階を新規追加」してください）</option>`;
    return;
  }
  els.argStage.innerHTML = state.stages
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`)
    .join("");
  if (selectedId && findStage(selectedId)) {
    els.argStage.value = String(selectedId);
  } else {
    els.argStage.value = state.stages[0].id;
  }
}

function renderTopicBar() {
  const topic = getCurrentTopic();
  els.topicSelect.innerHTML = state.topics
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`)
    .join("");
  els.topicSelect.value = topic.id;

  els.siteTitle.textContent = topic.title;
  els.siteSubtitle.textContent = topic.subtitle;
  els.siteSubtitle.hidden = !topic.subtitle;
  document.title = topic.title;
}

function renderAdminBar() {
  els.adminBadge.hidden = !state.isAdmin;
  els.editTopicBtn.hidden = !state.isAdmin;
  els.addTopicBtn.hidden = !state.isAdmin;
  els.addStageBtn.hidden = !state.isAdmin;
  els.addArgBtn.hidden = !state.isAdmin;
  els.seedDbBtn.hidden = !(state.isAdmin && isLegacyTopic());
  els.logoutBtn.hidden = !state.isAdmin;
  els.loginOpenBtn.hidden = state.isAdmin || !isFirebaseConfigured;
}

function renderTabs() {
  const tabDefs = [
    ...state.stages.map((s) => ({ id: s.id, label: s.label })),
    { id: "all", label: `全${state.arguments.length}論点` }
  ];

  els.stageTabs.innerHTML = tabDefs
    .map(
      (t) => `
      <button
        type="button"
        class="tab-btn ${state.stage === t.id ? "is-active" : ""}"
        data-stage="${escapeHtml(t.id)}"
      >${escapeHtml(t.label)}</button>`
    )
    .join("");
}

function renderModeButtons() {
  const topic = getCurrentTopic();
  els.modeButtons.forEach((btn) => {
    const mode = btn.dataset.mode;
    if (mode === "plus") btn.textContent = `+ ${topic.plusLabel}`;
    if (mode === "minus") btn.textContent = `- ${topic.minusLabel}`;
    if (mode === "split") btn.textContent = "⇄ 並置比較";
    btn.classList.toggle("is-active", mode === state.mode);
  });
  els.backBtn.disabled = state.history.length === 0;
}

function renderStageBanner() {
  if (state.stage === "all") {
    els.stageBanner.innerHTML = "";
    return;
  }
  const info = findStage(state.stage);
  if (!info) {
    els.stageBanner.innerHTML = "";
    return;
  }

  const topic = getCurrentTopic();
  const editBtnHtml = state.isAdmin
    ? `<button type="button" class="banner-edit-btn js-edit-stage" data-stage-id="${escapeHtml(info.id)}">この段階を編集</button>`
    : "";

  const boxesHtml = `
    <div class="banner-box is-plus">
      <div class="banner-head-row">
        <span class="banner-label">${escapeHtml(topic.plusLabel)}の基本主張</span>
        ${editBtnHtml}
      </div>
      <div>${escapeHtml(info.plus)}</div>
    </div>
    <div class="banner-box is-minus">
      <div class="banner-head-row">
        <span class="banner-label">${escapeHtml(topic.minusLabel)}の基本主張</span>
      </div>
      <div>${escapeHtml(info.minus)}</div>
    </div>
  `;

  const summaryText = state.mode === "minus" ? info.minus : info.plus;

  els.stageBanner.innerHTML = `
    <div class="stage-banner-grid">${boxesHtml}</div>
    <details class="stage-banner-accordion">
      <summary class="stage-banner-summary">
        <span>基本主張：${escapeHtml(summaryText)}</span>
      </summary>
      <div class="stage-banner-accordion-body">${boxesHtml}</div>
    </details>
  `;
}

function renderRefChips(refs, label) {
  if (!refs || refs.length === 0) return "";
  const chips = refs
    .map(
      (c) =>
        `<button type="button" class="ref-chip js-ref-btn" data-ref="${escapeHtml(c)}">±${escapeHtml(c)}</button>`
    )
    .join("");
  return `<div class="ref-row"><span>${escapeHtml(label)}:</span>${chips}</div>`;
}

function renderList() {
  const filtered = getFilteredArguments();
  if (filtered.length === 0) {
    let emptyHint = "条件に一致する論証がありません。";
    if (!state.query) {
      if (state.stages.length === 0) {
        emptyHint = state.isAdmin
          ? "この論題にはまだ主張段階がありません。上部の「+ 主張段階を追加」から最初の段階（例：1）を作成してください。"
          : "この論題にはまだ論証が登録されていません。";
      } else {
        emptyHint = state.isAdmin
          ? "この主張段階にはまだ論証がありません。上部の「+ 新規論証を追加」から追加できます。"
          : "この主張段階にはまだ論証が登録されていません。";
      }
    }
    els.argList.innerHTML = `<div class="empty-state">${emptyHint}</div>`;
    return;
  }

  const groups = new Map();
  for (const item of filtered) {
    const key = item.topic || `段階 ${item.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let html = "";
  for (const [topicHeading, items] of groups.entries()) {
    html += `<div class="topic-group"><h3 class="topic-heading">${escapeHtml(topicHeading)}</h3>`;

    for (const item of items) {
      const selectedClass = item.coord === state.selectedCoord ? "is-selected" : "";
      const bibPill =
        item.bibliography.length > 0
          ? `<span class="bib-count-pill">文献 ${item.bibliography.length}</span>`
          : "";

      if (state.mode === "split") {
        html += `
          <article class="arg-card is-split ${selectedClass}" data-coord="${escapeHtml(item.coord)}">
            <div class="card-header">
              <div class="card-title-wrap">
                <span class="coord-badge is-neutral">座標 ${escapeHtml(item.coord)}</span>
                ${bibPill}
              </div>
              <div>
                <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">+${escapeHtml(item.coord)} まとめ</button>
                <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">-${escapeHtml(item.coord)} まとめ</button>
              </div>
            </div>
            <div class="split-grid">
              <div class="split-col is-plus">
                <span class="coord-badge is-plus">+${escapeHtml(item.coord)}</span>
                <div class="split-col-title">${escapeHtml(item.plusTitle)}</div>
                <div>${escapeHtml(item.plusBody)}</div>
              </div>
              <div class="split-col is-minus">
                <span class="coord-badge is-minus">-${escapeHtml(item.coord)}</span>
                <div class="split-col-title">${escapeHtml(item.minusTitle)}</div>
                <div>${escapeHtml(item.minusBody)}</div>
              </div>
            </div>
            <div class="card-footer-row">
              ${renderRefChips(item.refs, "前提")}
              <span class="card-detail-hint">詳細・文献・コメント ›</span>
            </div>
          </article>
        `;
      } else {
        const isPlus = state.mode === "plus";
        const sign = isPlus ? "+" : "-";
        const oppSign = isPlus ? "-" : "+";
        const oppMode = isPlus ? "minus" : "plus";
        const title = isPlus ? item.plusTitle : item.minusTitle;
        const body = isPlus ? item.plusBody : item.minusBody;

        html += `
          <article class="arg-card ${isPlus ? "is-plus" : "is-minus"} ${selectedClass}" data-coord="${escapeHtml(item.coord)}">
            <div class="card-header">
              <div class="card-title-wrap">
                <span class="coord-badge ${isPlus ? "is-plus" : "is-minus"}">${sign}${escapeHtml(item.coord)}</span>
                <h4 class="card-title">${escapeHtml(title)}</h4>
                ${bibPill}
              </div>
              <button
                type="button"
                class="flip-btn js-flip-btn"
                data-coord="${escapeHtml(item.coord)}"
                data-target-mode="${oppMode}"
              >⇄ ${oppSign}${escapeHtml(item.coord)} へ反転</button>
            </div>
            <p class="card-body">${escapeHtml(body)}</p>
            <div class="card-footer-row">
              ${renderRefChips(item.refs, "前提")}
              <span class="card-detail-hint">詳細・比較・コメント ›</span>
            </div>
          </article>
        `;
      }
    }

    html += `</div>`;
  }

  els.argList.innerHTML = html;
}

function renderBibliographySection(item) {
  const listHtml =
    item.bibliography.length === 0
      ? `<p class="empty-muted">この座標に登録された参考文献はまだありません。</p>`
      : `<ul class="bib-list">${item.bibliography
          .map((b, idx) => {
            const href = safeUrl(b.url);
            return `
              <li class="bib-item">
                <div class="bib-item-head">
                  <span class="bib-citation">${escapeHtml(b.citation)}</span>
                  ${
                    state.isAdmin
                      ? `<button type="button" class="btn-xs-danger js-delete-bib" data-index="${idx}">削除</button>`
                      : ""
                  }
                </div>
                ${b.note ? `<p class="bib-note">${escapeHtml(b.note)}</p>` : ""}
                ${
                  href
                    ? `<a class="bib-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`
                    : ""
                }
              </li>`;
          })
          .join("")}</ul>`;

  const adminFormHtml = state.isAdmin
    ? `
      <form id="bib-add-form" class="mini-form">
        <input type="text" id="bib-citation" required placeholder="書誌情報（例：著者名『書名』出版年）" />
        <input type="url" id="bib-url" placeholder="参照URL（任意・https://...）" />
        <input type="text" id="bib-note" placeholder="関連箇所・メモ（任意）" />
        <button type="submit" class="btn-primary">参考文献を追加</button>
      </form>`
    : "";

  return `
    <section class="panel-section" id="detail-bib-section">
      <h3 class="panel-section-title">
        <span>参考文献（座標 ${escapeHtml(item.coord)}）</span>
        <span class="bib-count-pill">${item.bibliography.length}件</span>
      </h3>
      ${listHtml}
      ${adminFormHtml}
    </section>
  `;
}

function renderCommentsSection(item) {
  const topic = getCurrentTopic();
  const stanceLabelMap = {
    both: { text: "座標全体", cls: "is-both" },
    plus: { text: `+${item.coord} へ`, cls: "is-plus" },
    minus: { text: `-${item.coord} へ`, cls: "is-minus" }
  };

  let bodyHtml = "";
  if (!db) {
    bodyHtml = `<p class="empty-muted">Firebase を設定すると、閲覧者コメント機能が有効になります。</p>`;
  } else if (state.commentsLoading) {
    bodyHtml = `<p class="empty-muted">コメントを読み込み中...</p>`;
  } else if (state.comments.length === 0) {
    bodyHtml = `<p class="empty-muted">この座標へのコメントはまだありません。</p>`;
  } else {
    bodyHtml = `<ul class="comment-list">${state.comments
      .map((c) => {
        const st = stanceLabelMap[c.stance] || stanceLabelMap.both;
        return `
          <li class="comment-item">
            <div class="comment-meta">
              <div>
                <span class="comment-stance ${st.cls}">${escapeHtml(st.text)}</span>
                <span class="comment-author">${escapeHtml(c.author || "匿名")}</span>
                <span>・${escapeHtml(formatDate(c.createdAt))}</span>
              </div>
              ${
                state.isAdmin
                  ? `<button type="button" class="btn-xs-danger js-delete-comment" data-id="${escapeHtml(c.id)}">削除</button>`
                  : ""
              }
            </div>
            <p class="comment-body">${escapeHtml(c.body)}</p>
          </li>`;
      })
      .join("")}</ul>`;
  }

  const formHtml = db
    ? `
      <form id="comment-add-form" class="mini-form">
        <div class="form-grid-2">
          <input type="text" id="comment-author" maxlength="40" placeholder="お名前（空欄で匿名）" />
          <select id="comment-stance">
            <option value="both">座標 ${escapeHtml(item.coord)} 全体へのコメント</option>
            <option value="plus">+${escapeHtml(item.coord)}（${escapeHtml(topic.plusLabel)}）へのコメント</option>
            <option value="minus">-${escapeHtml(item.coord)}（${escapeHtml(topic.minusLabel)}）へのコメント</option>
          </select>
        </div>
        <textarea id="comment-body" rows="3" maxlength="1000" required placeholder="この論点に対する補足・反論・疑問などを記入（最大1000文字）"></textarea>
        <button type="submit" class="btn-primary">コメントを投稿</button>
      </form>`
    : "";

  return `
    <section class="panel-section" id="detail-comments-section">
      <h3 class="panel-section-title">
        <span>閲覧者コメント（座標 ${escapeHtml(item.coord)}）</span>
        <span class="bib-count-pill">${state.comments.length}件</span>
      </h3>
      ${bodyHtml}
      ${formHtml}
    </section>
  `;
}

function renderComparePanel() {
  const item = findArg(state.selectedCoord) || state.arguments[0];
  if (!item) {
    els.comparePanel.innerHTML = `<p class="empty-muted">この論題にはまだ表示する論証がありません。</p>`;
    return;
  }

  const topic = getCurrentTopic();
  const backRefs = referencedByMap.get(item.coord) || [];
  const listForPager = getFilteredArguments();
  const currentIdx = listForPager.findIndex((a) => a.coord === item.coord);
  const prevItem = currentIdx > 0 ? listForPager[currentIdx - 1] : null;
  const nextItem =
    currentIdx >= 0 && currentIdx < listForPager.length - 1 ? listForPager[currentIdx + 1] : null;

  els.comparePanel.innerHTML = `
    <div class="detail-topbar">
      <div class="detail-topbar-left">
        <button type="button" class="detail-back-btn js-close-detail">← 一覧</button>
        <span class="coord-badge is-neutral">座標 ${escapeHtml(item.coord)}</span>
      </div>
      <div class="detail-topbar-right">
        <button type="button" class="detail-quick-btn js-scroll-comments">💬 コメント (${state.comments.length})</button>
        ${
          state.isAdmin
            ? `<button type="button" class="admin-action-btn js-edit-arg" data-coord="${escapeHtml(item.coord)}">編集</button>`
            : ""
        }
      </div>
    </div>

    <div class="detail-body">
      <div class="compare-head">
        <h2>座標 ${escapeHtml(item.coord)} の対照比較</h2>
        <div class="compare-head-actions">
          <span class="coord-badge is-neutral">段階 ${escapeHtml(item.stage)}</span>
          <button type="button" class="flip-btn js-expand-detail" data-coord="${escapeHtml(item.coord)}">⤢ 拡大</button>
          ${
            state.isAdmin
              ? `<button type="button" class="admin-action-btn js-edit-arg" data-coord="${escapeHtml(item.coord)}">編集</button>`
              : ""
          }
        </div>
      </div>
      <div class="compare-topic">${escapeHtml(item.topic)}</div>

      <div class="compare-box is-plus">
        <div class="compare-box-head">
          <span class="coord-badge is-plus">+${escapeHtml(item.coord)} ${escapeHtml(topic.plusLabel)}</span>
          <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">一覧で表示</button>
        </div>
        <h3>${escapeHtml(item.plusTitle)}</h3>
        <p>${escapeHtml(item.plusBody)}</p>
      </div>

      <div class="compare-box is-minus">
        <div class="compare-box-head">
          <span class="coord-badge is-minus">-${escapeHtml(item.coord)} ${escapeHtml(topic.minusLabel)}</span>
          <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">一覧で表示</button>
        </div>
        <h3>${escapeHtml(item.minusTitle)}</h3>
        <p>${escapeHtml(item.minusBody)}</p>
      </div>

      ${renderRefChips(item.refs, "この論証が参照する前提")}
      ${renderRefChips(backRefs, "この論証を参照している論証")}
      ${renderBibliographySection(item)}
      ${renderCommentsSection(item)}

      <div class="detail-pager">
        <button
          type="button"
          class="pager-btn js-pager-nav"
          data-coord="${prevItem ? escapeHtml(prevItem.coord) : ""}"
          ${prevItem ? "" : "disabled"}
        >${prevItem ? `← 前の座標 (${escapeHtml(prevItem.coord)})` : "← 前の座標なし"}</button>
        <button
          type="button"
          class="pager-btn js-pager-nav"
          data-coord="${nextItem ? escapeHtml(nextItem.coord) : ""}"
          ${nextItem ? "" : "disabled"}
        >${nextItem ? `次の座標 (${escapeHtml(nextItem.coord)}) →` : "次の座標なし →"}</button>
      </div>
    </div>
  `;
}

function renderAll() {
  applyDetailBodyClass();
  renderTopicBar();
  renderAdminBar();
  renderTabs();
  renderModeButtons();
  renderStageBanner();
  renderList();
  renderComparePanel();
  syncUrlHash();
}

// === 7. ナビゲーション操作 ===
function selectCoord(coord, { reloadComments = true } = {}) {
  const changed = state.selectedCoord !== coord;
  state.selectedCoord = coord;
  renderList();
  renderComparePanel();
  syncUrlHash();
  if (reloadComments && changed) {
    loadCommentsForCoord(coord);
  }
}

function jumpTo(coord, targetMode, { closeDetail = false } = {}) {
  const item = findArg(coord);
  if (!item) return;

  state.history.push({
    stage: state.stage,
    mode: state.mode,
    coord: state.selectedCoord
  });

  if (state.stage !== "all" && item.stage !== state.stage) {
    state.stage = item.stage;
  }
  if (targetMode) {
    state.mode = targetMode;
  }

  if (state.query) {
    state.query = "";
    els.searchInput.value = "";
  }

  if (closeDetail && state.detailOpen) {
    state.detailOpen = false;
    state.pushedDetailHistory = false;
    applyDetailBodyClass();
  }

  const coordChanged = state.selectedCoord !== coord;
  state.selectedCoord = coord;

  renderAll();
  if (state.detailOpen) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    focusCard(coord);
  }
  if (coordChanged) {
    loadCommentsForCoord(coord);
  }
}

function goBack() {
  const prev = state.history.pop();
  if (!prev) return;

  const coordChanged = state.selectedCoord !== prev.coord;
  state.stage = prev.stage;
  state.mode = prev.mode;
  state.selectedCoord = prev.coord;

  if (state.query) {
    state.query = "";
    els.searchInput.value = "";
  }

  renderAll();
  focusCard(prev.coord);
  if (coordChanged) {
    loadCommentsForCoord(prev.coord);
  }
}

// === 8. 管理者モーダル操作 ===
function openTopicDialog(topicId = null) {
  els.topicError.hidden = true;
  state.editingTopicId = topicId;

  if (topicId) {
    const info = findTopic(topicId);
    if (!info) return;
    els.topicDialogTitle.textContent = "現在の論題を編集";
    els.topicId.value = info.id;
    els.topicId.readOnly = true;
    els.topicTitle.value = info.title;
    els.topicSubtitle.value = info.subtitle;
    els.topicPlusLabel.value = info.plusLabel;
    els.topicMinusLabel.value = info.minusLabel;
    els.topicDeleteBtn.hidden = false;
  } else {
    els.topicDialogTitle.textContent = "新しい論題を追加";
    els.topicForm.reset();
    els.topicId.readOnly = false;
    els.topicPlusLabel.value = "肯定側";
    els.topicMinusLabel.value = "反論側";
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
    els.argDialogTitle.textContent = `座標 ${coord} の論証を編集`;
    els.argCoord.value = item.coord;
    els.argCoord.readOnly = true;
    els.argTopic.value = item.topic;
    els.argPlusTitle.value = item.plusTitle;
    els.argPlusBody.value = item.plusBody;
    els.argMinusTitle.value = item.minusTitle;
    els.argMinusBody.value = item.minusBody;
    els.argRefs.value = item.refs.join(", ");
    els.argDeleteBtn.hidden = false;
  } else {
    const defaultStage = state.stage === "all" ? state.stages[0]?.id || "" : state.stage;
    els.argDialogTitle.textContent = "新しい座標の論証を追加";
    els.argForm.reset();
    populateStageSelect(defaultStage);
    els.argCoord.readOnly = false;
    els.argDeleteBtn.hidden = true;
  }

  els.argDialog.showModal();
}

function suggestNextStageId() {
  const nums = state.stages
    .map((s) => Number(s.id))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return nums.length > 0 ? String(Math.max(...nums) + 1) : "1";
}

function openStageDialog(stageId = null) {
  const topic = getCurrentTopic();
  els.stageError.hidden = true;
  els.stagePlusLabelText.textContent = `${topic.plusLabel}の基本主張 (+N)`;
  els.stageMinusLabelText.textContent = `${topic.minusLabel}の基本主張 (-N)`;
  state.editingStageId = stageId;

  if (stageId) {
    const info = findStage(stageId);
    if (!info) return;
    els.stageDialogTitle.textContent = `主張段階 ${stageId} を編集`;
    els.stageId.value = info.id;
    els.stageId.readOnly = true;
    els.stageLabel.value = info.label;
    els.stagePlus.value = info.plus;
    els.stageMinus.value = info.minus;
    els.stageDeleteBtn.hidden = false;
  } else {
    const nextId = suggestNextStageId();
    els.stageDialogTitle.textContent = "新しい主張段階を追加";
    els.stageForm.reset();
    els.stageId.readOnly = false;
    els.stageId.value = nextId;
    els.stageLabel.placeholder = `${nextId}. 新しい主張段階の名称`;
    els.stagePlus.placeholder = `(+${nextId}) ${topic.plusLabel}の基本主張を記入`;
    els.stageMinus.placeholder = `(-${nextId}) ${topic.minusLabel}の基本主張を記入`;
    els.stageDeleteBtn.hidden = true;
  }

  els.stageDialog.showModal();
}

// === 9. イベント登録 ===
window.addEventListener("popstate", () => {
  if (state.detailOpen) {
    closeDetailView({ restoreScroll: true });
  }
});

document.querySelectorAll(".js-close-dialog").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.closest("dialog")?.close();
  });
});

els.topicSelect.addEventListener("change", (e) => {
  switchTopic(e.target.value);
});

els.editTopicBtn.addEventListener("click", () => openTopicDialog(state.currentTopicId));
els.addTopicBtn.addEventListener("click", () => openTopicDialog(null));

els.loginOpenBtn.addEventListener("click", () => {
  els.loginError.hidden = true;
  els.loginForm.reset();
  els.loginDialog.showModal();
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!auth) return;
  els.loginError.hidden = true;
  try {
    await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value);
    els.loginDialog.close();
  } catch (err) {
    console.error(err);
    els.loginError.textContent = "メールアドレスまたはパスワードが正しくありません。";
    els.loginError.hidden = false;
  }
});

els.logoutBtn.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth);
});

els.addStageBtn.addEventListener("click", () => openStageDialog(null));
els.inlineAddStageBtn.addEventListener("click", () => openStageDialog(null));
els.addArgBtn.addEventListener("click", () => openArgDialog(null));
els.seedDbBtn.addEventListener("click", seedInitialDataToFirestore);

// 論題の保存
els.topicForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;

  const id = els.topicId.value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    els.topicError.textContent = "論題IDには半角英数字・ハイフン（-）・アンダースコア（_）のみ使えます。";
    els.topicError.hidden = false;
    return;
  }

  const isCreating = !state.editingTopicId;
  if (isCreating && findTopic(id)) {
    els.topicError.textContent = `論題ID「${id}」はすでに使われています。別のIDを指定してください。`;
    els.topicError.hidden = false;
    return;
  }

  const existing = findTopic(id);
  const maxOrder = state.topics.reduce((m, t) => Math.max(m, t.order || 0), 0);

  const payload = {
    id,
    title: els.topicTitle.value.trim(),
    subtitle: els.topicSubtitle.value.trim(),
    plusLabel: els.topicPlusLabel.value.trim() || "肯定側",
    minusLabel: els.topicMinusLabel.value.trim() || "反論側",
    order: existing ? existing.order : maxOrder + 1,
    useLegacyRoot: existing ? existing.useLegacyRoot : false,
    updatedAt: serverTimestamp()
  };

  try {
    await ensureTopicsSeededInDb();
    await setDoc(doc(db, "topics", id), payload);
    els.topicDialog.close();
    await loadTopics();

    if (isCreating) {
      await switchTopic(id);
    } else {
      renderAll();
    }
  } catch (err) {
    console.error(err);
    els.topicError.textContent = "保存に失敗しました。Firestoreのルール（topics）を確認してください。";
    els.topicError.hidden = false;
  }
});

// 論題の削除
els.topicDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingTopicId) return;
  const targetId = state.editingTopicId;

  if (state.topics.length <= 1) {
    els.topicError.textContent = "最後の1件の論題は削除できません。";
    els.topicError.hidden = false;
    return;
  }

  if (state.arguments.length > 0) {
    els.topicError.textContent = `この論題には ${state.arguments.length} 件の論証が残っています。誤削除を防ぐため、先に論証を削除してください。`;
    els.topicError.hidden = false;
    return;
  }

  if (!confirm(`論題「${findTopic(targetId)?.title || targetId}」を削除しますか？この操作は元に戻せません。`)) {
    return;
  }

  try {
    await ensureTopicsSeededInDb();
    // 新規論題に空の主張段階が残っていれば一緒に削除する
    if (!isLegacyTopic(targetId)) {
      for (const st of state.stages) {
        await deleteDoc(stageDoc(st.id, targetId));
      }
    }
    await deleteDoc(doc(db, "topics", targetId));
    els.topicDialog.close();
    await loadTopics();
    const nextTopicId = state.topics[0]?.id || DEFAULT_TOPIC.id;
    await switchTopic(nextTopicId);
  } catch (err) {
    console.error(err);
    els.topicError.textContent = "削除に失敗しました。";
    els.topicError.hidden = false;
  }
});

// 主張段階の保存
els.stageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;

  const id = els.stageId.value.trim();
  if (!id || id === "all" || id.includes("/")) {
    els.stageError.textContent = "段階番号に「all」やスラッシュ（/）は使えません。";
    els.stageError.hidden = false;
    return;
  }

  if (!state.editingStageId && findStage(id)) {
    els.stageError.textContent = `主張段階 ${id} はすでに存在します。既存の段階を編集してください。`;
    els.stageError.hidden = false;
    return;
  }

  const payload = {
    id,
    label: els.stageLabel.value.trim(),
    plus: els.stagePlus.value.trim(),
    minus: els.stageMinus.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    await ensureStagesSeededInDb();
    await setDoc(stageDoc(id), payload);
    els.stageDialog.close();
    await loadStages();

    if (els.argDialog.open) {
      populateStageSelect(id);
    } else {
      state.stage = id;
    }
    renderAll();
  } catch (err) {
    console.error(err);
    els.stageError.textContent = "保存に失敗しました。Firestoreのルール（stages）を確認してください。";
    els.stageError.hidden = false;
  }
});

// 主張段階の削除
els.stageDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingStageId) return;
  const targetId = state.editingStageId;
  const linkedCount = state.arguments.filter((a) => a.stage === targetId).length;

  if (linkedCount > 0) {
    els.stageError.textContent = `この段階には ${linkedCount} 件の論証が紐づいています。先にそれらの論証の段階を変更または削除してください。`;
    els.stageError.hidden = false;
    return;
  }

  if (!confirm(`主張段階 ${targetId} を削除しますか？この操作は元に戻せません。`)) return;

  try {
    await ensureStagesSeededInDb();
    await deleteDoc(stageDoc(targetId));
    els.stageDialog.close();
    await loadStages();
    if (state.stage === targetId) {
      state.stage = state.stages[0]?.id || "all";
    }
    renderAll();
  } catch (err) {
    console.error(err);
    els.stageError.textContent = "削除に失敗しました。";
    els.stageError.hidden = false;
  }
});

// 論証の保存
els.argForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;

  const coord = els.argCoord.value.trim();
  const stageVal = String(els.argStage.value).trim();

  if (!stageVal) {
    els.argError.textContent = "先に「+ 段階を新規追加」から主張段階を1つ作成してください。";
    els.argError.hidden = false;
    return;
  }

  if (!coord || coord.includes("/")) {
    els.argError.textContent = "座標にスラッシュ（/）は使えません。";
    els.argError.hidden = false;
    return;
  }

  if (!state.editingCoord && findArg(coord)) {
    els.argError.textContent = `座標 ${coord} はすでに存在します。既存の座標を編集してください。`;
    els.argError.hidden = false;
    return;
  }

  const existing = findArg(coord);
  const refs = els.argRefs.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    coord,
    stage: stageVal,
    topic: els.argTopic.value.trim(),
    plusTitle: els.argPlusTitle.value.trim(),
    plusBody: els.argPlusBody.value.trim(),
    minusTitle: els.argMinusTitle.value.trim(),
    minusBody: els.argMinusBody.value.trim(),
    refs,
    bibliography: existing ? existing.bibliography : [],
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(argumentDoc(coord), payload);
    els.argDialog.close();
    await loadArguments();
    state.stage = payload.stage;
    state.selectedCoord = coord;
    renderAll();
    loadCommentsForCoord(coord);
    focusCard(coord);
  } catch (err) {
    console.error(err);
    els.argError.textContent = "保存に失敗しました。管理者UIDとFirestoreルールを確認してください。";
    els.argError.hidden = false;
  }
});

// 論証の削除
els.argDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingCoord) return;
  const target = state.editingCoord;
  if (!confirm(`座標 ${target} の論証を削除しますか？この操作は元に戻せません。`)) return;

  try {
    await deleteDoc(argumentDoc(target));
    els.argDialog.close();
    await loadArguments();
    state.selectedCoord = state.arguments[0]?.coord || "";
    if (state.detailOpen) {
      closeDetailView({ restoreScroll: false });
    } else {
      renderAll();
    }
    loadCommentsForCoord(state.selectedCoord);
  } catch (err) {
    console.error(err);
    els.argError.textContent = "削除に失敗しました。";
    els.argError.hidden = false;
  }
});

els.stageTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  state.stage = btn.dataset.stage;

  const current = findArg(state.selectedCoord);
  if (state.stage !== "all" && (!current || current.stage !== state.stage)) {
    const firstInStage = state.arguments.find((a) => a.stage === state.stage);
    if (firstInStage) {
      state.selectedCoord = firstInStage.coord;
      loadCommentsForCoord(firstInStage.coord);
    }
  }
  renderAll();
});

els.stageBanner.addEventListener("click", (e) => {
  const editStageBtn = e.target.closest(".js-edit-stage");
  if (editStageBtn) {
    openStageDialog(editStageBtn.dataset.stageId);
  }
});

els.modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    renderAll();
  });
});

els.searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  renderList();
});

els.backBtn.addEventListener("click", goBack);

els.argList.addEventListener("click", (e) => {
  const flipBtn = e.target.closest(".js-flip-btn, .js-jump-mode");
  if (flipBtn) {
    e.stopPropagation();
    jumpTo(flipBtn.dataset.coord, flipBtn.dataset.targetMode);
    return;
  }

  const refBtn = e.target.closest(".js-ref-btn");
  if (refBtn) {
    e.stopPropagation();
    jumpTo(refBtn.dataset.ref, null);
    return;
  }

  const card = e.target.closest(".arg-card");
  if (card) {
    if (isMobileViewport()) {
      openDetailView(card.dataset.coord);
    } else {
      selectCoord(card.dataset.coord);
    }
  }
});

els.comparePanel.addEventListener("click", async (e) => {
  if (e.target.closest(".js-close-detail")) {
    requestCloseDetailView();
    return;
  }

  const expandBtn = e.target.closest(".js-expand-detail");
  if (expandBtn) {
    openDetailView(expandBtn.dataset.coord);
    return;
  }

  if (e.target.closest(".js-scroll-comments")) {
    const target = document.getElementById("detail-comments-section");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  const pagerBtn = e.target.closest(".js-pager-nav");
  if (pagerBtn && pagerBtn.dataset.coord) {
    openDetailView(pagerBtn.dataset.coord, { pushBrowserHistory: false });
    return;
  }

  const editBtn = e.target.closest(".js-edit-arg");
  if (editBtn) {
    openArgDialog(editBtn.dataset.coord);
    return;
  }

  const jumpBtn = e.target.closest(".js-jump-mode");
  if (jumpBtn) {
    jumpTo(jumpBtn.dataset.coord, jumpBtn.dataset.targetMode, { closeDetail: true });
    return;
  }

  const refBtn = e.target.closest(".js-ref-btn");
  if (refBtn) {
    if (state.detailOpen) {
      openDetailView(refBtn.dataset.ref, { pushBrowserHistory: false });
    } else {
      jumpTo(refBtn.dataset.ref, null);
    }
    return;
  }

  const delBibBtn = e.target.closest(".js-delete-bib");
  if (delBibBtn && db && state.isAdmin) {
    const item = findArg(state.selectedCoord);
    if (!item) return;
    const idx = Number(delBibBtn.dataset.index);
    const nextBib = item.bibliography.filter((_, i) => i !== idx);
    try {
      await setDoc(argumentDoc(item.coord), {
        ...item,
        bibliography: nextBib,
        updatedAt: serverTimestamp()
      });
      item.bibliography = nextBib;
      renderList();
      renderComparePanel();
    } catch (err) {
      console.error(err);
      alert("参考文献の削除に失敗しました。");
    }
    return;
  }

  const delCommentBtn = e.target.closest(".js-delete-comment");
  if (delCommentBtn && db && state.isAdmin) {
    if (!confirm("このコメントを削除しますか？")) return;
    try {
      await deleteDoc(commentDoc(delCommentBtn.dataset.id));
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) {
      console.error(err);
      alert("コメントの削除に失敗しました。");
    }
  }
});

els.comparePanel.addEventListener("submit", async (e) => {
  if (e.target.id === "bib-add-form") {
    e.preventDefault();
    if (!db || !state.isAdmin) return;
    const item = findArg(state.selectedCoord);
    if (!item) return;

    const citation = document.getElementById("bib-citation").value.trim();
    const url = document.getElementById("bib-url").value.trim();
    const note = document.getElementById("bib-note").value.trim();
    if (!citation) return;

    const nextBib = [...item.bibliography, { citation, url, note }];
    try {
      await setDoc(argumentDoc(item.coord), {
        ...item,
        bibliography: nextBib,
        updatedAt: serverTimestamp()
      });
      item.bibliography = nextBib;
      renderList();
      renderComparePanel();
    } catch (err) {
      console.error(err);
      alert("参考文献の追加に失敗しました。");
    }
    return;
  }

  if (e.target.id === "comment-add-form") {
    e.preventDefault();
    if (!db || !state.selectedCoord) return;

    const authorInput = document.getElementById("comment-author");
    const stanceInput = document.getElementById("comment-stance");
    const bodyInput = document.getElementById("comment-body");
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const body = bodyInput.value.trim();
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";

    try {
      await addDoc(commentsCollection(), {
        coord: state.selectedCoord,
        stance: stanceInput.value,
        author: authorInput.value.trim() || "匿名",
        body,
        createdAt: serverTimestamp()
      });
      bodyInput.value = "";
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) {
      console.error(err);
      alert("コメントの投稿に失敗しました。文字数（1000文字以内）や通信状況を確認してください。");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "コメントを投稿";
    }
  }
});

// === 10. 初期化 ===
async function init() {
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      state.isAdmin = Boolean(user && user.uid === ADMIN_UID);
      renderAdminBar();
      renderStageBanner();
      renderList();
      renderComparePanel();
    });
  }

  await loadTopics();

  const { topicId, coordToken } = parseUrlHashTokens();
  if (topicId && findTopic(topicId)) {
    state.currentTopicId = topicId;
  } else {
    state.currentTopicId = state.topics[0]?.id || DEFAULT_TOPIC.id;
  }

  await Promise.all([loadStages(), loadArguments()]);

  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  state.selectedCoord = state.arguments[0]?.coord || "";

  const matchedCoord = applyCoordToken(coordToken);
  if (matchedCoord && isMobileViewport()) {
    state.detailOpen = true;
  }

  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}

init();