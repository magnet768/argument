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
  stages: [],             // 全主張段階: [{ id, label, plus, minus }]
  stagesInDb: false,      // stages コレクションが DB に保存済みか
  arguments: [],          // 全論証
  stage: "1",             // 選択中の段階 ID または "all"
  mode: "plus",           // "plus" | "minus" | "split"
  selectedCoord: "1.10",
  query: "",
  history: [],
  isAdmin: false,
  comments: [],
  commentsLoading: false,
  editingCoord: null,
  editingStageId: null
};

let referencedByMap = new Map();

// DOM 参照
const els = {
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

  argDialog: document.getElementById("arg-dialog"),
  argDialogTitle: document.getElementById("arg-dialog-title"),
  argForm: document.getElementById("arg-form"),
  argCoord: document.getElementById("arg-coord"),
  argStage: document.getElementById("arg-stage"),
  inlineAddStageBtn: document.getElementById("inline-add-stage-btn"),
  argTopic: document.getElementById("arg-topic"),
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
  stagePlus: document.getElementById("stage-plus"),
  stageMinus: document.getElementById("stage-minus"),
  stageDeleteBtn: document.getElementById("stage-delete-btn"),
  stageError: document.getElementById("stage-error")
};

// === 3. ユーティリティ ===
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

function syncUrlHash() {
  if (!state.selectedCoord) return;
  const prefix = state.mode === "plus" ? "+" : state.mode === "minus" ? "-" : "";
  try {
    history.replaceState(null, "", `#${prefix}${state.selectedCoord}`);
  } catch {
    // 制限環境を無視
  }
}

function parseInitialHash() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (!raw) return;

  let mode = state.mode;
  let coord = raw;

  if (raw.startsWith("+")) {
    mode = "plus";
    coord = raw.slice(1);
  } else if (raw.startsWith("-")) {
    mode = "minus";
    coord = raw.slice(1);
  }

  const found = findArg(coord);
  if (!found) return;

  state.stage = found.stage;
  state.mode = mode;
  state.selectedCoord = found.coord;
}

