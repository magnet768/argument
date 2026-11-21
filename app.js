import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

const DEFAULT_STAGES_OBJ = typeof STAGES !== "undefined" ? STAGES : {};
const DEFAULT_ARGUMENTS = typeof ARGUMENTS !== "undefined" ? ARGUMENTS : [];
const DEFAULT_TOPIC = { id: "antinatalism", title: "反出生主義と反論：細分化論証エクスプローラー", plusLabel: "肯定側", minusLabel: "反論側", order: 1, useLegacyRoot: true };
const DEFAULT_PROFILE = { name: "", role: "", bio: "", interests: [], links: [], contact: "" };

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
  stages: [], stagesInDb: false, arguments: [],
  stage: "1", mode: "plus", selectedCoord: "", evaluations: {}, query: "",
  currentUid: null, isAdmin: false, comments: [], commentsLoading: false,
  editingCommentId: null, editingTopicId: null, editingCoord: null, editingStageId: null,
  detailOpen: false, savedListScrollY: 0, pushedDetailHistory: false
};

let referencedByMap = new Map();
const $ = (id) => document.getElementById(id);

const els = {
  menuOpenBtn: $("menu-open-btn"), menuCloseBtn: $("menu-close-btn"), navDrawer: $("nav-drawer"), navBackdrop: $("nav-backdrop"),
  drawerNavButtons: document.querySelectorAll(".drawer-nav-btn"), drawerAdminStatus: $("drawer-admin-status"),
  topTopicControls: $("top-topic-controls"), topPageLabel: $("top-page-label"),
  explorerHeaderPanel: $("explorer-header-panel"), explorerAdminBar: $("explorer-admin-bar"),
  explorerView: $("explorer-view"), guideView: $("guide-view"), profileView: $("profile-view"), profileContent: $("profile-content"),
  topicSelect: $("topic-select"), editTopicBtn: $("edit-topic-btn"), addTopicBtn: $("add-topic-btn"),
  stageTabs: $("stage-tabs"), stageBanner: $("stage-banner"), argList: $("argument-list"), comparePanel: $("compare-panel"),
  searchInput: $("search-input"), modeButtons: document.querySelectorAll(".mode-btn"), statusNotice: $("status-notice"),
  adminBadge: $("admin-badge"), addStageBtn: $("add-stage-btn"), addArgBtn: $("add-arg-btn"), seedDbBtn: $("seed-db-btn"),
  loginOpenBtn: $("login-open-btn"), logoutBtn: $("logout-btn"),
  loginDialog: $("login-dialog"), loginForm: $("login-form"), loginEmail: $("login-email"), loginPassword: $("login-password"), loginError: $("login-error"),
  profileDialog: $("profile-dialog"), profileForm: $("profile-form"), profileName: $("profile-name"), profileRole: $("profile-role"),
  profileBio: $("profile-bio"), profileInterests: $("profile-interests"), profileLinks: $("profile-links"), profileContact: $("profile-contact"), profileError: $("profile-error"),
  topicDialog: $("topic-dialog"), topicDialogTitle: $("topic-dialog-title"), topicForm: $("topic-form"), topicId: $("topic-id"),
  topicTitle: $("topic-title"), topicPlusLabel: $("topic-plus-label"), topicMinusLabel: $("topic-minus-label"), topicDeleteBtn: $("topic-delete-btn"), topicError: $("topic-error"),
  argDialog: $("arg-dialog"), argDialogTitle: $("arg-dialog-title"), argForm: $("arg-form"), argCoord: $("arg-coord"), argStage: $("arg-stage"),
  inlineAddStageBtn: $("inline-add-stage-btn"), argTopic: $("arg-topic"), argPlusHeading: $("arg-plus-heading"), argMinusHeading: $("arg-minus-heading"),
  argPlusTitle: $("arg-plus-title"), argPlusBody: $("arg-plus-body"), argMinusTitle: $("arg-minus-title"), argMinusBody: $("arg-minus-body"),
  argRefs: $("arg-refs"), argDeleteBtn: $("arg-delete-btn"), argError: $("arg-error"),
  stageDialog: $("stage-dialog"), stageDialogTitle: $("stage-dialog-title"), stageForm: $("stage-form"), stageId: $("stage-id"),
  stageLabel: $("stage-label"), stagePlusLabelText: $("stage-plus-label-text"), stageMinusLabelText: $("stage-minus-label-text"),
  stagePlus: $("stage-plus"), stageMinus: $("stage-minus"), stageDeleteBtn: $("stage-delete-btn"), stageError: $("stage-error")
};

