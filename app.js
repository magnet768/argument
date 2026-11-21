import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

const DEFAULT_STAGES_OBJ = typeof STAGES !== "undefined" ? STAGES : {};
const DEFAULT_ARGUMENTS = typeof ARGUMENTS !== "undefined" ? ARGUMENTS : [];

const DEFAULT_TOPIC = {
  id: "antinatalism",
  title: "反出生主義と反論：細分化論証エクスプローラー",
  plusLabel: "肯定側",
  minusLabel: "反論側",
  order: 1,
  useLegacyRoot: true
};

const DEFAULT_PROFILE = {
  name: "",
  role: "",
  bio: "",
  interests: [],
  links: [],
  contact: ""
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
  page: "explorer",
  drawerOpen: false,
  profile: { ...DEFAULT_PROFILE },
  adminComments: [],
  adminCommentsLoading: false,
  editingAdminCommentId: null,
  topics: [],
  topicsInDb: false,
  currentTopicId: DEFAULT_TOPIC.id,
  stages: [],
  stagesInDb: false,
  arguments: [],
  stage: "1",
  mode: "plus",
  selectedCoord: "",
  query: "",
  history: [],
  currentUid: null,
  isAdmin: false,
  comments: [],
  commentsLoading: false,
  editingCommentId: null,
  editingTopicId: null,
  editingCoord: null,
  editingStageId: null,
  detailOpen: false,
  savedListScrollY: 0,
  pushedDetailHistory: false
};

let referencedByMap = new Map();

const els = {
  menuOpenBtn: document.getElementById("menu-open-btn"),
  menuCloseBtn: document.getElementById("menu-close-btn"),
  navDrawer: document.getElementById("nav-drawer"),
  navBackdrop: document.getElementById("nav-backdrop"),
  drawerNavButtons: document.querySelectorAll(".drawer-nav-btn"),
  drawerAdminStatus: document.getElementById("drawer-admin-status"),

  topTopicControls: document.getElementById("top-topic-controls"),
  topPageLabel: document.getElementById("top-page-label"),

  explorerHeaderPanel: document.getElementById("explorer-header-panel"),
  explorerAdminBar: document.getElementById("explorer-admin-bar"),
  explorerView: document.getElementById("explorer-view"),
  guideView: document.getElementById("guide-view"),
  profileView: document.getElementById("profile-view"),
  profileContent: document.getElementById("profile-content"),

  topicSelect: document.getElementById("topic-select"),
  editTopicBtn: document.getElementById("edit-topic-btn"),
  addTopicBtn: document.getElementById("add-topic-btn"),

  stageTabs: document.getElementById("stage-tabs"),
  stageBanner: document.getElementById("stage-banner"),
  argList: document.getElementById("argument-list"),
  comparePanel: document.getElementById("compare-panel"),
  searchInput: document.getElementById("search-input"),
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

  profileDialog: document.getElementById("profile-dialog"),
  profileForm: document.getElementById("profile-form"),
  profileName: document.getElementById("profile-name"),
  profileRole: document.getElementById("profile-role"),
  profileBio: document.getElementById("profile-bio"),
  profileInterests: document.getElementById("profile-interests"),
  profileLinks: document.getElementById("profile-links"),
  profileContact: document.getElementById("profile-contact"),
  profileError: document.getElementById("profile-error"),

  topicDialog: document.getElementById("topic-dialog"),
  topicDialogTitle: document.getElementById("topic-dialog-title"),
  topicForm: document.getElementById("topic-form"),
  topicId: document.getElementById("topic-id"),
  topicTitle: document.getElementById("topic-title"),
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

function normalizeProfile(raw = {}) {
  return {
    name: String(raw.name ?? "").trim(),
    role: String(raw.role ?? "").trim(),
    bio: String(raw.bio ?? "").trim(),
    interests: Array.isArray(raw.interests) ? raw.interests.filter(Boolean) : [],
    links: Array.isArray(raw.links)
      ? raw.links
          .filter((l) => l && safeUrl(l.url))
          .map((l) => ({ label: String(l.label ?? l.url).trim(), url: safeUrl(l.url) }))
      : [],
    contact: String(raw.contact ?? "").trim()
  };
}

function normalizeTopic(raw) {
  const id = String(raw.id).trim();
  return {
    id,
    title: String(raw.title ?? id).trim(),
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
  for (const item of state.arguments) referencedByMap.set(item.coord, []);
  for (const item of state.arguments) {
    for (const refCoord of item.refs) {
      if (referencedByMap.has(refCoord)) referencedByMap.get(refCoord).push(item.coord);
    }
  }
}

function findStage(id) {
  return state.stages.find((s) => s.id === String(id));
}

function findArg(coord) {
  return state.arguments.find((a) => a.coord === coord);
}

function isCommentOwner(comment) {
  return Boolean(state.currentUid && comment && comment.authorUid && comment.authorUid === state.currentUid);
}

function showNotice(message) {
  els.statusNotice.hidden = !message;
  els.statusNotice.textContent = message || "";
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
  if (state.page === "guide") return "#guide";
  if (state.page === "profile") return "#profile";
  const topicId = state.currentTopicId;
  if (!topicId) return "";
  if (!state.selectedCoord) return `#${encodeURIComponent(topicId)}`;
  const prefix = state.mode === "plus" ? "+" : state.mode === "minus" ? "-" : "";
  return `#${encodeURIComponent(topicId)}/${prefix}${state.selectedCoord}`;
}

function syncUrlHash() {
  const hash = getCurrentHash();
  if (!hash) return;
  try {
    history.replaceState(history.state, "", hash);
  } catch {}
}

function parseUrlHashTokens() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (!raw) return { page: "explorer", topicId: null, coordToken: "" };
  if (raw === "guide") return { page: "guide", topicId: null, coordToken: "" };
  if (raw === "profile") return { page: "profile", topicId: null, coordToken: "" };
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

// === 4. スライドメニュー・ページ切替・詳細ページ開閉 ===
function openNavDrawer() {
  state.drawerOpen = true;
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

function applyDetailBodyClass() {
  document.body.classList.toggle("is-detail-view", state.page === "explorer" && state.detailOpen);
}

function switchPage(nextPage) {
  if (!["explorer", "guide", "profile"].includes(nextPage)) return;
  closeNavDrawer();
  state.page = nextPage;
  state.editingCommentId = null;
  state.editingAdminCommentId = null;
  if (nextPage !== "explorer" && state.detailOpen) {
    state.detailOpen = false;
    state.pushedDetailHistory = false;
  }
  renderAll();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (nextPage === "profile") loadAdminComments();
}

function openDetailView(coord, { pushBrowserHistory = true } = {}) {
  const item = findArg(coord);
  if (!item) return;
  const wasOpen = state.detailOpen;
  if (!wasOpen) state.savedListScrollY = window.scrollY;

  const coordChanged = state.selectedCoord !== coord;
  state.page = "explorer";
  state.selectedCoord = coord;
  state.editingCommentId = null;
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
  if (coordChanged || !wasOpen) loadCommentsForCoord(coord);
}

function closeDetailView({ restoreScroll = true } = {}) {
  if (!state.detailOpen) return;
  state.detailOpen = false;
  state.pushedDetailHistory = false;
  state.editingCommentId = null;
  applyDetailBodyClass();
  renderAll();
  if (restoreScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: state.savedListScrollY, behavior: "instant" }));
  }
}