function focusCard(coord) {
  requestAnimationFrame(() => {
    const card = els.argList.querySelector(`[data-coord="${CSS.escape(coord)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
  });
}

// === 4. Firestore データ操作 ===
async function loadStages() {
  const fallback = getDefaultStagesList();
  if (!db) {
    state.stages = fallback;
    state.stagesInDb = false;
    return;
  }

  try {
    const snap = await getDocs(collection(db, "stages"));
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

// 段階1〜4がまだ DB に未保存の場合、新規段階追加で消えないよう自動で DB へ同期する
async function ensureStagesSeededInDb() {
  if (!db || !state.isAdmin || state.stagesInDb) return;
  const defaults = getDefaultStagesList();
  for (const st of defaults) {
    await setDoc(doc(db, "stages", st.id), {
      ...st,
      updatedAt: serverTimestamp()
    });
  }
  state.stagesInDb = true;
}

async function loadArguments() {
  if (!db) {
    state.arguments = DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord));
    rebuildReferencedByMap();
    showNotice("firebase-config.js が未設定のため、ローカルの初期データのみで閲覧モード表示しています。");
    return;
  }

  try {
    const snap = await getDocs(collection(db, "arguments"));
    if (snap.empty) {
      state.arguments = DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord));
      rebuildReferencedByMap();
      showNotice("データベースに論証が未登録です。管理者ログイン後、右上の「初期データをDBへ投入」を押すと初期データが登録されます。");
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
    state.arguments = DEFAULT_ARGUMENTS.map(normalizeArg).sort((a, b) => compareNatural(a.coord, b.coord));
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

  state.commentsLoading = true;
  renderComparePanel();

  try {
    const q = query(collection(db, "comments"), where("coord", "==", coord));
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
    if (state.selectedCoord === coord) {
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

async function seedInitialDataToFirestore() {
  if (!db || !state.isAdmin) return;
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
    for (const st of defaultStages) {
      await setDoc(doc(db, "stages", st.id), {
        ...st,
        updatedAt: serverTimestamp()
      });
    }
    for (const raw of DEFAULT_ARGUMENTS) {
      const item = normalizeArg(raw);
      await setDoc(doc(db, "arguments", item.coord), {
        ...item,
        updatedAt: serverTimestamp()
      });
    }
    await loadStages();
    await loadArguments();
    renderAll();
    alert("初期データ（主張段階・論証）の投入が完了しました。");
  } catch (err) {
    console.error(err);
    alert("投入に失敗しました。Firestoreのルール（stages / arguments）と管理者UIDを確認してください。");
  } finally {
    els.seedDbBtn.disabled = false;
    els.seedDbBtn.textContent = "初期データをDBへ投入";
  }
}

// === 5. 描画関数 ===
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
  els.argStage.innerHTML = state.stages
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`)
    .join("");
  if (selectedId && findStage(selectedId)) {
    els.argStage.value = String(selectedId);
  } else if (state.stages.length > 0) {
    els.argStage.value = state.stages[0].id;
  }
}

function renderAdminBar() {
  els.adminBadge.hidden = !state.isAdmin;
  els.addStageBtn.hidden = !state.isAdmin;
  els.addArgBtn.hidden = !state.isAdmin;
  els.seedDbBtn.hidden = !state.isAdmin;
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
  els.modeButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === state.mode);
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

  const editBtnHtml = state.isAdmin
    ? `<button type="button" class="banner-edit-btn js-edit-stage" data-stage-id="${escapeHtml(info.id)}">この段階を編集</button>`
    : "";

  els.stageBanner.innerHTML = `
    <div class="banner-box is-plus">
      <div class="banner-head-row">
        <span class="banner-label">肯定側の基本主張</span>
        ${editBtnHtml}
      </div>
      <div>${escapeHtml(info.plus)}</div>
    </div>
    <div class="banner-box is-minus">
      <div class="banner-head-row">
        <span class="banner-label">反論側の基本主張</span>
      </div>
      <div>${escapeHtml(info.minus)}</div>
    </div>
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
    const emptyHint =
      state.isAdmin && !state.query
        ? `この主張段階にはまだ論証がありません。右上の「+ 新規論証を追加」から追加できます。`
        : `条件に一致する論証がありません。`;
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
  for (const [topic, items] of groups.entries()) {
    html += `<div class="topic-group"><h3 class="topic-heading">${escapeHtml(topic)}</h3>`;

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
                <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">+${escapeHtml(item.coord)} まとめへ</button>
                <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">-${escapeHtml(item.coord)} まとめへ</button>
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
            ${renderRefChips(item.refs, "関連前提")}
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
              >⇄ ${oppSign}${escapeHtml(item.coord)} へ反転ジャンプ</button>
            </div>
            <p class="card-body">${escapeHtml(body)}</p>
            ${renderRefChips(item.refs, "前提論証")}
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
        <input type="text" id="bib-citation" required placeholder="書誌情報（例：D. Benatar, Better Never to Have Been, 2006）" />
        <input type="url" id="bib-url" placeholder="参照URL（任意・https://...）" />
        <input type="text" id="bib-note" placeholder="関連箇所・メモ（任意・例：第2章の非対称性論証）" />
        <button type="submit" class="btn-primary">参考文献を追加</button>
      </form>`
    : "";

  return `
    <section class="panel-section">
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
            <option value="plus">+${escapeHtml(item.coord)}（肯定側）へのコメント</option>
            <option value="minus">-${escapeHtml(item.coord)}（反論側）へのコメント</option>
          </select>
        </div>
        <textarea id="comment-body" rows="3" maxlength="1000" required placeholder="この論点に対する補足・反論・疑問などを記入（最大1000文字）"></textarea>
        <button type="submit" class="btn-primary">コメントを投稿</button>
      </form>`
    : "";

  return `
    <section class="panel-section">
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
    els.comparePanel.innerHTML = `<p class="empty-muted">表示する論証がありません。</p>`;
    return;
  }

  const backRefs = referencedByMap.get(item.coord) || [];

  els.comparePanel.innerHTML = `
    <div class="compare-head">
      <h2>座標 ${escapeHtml(item.coord)} の対照比較</h2>
      <div class="compare-head-actions">
        <span class="coord-badge is-neutral">段階 ${escapeHtml(item.stage)}</span>
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
        <span class="coord-badge is-plus">+${escapeHtml(item.coord)} 肯定側</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="plus">一覧で表示</button>
      </div>
      <h3>${escapeHtml(item.plusTitle)}</h3>
      <p>${escapeHtml(item.plusBody)}</p>
    </div>

    <div class="compare-box is-minus">
      <div class="compare-box-head">
        <span class="coord-badge is-minus">-${escapeHtml(item.coord)} 反論側</span>
        <button type="button" class="flip-btn js-jump-mode" data-coord="${escapeHtml(item.coord)}" data-target-mode="minus">一覧で表示</button>
      </div>
      <h3>${escapeHtml(item.minusTitle)}</h3>
      <p>${escapeHtml(item.minusBody)}</p>
    </div>

    ${renderRefChips(item.refs, "この論証が参照する前提")}
    ${renderRefChips(backRefs, "この論証を参照している論証")}
    ${renderBibliographySection(item)}
    ${renderCommentsSection(item)}
  `;
}

function renderAll() {
  renderAdminBar();
  renderTabs();
  renderModeButtons();
  renderStageBanner();
  renderList();
  renderComparePanel();
  syncUrlHash();
}

// === 6. ナビゲーション操作 ===
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

function jumpTo(coord, targetMode) {
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

  const coordChanged = state.selectedCoord !== coord;
  state.selectedCoord = coord;

  if (state.query) {
    state.query = "";
    els.searchInput.value = "";
  }

  renderAll();
  focusCard(coord);
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

// === 7. 管理者モーダル操作 ===
function openArgDialog(coord = null) {
  els.argError.hidden = true;
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
    const defaultStage = state.stage === "all" ? state.stages[0]?.id || "1" : state.stage;
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
  els.stageError.hidden = true;
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
    els.stagePlus.placeholder = `(+${nextId}) 肯定側の基本主張を記入`;
    els.stageMinus.placeholder = `(-${nextId}) 反論側の基本主張を記入`;
    els.stageDeleteBtn.hidden = true;
  }

  els.stageDialog.showModal();
}

// === 8. イベント登録 ===
document.querySelectorAll(".js-close-dialog").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.closest("dialog")?.close();
  });
});

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
    await setDoc(doc(db, "stages", id), payload);
    els.stageDialog.close();
    await loadStages();

    // 論証追加ダイアログが開いている途中なら、選択肢を更新して新しい段階を自動選択
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
    await deleteDoc(doc(db, "stages", targetId));
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
    stage: String(els.argStage.value).trim(),
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
    await setDoc(doc(db, "arguments", coord), payload);
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
    await deleteDoc(doc(db, "arguments", target));
    els.argDialog.close();
    await loadArguments();
    state.selectedCoord = state.arguments[0]?.coord || "";
    renderAll();
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
    selectCoord(card.dataset.coord);
  }
});

els.comparePanel.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".js-edit-arg");
  if (editBtn) {
    openArgDialog(editBtn.dataset.coord);
    return;
  }

  const jumpBtn = e.target.closest(".js-jump-mode");
  if (jumpBtn) {
    jumpTo(jumpBtn.dataset.coord, jumpBtn.dataset.targetMode);
    return;
  }

  const refBtn = e.target.closest(".js-ref-btn");
  if (refBtn) {
    jumpTo(refBtn.dataset.ref, null);
    return;
  }

  const delBibBtn = e.target.closest(".js-delete-bib");
  if (delBibBtn && db && state.isAdmin) {
    const item = findArg(state.selectedCoord);
    if (!item) return;
    const idx = Number(delBibBtn.dataset.index);
    const nextBib = item.bibliography.filter((_, i) => i !== idx);
    try {
      await setDoc(doc(db, "arguments", item.coord), {
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
      await deleteDoc(doc(db, "comments", delCommentBtn.dataset.id));
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
      await setDoc(doc(db, "arguments", item.coord), {
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
    if (!db) return;

    const authorInput = document.getElementById("comment-author");
    const stanceInput = document.getElementById("comment-stance");
    const bodyInput = document.getElementById("comment-body");
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const body = bodyInput.value.trim();
    if (!body) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";

    try {
      await addDoc(collection(db, "comments"), {
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

// === 9. 初期化 ===
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

  await Promise.all([loadStages(), loadArguments()]);
  if (state.stage !== "all" && !findStage(state.stage) && state.stages.length > 0) {
    state.stage = state.stages[0].id;
  }
  if (!findArg(state.selectedCoord) && state.arguments.length > 0) {
    state.selectedCoord = state.arguments[0].coord;
  }
  parseInitialHash();
  renderAll();
  await loadCommentsForCoord(state.selectedCoord);
}

init();