const isMobileViewport = () => window.matchMedia("(max-width: 980px)").matches;
const escapeHtml = (str) => String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (url) => (/^https?:\/\//i.test(String(url ?? "").trim()) ? String(url).trim() : "");
const compareNatural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

const normalizeProfile = (raw = {}) => ({
  name: String(raw.name ?? "").trim(), role: String(raw.role ?? "").trim(), bio: String(raw.bio ?? "").trim(),
  interests: Array.isArray(raw.interests) ? raw.interests.filter(Boolean) : [],
  links: Array.isArray(raw.links) ? raw.links.filter((l) => l && safeUrl(l.url)).map((l) => ({ label: String(l.label ?? l.url).trim(), url: safeUrl(l.url) })) : [],
  contact: String(raw.contact ?? "").trim()
});

const normalizeTopic = (raw) => {
  const id = String(raw.id).trim();
  return {
    id, title: String(raw.title ?? id).trim(),
    plusLabel: String(raw.plusLabel ?? "肯定側").trim() || "肯定側",
    minusLabel: String(raw.minusLabel ?? "反論側").trim() || "反論側",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 9999,
    useLegacyRoot: typeof raw.useLegacyRoot === "boolean" ? raw.useLegacyRoot : id === DEFAULT_TOPIC.id
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
const isLegacyTopic = (topicId = state.currentTopicId) => Boolean(findTopic(topicId) ? findTopic(topicId).useLegacyRoot : topicId === DEFAULT_TOPIC.id);
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

const findStage = (id) => state.stages.find((s) => s.id === String(id));
const findArg = (coord) => state.arguments.find((a) => a.coord === coord);
const isCommentOwner = (c) => Boolean(state.currentUid && c && c.authorUid && c.authorUid === state.currentUid);
const showNotice = (msg) => { els.statusNotice.hidden = !msg; els.statusNotice.textContent = msg || ""; };

// === 命題の評価（localStorage 保存・前提→帰結の一方向連動） ===
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
}
function renderEvalControl(coord, { isPanel = false } = {}) {
  const topic = getCurrentTopic();
  const cur = getEvaluation(coord);
  const curLabel = cur === "plus" ? topic.plusLabel : cur === "minus" ? topic.minusLabel : "保留";
  return `
    <div class="eval-row ${isPanel ? "is-panel" : ""}">
      <span class="eval-label">自説：${escapeHtml(curLabel)}</span>
      <div class="eval-group" role="group" aria-label="命題の評価">
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
  if (!state.selectedCoord) return `#${encodeURIComponent(state.currentTopicId)}`;
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
const applyDetailBodyClass = () => document.body.classList.toggle("is-detail-view", state.page === "explorer" && state.detailOpen);

function switchPage(nextPage) {
  if (!["explorer", "guide", "profile"].includes(nextPage)) return;
  closeNavDrawer();
  state.page = nextPage;
  state.editingCommentId = null;
  state.editingAdminCommentId = null;
  if (nextPage !== "explorer" && state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; }
  renderAll();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (nextPage === "profile") loadAdminComments();
}
function openDetailView(coord, { pushBrowserHistory = true } = {}) {
  if (!findArg(coord)) return;
  const wasOpen = state.detailOpen;
  if (!wasOpen) state.savedListScrollY = window.scrollY;
  const changed = state.selectedCoord !== coord;
  state.page = "explorer";
  state.selectedCoord = coord;
  state.editingCommentId = null;
  state.detailOpen = true;
  applyDetailBodyClass();
  if (pushBrowserHistory && !wasOpen) {
    try { history.pushState({ detailOpen: true, coord }, "", getCurrentHash()); state.pushedDetailHistory = true; }
    catch { state.pushedDetailHistory = false; }
  } else syncUrlHash();
  renderList();
  renderComparePanel();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (changed || !wasOpen) loadCommentsForCoord(coord);
}
function closeDetailView({ restoreScroll = true } = {}) {
  if (!state.detailOpen) return;
  state.detailOpen = false;
  state.pushedDetailHistory = false;
  state.editingCommentId = null;
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
  if (!db) { state.stages = fallback; state.stagesInDb = false; return; }
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
}
async function ensureStagesSeededInDb() {
  if (!db || !state.isAdmin || state.stagesInDb || !isLegacyTopic()) return;
  for (const st of getDefaultStagesList()) await setDoc(stageDoc(st.id), { ...st, updatedAt: serverTimestamp() });
  state.stagesInDb = true;
}
async function loadArguments() {
  const legacy = isLegacyTopic(state.currentTopicId);
  if (!db) {
    state.arguments = legacy ? DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord)) : [];
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
      } else { state.arguments = []; showNotice(""); }
    } else {
      const rows = [];
      snap.forEach((d) => rows.push(normalizeArg({ coord: d.id, ...d.data() })));
      state.arguments = rows.sort((a, b) => compareNatural(a.coord, b.coord));
      showNotice("");
    }
    rebuildReferencedByMap();
  } catch (err) {
    console.error(err);
    state.arguments = legacy ? DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord)) : [];
    rebuildReferencedByMap();
    showNotice("データベースの読み込みに失敗しました。Firebaseの設定とルールを確認してください。");
  }
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
    if (state.currentTopicId === tid && state.selectedCoord === coord) state.comments = list;
  } catch (err) { console.error(err); state.comments = []; }
  finally { state.commentsLoading = false; renderComparePanel(); }
}
async function switchTopic(topicId) {
  if (!findTopic(topicId)) return;
  state.currentTopicId = topicId;
  state.query = "";
  els.searchInput.value = "";
  state.comments = [];
  state.editingCommentId = null;
  if (state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; applyDetailBodyClass(); }
  await Promise.all([loadStages(), loadArguments()]);
  loadEvaluations();
  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  const first = state.stage !== "all" ? state.arguments.find((a) => a.stage === state.stage) || state.arguments[0] : state.arguments[0];
  state.selectedCoord = first ? first.coord : "";
  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}