function requestCloseDetailView() {
  if (state.pushedDetailHistory) history.back();
  else closeDetailView({ restoreScroll: true });
}

// === 5. Firestore データ操作 ===
async function ensureSignedInUid() {
  if (!auth) return null;
  if (auth.currentUser) {
    state.currentUid = auth.currentUser.uid;
    return auth.currentUser.uid;
  }
  const cred = await signInAnonymously(auth);
  state.currentUid = cred.user.uid;
  return cred.user.uid;
}

async function loadProfile() {
  if (!db) {
    state.profile = { ...DEFAULT_PROFILE };
    return;
  }
  try {
    const snap = await getDoc(doc(db, "siteMeta", "profile"));
    state.profile = snap.exists() ? normalizeProfile(snap.data()) : { ...DEFAULT_PROFILE };
  } catch (err) {
    console.error(err);
    state.profile = { ...DEFAULT_PROFILE };
  }
}

async function loadAdminComments() {
  if (!db) {
    state.adminComments = [];
    state.adminCommentsLoading = false;
    renderProfilePage();
    return;
  }
  state.adminCommentsLoading = true;
  renderProfilePage();
  try {
    const snap = await getDocs(collection(db, "adminComments"));
    const list = [];
    snap.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    state.adminComments = list;
  } catch (err) {
    console.error(err);
    state.adminComments = [];
  } finally {
    state.adminCommentsLoading = false;
    renderProfilePage();
  }
}

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
      snap.forEach((docSnap) => rows.push(normalizeTopic({ id: docSnap.id, ...docSnap.data() })));
      state.topics = rows.sort((a, b) => a.order - b.order || compareNatural(a.id, b.id));
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
  await setDoc(doc(db, "topics", DEFAULT_TOPIC.id), { ...DEFAULT_TOPIC, updatedAt: serverTimestamp() });
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
      snap.forEach((docSnap) => rows.push(normalizeStage({ id: docSnap.id, ...docSnap.data() })));
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
  for (const st of getDefaultStagesList()) {
    await setDoc(stageDoc(st.id), { ...st, updatedAt: serverTimestamp() });
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
        state.arguments = DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord));
        showNotice("データベースに命題が未登録です。左上のメニューから管理者ログイン後、「初期データをDBへ投入」を押すと初期データが登録されます。");
      } else {
        state.arguments = [];
        showNotice("");
      }
      rebuildReferencedByMap();
    } else {
      const rows = [];
      snap.forEach((docSnap) => rows.push(normalizeArg({ coord: docSnap.id, ...docSnap.data() })));
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
    state.editingCommentId = null;
    renderComparePanel();
    return;
  }
  const targetTopicId = state.currentTopicId;
  state.commentsLoading = true;
  state.editingCommentId = null;
  renderComparePanel();
  try {
    const q = query(commentsCollection(targetTopicId), where("coord", "==", coord));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
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
  state.editingCommentId = null;
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
  if (!confirm(`data.js の初期データ（水準 ${defaultStages.length}件・命題 ${DEFAULT_ARGUMENTS.length}件）をデータベースへ書き込みますか？（同じ番号・座標が存在する場合は上書きされます）`)) {
    return;
  }
  els.seedDbBtn.disabled = true;
  els.seedDbBtn.textContent = "投入中...";
  try {
    await ensureTopicsSeededInDb();
    for (const st of defaultStages) {
      await setDoc(stageDoc(st.id), { ...st, updatedAt: serverTimestamp() });
    }
    for (const raw of DEFAULT_ARGUMENTS) {
      const item = normalizeArg(raw);
      await setDoc(argumentDoc(item.coord), { ...item, updatedAt: serverTimestamp() });
    }
    await Promise.all([loadTopics(), loadStages(), loadArguments()]);
    renderAll();
    alert("初期データ（論題・水準・命題）の投入が完了しました。");
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
    if (state.stage !== "all" && item.stage !== state.stage) return false;
    if (!q) return true;
    const bibText = item.bibliography.map((b) => `${b.citation} ${b.note}`).join(" ");
    return [
      item.coord, `+${item.coord}`, `-${item.coord}`, item.topic,
      item.plusTitle, item.plusBody, item.minusTitle, item.minusBody, bibText
    ].join(" ").toLowerCase().includes(q);
  });
}

