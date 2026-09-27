/**
 * AAYUSH 360 - Android Mobile Engine
 * Local-First IndexedDB Database + Supabase Bidirectional Delta Sync + Modern Mobile UI
 */

// Configuration matching desktop config.py
const SUPABASE_URL = "https://cfojtvlmayxpfabihqus.supabase.co";
const SUPABASE_KEY = "sb_publishable_vEOQRrOogOHVyUjoY6Oq3w_1Ym37ygj";

// Globals
let db = null;
let supabaseClient = null;
let currentUser = null;
let syncInProgress = false;
let currentView = 'dashboard';
let currentSubjectFilter = 'all';
let currentLectureStatusFilter = 'all';
let activeChapterFilter = null;
let currentPracticeTab = 'tests';
let currentAnalyticsFilter = 'all_time';
let chartInstance = null;
let autoSyncDebounceTimer = null;

// UUID generator
function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Format helpers
function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'sync') icon = '🔄';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ============================================================================
// 1. LOCAL-FIRST INDEXEDDB ENGINE
// ============================================================================

const DB_NAME = 'Aayush360_Mobile_DB';
const DB_VERSION = 1;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const idb = e.target.result;

      // 1. Subjects
      if (!idb.objectStoreNames.contains('subjects')) {
        const store = idb.createObjectStore('subjects', { keyPath: 'client_id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('sort_order', 'sort_order', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 2. Chapters
      if (!idb.objectStoreNames.contains('chapters')) {
        const store = idb.createObjectStore('chapters', { keyPath: 'client_id' });
        store.createIndex('subject_client_id', 'subject_client_id', { unique: false });
        store.createIndex('sequence_no', 'sequence_no', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 3. Lectures
      if (!idb.objectStoreNames.contains('lectures')) {
        const store = idb.createObjectStore('lectures', { keyPath: 'client_id' });
        store.createIndex('subject_client_id', 'subject_client_id', { unique: false });
        store.createIndex('chapter_client_id', 'chapter_client_id', { unique: false });
        store.createIndex('scheduled_date', 'scheduled_date', { unique: false });
        store.createIndex('is_completed', 'is_completed', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 4. Tests
      if (!idb.objectStoreNames.contains('tests')) {
        const store = idb.createObjectStore('tests', { keyPath: 'client_id' });
        store.createIndex('test_date', 'test_date', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 5. Weekly Targets
      if (!idb.objectStoreNames.contains('weekly_targets')) {
        const store = idb.createObjectStore('weekly_targets', { keyPath: 'client_id' });
        store.createIndex('week_start', 'week_start', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 6. Study Sessions
      if (!idb.objectStoreNames.contains('study_sessions')) {
        const store = idb.createObjectStore('study_sessions', { keyPath: 'client_id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 7. Revisions
      if (!idb.objectStoreNames.contains('revisions')) {
        const store = idb.createObjectStore('revisions', { keyPath: 'client_id' });
        store.createIndex('lecture_client_id', 'lecture_client_id', { unique: false });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 8. App Settings
      if (!idb.objectStoreNames.contains('app_settings')) {
        idb.createObjectStore('app_settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      console.error('[IndexedDB] Open error:', e.target.error);
      reject(e.target.error);
    };
  });
}

// Generic DB Helpers
function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPutBatch(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!items || items.length === 0) return resolve();
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dbGetPending(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const idx = store.index('sync_status');
    const req = idx.getAll('pending');
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function getSetting(key, defaultValue = "") {
  return new Promise((resolve) => {
    dbGet('app_settings', key).then(res => {
      resolve(res ? res.value : defaultValue);
    }).catch(() => resolve(defaultValue));
  });
}

function setSetting(key, value) {
  return dbPut('app_settings', { key, value: String(value) });
}

// Seed complete JEE subjects, chapters, lectures, and tests if missing
async function seedDefaultSubjectsIfEmpty() {
  try {
    const lectures = await dbGetAll('lectures');
    const chapters = await dbGetAll('chapters');
    const subjects = await dbGetAll('subjects');

    // Force seed if lectures or chapters are missing or old placeholder subjects exist
    const needsSeed = lectures.length === 0 || chapters.length === 0 || subjects.length === 0 || subjects.some(s => s.client_id === 'sub_physics');

    if (needsSeed && window.INITIAL_SEED_DATA) {
      const data = window.INITIAL_SEED_DATA;
      console.log('[IndexedDB] Seeding full JEE data from INITIAL_SEED_DATA...');
      if (data.subjects && data.subjects.length > 0) await dbPutBatch('subjects', data.subjects);
      if (data.chapters && data.chapters.length > 0) await dbPutBatch('chapters', data.chapters);
      if (data.lectures && data.lectures.length > 0) await dbPutBatch('lectures', data.lectures);
      if (data.tests && data.tests.length > 0) await dbPutBatch('tests', data.tests);
      if (data.weekly_targets && data.weekly_targets.length > 0) await dbPutBatch('weekly_targets', data.weekly_targets);
      console.log(`[IndexedDB] Seed successful! ${data.subjects.length} subjects, ${data.chapters.length} chapters, ${data.lectures.length} lectures.`);
    }
  } catch (err) {
    console.error('[IndexedDB] Seed error:', err);
  }
}
// ============================================================================
// 2. SUPABASE INITIALIZATION & AUTH
// ============================================================================

function initSupabase() {
  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
      console.log('[Supabase] Client initialized successfully');
    } else {
      console.warn('[Supabase] window.supabase not available');
    }
  } catch (err) {
    console.error('[Supabase] Init error:', err);
  }
}

async function restoreUserSession() {
  if (!supabaseClient) initSupabase();
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      updateAuthUI(currentUser.email);
      setSyncStatus('Connected', 'emerald');
      return currentUser;
    }
  } catch (err) {
    console.error('[Supabase] Restore session error:', err);
  }
  updateAuthUI(null);
  setSyncStatus('Offline / Local', 'slate');
  return null;
}

function updateAuthUI(email) {
  const emailElem = document.getElementById('sync-account-email');
  const logoutBtn = document.getElementById('btn-logout-auth');
  const manageBtn = document.getElementById('btn-manage-auth');
  const cloudBanner = document.getElementById('dash-cloud-banner');

  if (email) {
    if (emailElem) emailElem.textContent = email;
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (manageBtn) manageBtn.textContent = 'Account Info';
    if (cloudBanner) cloudBanner.classList.add('hidden');
  } else {
    if (emailElem) emailElem.textContent = 'Not connected';
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (manageBtn) manageBtn.textContent = 'Link Account';
    if (cloudBanner) cloudBanner.classList.remove('hidden');
  }
}

async function handleHeaderSyncClick() {
  if (!currentUser) {
    openAuthSheet();
  } else {
    showToast('Starting cloud synchronization...', 'sync');
    await syncNow();
  }
}

let html5QrScanner = null;

async function startQrScanner() {
  const wrapper = document.getElementById('qr-scanner-wrapper');
  const startBtn = document.getElementById('btn-start-qr');
  if (wrapper) wrapper.classList.remove('hidden');
  if (startBtn) startBtn.classList.add('hidden');

  try {
    if (window.Html5Qrcode) {
      html5QrScanner = new Html5Qrcode("qr-reader");
      await html5QrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          stopQrScanner();
          applyPairingPayload(decodedText);
        },
        () => {}
      );
    } else {
      showToast('QR scanner not ready', 'error');
    }
  } catch (err) {
    console.error('[QR] Scanner start error:', err);
    showToast(`Camera permission / scan error: ${err.message || err}`, 'error');
    stopQrScanner();
  }
}

async function stopQrScanner() {
  const wrapper = document.getElementById('qr-scanner-wrapper');
  const startBtn = document.getElementById('btn-start-qr');
  if (wrapper) wrapper.classList.add('hidden');
  if (startBtn) startBtn.classList.remove('hidden');

  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
      html5QrScanner.clear();
    } catch (_) {}
    html5QrScanner = null;
  }
}

async function handlePairingCodeSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('pairing-code-input');
  if (!input || !input.value.trim()) {
    showToast('Please paste the pairing string from your Windows PC', 'error');
    return;
  }
  await applyPairingPayload(input.value.trim());
}

async function applyPairingPayload(payloadStr) {
  try {
    let payload = null;
    try {
      if (payloadStr.startsWith('{')) {
        payload = JSON.parse(payloadStr);
      } else {
        payload = JSON.parse(atob(payloadStr));
      }
    } catch (_) {
      throw new Error('Invalid pairing string. Please copy it directly from your Windows PC.');
    }

    if (!payload || !payload.access_token || !payload.refresh_token) {
      throw new Error('Pairing string missing authentication tokens.');
    }

    setSyncStatus('Pairing...', 'amber');
    showToast('Pairing with Windows PC account...', 'info');
    if (!supabaseClient) initSupabase();

    const { data, error } = await supabaseClient.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token
    });
    if (error) throw error;

    if (data && data.user) {
      currentUser = data.user;
      updateAuthUI(currentUser.email);
      showToast(`Paired successfully as ${currentUser.email}! Syncing PC data...`, 'success');
      closeAllSheets();

      // Immediately pull full cloud database
      await syncNow();
      refreshCurrentView();
    }
  } catch (err) {
    console.error('[Pairing] Error:', err);
    showToast(err.message || 'Pairing failed', 'error');
    setSyncStatus('Pairing Error', 'rose');
  }
}

async function signOutCloud() {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    currentUser = null;
    updateAuthUI(null);
    setSyncStatus('Offline / Local', 'slate');
    showToast('Disconnected from cloud sync. Local data preserved.', 'info');
  } catch (err) {
    console.error('[Auth] Logout error:', err);
  }
}



async function markAllPending() {
  const stores = ['subjects', 'chapters', 'lectures', 'tests', 'weekly_targets', 'study_sessions', 'revisions'];
  for (const store of stores) {
    const items = await dbGetAll(store);
    items.forEach(it => it.sync_status = 'pending');
    await dbPutBatch(store, items);
  }
}

// ============================================================================
// 3. BIDIRECTIONAL DELTA SYNC ENGINE (MATCHES WINDOWS `cloud_sync.py`)
// ============================================================================

function setSyncStatus(statusText, color = 'emerald') {
  const textElem = document.getElementById('header-sync-text');
  const dotElem = document.getElementById('sync-dot');
  const cardStatusElem = document.getElementById('sync-card-status');

  if (textElem) textElem.textContent = statusText;
  if (cardStatusElem) cardStatusElem.textContent = `Status: ${statusText}`;

  if (dotElem) {
    dotElem.className = 'w-2 h-2 rounded-full';
    if (color === 'emerald') dotElem.classList.add('bg-emerald-500');
    else if (color === 'amber') dotElem.classList.add('bg-amber-500', 'syncing-dot');
    else if (color === 'rose') dotElem.classList.add('bg-rose-500');
    else dotElem.classList.add('bg-slate-400');
  }
}

async function updatePendingCountUI() {
  let pendingCount = 0;
  const stores = ['subjects', 'chapters', 'lectures', 'tests', 'weekly_targets', 'study_sessions', 'revisions'];
  for (const store of stores) {
    const pending = await dbGetPending(store);
    pendingCount += pending.length;
  }
  const pendingElem = document.getElementById('sync-pending-count');
  if (pendingElem) pendingElem.textContent = pendingCount;
  return pendingCount;
}

async function syncNow() {
  if (syncInProgress) return;
  if (!supabaseClient || !currentUser) {
    console.log('[Sync] Not logged in, skipping cloud sync');
    setSyncStatus('Offline / Local', 'slate');
    return;
  }

  syncInProgress = true;
  setSyncStatus('Syncing...', 'amber');

  try {
    const userId = currentUser.id;
    let pushedCount = 0;
    let pulledCount = 0;

    const lastSyncTime = await getSetting('cloud_last_sync_time', '');

    // On fresh sync (empty lastSyncTime), PULL FIRST so cloud data takes absolute priority
    if (!lastSyncTime) {
      pulledCount += await pullStoreChanges('subjects', userId, '');
      pulledCount += await pullStoreChanges('chapters', userId, '');
      pulledCount += await pullStoreChanges('lectures', userId, '');
      pulledCount += await pullStoreChanges('tests', userId, '');
      pulledCount += await pullStoreChanges('weekly_targets', userId, '');
      pulledCount += await pullStoreChanges('study_sessions', userId, '');
      pulledCount += await pullStoreChanges('revisions', userId, '');
    } else {
      // 1. PUSH LOCAL PENDING CHANGES
      pushedCount += await pushStoreChanges('subjects', userId);
      pushedCount += await pushStoreChanges('chapters', userId);
      pushedCount += await pushStoreChanges('lectures', userId);
      pushedCount += await pushStoreChanges('tests', userId);
      pushedCount += await pushStoreChanges('weekly_targets', userId);
      pushedCount += await pushStoreChanges('study_sessions', userId);
      pushedCount += await pushStoreChanges('revisions', userId);

      // 2. PULL CLOUD CHANGES
      pulledCount += await pullStoreChanges('subjects', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('chapters', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('lectures', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('tests', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('weekly_targets', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('study_sessions', userId, lastSyncTime);
      pulledCount += await pullStoreChanges('revisions', userId, lastSyncTime);
    }

    const nowIso = new Date().toISOString();
    await setSetting('cloud_last_sync_time', nowIso);
    
    const lastTimeElem = document.getElementById('sync-last-time');
    if (lastTimeElem) {
      const d = new Date(nowIso);
      lastTimeElem.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    setSyncStatus('Synced', 'emerald');
    await updatePendingCountUI();
    if (pushedCount > 0 || pulledCount > 0) {
      showToast(`Synced! Pushed: ${pushedCount}, Pulled: ${pulledCount}`, 'sync');
      refreshCurrentView();
    }
  } catch (err) {
    console.error('[Sync] Sync failed:', err);
    setSyncStatus('Sync error', 'rose');
  } finally {
    syncInProgress = false;
  }
}

async function pushStoreChanges(storeName, userId) {
  const pendingItems = await dbGetPending(storeName);
  if (pendingItems.length === 0) return 0;

  // Format payload for Supabase
  const payload = pendingItems.map(item => {
    const cleanItem = { ...item, user_id: userId };
    delete cleanItem.sync_status;
    return cleanItem;
  });

  // Batch upsert in chunks of 50
  for (let i = 0; i < payload.length; i += 50) {
    const chunk = payload.slice(i, i + 50);
    const { error } = await supabaseClient.from(storeName).upsert(chunk, { onConflict: 'user_id,client_id' });
    if (error) throw error;
  }

  // Mark local items as synced
  pendingItems.forEach(item => item.sync_status = 'synced');
  await dbPutBatch(storeName, pendingItems);

  return pendingItems.length;
}

async function pullStoreChanges(storeName, userId, lastSyncTime) {
  let query = supabaseClient.from(storeName).select('*').eq('user_id', userId);
  if (lastSyncTime) {
    query = query.gt('updated_at', lastSyncTime);
  } else {
    query = query.limit(1000);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  // Merge into local DB with LWW & completion preservation
  const localItems = await dbGetAll(storeName);
  const localMap = new Map(localItems.map(it => [it.client_id, it]));

  const toSave = [];
  for (const cloudItem of data) {
    const existing = localMap.get(cloudItem.client_id);
    if (!existing) {
      cloudItem.sync_status = 'synced';
      toSave.push(cloudItem);
    } else {
      // If local item is pending, resolve conflict with Last-Write-Wins
      if (existing.sync_status === 'pending') {
        const localUpdated = new Date(existing.updated_at || 0).getTime();
        const cloudUpdated = new Date(cloudItem.updated_at || 0).getTime();

        // Preserve completion if local completed
        if (existing.is_completed && !cloudItem.is_completed) {
          continue; // Keep local
        }
        if (cloudUpdated > localUpdated) {
          cloudItem.sync_status = 'synced';
          toSave.push(cloudItem);
        }
      } else {
        cloudItem.sync_status = 'synced';
        toSave.push(cloudItem);
      }
    }
  }

  if (toSave.length > 0) {
    await dbPutBatch(storeName, toSave);
  }

  return toSave.length;
}

function triggerDebouncedAutoSync() {
  updatePendingCountUI();
  if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
  autoSyncDebounceTimer = setTimeout(() => {
    syncNow();
  }, 1200);
}

// ============================================================================
// 4. UI CONTROLLER & VIEW RENDERING
// ============================================================================

function switchView(viewName, param = null) {
  currentView = viewName;
  ['dashboard', 'subjects', 'lectures', 'practice', 'analytics'].forEach(v => {
    const elem = document.getElementById(`view-${v}`);
    if (elem) elem.classList.toggle('hidden', v !== viewName);
  });

  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'subjects') renderSubjectsView();
  if (viewName === 'lectures') {
    if (param === 'backlog') {
      currentLectureStatusFilter = 'backlog';
      activeChapterFilter = null;
    } else if (typeof param === 'string') {
      activeChapterFilter = param;
    }
    renderLecturesList(activeChapterFilter);
  }
  if (viewName === 'practice') renderPracticeView();
  if (viewName === 'analytics') renderAnalyticsView();

  if (window.lucide) lucide.createIcons();
}

function refreshCurrentView() {
  switchView(currentView);
}

// ---------------- DASHBOARD ----------------
async function renderDashboard() {
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const tests = await dbGetAll('tests');

  const activeLectures = lectures.filter(l => !l.deleted_at);
  const totalLectures = activeLectures.length;
  const completedLectures = activeLectures.filter(l => l.is_completed).length;
  const progressPct = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

  const completedTests = tests.filter(t => !t.deleted_at && t.status === 'completed').length;

  document.getElementById('dash-lectures-completed').textContent = `${completedLectures}/${totalLectures}`;
  document.getElementById('dash-overall-progress').textContent = `${progressPct}%`;
  document.getElementById('dash-tests-done').textContent = completedTests;

  // Today's schedule
  const todayStr = getTodayDateStr();
  const todayTasks = activeLectures.filter(l => (l.scheduled_date === todayStr || l.rescheduled_date === todayStr));

  const todayCountBadge = document.getElementById('dash-today-count');
  if (todayCountBadge) todayCountBadge.textContent = `${todayTasks.length} Tasks`;

  const todayList = document.getElementById('dash-today-list');
  if (todayList) {
    if (todayTasks.length === 0) {
      todayList.innerHTML = `<div class="text-center py-5 text-slate-400 text-xs">No scheduled lectures for today! Great time to revise.</div>`;
    } else {
      todayList.innerHTML = todayTasks.map(l => `
        <div class="p-2.5 rounded-xl border ${l.is_completed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'} flex items-center justify-between gap-2 shadow-2xs">
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div onclick="toggleLectureCompletion('${l.client_id}')" class="touch-checkbox ${l.is_completed ? 'checked' : ''}">
              ${l.is_completed ? '✓' : ''}
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-800 truncate ${l.is_completed ? 'line-through text-slate-400' : ''}">
                ${l.lecture_name || `Lecture ${l.lecture_no}`}
              </div>
              <div class="text-[10px] text-slate-500 truncate">${l.topic || 'General Lecture'}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button onclick="toggleDppCompletion('${l.client_id}')" class="pill ${l.is_dpp_completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
              ${l.is_dpp_completed ? 'DPP Done' : 'DPP'}
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // Backlog count
  const backlogLectures = activeLectures.filter(l => !l.is_completed && l.scheduled_date < todayStr);
  const backlogCard = document.getElementById('dash-backlog-card');
  const backlogTitle = document.getElementById('dash-backlog-title');
  if (backlogCard && backlogTitle) {
    if (backlogLectures.length > 0) {
      backlogCard.classList.remove('hidden');
      backlogTitle.textContent = `${backlogLectures.length} Backlog Lectures`;
    } else {
      backlogCard.classList.add('hidden');
    }
  }

  // Subject breakdown
  const subjectListElem = document.getElementById('dash-subject-progress-list');
  if (subjectListElem) {
    subjectListElem.innerHTML = subjects.map(sub => {
      const subLectures = activeLectures.filter(l => l.subject_client_id === sub.client_id);
      const subDone = subLectures.filter(l => l.is_completed).length;
      const pct = subLectures.length > 0 ? Math.round((subDone / subLectures.length) * 100) : 0;

      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-bold">
            <span class="text-slate-700">${sub.display_name || sub.name}</span>
            <span class="text-slate-500">${subDone}/${subLectures.length} (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" style="width: ${pct}%; background-color: ${sub.color || '#4f46e5'};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (window.lucide) lucide.createIcons();
}

// ---------------- SUBJECTS & CHAPTERS ----------------
async function renderSubjectsView() {
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');
  const lectures = await dbGetAll('lectures');

  const tabsContainer = document.getElementById('subject-tabs-container');
  if (tabsContainer) {
    tabsContainer.innerHTML = `
      <button onclick="filterSubjectChapters('all')" class="pill ${currentSubjectFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
        All Subjects
      </button>
      ${subjects.map(sub => `
        <button onclick="filterSubjectChapters('${sub.client_id}')" class="pill ${currentSubjectFilter === sub.client_id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
          ${sub.display_name || sub.name}
        </button>
      `).join('')}
    `;
  }

  const filteredChapters = chapters.filter(ch => {
    if (ch.deleted_at) return false;
    if (currentSubjectFilter !== 'all' && ch.subject_client_id !== currentSubjectFilter) return false;
    return true;
  }).sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));

  const chaptersContainer = document.getElementById('chapters-list-container');
  if (chaptersContainer) {
    if (filteredChapters.length === 0) {
      chaptersContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No chapters found for this subject.</div>`;
    } else {
      chaptersContainer.innerHTML = filteredChapters.map(ch => {
        const chLectures = lectures.filter(l => !l.deleted_at && l.chapter_client_id === ch.client_id);
        const done = chLectures.filter(l => l.is_completed).length;
        const pct = chLectures.length > 0 ? Math.round((done / chLectures.length) * 100) : 0;
        const parentSub = subjects.find(s => s.client_id === ch.subject_client_id);

        return `
          <div class="touch-card p-3.5 space-y-2 border-l-4" style="border-left-color: ${parentSub ? parentSub.color : '#4f46e5'}" onclick="filterLecturesByChapter('${ch.client_id}')">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">CH ${ch.sequence_no || 1}</span>
                <h3 class="text-xs font-bold text-slate-800 mt-1">${ch.name}</h3>
              </div>
              <div class="text-right">
                <span class="text-xs font-black text-indigo-600">${pct}%</span>
                <div class="text-[10px] text-slate-400">${done}/${chLectures.length} Lecs</div>
              </div>
            </div>
            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width: ${pct}%; background-color: ${parentSub ? parentSub.color : '#4f46e5'}"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

function filterSubjectChapters(subId) {
  currentSubjectFilter = subId;
  renderSubjectsView();
}

function filterLecturesByChapter(chId) {
  activeChapterFilter = chId;
  switchView('lectures', chId);
}

function clearChapterFilter() {
  activeChapterFilter = null;
  const subSelect = document.getElementById('lecture-subject-filter');
  if (subSelect) subSelect.value = 'all';
  renderLecturesList(null);
}

// ---------------- LECTURES ----------------
async function renderLecturesList(targetChapterId = null) {
  const chId = targetChapterId !== null ? targetChapterId : activeChapterFilter;
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');
  const searchInput = document.getElementById('lecture-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let activeChapterObj = null;
  if (chId) {
    activeChapterObj = chapters.find(c => c.client_id === chId);
  }

  // Subject filter dropdown
  const subSelect = document.getElementById('lecture-subject-filter');
  if (subSelect) {
    subSelect.innerHTML = `<option value="all">All Subjects</option>` + subjects.map(s => `
      <option value="${s.client_id}">${s.display_name || s.name}</option>
    `).join('');
    if (activeChapterObj && activeChapterObj.subject_client_id) {
      subSelect.value = activeChapterObj.subject_client_id;
    }
  }
  const selectedSubject = subSelect ? subSelect.value : 'all';

  const todayStr = getTodayDateStr();

  const filtered = lectures.filter(l => {
    if (l.deleted_at) return false;
    if (chId && l.chapter_client_id !== chId) return false;
    if (!chId && selectedSubject !== 'all' && l.subject_client_id !== selectedSubject) return false;

    if (currentLectureStatusFilter === 'completed' && !l.is_completed) return false;
    if (currentLectureStatusFilter === 'pending' && l.is_completed) return false;
    if (currentLectureStatusFilter === 'backlog' && (l.is_completed || (l.scheduled_date && l.scheduled_date >= todayStr))) return false;

    if (query) {
      const matchName = (l.lecture_name || '').toLowerCase().includes(query);
      const matchTopic = (l.topic || '').toLowerCase().includes(query);
      if (!matchName && !matchTopic) return false;
    }

    return true;
  }).sort((a, b) => (a.lecture_no || 0) - (b.lecture_no || 0) || (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

  const container = document.getElementById('lectures-container');
  if (container) {
    let headerHtml = '';
    if (activeChapterObj) {
      headerHtml = `
        <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-2 flex items-center justify-between">
          <div>
            <div class="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider">Chapter Filter</div>
            <div class="text-xs font-black text-indigo-950">${activeChapterObj.name}</div>
          </div>
          <button onclick="clearChapterFilter()" class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold shadow-xs">
            Show All
          </button>
        </div>
      `;
    }

    if (filtered.length === 0) {
      container.innerHTML = headerHtml + `<div class="text-center py-10 text-slate-400 text-xs">No lectures matching filters.</div>`;
    } else {
      container.innerHTML = headerHtml + filtered.map(l => {
        const sub = subjects.find(s => s.client_id === l.subject_client_id);
        const isBacklog = !l.is_completed && l.scheduled_date && l.scheduled_date < todayStr;

        return `
          <div class="touch-card p-3 flex items-center justify-between gap-2.5 ${l.is_completed ? 'bg-slate-50/70 opacity-90' : 'bg-white'}">
            <!-- Checkbox & Title -->
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div onclick="toggleLectureCompletion('${l.client_id}')" class="touch-checkbox ${l.is_completed ? 'checked' : ''}">
                ${l.is_completed ? '✓' : ''}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white" style="background-color: ${sub ? sub.color : '#4f46e5'}">
                    L${l.lecture_no}
                  </span>
                  <span class="text-xs font-bold text-slate-800 truncate ${l.is_completed ? 'line-through text-slate-400' : ''}">
                    ${l.lecture_name || `Lecture ${l.lecture_no}`}
                  </span>
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>📅 ${l.scheduled_date || 'No Date'}</span>
                  ${isBacklog ? '<span class="text-rose-600 font-bold">⚠️ Backlog</span>' : ''}
                </div>
              </div>
            </div>

            <!-- DPP & Actions -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button onclick="toggleDppCompletion('${l.client_id}')" class="pill ${l.is_dpp_completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                ${l.is_dpp_completed ? '✓ DPP' : 'DPP'}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

function setLectureStatusFilter(status) {
  currentLectureStatusFilter = status;
  ['all', 'pending', 'completed', 'backlog'].forEach(s => {
    const btn = document.getElementById(`filter-btn-${s}`);
    if (btn) {
      if (s === status) {
        btn.className = 'pill bg-indigo-600 text-white';
      } else {
        btn.className = 'pill bg-white border border-slate-200 text-slate-600';
      }
    }
  });
  renderLecturesList();
}

async function toggleLectureCompletion(clientId) {
  const lecture = await dbGet('lectures', clientId);
  if (!lecture) return;

  const nowIso = new Date().toISOString();
  lecture.is_completed = !lecture.is_completed;
  lecture.completed_at = lecture.is_completed ? nowIso : null;
  lecture.updated_at = nowIso;
  lecture.sync_status = 'pending';

  await dbPut('lectures', lecture);
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

async function toggleDppCompletion(clientId) {
  const lecture = await dbGet('lectures', clientId);
  if (!lecture) return;

  const nowIso = new Date().toISOString();
  lecture.is_dpp_completed = !lecture.is_dpp_completed;
  lecture.dpp_completed_at = lecture.is_dpp_completed ? nowIso : null;
  lecture.updated_at = nowIso;
  lecture.sync_status = 'pending';

  await dbPut('lectures', lecture);
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

// ---------------- PRACTICE & TESTS ----------------
function switchPracticeTab(tab) {
  currentPracticeTab = tab;
  ['tests', 'questions', 'revisions'].forEach(t => {
    const subView = document.getElementById(`practice-sub-${t}`);
    const segBtn = document.getElementById(`seg-btn-${t}`);
    if (subView) subView.classList.toggle('hidden', t !== tab);
    if (segBtn) {
      if (t === tab) {
        segBtn.className = 'py-1.5 rounded-lg bg-white text-indigo-700 shadow-xs font-bold';
      } else {
        segBtn.className = 'py-1.5 rounded-lg text-slate-600 font-bold';
      }
    }
  });

  renderPracticeView();
}

async function renderPracticeView() {
  if (currentPracticeTab === 'tests') {
    const tests = await dbGetAll('tests');
    const activeTests = tests.filter(t => !t.deleted_at).sort((a, b) => (b.test_date || '').localeCompare(a.test_date || ''));

    const container = document.getElementById('tests-list-container');
    if (container) {
      if (activeTests.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">No tests added yet. Tap "+ Add Test" above.</div>`;
      } else {
        container.innerHTML = activeTests.map(t => `
          <div class="touch-card p-3.5 space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <span class="pill ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}">
                  ${t.test_type || 'Part Test'}
                </span>
                <h3 class="text-xs font-black text-slate-800 mt-1">${t.test_name}</h3>
              </div>
              <div class="text-right">
                <span class="text-base font-black ${t.score >= 180 ? 'text-emerald-600' : 'text-indigo-600'}">${t.score || 0}/300</span>
                <div class="text-[10px] text-slate-400">${t.test_date}</div>
              </div>
            </div>
            ${t.physics_syllabus || t.notes ? `
              <div class="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                ${t.physics_syllabus || t.notes}
              </div>
            ` : ''}
          </div>
        `).join('');
      }
    }
  } else if (currentPracticeTab === 'questions') {
    const lectures = await dbGetAll('lectures');
    const withPractice = lectures.filter(l => !l.deleted_at && (l.questions_practiced || 0) > 0);

    let totalPracticed = 0;
    let totalCorrect = 0;
    withPractice.forEach(l => {
      totalPracticed += (l.questions_practiced || 0);
      totalCorrect += (l.questions_correct || 0);
    });
    const acc = totalPracticed > 0 ? Math.round((totalCorrect / totalPracticed) * 100) : 0;

    document.getElementById('stat-total-q').textContent = totalPracticed;
    document.getElementById('stat-correct-q').textContent = totalCorrect;
    document.getElementById('stat-accuracy-q').textContent = `${acc}%`;

    const container = document.getElementById('question-logs-container');
    if (container) {
      if (withPractice.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No questions logged yet.</div>`;
      } else {
        container.innerHTML = withPractice.map(l => `
          <div class="touch-card p-3 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold text-slate-800">${l.lecture_name || `Lecture ${l.lecture_no}`}</div>
              <div class="text-[10px] text-slate-500">${l.topic || 'Practice Session'}</div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-emerald-600">${l.questions_correct || 0}/${l.questions_practiced || 0} Correct</span>
              <div class="text-[10px] text-slate-400">${l.accuracy || 0}% Acc</div>
            </div>
          </div>
        `).join('');
      }
    }
  } else if (currentPracticeTab === 'revisions') {
    const revisions = await dbGetAll('revisions');
    const lectures = await dbGetAll('lectures');
    const container = document.getElementById('revisions-list-container');

    if (container) {
      if (revisions.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">Revisions will appear as you complete lectures.</div>`;
      } else {
        container.innerHTML = revisions.map(r => {
          const lec = lectures.find(l => l.client_id === r.lecture_client_id);
          return `
            <div class="touch-card p-3 flex items-center justify-between">
              <div>
                <span class="pill bg-purple-100 text-purple-800">Stage ${r.stage_no || 1}</span>
                <div class="text-xs font-bold text-slate-800 mt-1">${lec ? lec.lecture_name : 'Revision Item'}</div>
              </div>
              <div class="touch-checkbox ${r.is_completed ? 'checked' : ''}" onclick="toggleRevisionDone('${r.client_id}')">
                ${r.is_completed ? '✓' : ''}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function toggleRevisionDone(clientId) {
  const rev = await dbGet('revisions', clientId);
  if (!rev) return;
  rev.is_completed = !rev.is_completed;
  rev.completed_at = rev.is_completed ? new Date().toISOString() : null;
  rev.updated_at = new Date().toISOString();
  rev.sync_status = 'pending';
  await dbPut('revisions', rev);
  triggerDebouncedAutoSync();
  renderPracticeView();
}

// ---------------- ANALYTICS ----------------
function setAnalyticsFilter(filter) {
  currentAnalyticsFilter = filter;
  ['all', 'month', 'week', 'today'].forEach(f => {
    const btn = document.getElementById(`af-${f}`);
    if (btn) {
      if ((f === 'all' && filter === 'all_time') ||
          (f === 'month' && filter === 'this_month') ||
          (f === 'week' && filter === 'this_week') ||
          (f === 'today' && filter === 'today')) {
        btn.className = 'pill bg-indigo-600 text-white';
      } else {
        btn.className = 'pill bg-white border border-slate-200 text-slate-600';
      }
    }
  });
  renderAnalyticsView();
}

async function renderAnalyticsView() {
  const subjects = await dbGetAll('subjects');
  const lectures = await dbGetAll('lectures');
  const activeLectures = lectures.filter(l => !l.deleted_at);

  const labels = subjects.map(s => s.display_name || s.name);
  const data = subjects.map(s => {
    return activeLectures.filter(l => l.subject_client_id === s.client_id && l.is_completed).length;
  });
  const colors = subjects.map(s => s.color || '#4f46e5');

  const canvas = document.getElementById('chart-subject-distribution');
  if (canvas && window.Chart) {
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data.every(v => v === 0) ? [1, 1, 1, 1, 1] : data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } }
          }
        },
        cutout: '65%'
      }
    });
  }

  updatePendingCountUI();
  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// 5. MODALS & FORMS
// ============================================================================

function openAuthSheet() {
  stopQrScanner();
  const input = document.getElementById('pairing-code-input');
  if (input) input.value = '';
  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-auth').classList.add('open');
}

async function openAddLectureModal() {
  const subjects = await dbGetAll('subjects');
  const subSelect = document.getElementById('lecture-form-subject');
  if (subSelect) {
    subSelect.innerHTML = subjects.map(s => `
      <option value="${s.client_id}">${s.display_name || s.name}</option>
    `).join('');
  }
  document.getElementById('lecture-form-date').value = getTodayDateStr();
  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-add-lecture').classList.add('open');
}

async function openLogQuestionsModal() {
  const lectures = await dbGetAll('lectures');
  const active = lectures.filter(l => !l.deleted_at);
  const select = document.getElementById('qlog-lecture-select');
  if (select) {
    select.innerHTML = active.map(l => `
      <option value="${l.client_id}">L${l.lecture_no}: ${l.lecture_name || l.topic}</option>
    `).join('');
  }
  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-log-questions').classList.add('open');
}

function openAddTestModal() {
  document.getElementById('test-date').value = getTodayDateStr();
  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-add-test').classList.add('open');
}

function closeAllSheets() {
  stopQrScanner();
  document.getElementById('sheet-backdrop').classList.remove('open');
  document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
}

async function handleAddLectureSubmit(e) {
  e.preventDefault();
  const subId = document.getElementById('lecture-form-subject').value;
  const chapterName = document.getElementById('lecture-form-chapter').value.trim();
  const lectureNo = parseInt(document.getElementById('lecture-form-no').value) || 1;
  const scheduledDate = document.getElementById('lecture-form-date').value;
  const topicName = document.getElementById('lecture-form-topic').value.trim();

  // Find or create chapter
  let chapters = await dbGetAll('chapters');
  let chapter = chapters.find(c => c.subject_client_id === subId && c.name.toLowerCase() === chapterName.toLowerCase());
  const nowIso = new Date().toISOString();

  if (!chapter) {
    chapter = {
      client_id: generateUUID(),
      subject_client_id: subId,
      name: chapterName,
      sequence_no: chapters.length + 1,
      target_hours: 0,
      sync_status: 'pending',
      created_at: nowIso,
      updated_at: nowIso
    };
    await dbPut('chapters', chapter);
  }

  const newLecture = {
    client_id: generateUUID(),
    subject_client_id: subId,
    chapter_client_id: chapter.client_id,
    lecture_no: lectureNo,
    lecture_name: topicName || `Lecture ${lectureNo}`,
    topic: topicName,
    dpp_no: lectureNo,
    scheduled_date: scheduledDate,
    is_completed: false,
    is_dpp_completed: false,
    sync_status: 'pending',
    created_at: nowIso,
    updated_at: nowIso
  };

  await dbPut('lectures', newLecture);
  showToast('Lecture added successfully!', 'success');
  closeAllSheets();
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

async function handleLogQuestionsSubmit(e) {
  e.preventDefault();
  const lectureId = document.getElementById('qlog-lecture-select').value;
  const practiced = parseInt(document.getElementById('qlog-practiced').value) || 0;
  const correct = parseInt(document.getElementById('qlog-correct').value) || 0;
  const notes = document.getElementById('qlog-notes').value.trim();

  const lecture = await dbGet('lectures', lectureId);
  if (lecture) {
    const nowIso = new Date().toISOString();
    lecture.questions_practiced = practiced;
    lecture.questions_correct = correct;
    lecture.questions_incorrect = Math.max(0, practiced - correct);
    lecture.accuracy = practiced > 0 ? Math.round((correct / practiced) * 100) : 0;
    lecture.notes = notes;
    lecture.updated_at = nowIso;
    lecture.sync_status = 'pending';
    await dbPut('lectures', lecture);
  }

  showToast('Question practice logged!', 'success');
  closeAllSheets();
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

async function handleAddTestSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('test-name').value.trim();
  const date = document.getElementById('test-date').value;
  const type = document.getElementById('test-type').value;
  const score = parseInt(document.getElementById('test-score').value) || 0;
  const status = document.getElementById('test-status').value;
  const syllabus = document.getElementById('test-syllabus').value.trim();

  const nowIso = new Date().toISOString();
  const newTest = {
    client_id: generateUUID(),
    test_name: name,
    test_date: date,
    test_type: type,
    score: score,
    total_marks: 300,
    status: status,
    physics_syllabus: syllabus,
    notes: syllabus,
    sync_status: 'pending',
    created_at: nowIso,
    updated_at: nowIso
  };

  await dbPut('tests', newTest);
  showToast('Test saved successfully!', 'success');
  closeAllSheets();
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

// ============================================================================
// 6. APP BOOTSTRAP (CLOUD-SYNC & OFFLINE-CAPABLE)
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initIndexedDB();
    await seedDefaultSubjectsIfEmpty();
    initSupabase();
    await restoreUserSession();

    // Render initial UI immediately
    switchView('dashboard');

    // If session is active and device is online, run background sync immediately
    if (navigator.onLine && currentUser) {
      syncNow();
    }

    window.addEventListener('online', () => {
      showToast('Back online! Syncing...', 'sync');
      if (currentUser) syncNow();
    });

    window.addEventListener('offline', () => {
      setSyncStatus('Offline', 'slate');
      showToast('Working offline (Local Mode)', 'info');
    });

    // Periodic auto sync every 60 seconds
    setInterval(() => {
      if (navigator.onLine && currentUser && !syncInProgress) {
        syncNow();
      }
    }, 60000);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('[App] Bootstrap error:', err);
  }
});