async function seedInitialDataToFirestore() {
  if (!db || !state.isAdmin || !isLegacyTopic()) return;
  const defaultStages = getDefaultStagesList();
  if (!confirm(`data.js の初期データ（水準 ${defaultStages.length}件・命題 ${DEFAULT_ARGUMENTS.length}件）をデータベースへ書き込みますか？（同じ番号・座標が存在する場合は上書きされます）`)) return;
  els.seedDbBtn.disabled = true;
  els.seedDbBtn.textContent = "投入中...";
  try {
    await ensureTopicsSeededInDb();
    for (const st of defaultStages) await setDoc(stageDoc(st.id), { ...st, updatedAt: serverTimestamp() });
    for (const raw of DEFAULT_ARGUMENTS) {
      const item = normalizeArg(raw);
      await setDoc(argumentDoc(item.coord), { ...item, updatedAt: serverTimestamp() });
    }
    await Promise.all([loadTopics(), loadStages(), loadArguments()]);
    renderAll();
    alert("初期データ（論題・水準・命題）の投入が完了しました。");
  } catch (err) { console.error(err); alert("投入に失敗しました。Firestoreのルールと管理者UIDを確認してください。"); }
  finally { els.seedDbBtn.disabled = false; els.seedDbBtn.textContent = "初期データをDBへ投入"; }
}