function populateStageSelect(selectedId) {
  if (state.stages.length === 0) {
    els.argStage.innerHTML = `<option value="">（先に「+ 水準を新規追加」してください）</option>`;
    return;
  }
  els.argStage.innerHTML = state.stages
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`)
    .join("");
  els.argStage.value = selectedId && findStage(selectedId) ? String(selectedId) : state.stages[0].id;
}

function renderPageVisibility() {
  const isExplorer = state.page === "explorer";
  const isGuide = state.page === "guide";
  const isProfile = state.page === "profile";

  els.drawerNavButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.page === state.page));
  els.topTopicControls.hidden = !isExplorer;
  els.topPageLabel.hidden = isExplorer;
  if (isGuide) els.topPageLabel.textContent = "このサイトの使い方";
  else if (isProfile) els.topPageLabel.textContent = "管理者プロフィール";

  els.explorerHeaderPanel.hidden = !isExplorer;
  els.explorerView.hidden = !isExplorer;
  els.guideView.hidden = !isGuide;
  els.profileView.hidden = !isProfile;

  const topic = getCurrentTopic();
  document.title = isGuide ? `使い方 | ${topic.title}` : isProfile ? `プロフィール | ${topic.title}` : topic.title;
}

function renderAdminCommentsSection() {
  const catMap = {
    bibliography: { text: "参考文献の修正提案", cls: "is-bibliography" },
    correction: { text: "命題・論証の修正提案", cls: "is-correction" },
    other: { text: "サイト全体へのご意見・その他", cls: "is-other" }
  };

  let bodyHtml = "";
  if (!db) {
    bodyHtml = `<p class="empty-muted">Firebase を設定すると、管理者へのコメント機能が有効になります。</p>`;
  } else if (state.adminCommentsLoading) {
    bodyHtml = `<p class="empty-muted">コメントを読み込み中...</p>`;
  } else if (state.adminComments.length === 0) {
    bodyHtml = `<p class="empty-muted">管理者へのコメントはまだありません。</p>`;
  } else {
    bodyHtml = `<ul class="comment-list">${state.adminComments
      .map((c) => {
        const cat = catMap[c.category] || catMap.other;
        const owner = isCommentOwner(c);
        const canDelete = owner || state.isAdmin;
        if (owner && state.editingAdminCommentId === c.id) {
          return `
            <li class="comment-item">
              <form class="mini-form js-admin-comment-edit-form" data-id="${escapeHtml(c.id)}">
                <div class="form-grid-2">
                  <input type="text" name="author" maxlength="40" value="${escapeHtml(c.author === "匿名" ? "" : c.author || "")}" placeholder="お名前（空欄で匿名）" />
                  <select name="category">
                    <option value="bibliography" ${c.category === "bibliography" ? "selected" : ""}>参考文献の修正提案</option>
                    <option value="correction" ${c.category === "correction" ? "selected" : ""}>命題・論証の修正提案</option>
                    <option value="other" ${c.category === "other" ? "selected" : ""}>サイト全体へのご意見・その他</option>
                  </select>
                </div>
                <input type="text" name="targetRef" maxlength="80" value="${escapeHtml(c.targetRef || "")}" placeholder="対象の論題・座標（任意 例：反出生主義 / 座標 1.10）" />
                <textarea name="body" rows="4" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
                <div class="comment-edit-actions">
                  <button type="button" class="btn-secondary js-cancel-edit-admin-comment">キャンセル</button>
                  <button type="submit" class="btn-primary">変更を保存</button>
                </div>
              </form>
            </li>`;
        }
        return `
          <li class="comment-item">
            <div class="comment-meta">
              <div>
                <span class="admin-comment-cat ${cat.cls}">${escapeHtml(cat.text)}</span>
                <span class="comment-author">${escapeHtml(c.author || "匿名")}</span>
                <span>・${escapeHtml(formatDate(c.createdAt))}</span>
                ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
              </div>
              <div class="comment-actions">
                ${owner ? `<button type="button" class="btn-xs-edit js-edit-admin-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
                ${canDelete ? `<button type="button" class="btn-xs-danger js-delete-admin-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
              </div>
            </div>
            ${c.targetRef ? `<div class="admin-comment-target">対象：${escapeHtml(c.targetRef)}</div>` : ""}
            <p class="comment-body">${escapeHtml(c.body)}</p>
          </li>`;
      })
      .join("")}</ul>`;
  }

  const formHtml = db
    ? `
      <form id="admin-comment-add-form" class="mini-form">
        <div class="form-grid-2">
          <input type="text" id="admin-comment-author" maxlength="40" placeholder="お名前（空欄で匿名）" />
          <select id="admin-comment-category">
            <option value="bibliography">参考文献の修正提案</option>
            <option value="correction">命題・論証の修正提案</option>
            <option value="other">サイト全体へのご意見・その他</option>
          </select>
        </div>
        <input type="text" id="admin-comment-target" maxlength="80" placeholder="対象の論題・座標（任意 例：反出生主義 / 座標 1.10）" />
        <textarea id="admin-comment-body" rows="4" maxlength="1000" required placeholder="参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などをご記入ください（最大1000文字）"></textarea>
        <button type="submit" class="btn-primary">管理者へコメントを投稿</button>
        <p class="comment-note">※投稿したコメントは、同じ端末・ブラウザから本人のみ編集・削除できます。</p>
      </form>`
    : "";

  return `
    <section class="doc-section panel-section" id="admin-comments-section">
      <h3 class="panel-section-title">
        <span>管理者へのコメント（修正提案・サイト全体へのご意見）</span>
        <span class="bib-count-pill">${state.adminComments.length}件</span>
      </h3>
      <p class="admin-comments-lead">
        各座標の参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などがあればこちらからご連絡ください。
      </p>
      ${bodyHtml}
      ${formHtml}
    </section>
  `;
}

function renderProfilePage() {
  const p = state.profile;
  const hasContent = Boolean(p.name || p.role || p.bio || p.interests.length > 0 || p.links.length > 0 || p.contact);
  const editBtnHtml = state.isAdmin
    ? `<button type="button" class="admin-action-btn js-open-profile-edit">プロフィールを編集</button>`
    : "";
  const adminCommentsHtml = renderAdminCommentsSection();

  if (!hasContent) {
    els.profileContent.innerHTML = `
      <header class="doc-header">
        <div class="doc-header-row">
          <div>
            <h2>管理者プロフィール</h2>
            <p class="doc-lead">このサイトの運営者情報・管理者への連絡欄</p>
          </div>
          ${editBtnHtml}
        </div>
      </header>
      <div class="empty-state">
        ${state.isAdmin ? "プロフィールはまだ登録されていません。右上の「プロフィールを編集」から作成できます。" : "管理者のプロフィールはまだ登録されていません。"}
      </div>
      ${adminCommentsHtml}
      <div class="doc-footer-actions">
        <button type="button" class="btn-primary js-go-explorer">← 命題一覧へ戻る</button>
      </div>
    `;
    return;
  }

  const interestsHtml = p.interests.length > 0
    ? `<section class="doc-section"><h3>関心領域・テーマ</h3><div class="interest-tags">${p.interests.map((tag) => `<span class="interest-tag">${escapeHtml(tag)}</span>`).join("")}</div></section>`
    : "";

  const linksHtml = p.links.length > 0
    ? `<section class="doc-section"><h3>外部リンク</h3><ul class="profile-links">${p.links.map((l) => `<li class="profile-link-item"><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} ↗</a></li>`).join("")}</ul></section>`
    : "";

  const contactHtml = p.contact
    ? `<section class="doc-section"><h3>連絡先・メモ</h3><p class="profile-bio">${escapeHtml(p.contact)}</p></section>`
    : "";

  els.profileContent.innerHTML = `
    <header class="doc-header">
      <div class="doc-header-row">
        <div>
          <h2>${escapeHtml(p.name || "管理者プロフィール")}</h2>
          ${p.role ? `<p class="profile-role">${escapeHtml(p.role)}</p>` : ""}
        </div>
        ${editBtnHtml}
      </div>
    </header>
    ${p.bio ? `<section class="doc-section"><h3>自己紹介</h3><p class="profile-bio">${escapeHtml(p.bio)}</p></section>` : ""}
    ${interestsHtml}
    ${linksHtml}
    ${contactHtml}
    ${adminCommentsHtml}
    <div class="doc-footer-actions">
      <button type="button" class="btn-primary js-go-explorer">← 命題一覧へ戻る</button>
    </div>
  `;
}

function renderTopicBar() {
  const topic = getCurrentTopic();
  els.topicSelect.innerHTML = state.topics
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`)
    .join("");
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
  els.seedDbBtn.hidden = !(state.isAdmin && isLegacyTopic());
  els.logoutBtn.hidden = !state.isAdmin;
  els.loginOpenBtn.hidden = state.isAdmin || !isFirebaseConfigured;
}

function renderTabs() {
  const tabDefs = [
    { id: "all", label: `全${state.arguments.length}命題` },
    ...state.stages.map((s) => ({ id: s.id, label: s.label }))
  ];
  els.stageTabs.innerHTML = tabDefs
    .map((t) => `<button type="button" class="tab-btn ${state.stage === t.id ? "is-active" : ""}" data-stage="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`)
    .join("");
}

function renderModeButtons() {
  const topic = getCurrentTopic();
  els.modeButtons.forEach((btn) => {
    const mode = btn.dataset.mode;
    if (mode === "plus") btn.textContent = `+ ${topic.plusLabel}`;
    if (mode === "minus") btn.textContent = `- ${topic.minusLabel}`;
    if (mode === "split") btn.textContent = "⇄ 比較";
    btn.classList.toggle("is-active", mode === state.mode);
  });
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
    ? `<button type="button" class="banner-edit-btn js-edit-stage" data-stage-id="${escapeHtml(info.id)}">この水準を編集</button>`
    : "";
  const boxesHtml = `
    <div class="banner-box is-plus">
      <div class="banner-head-row">
        <span class="banner-label">${escapeHtml(topic.plusLabel)}の基本命題</span>
        ${editBtnHtml}
      </div>
      <div>${escapeHtml(info.plus)}</div>
    </div>
    <div class="banner-box is-minus">
      <div class="banner-head-row">
        <span class="banner-label">${escapeHtml(topic.minusLabel)}の基本命題</span>
      </div>
      <div>${escapeHtml(info.minus)}</div>
    </div>
  `;
  const summaryText = state.mode === "minus" ? info.minus : info.plus;
  els.stageBanner.innerHTML = `
    <div class="stage-banner-grid">${boxesHtml}</div>
    <details class="stage-banner-accordion">
      <summary class="stage-banner-summary"><span>基本命題：${escapeHtml(summaryText)}</span></summary>
      <div class="stage-banner-accordion-body">${boxesHtml}</div>
    </details>
  `;
}

function renderRefChips(refs, label) {
  if (!refs || refs.length === 0) return "";
  const chips = refs
    .map((c) => `<button type="button" class="ref-chip js-ref-btn" data-ref="${escapeHtml(c)}">±${escapeHtml(c)}</button>`)
    .join("");
  return `<div class="ref-row"><span>${escapeHtml(label)}:</span>${chips}</div>`;
}

function renderList() {
  const filtered = getFilteredArguments();
  if (filtered.length === 0) {
    let emptyHint = "条件に一致する命題がありません。";
    if (!state.query) {
      if (state.stages.length === 0) {
        emptyHint = state.isAdmin
          ? "この論題にはまだ水準がありません。上部の「+ 水準を追加」から最初の水準（例：1）を作成してください。"
          : "この論題にはまだ命題が登録されていません。";
      } else {
        emptyHint = state.isAdmin
          ? "この水準にはまだ命題がありません。上部の「+ 新規命題を追加」から追加できます。"
          : "この水準にはまだ命題が登録されていません。";
      }
    }
    els.argList.innerHTML = `<div class="empty-state">${emptyHint}</div>`;
    return;
  }

  const groups = new Map();
  for (const item of filtered) {
    const key = item.topic || `水準 ${item.stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let html = "";
  for (const [topicHeading, items] of groups.entries()) {
    html += `<div class="topic-group"><h3 class="topic-heading">${escapeHtml(topicHeading)}</h3>`;
    for (const item of items) {
      const selectedClass = item.coord === state.selectedCoord ? "is-selected" : "";
      const bibPill = item.bibliography.length > 0 ? `<span class="bib-count-pill">文献 ${item.bibliography.length}</span>` : "";
      const refsHtml = renderRefChips(item.refs, "前提命題");

      if (state.mode === "split") {
        html += `
          <article class="arg-card is-split ${selectedClass}" data-coord="${escapeHtml(item.coord)}">
            <div class="card-header">
              <div class="card-title-wrap">
                <span class="coord-badge is-neutral">${escapeHtml(item.coord)}</span>
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
            ${refsHtml}
          </article>`;
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
              <button type="button" class="flip-btn js-flip-btn" data-coord="${escapeHtml(item.coord)}" data-target-mode="${oppMode}">⇄ ${oppSign}${escapeHtml(item.coord)} へ反転</button>
            </div>
            <p class="card-body">${escapeHtml(body)}</p>
            ${refsHtml}
          </article>`;
      }
    }
    html += `</div>`;
  }
  els.argList.innerHTML = html;
}