// === 描画関数 ===
function getFilteredArguments() {
  const q = state.query.trim().toLowerCase();
  return state.arguments.filter((item) => {
    if (state.stage !== "all" && item.stage !== state.stage) return false;
    if (state.mode === "mine" && getEvaluation(item.coord) === "hold") return false;
    if (!q) return true;
    const bib = item.bibliography.map((b) => `${b.citation} ${b.note}`).join(" ");
    return [item.coord, `+${item.coord}`, `-${item.coord}`, item.topic, item.plusTitle, item.plusBody, item.minusTitle, item.minusBody, bib].join(" ").toLowerCase().includes(q);
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
  else if (isProfile) els.topPageLabel.textContent = "管理者プロフィール";
  els.explorerHeaderPanel.hidden = !isExplorer;
  els.explorerView.hidden = !isExplorer;
  els.guideView.hidden = !isGuide;
  els.profileView.hidden = !isProfile;
  const t = getCurrentTopic();
  document.title = isGuide ? `使い方 | ${t.title}` : isProfile ? `プロフィール | ${t.title}` : t.title;
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
          <input type="text" name="targetRef" maxlength="80" value="${escapeHtml(c.targetRef || "")}" placeholder="対象の論題・座標（任意 例：反出生主義 / 座標 1.10）" />
          <textarea name="body" rows="4" maxlength="1000" required>${escapeHtml(c.body)}</textarea>
          <div class="comment-edit-actions">
            <button type="button" class="btn-secondary js-cancel-edit-admin-comment">キャンセル</button>
            <button type="submit" class="btn-primary">変更を保存</button>
          </div></form></li>`;
      }
      return `<li class="comment-item"><div class="comment-meta"><div>
          <span class="admin-comment-cat ${cat.cls}">${escapeHtml(cat.text)}</span>
          <span class="comment-author">${escapeHtml(c.author || "匿名")}</span><span>・${escapeHtml(formatDate(c.createdAt))}</span>
          ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
        </div><div class="comment-actions">
          ${owner ? `<button type="button" class="btn-xs-edit js-edit-admin-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
          ${canDel ? `<button type="button" class="btn-xs-danger js-delete-admin-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
        </div></div>
        ${c.targetRef ? `<div class="admin-comment-target">対象：${escapeHtml(c.targetRef)}</div>` : ""}
        <p class="comment-body">${escapeHtml(c.body)}</p></li>`;
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
    <input type="text" id="admin-comment-target" maxlength="80" placeholder="対象の論題・座標（任意 例：反出生主義 / 座標 1.10）" />
    <textarea id="admin-comment-body" rows="4" maxlength="1000" required placeholder="参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などをご記入ください（最大1000文字）"></textarea>
    <button type="submit" class="btn-primary">管理者へコメントを投稿</button>
    <p class="comment-note">※投稿したコメントは、同じ端末・ブラウザから本人のみ編集・削除できます。</p>
  </form>` : "";
  return `<section class="doc-section panel-section" id="admin-comments-section">
    <h3 class="panel-section-title"><span>管理者へのコメント（修正提案・サイト全体へのご意見）</span><span class="bib-count-pill">${state.adminComments.length}件</span></h3>
    <p class="admin-comments-lead">各座標の参考文献の修正提案、命題・論証の修正提案、またはサイト全体へのご意見などがあればこちらからご連絡ください。</p>
    ${bodyHtml}${formHtml}</section>`;
}

function renderProfilePage() {
  const p = state.profile;
  const has = Boolean(p.name || p.role || p.bio || p.interests.length || p.links.length || p.contact);
  const editBtn = state.isAdmin ? `<button type="button" class="admin-action-btn js-open-profile-edit">プロフィールを編集</button>` : "";
  const commentsHtml = renderAdminCommentsSection();
  if (!has) {
    els.profileContent.innerHTML = `<header class="doc-header"><div class="doc-header-row"><div><h2>管理者プロフィール</h2><p class="doc-lead">このサイトの運営者情報・管理者への連絡欄</p></div>${editBtn}</div></header>
      <div class="empty-state">${state.isAdmin ? "プロフィールはまだ登録されていません。右上の「プロフィールを編集」から作成できます。" : "管理者のプロフィールはまだ登録されていません。"}</div>
      ${commentsHtml}<div class="doc-footer-actions"><button type="button" class="btn-primary js-go-explorer">← 命題一覧へ戻る</button></div>`;
    return;
  }
  const interests = p.interests.length ? `<section class="doc-section"><h3>関心領域・テーマ</h3><div class="interest-tags">${p.interests.map((t) => `<span class="interest-tag">${escapeHtml(t)}</span>`).join("")}</div></section>` : "";
  const links = p.links.length ? `<section class="doc-section"><h3>外部リンク</h3><ul class="profile-links">${p.links.map((l) => `<li class="profile-link-item"><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} ↗</a></li>`).join("")}</ul></section>` : "";
  const contact = p.contact ? `<section class="doc-section"><h3>連絡先・メモ</h3><p class="profile-bio">${escapeHtml(p.contact)}</p></section>` : "";
  els.profileContent.innerHTML = `<header class="doc-header"><div class="doc-header-row"><div><h2>${escapeHtml(p.name || "管理者プロフィール")}</h2>${p.role ? `<p class="profile-role">${escapeHtml(p.role)}</p>` : ""}</div>${editBtn}</div></header>
    ${p.bio ? `<section class="doc-section"><h3>自己紹介</h3><p class="profile-bio">${escapeHtml(p.bio)}</p></section>` : ""}${interests}${links}${contact}${commentsHtml}
    <div class="doc-footer-actions"><button type="button" class="btn-primary js-go-explorer">← 命題一覧へ戻る</button></div>`;
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
  els.seedDbBtn.hidden = !(state.isAdmin && isLegacyTopic());
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
    if (m === "mine") btn.textContent = "☆自説";
    btn.classList.toggle("is-active", m === state.mode);
  });
}
function renderStageBanner() {
  if (state.stage === "all") { els.stageBanner.innerHTML = ""; return; }
  const info = findStage(state.stage);
  if (!info) { els.stageBanner.innerHTML = ""; return; }
  const topic = getCurrentTopic();
  const editBtn = state.isAdmin ? `<button type="button" class="banner-edit-btn js-edit-stage" data-stage-id="${escapeHtml(info.id)}">この水準を編集</button>` : "";
  const boxes = `<div class="banner-box is-plus"><div class="banner-head-row"><span class="banner-label">${escapeHtml(topic.plusLabel)}の基本命題</span>${editBtn}</div><div>${escapeHtml(info.plus)}</div></div>
    <div class="banner-box is-minus"><div class="banner-head-row"><span class="banner-label">${escapeHtml(topic.minusLabel)}の基本命題</span></div><div>${escapeHtml(info.minus)}</div></div>`;
  els.stageBanner.innerHTML = `<div class="stage-banner-grid">${boxes}</div><details class="stage-banner-accordion"><summary class="stage-banner-summary"><span>基本命題</span></summary><div class="stage-banner-accordion-body">${boxes}</div></details>`;
}
function renderRefChips(refs, label) {
  if (!refs || refs.length === 0) return "";
  return `<div class="ref-row"><span>${escapeHtml(label)}:</span>${refs.map((c) => `<button type="button" class="ref-chip js-ref-btn" data-ref="${escapeHtml(c)}">±${escapeHtml(c)}</button>`).join("")}</div>`;
}

function renderList() {
  const filtered = getFilteredArguments();
  if (filtered.length === 0) {
    let hint = "条件に一致する命題がありません。";
    if (!state.query) {
      if (state.mode === "mine") {
        const t = getCurrentTopic();
        hint = `まだ自説が選択されていません。各命題の評価で「+（${escapeHtml(t.plusLabel)}）」または「-（${escapeHtml(t.minusLabel)}）」を選ぶと、ここに一覧表示されます。`;
      } else if (state.stages.length === 0) {
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

  let html = "";
  for (const [heading, items] of groups.entries()) {
    html += `<div class="topic-group"><h3 class="topic-heading">${escapeHtml(heading)}</h3>`;
    for (const item of items) {
      const sel = item.coord === state.selectedCoord ? "is-selected" : "";
      const bib = item.bibliography.length ? `<span class="bib-count-pill">文献 ${item.bibliography.length}</span>` : "";
      const refsHtml = renderRefChips(item.refs, "前提命題");
      const evalHtml = renderEvalControl(item.coord);

      if (state.mode === "split") {
        html += `<article class="arg-card is-split ${sel}" data-coord="${escapeHtml(item.coord)}">
          <div class="card-header"><div class="card-title-wrap"><span class="coord-badge is-neutral">座標 ${escapeHtml(item.coord)}</span>${bib}</div>
          <div><button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">+${escapeHtml(item.coord)} まとめ</button>
          <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">-${escapeHtml(item.coord)} まとめ</button></div></div>
          <div class="split-grid">
            <div class="split-col is-plus"><span class="coord-badge is-plus">+${escapeHtml(item.coord)}</span><div class="split-col-title">${escapeHtml(item.plusTitle)}</div><div>${escapeHtml(item.plusBody)}</div></div>
            <div class="split-col is-minus"><span class="coord-badge is-minus">-${escapeHtml(item.coord)}</span><div class="split-col-title">${escapeHtml(item.minusTitle)}</div><div>${escapeHtml(item.minusBody)}</div></div>
          </div>${refsHtml}${evalHtml}</article>`;
      } else {
        const isPlus = state.mode === "mine" ? getEvaluation(item.coord) === "plus" : state.mode === "plus";
        const sign = isPlus ? "+" : "-", oppSign = isPlus ? "-" : "+", oppMode = isPlus ? "minus" : "plus";
        const title = isPlus ? item.plusTitle : item.minusTitle, body = isPlus ? item.plusBody : item.minusBody;
        html += `<article class="arg-card ${isPlus ? "is-plus" : "is-minus"} ${sel}" data-coord="${escapeHtml(item.coord)}">
          <div class="card-header"><div class="card-title-wrap"><span class="coord-badge ${isPlus ? "is-plus" : "is-minus"}">${sign}${escapeHtml(item.coord)}</span><h4 class="card-title">${escapeHtml(title)}</h4>${bib}</div>
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
  return `<section class="panel-section" id="detail-bib-section"><h3 class="panel-section-title"><span>参考文献</span><span class="bib-count-pill">${item.bibliography.length}件</span></h3>${listHtml}${formHtml}</section>`;
}

function renderCommentsSection(item) {
  const topic = getCurrentTopic();
  const stanceMap = { both: { text: "座標全体", cls: "is-both" }, plus: { text: `+${item.coord} へ`, cls: "is-plus" }, minus: { text: `-${item.coord} へ`, cls: "is-minus" } };
  let bodyHtml = "";
  if (!db) bodyHtml = `<p class="empty-muted">Firebase を設定すると、閲覧者コメント機能が有効になります。</p>`;
  else if (state.commentsLoading) bodyHtml = `<p class="empty-muted">コメントを読み込み中...</p>`;
  else if (state.comments.length === 0) bodyHtml = `<p class="empty-muted">この座標へのコメントはまだありません。</p>`;
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
      return `<li class="comment-item"><div class="comment-meta"><div>
          <span class="comment-stance ${st.cls}">${escapeHtml(st.text)}</span><span class="comment-author">${escapeHtml(c.author || "匿名")}</span><span>・${escapeHtml(formatDate(c.createdAt))}</span>
          ${c.updatedAt ? `<span class="comment-edited-tag">（編集済み）</span>` : ""}
        </div><div class="comment-actions">
          ${owner ? `<button type="button" class="btn-xs-edit js-edit-comment" data-id="${escapeHtml(c.id)}">編集</button>` : ""}
          ${canDel ? `<button type="button" class="btn-xs-danger js-delete-comment" data-id="${escapeHtml(c.id)}">削除</button>` : ""}
        </div></div><p class="comment-body">${escapeHtml(c.body)}</p></li>`;
    }).join("")}</ul>`;
  }
  const formHtml = db ? `<form id="comment-add-form" class="mini-form">
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
  </form>` : "";
  return `<section class="panel-section" id="detail-comments-section"><h3 class="panel-section-title"><span>閲覧者コメント</span><span class="bib-count-pill">${state.comments.length}件</span></h3>${bodyHtml}${formHtml}</section>`;
}

function renderComparePanel() {
  const item = findArg(state.selectedCoord) || state.arguments[0];
  if (!item) { els.comparePanel.innerHTML = `<p class="empty-muted">この論題にはまだ表示する命題がありません。</p>`; return; }
  const topic = getCurrentTopic();
  const backRefs = referencedByMap.get(item.coord) || [];
  const list = getFilteredArguments();
  const idx = list.findIndex((a) => a.coord === item.coord);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

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
      ${renderEvalControl(item.coord, { isPanel: true })}
      <div class="compare-box is-plus">
        <div class="compare-box-head"><span class="coord-badge is-plus">+${escapeHtml(item.coord)} ${escapeHtml(topic.plusLabel)}</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">一覧で表示</button></div>
        <h3>${escapeHtml(item.plusTitle)}</h3><p>${escapeHtml(item.plusBody)}</p>
      </div>
      <div class="compare-box is-minus">
        <div class="compare-box-head"><span class="coord-badge is-minus">-${escapeHtml(item.coord)} ${escapeHtml(topic.minusLabel)}</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">一覧で表示</button></div>
        <h3>${escapeHtml(item.minusTitle)}</h3><p>${escapeHtml(item.minusBody)}</p>
      </div>
      ${renderRefChips(item.refs, "この命題が参照する前提")}
      ${renderRefChips(backRefs, "この命題を参照している命題")}
      ${renderBibliographySection(item)}
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
  renderProfilePage();
  syncUrlHash();
}

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
  if (state.stage !== "all" && item.stage !== state.stage) state.stage = item.stage;
  if (targetMode) state.mode = targetMode;
  if (state.query) { state.query = ""; els.searchInput.value = ""; }
  if (closeDetail && state.detailOpen) { state.detailOpen = false; state.pushedDetailHistory = false; applyDetailBodyClass(); }
  const changed = state.selectedCoord !== coord;
  state.selectedCoord = coord;
  if (changed) state.editingCommentId = null;
  renderAll();
  if (state.detailOpen) window.scrollTo({ top: 0, behavior: "smooth" });
  else focusCard(coord);
  if (changed) loadCommentsForCoord(coord);
}

// === 管理者モーダル ===
function openProfileDialog() {
  const p = state.profile;
  els.profileError.hidden = true;
  els.profileName.value = p.name;
  els.profileRole.value = p.role;
  els.profileBio.value = p.bio;
  els.profileInterests.value = p.interests.join(", ");
  els.profileLinks.value = p.links.map((l) => (l.label && l.label !== l.url ? `${l.label} | ${l.url}` : l.url)).join("\n");
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
    els.argDeleteBtn.hidden = false;
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
  els.stagePlusLabelText.textContent = `${topic.plusLabel}の基本命題 (+N)`;
  els.stageMinusLabelText.textContent = `${topic.minusLabel}の基本命題 (-N)`;
  state.editingStageId = stageId;
  if (stageId) {
    const info = findStage(stageId);
    if (!info) return;
    els.stageDialogTitle.textContent = `水準 ${stageId} を編集`;
    els.stageId.value = info.id; els.stageId.readOnly = true;
    els.stageLabel.value = info.label; els.stagePlus.value = info.plus; els.stageMinus.value = info.minus;
    els.stageDeleteBtn.hidden = false;
  } else {
    const nums = state.stages.map((s) => Number(s.id)).filter((n) => Number.isInteger(n) && n >= 0);
    const nextId = nums.length ? String(Math.max(...nums) + 1) : "1";
    els.stageDialogTitle.textContent = "新しい水準を追加";
    els.stageForm.reset(); els.stageId.readOnly = false; els.stageId.value = nextId;
    els.stageLabel.placeholder = `${nextId}. 新しい水準の名称`;
    els.stagePlus.placeholder = `(+${nextId}) ${topic.plusLabel}の基本命題を記入`;
    els.stageMinus.placeholder = `(-${nextId}) ${topic.minusLabel}の基本命題を記入`;
    els.stageDeleteBtn.hidden = true;
  }
  els.stageDialog.showModal();
}

// === イベント登録 ===
els.menuOpenBtn.addEventListener("click", openNavDrawer);
els.menuCloseBtn.addEventListener("click", closeNavDrawer);
els.navBackdrop.addEventListener("click", closeNavDrawer);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.drawerOpen) closeNavDrawer(); });
window.addEventListener("popstate", () => { if (state.detailOpen) closeDetailView({ restoreScroll: true }); });
els.drawerNavButtons.forEach((b) => b.addEventListener("click", () => switchPage(b.dataset.page)));
document.addEventListener("click", (e) => {
  if (e.target.closest(".js-go-explorer")) { switchPage("explorer"); return; }
  if (e.target.closest(".js-go-profile")) { switchPage("profile"); return; }
  if (e.target.closest(".js-open-profile-edit")) openProfileDialog();
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
  const interests = els.profileInterests.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  const links = [];
  for (const line of els.profileLinks.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const [labelPart, ...urlParts] = line.includes("|") ? line.split("|") : [line, line];
    const url = safeUrl(urlParts.join("|"));
    if (!url) { els.profileError.textContent = `外部リンクのURLが正しくありません：${line}`; els.profileError.hidden = false; return; }
    links.push({ label: labelPart.trim() || url, url });
  }
  const payload = { name: els.profileName.value.trim(), role: els.profileRole.value.trim(), bio: els.profileBio.value.trim(), interests, links, contact: els.profileContact.value.trim(), updatedAt: serverTimestamp() };
  try { await setDoc(doc(db, "siteMeta", "profile"), payload); state.profile = normalizeProfile(payload); els.profileDialog.close(); renderProfilePage(); }
  catch (err) { console.error(err); els.profileError.textContent = "保存に失敗しました。Firestoreのルールを確認してください。"; els.profileError.hidden = false; }
});

els.profileContent.addEventListener("click", async (e) => {
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
      await updateDoc(doc(db, "adminComments", id), { author: e.target.elements.author.value.trim() || "匿名", category: e.target.elements.category.value, targetRef: e.target.elements.targetRef.value.trim(), body, updatedAt: serverTimestamp() });
      state.editingAdminCommentId = null;
      await loadAdminComments();
    } catch (err) { console.error(err); alert("コメントの更新に失敗しました。"); }
    finally { btn.disabled = false; btn.textContent = "変更を保存"; }
    return;
  }
  if (e.target.id === "admin-comment-add-form") {
    e.preventDefault();
    if (!db) return;
    const bodyEl = $("admin-comment-body"), targetEl = $("admin-comment-target"), body = bodyEl.value.trim();
    if (!body) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "送信中...";
    try {
      const uid = await ensureSignedInUid();
      await addDoc(collection(db, "adminComments"), { category: $("admin-comment-category").value, targetRef: targetEl.value.trim(), author: $("admin-comment-author").value.trim() || "匿名", body, authorUid: uid, createdAt: serverTimestamp() });
      bodyEl.value = ""; targetEl.value = "";
      await loadAdminComments();
    } catch (err) {
      console.error(err);
      alert(err?.code === "auth/operation-not-allowed" ? "Firebase Authentication で「匿名」ログインを有効にしてください。" : "コメントの投稿に失敗しました。");
    } finally { btn.disabled = false; btn.textContent = "管理者へコメントを投稿"; }
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
  if (state.topics.length <= 1) { els.topicError.textContent = "最後の1件の論題は削除できません。"; els.topicError.hidden = false; return; }
  if (state.arguments.length > 0) { els.topicError.textContent = `この論題には ${state.arguments.length} 件の命題が残っています。先に削除してください。`; els.topicError.hidden = false; return; }
  if (!confirm(`論題「${findTopic(targetId)?.title || targetId}」を削除しますか？`)) return;
  try {
    await ensureTopicsSeededInDb();
    if (!isLegacyTopic(targetId)) { for (const st of state.stages) await deleteDoc(stageDoc(st.id, targetId)); }
    await deleteDoc(doc(db, "topics", targetId));
    els.topicDialog.close();
    await loadTopics();
    await switchTopic(state.topics[0]?.id || DEFAULT_TOPIC.id);
  } catch (err) { console.error(err); els.topicError.textContent = "削除に失敗しました。"; els.topicError.hidden = false; }
});