function renderBibliographySection(item) {
  const listHtml = item.bibliography.length === 0
    ? `<p class="empty-muted">この座標に登録された参考文献はまだありません。</p>`
    : `<ul class="bib-list">${item.bibliography.map((b, idx) => {
        const href = safeUrl(b.url);
        return `
          <li class="bib-item">
            <div class="bib-item-head">
              <span class="bib-citation">${escapeHtml(b.citation)}</span>
              ${state.isAdmin ? `<button type="button" class="btn-xs-danger js-delete-bib" data-index="${idx}">削除</button>` : ""}
            </div>
            ${b.note ? `<p class="bib-note">${escapeHtml(b.note)}</p>` : ""}
            ${href ? `<a class="bib-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>` : ""}
          </li>`;
      }).join("")}</ul>`;

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
        <span>参考文献</span>
        <span class="bib-count-pill">${item.bibliography.length}件</span>
      </h3>
      ${listHtml}
      ${adminFormHtml}
    </section>`;
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
    bodyHtml = `<ul class="comment-list">${state.comments.map((c) => {
      const st = stanceLabelMap[c.stance] || stanceLabelMap.both;
      const owner = isCommentOwner(c);
      const canDelete = owner || state.isAdmin;
      if (owner && state.editingCommentId === c.id) {
        return `
          <li class="comment-item">
            <form class="mini-form js-comment-edit-form" data-id="${escapeHtml(c.id)}">
              <div class="form-grid-2">
                <input type="text" name="author" maxlength="40" value="${escapeHtml(c.author === "匿名" ? "" : c.author || "")}" placeholder="お名前（空欄で匿名）" />
                <select name="stance">
                  <option value="both" ${c.stance === "both" ? "selected" : ""}>座標 ${escapeHtml(item.coord)} 全体</option>
                  <option value="plus" ${c.stance === "plus" ? "selected" : ""}>+${escapeHtml(item.coord)}（${escapeHtml(topic.plusLabel)}）</option>
                  <option value="minus" ${c.stance === "minus" ? "selected" : ""}>-${escapeHtml(item.coord)}（${escapeHtml(topic.minusLabel)}）</option>
                </select>
              </div>
              <textarea name="body" rows="3" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
              <div class="comment-edit-actions">
                <button type="button" class="btn-secondary js-cancel-edit-comment">キャンセル</button>
                <button type="submit" class="btn-primary">変更を保存</button>
              </div>
            </form>
          </li>`;
      }
      return `
        <li class="comment-item">
          <div class="comment-meta">
            <div>
              <span class="comment-stance ${st.cls}">${escapeHtml(st.text)}</span>
              <span class="comment-author">${escapeHtml(c.author || "匿名")}</span>
              <span>・${escapeHtml(formatDate(c.createdAt))}</span>
              ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
            </div>
            <div class="comment-actions">
              ${owner ? `<button type="button" class="btn-xs-edit js-edit-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
              ${canDelete ? `<button type="button" class="btn-xs-danger js-delete-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
            </div>
          </div>
          <p class="comment-body">${escapeHtml(c.body)}</p>
        </li>`;
    }).join("")}</ul>`;
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
        <textarea id="comment-body" rows="3" maxlength="1000" required placeholder="この命題に対する補足・反論・疑問などを記入（最大1000文字）"></textarea>
        <button type="submit" class="btn-primary">コメントを投稿</button>
        <p class="comment-note">※投稿したコメントは、同じ端末・ブラウザから本人のみ編集・削除できます。</p>
      </form>`
    : "";

  return `
    <section class="panel-section" id="detail-comments-section">
      <h3 class="panel-section-title">
        <span>閲覧者コメント</span>
        <span class="bib-count-pill">${state.comments.length}件</span>
      </h3>
      ${bodyHtml}
      ${formHtml}
    </section>`;
}

function renderComparePanel() {
  const item = findArg(state.selectedCoord) || state.arguments[0];
  if (!item) {
    els.comparePanel.innerHTML = `<p class="empty-muted">この論題にはまだ表示する命題がありません。</p>`;
    return;
  }

  const topic = getCurrentTopic();
  const backRefs = referencedByMap.get(item.coord) || [];
  const listForPager = getFilteredArguments();
  const currentIdx = listForPager.findIndex((a) => a.coord === item.coord);
  const prevItem = currentIdx > 0 ? listForPager[currentIdx - 1] : null;
  const nextItem = currentIdx >= 0 && currentIdx < listForPager.length - 1 ? listForPager[currentIdx + 1] : null;

  els.comparePanel.innerHTML = `
    <div class="detail-topbar">
      <div class="detail-topbar-left">
        <button type="button" class="detail-back-btn js-close-detail">← 一覧</button>
        <span class="coord-badge is-neutral">${escapeHtml(item.coord)}</span>
      </div>
      <div class="detail-topbar-right">
        <button type="button" class="detail-quick-btn js-scroll-comments">💬 コメント (${state.comments.length})</button>
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

      ${renderRefChips(item.refs, "この命題が参照する前提")}
      ${renderRefChips(backRefs, "この命題を参照している命題")}
      ${renderBibliographySection(item)}
      ${renderCommentsSection(item)}

      <div class="detail-pager">
        <button type="button" class="pager-btn js-pager-nav" data-coord="${prevItem ? escapeHtml(prevItem.coord) : ""}" ${prevItem ? "" : "disabled"}>
          ${prevItem ? `← 前の座標 (${escapeHtml(prevItem.coord)})` : "← 前の座標なし"}
        </button>
        <button type="button" class="pager-btn js-pager-nav" data-coord="${nextItem ? escapeHtml(nextItem.coord) : ""}" ${nextItem ? "" : "disabled"}>
          ${nextItem ? `次の座標 (${escapeHtml(nextItem.coord)}) →` : "次の座標なし →"}
        </button>
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
  renderProfilePage();
  syncUrlHash();
}

// === 7. ナビゲーション操作 ===
function selectCoord(coord, { reloadComments = true } = {}) {
  const changed = state.selectedCoord !== coord;
  state.selectedCoord = coord;
  if (changed) state.editingCommentId = null;
  renderList();
  renderComparePanel();
  syncUrlHash();
  if (reloadComments && changed) loadCommentsForCoord(coord);
}

function jumpTo(coord, targetMode, { closeDetail = false } = {}) {
  const item = findArg(coord);
  if (!item) return;
  state.history.push({ stage: state.stage, mode: state.mode, coord: state.selectedCoord });
  if (state.stage !== "all" && item.stage !== state.stage) state.stage = item.stage;
  if (targetMode) state.mode = targetMode;
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
  if (coordChanged) state.editingCommentId = null;

  renderAll();
  if (state.detailOpen) window.scrollTo({ top: 0, behavior: "smooth" });
  else focusCard(coord);
  if (coordChanged) loadCommentsForCoord(coord);
}

function goBack() {
  const prev = state.history.pop();
  if (!prev) return;
  const coordChanged = state.selectedCoord !== prev.coord;
  state.stage = prev.stage;
  state.mode = prev.mode;
  state.selectedCoord = prev.coord;
  if (coordChanged) state.editingCommentId = null;
  if (state.query) {
    state.query = "";
    els.searchInput.value = "";
  }
  renderAll();
  focusCard(prev.coord);
  if (coordChanged) loadCommentsForCoord(prev.coord);
}

// === 8. 管理者モーダル操作 ===
function openProfileDialog() {
  const p = state.profile;
  els.profileError.hidden = true;
  els.profileName.value = p.name;
  els.profileRole.value = p.role;
  els.profileBio.value = p.bio;
  els.profileInterests.value = p.interests.join(", ");
  els.profileLinks.value = p.links
    .map((l) => (l.label && l.label !== l.url ? `${l.label} | ${l.url}` : l.url))
    .join("\n");
  els.profileContact.value = p.contact;
  els.profileDialog.showModal();
}

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
    els.argDialogTitle.textContent = `座標 ${coord} の命題を編集`;
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
    els.argDialogTitle.textContent = "新しい座標の命題を追加";
    els.argForm.reset();
    populateStageSelect(defaultStage);
    els.argCoord.readOnly = false;
    els.argDeleteBtn.hidden = true;
  }
  els.argDialog.showModal();
}

function suggestNextStageId() {
  const nums = state.stages.map((s) => Number(s.id)).filter((n) => Number.isInteger(n) && n >= 0);
  return nums.length > 0 ? String(Math.max(...nums) + 1) : "1";
}

function openStageDialog(stageId = null) {
  const topic = getCurrentTopic();
  els.stageError.hidden = true;
  els.stagePlusLabelText.textContent = `${topic.plusLabel}の基本命題 (+N)`;
  els.stageMinusLabelText.textContent = `${topic.minusLabel}の基本命題 (-N)`;
  state.editingStageId = stageId;

  if (stageId) {
    const info = findStage(stageId);
    if (!info) return;
    els.stageDialogTitle.textContent = `水準 ${stageId} を編集`;
    els.stageId.value = info.id;
    els.stageId.readOnly = true;
    els.stageLabel.value = info.label;
    els.stagePlus.value = info.plus;
    els.stageMinus.value = info.minus;
    els.stageDeleteBtn.hidden = false;
  } else {
    const nextId = suggestNextStageId();
    els.stageDialogTitle.textContent = "新しい水準を追加";
    els.stageForm.reset();
    els.stageId.readOnly = false;
    els.stageId.value = nextId;
    els.stageLabel.placeholder = `${nextId}. 新しい水準の名称`;
    els.stagePlus.placeholder = `(+${nextId}) ${topic.plusLabel}の基本命題を記入`;
    els.stageMinus.placeholder = `(-${nextId}) ${topic.minusLabel}の基本命題を記入`;
    els.stageDeleteBtn.hidden = true;
  }
  els.stageDialog.showModal();
}

// === 9. イベント登録 ===
els.menuOpenBtn.addEventListener("click", openNavDrawer);
els.menuCloseBtn.addEventListener("click", closeNavDrawer);
els.navBackdrop.addEventListener("click", closeNavDrawer);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.drawerOpen) closeNavDrawer();
});

window.addEventListener("popstate", () => {
  if (state.detailOpen) closeDetailView({ restoreScroll: true });
});

els.drawerNavButtons.forEach((btn) => btn.addEventListener("click", () => switchPage(btn.dataset.page)));

document.addEventListener("click", (e) => {
  if (e.target.closest(".js-go-explorer")) {
    switchPage("explorer");
    return;
  }
  if (e.target.closest(".js-go-profile")) {
    switchPage("profile");
    return;
  }
  if (e.target.closest(".js-open-profile-edit")) openProfileDialog();
});

document.querySelectorAll(".js-close-dialog").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog")?.close());
});

els.topicSelect.addEventListener("change", (e) => switchTopic(e.target.value));
els.editTopicBtn.addEventListener("click", () => openTopicDialog(state.currentTopicId));
els.addTopicBtn.addEventListener("click", () => openTopicDialog(null));

els.loginOpenBtn.addEventListener("click", () => {
  closeNavDrawer();
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
  closeNavDrawer();
  await signOut(auth);
});

els.profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  els.profileError.hidden = true;

  const interests = els.profileInterests.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  const rawLines = els.profileLinks.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const links = [];
  for (const line of rawLines) {
    if (line.includes("|")) {
      const [labelPart, ...urlParts] = line.split("|");
      const url = safeUrl(urlParts.join("|"));
      if (!url) {
        els.profileError.textContent = `外部リンクのURLが正しくありません（https:// または http:// で始めてください）：${line}`;
        els.profileError.hidden = false;
        return;
      }
      links.push({ label: labelPart.trim() || url, url });
    } else {
      const url = safeUrl(line);
      if (!url) {
        els.profileError.textContent = `外部リンクのURLが正しくありません（https:// または http:// で始めてください）：${line}`;
        els.profileError.hidden = false;
        return;
      }
      links.push({ label: url, url });
    }
  }

  const payload = {
    name: els.profileName.value.trim(),
    role: els.profileRole.value.trim(),
    bio: els.profileBio.value.trim(),
    interests,
    links,
    contact: els.profileContact.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, "siteMeta", "profile"), payload);
    state.profile = normalizeProfile(payload);
    els.profileDialog.close();
    renderProfilePage();
  } catch (err) {
    console.error(err);
    els.profileError.textContent = "保存に失敗しました。Firestoreのルール（siteMeta）を確認してください。";
    els.profileError.hidden = false;
  }
});