els.stageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !state.isAdmin) return;
  const id = els.stageId.value.trim();
  if (!id || id === "all" || id.includes("/")) { els.stageError.textContent = "水準番号に「all」や「/」は使えません。"; els.stageError.hidden = false; return; }
  if (!state.editingStageId && findStage(id)) { els.stageError.textContent = `水準 ${id} はすでに存在します。`; els.stageError.hidden = false; return; }
  try {
    await ensureStagesSeededInDb();
    await setDoc(stageDoc(id), { id, label: els.stageLabel.value.trim(), plus: els.stagePlus.value.trim(), minus: els.stageMinus.value.trim(), updatedAt: serverTimestamp() });
    els.stageDialog.close();
    await loadStages();
    if (els.argDialog.open) populateStageSelect(id); else state.stage = id;
    renderAll();
  } catch (err) { console.error(err); els.stageError.textContent = "保存に失敗しました。"; els.stageError.hidden = false; }
});

els.stageDeleteBtn.addEventListener("click", async () => {
  if (!db || !state.isAdmin || !state.editingStageId) return;
  const targetId = state.editingStageId, linked = state.arguments.filter((a) => a.stage === targetId).length;
  if (linked > 0) { els.stageError.textContent = `この水準には ${linked} 件の命題が紐づいています。`; els.stageError.hidden = false; return; }
  if (!confirm(`水準 ${targetId} を削除しますか？`)) return;
  try {
    await ensureStagesSeededInDb();
    await deleteDoc(stageDoc(targetId));
    els.stageDialog.close();
    await loadStages();
    if (state.stage === targetId) state.stage = state.stages[0]?.id || "all";
    renderAll();
  } catch (err) { console.error(err); els.stageError.textContent = "削除に失敗しました。"; els.stageError.hidden = false; }
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
    state.stage = payload.stage; state.selectedCoord = coord;
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
    state.selectedCoord = state.arguments[0]?.coord || "";
    if (state.detailOpen) closeDetailView({ restoreScroll: false }); else renderAll();
    loadCommentsForCoord(state.selectedCoord);
  } catch (err) { console.error(err); els.argError.textContent = "削除に失敗しました。"; els.argError.hidden = false; }
});

els.stageTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  state.stage = btn.dataset.stage;
  const cur = findArg(state.selectedCoord);
  if (state.stage !== "all" && (!cur || cur.stage !== state.stage)) {
    const first = state.arguments.find((a) => a.stage === state.stage);
    if (first) { state.selectedCoord = first.coord; loadCommentsForCoord(first.coord); }
  }
  renderAll();
});
els.stageBanner.addEventListener("click", (e) => {
  const b = e.target.closest(".js-edit-stage");
  if (b) openStageDialog(b.dataset.stageId);
});
els.modeButtons.forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode; renderAll(); }));
els.searchInput.addEventListener("input", (e) => { state.query = e.target.value; renderList(); });

els.argList.addEventListener("click", (e) => {
  const evalBtn = e.target.closest(".js-eval-btn");
  if (evalBtn) { e.stopPropagation(); setEvaluation(evalBtn.dataset.coord, evalBtn.dataset.eval); return; }
  const flipBtn = e.target.closest(".js-flip-btn, .js-jump-mode");
  if (flipBtn) { e.stopPropagation(); jumpTo(flipBtn.dataset.coord, flipBtn.dataset.targetMode); return; }
  const refBtn = e.target.closest(".js-ref-btn");
  if (refBtn) { e.stopPropagation(); jumpTo(refBtn.dataset.ref, null); return; }
  const card = e.target.closest(".arg-card");
  if (card) { if (isMobileViewport()) openDetailView(card.dataset.coord); else selectCoord(card.dataset.coord); }
});