// 管理者へのコメント（プロフィールページ内）の操作
els.profileContent.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".js-edit-admin-comment");
  if (editBtn) {
    const target = state.adminComments.find((c) => c.id === editBtn.dataset.id);
    if (!isCommentOwner(target)) return;
    state.editingAdminCommentId = target.id;
    renderProfilePage();
    return;
  }
  if (e.target.closest(".js-cancel-edit-admin-comment")) {
    state.editingAdminCommentId = null;
    renderProfilePage();
    return;
  }
  const delBtn = e.target.closest(".js-delete-admin-comment");
  if (delBtn && db) {
    const target = state.adminComments.find((c) => c.id === delBtn.dataset.id);
    if (!target || (!isCommentOwner(target) && !state.isAdmin)) return;
    if (!confirm("このコメントを削除しますか？")) return;
    try {
      await deleteDoc(doc(db, "adminComments", target.id));
      if (state.editingAdminCommentId === target.id) state.editingAdminCommentId = null;
      await loadAdminComments();
    } catch (err) {
      console.error(err);
      alert("コメントの削除に失敗しました。");
    }
  }
});

els.profileContent.addEventListener("submit", async (e) => {
  if (e.target.classList.contains("js-admin-comment-edit-form")) {
    e.preventDefault();
    if (!db) return;
    const commentId = e.target.dataset.id;
    const target = state.adminComments.find((c) => c.id === commentId);
    if (!isCommentOwner(target)) return;

    const author = e.target.elements.author.value.trim() || "匿名";
    const category = e.target.elements.category.value;
    const targetRef = e.target.elements.targetRef.value.trim();
    const body = e.target.elements.body.value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";
    try {
      await updateDoc(doc(db, "adminComments", commentId), {
        author, category, targetRef, body, updatedAt: serverTimestamp()
      });
      state.editingAdminCommentId = null;
      await loadAdminComments();
    } catch (err) {
      console.error(err);
      alert("コメントの更新に失敗しました。文字数（1000文字以内）や通信状況を確認してください。");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "変更を保存";
    }
    return;
  }

  if (e.target.id === "admin-comment-add-form") {
    e.preventDefault();
    if (!db) return;
    const authorInput = document.getElementById("admin-comment-author");
    const categoryInput = document.getElementById("admin-comment-category");
    const targetInput = document.getElementById("admin-comment-target");
    const bodyInput = document.getElementById("admin-comment-body");
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const author = authorInput.value.trim() || "匿名";
    const category = categoryInput.value;
    const targetRef = targetInput.value.trim();
    const body = bodyInput.value.trim();
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(collection(db, "adminComments"), {
        category, targetRef, author, body, authorUid: uid, createdAt: serverTimestamp()
      });
      bodyInput.value = "";
      targetInput.value = "";
      await loadAdminComments();
    } catch (err) {
      console.error(err);
      if (err?.code === "auth/operation-not-allowed" || err?.code === "auth/admin-restricted-operation") {
        alert("Firebase Authentication で「匿名」ログインを有効にしてください。");
      } else {
        alert("コメントの投稿に失敗しました。Firestoreのルール（adminComments）や文字数を確認してください。");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "管理者へコメントを投稿";
    }
  }
});

els.addStageBtn.addEventListener("click", () => openStageDialog(null));
els.inlineAddStageBtn.addEventListener("click", () => openStageDialog(null));
els.addArgBtn.addEventListener("click", () => openArgDialog(null));
els.seedDbBtn.addEventListener("click", seedInitialDataToFirestore);

els.topicForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const id = els.topicId.value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id === "guide" || id === "profile") {
    els.topicError.textContent = "論題IDには半角英数字・ハイフン・アンダースコアのみ使え、「guide」「profile」は予約語のため使用できません。";
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
    if (isCreating) await switchTopic(id);
    else renderAll();
  } catch (err) {
    console.error(err);
    els.topicError.textContent = "保存に失敗しました。Firestoreのルール（topics）を確認してください。";
    els.topicError.hidden = false;
  }
});

els.topicDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingTopicId) return;
  const targetId = state.editingTopicId;
  if (state.topics.length <= 1) {
    els.topicError.textContent = "最後の1件の論題は削除できません。";
    els.topicError.hidden = false;
    return;
  }
  if (state.arguments.length > 0) {
    els.topicError.textContent = `この論題には ${state.arguments.length} 件の命題が残っています。誤削除を防ぐため、先に命題を削除してください。`;
    els.topicError.hidden = false;
    return;
  }
  if (!confirm(`論題「${findTopic(targetId)?.title || targetId}」を削除しますか？この操作は元に戻せません。`)) return;
  try {
    await ensureTopicsSeededInDb();
    if (!isLegacyTopic(targetId)) {
      for (const st of state.stages) await deleteDoc(stageDoc(st.id, targetId));
    }
    await deleteDoc(doc(db, "topics", targetId));
    els.topicDialog.close();
    await loadTopics();
    await switchTopic(state.topics[0]?.id || DEFAULT_TOPIC.id);
  } catch (err) {
    console.error(err);
    els.topicError.textContent = "削除に失敗しました。";
    els.topicError.hidden = false;
  }
});

els.stageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const id = els.stageId.value.trim();
  if (!id || id === "all" || id.includes("/")) {
    els.stageError.textContent = "水準番号に「all」やスラッシュ（/）は使えません。";
    els.stageError.hidden = false;
    return;
  }
  if (!state.editingStageId && findStage(id)) {
    els.stageError.textContent = `水準 ${id} はすでに存在します。既存の水準を編集してください。`;
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
    if (els.argDialog.open) populateStageSelect(id);
    else state.stage = id;
    renderAll();
  } catch (err) {
    console.error(err);
    els.stageError.textContent = "保存に失敗しました。Firestoreのルール（stages）を確認してください。";
    els.stageError.hidden = false;
  }
});