els.comparePanel.addEventListener("click", async (e) => {
  const evalBtn = e.target.closest(".js-eval-btn");
  if (evalBtn) { setEvaluation(evalBtn.dataset.coord, evalBtn.dataset.eval); return; }
  if (e.target.closest(".js-close-detail")) { requestCloseDetailView(); return; }
  const exp = e.target.closest(".js-expand-detail");
  if (exp) { openDetailView(exp.dataset.coord); return; }
  if (e.target.closest(".js-scroll-comments")) { $("detail-comments-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
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
    const nextBib = item.bibliography.filter((_, i) => i !== Number(delBib.dataset.index));
    try { await setDoc(argumentDoc(item.coord), { ...item, bibliography: nextBib, updatedAt: serverTimestamp() }); item.bibliography = nextBib; renderList(); renderComparePanel(); }
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
    if (!t || (!isCommentOwner(t) && !state.isAdmin) || !confirm("このコメントを削除しますか？")) return;
    try { await deleteDoc(commentDoc(t.id)); if (state.editingCommentId === t.id) state.editingCommentId = null; await loadCommentsForCoord(state.selectedCoord); }
    catch (err) { console.error(err); alert("コメントの削除に失敗しました。"); }
  }
});

els.comparePanel.addEventListener("submit", async (e) => {
  if (e.target.id === "bib-add-form") {
    e.preventDefault();
    if (!db || !state.isAdmin) return;
    const item = findArg(state.selectedCoord), citation = $("bib-citation").value.trim();
    if (!item || !citation) return;
    const nextBib = [...item.bibliography, { citation, url: $("bib-url").value.trim(), note: $("bib-note").value.trim() }];
    try { await setDoc(argumentDoc(item.coord), { ...item, bibliography: nextBib, updatedAt: serverTimestamp() }); item.bibliography = nextBib; renderList(); renderComparePanel(); }
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
    } catch (err) { console.error(err); alert("コメントの更新に失敗しました。"); }
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
      alert(err?.code === "auth/operation-not-allowed" ? "Firebase Authentication で「匿名」ログインを有効にしてください。" : "コメントの投稿に失敗しました。");
    } finally { btn.disabled = false; btn.textContent = "コメントを投稿"; }
  }
});

async function init() {
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      state.currentUid = user ? user.uid : null;
      state.isAdmin = Boolean(user && user.uid === ADMIN_UID);
      renderAdminBar(); renderStageBanner(); renderList(); renderComparePanel(); renderProfilePage();
    });
  }
  await Promise.all([loadProfile(), loadTopics(), loadAdminComments()]);
  const { page, topicId, coordToken } = parseUrlHashTokens();
  state.page = page;
  state.currentTopicId = topicId && findTopic(topicId) ? topicId : state.topics[0]?.id || DEFAULT_TOPIC.id;
  await Promise.all([loadStages(), loadArguments()]);
  loadEvaluations();
  state.stage = state.stages.length > 0 ? state.stages[0].id : "all";
  state.selectedCoord = state.arguments[0]?.coord || "";
  if (state.page === "explorer" && applyCoordToken(coordToken) && isMobileViewport()) state.detailOpen = true;
  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}

init();