els.stageDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingStageId) return;
  const targetId = state.editingStageId;
  const linkedCount = state.arguments.filter((a) => a.stage === targetId).length;
  if (linkedCount > 0) {
    els.stageError.textContent = `この水準には ${linkedCount} 件の命題が紐づいています。先にそれらの命題の水準を変更または削除してください。`;
    els.stageError.hidden = false;
    return;
  }
  if (!confirm(`水準 ${targetId} を削除しますか？この操作は元に戻せません。`)) return;
  try {
    await ensureStagesSeededInDb();
    await deleteDoc(stageDoc(targetId));
    els.stageDialog.close();
    await loadStages();
    if (state.stage === targetId) state.stage = state.stages[0]?.id || "all";
    renderAll();
  } catch (err) {
    console.error(err);
    els.stageError.textContent = "削除に失敗しました。";
    els.stageError.hidden = false;
  }
});

els.argForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const coord = els.argCoord.value.trim();
  const stageVal = String(els.argStage.value).trim();
  if (!stageVal) {
    els.argError.textContent = "先に「+ 水準を新規追加」から水準を1つ作成してください。";
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
  const refs = els.argRefs.value.split(",").map((s) => s.trim()).filter(Boolean);
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

els.argDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingCoord) return;
  const target = state.editingCoord;
  if (!confirm(`座標 ${target} の命題を削除しますか？この操作は元に戻せません。`)) return;
  try {
    await deleteDoc(argumentDoc(target));
    els.argDialog.close();
    await loadArguments();
    state.selectedCoord = state.arguments[0]?.coord || "";
    if (state.detailOpen) closeDetailView({ restoreScroll: false });
    else renderAll();
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
  if (editStageBtn) openStageDialog(editStageBtn.dataset.stageId);
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
    if (isMobileViewport()) openDetailView(card.dataset.coord);
    else selectCoord(card.dataset.coord);
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
    document.getElementById("detail-comments-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (state.detailOpen) openDetailView(refBtn.dataset.ref, { pushBrowserHistory: false });
    else jumpTo(refBtn.dataset.ref, null);
    return;
  }
  const delBibBtn = e.target.closest(".js-delete-bib");
  if (delBibBtn && db && state.isAdmin) {
    const item = findArg(state.selectedCoord);
    if (!item) return;
    const idx = Number(delBibBtn.dataset.index);
    const nextBib = item.bibliography.filter((_, i) => i !== idx);
    try {
      await setDoc(argumentDoc(item.coord), { ...item, bibliography: nextBib, updatedAt: serverTimestamp() });
      item.bibliography = nextBib;
      renderList();
      renderComparePanel();
    } catch (err) {
      console.error(err);
      alert("参考文献の削除に失敗しました。");
    }
    return;
  }
  const editCommentBtn = e.target.closest(".js-edit-comment");
  if (editCommentBtn) {
    const target = state.comments.find((c) => c.id === editCommentBtn.dataset.id);
    if (!isCommentOwner(target)) return;
    state.editingCommentId = target.id;
    renderComparePanel();
    return;
  }
  if (e.target.closest(".js-cancel-edit-comment")) {
    state.editingCommentId = null;
    renderComparePanel();
    return;
  }
  const delCommentBtn = e.target.closest(".js-delete-comment");
  if (delCommentBtn && db) {
    const target = state.comments.find((c) => c.id === delCommentBtn.dataset.id);
    if (!target || (!isCommentOwner(target) && !state.isAdmin)) return;
    if (!confirm("このコメントを削除しますか？")) return;
    try {
      await deleteDoc(commentDoc(target.id));
      if (state.editingCommentId === target.id) state.editingCommentId = null;
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
      await setDoc(argumentDoc(item.coord), { ...item, bibliography: nextBib, updatedAt: serverTimestamp() });
      item.bibliography = nextBib;
      renderList();
      renderComparePanel();
    } catch (err) {
      console.error(err);
      alert("参考文献の追加に失敗しました。");
    }
    return;
  }

  if (e.target.classList.contains("js-comment-edit-form")) {
    e.preventDefault();
    if (!db) return;
    const commentId = e.target.dataset.id;
    const target = state.comments.find((c) => c.id === commentId);
    if (!isCommentOwner(target)) return;

    const author = e.target.elements.author.value.trim() || "匿名";
    const stance = e.target.elements.stance.value;
    const body = e.target.elements.body.value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";
    try {
      await updateDoc(commentDoc(commentId), { author, stance, body, updatedAt: serverTimestamp() });
      state.editingCommentId = null;
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) {
      console.error(err);
      alert("コメントの更新に失敗しました。文字数（1000文字以内）や通信状況を確認してください。");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "変更を保存";
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

    const author = authorInput.value.trim() || "匿名";
    const stance = stanceInput.value;
    const body = bodyInput.value.trim();
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(commentsCollection(), {
        coord: state.selectedCoord, stance, author, body, authorUid: uid, createdAt: serverTimestamp()
      });
      bodyInput.value = "";
      await loadCommentsForCoord(state.selectedCoord);
    } catch (err) {
      console.error(err);
      if (err?.code === "auth/operation-not-allowed" || err?.code === "auth/admin-restricted-operation") {
        alert("Firebase Authentication で「匿名」ログインを有効にしてください。");
      } else {
        alert("コメントの投稿に失敗しました。文字数（1000文字以内）や通信状況を確認してください。");
      }
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
      state.currentUid = user ? user.uid : null;
      state.isAdmin = Boolean(user && user.uid === ADMIN_UID);
      renderAdminBar();
      renderStageBanner();
      renderList();
      renderComparePanel();
      renderProfilePage();
    });
  }

  await Promise.all([loadProfile(), loadTopics(), loadAdminComments()]);

  const { page, topicId, coordToken } = parseUrlHashTokens();
  state.page = page;
  state.currentTopicId = topicId && findTopic(topicId) ? topicId : state.topics[0]?.id || DEFAULT_TOPIC.id;

  await Promise.all([loadStages(), loadArguments()]);

  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  state.selectedCoord = state.arguments[0]?.coord || "";

  const matchedCoord = applyCoordToken(coordToken);
  if (state.page === "explorer" && matchedCoord && isMobileViewport()) {
    state.detailOpen = true;
  }

  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}

init();