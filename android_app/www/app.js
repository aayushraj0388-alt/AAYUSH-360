/**
 * AAYUSH 360 - Android Mobile Companion Engine
 * Local-First IndexedDB Database + Supabase Bidirectional Delta Sync + Modern JEE Dashboard & Study Analytics
 */

// Configuration matching desktop config.py
const SUPABASE_URL = "https://cfojtvlmayxpfabihqus.supabase.co";
const SUPABASE_KEY = "sb_publishable_vEOQRrOogOHVyUjoY6Oq3w_1Ym37ygj";

// Globals & State
let db = null;
let supabaseClient = null;
let currentUser = null;
let syncInProgress = false;
let currentView = 'dashboard';
let currentSubjectFilter = 'all';
let currentLectureStatusFilter = 'all';
let activeChapterFilter = null;
let currentPracticeTab = 'tests';
let currentAnalyticsTab = 'study_time';
let currentPomodoroFilter = 'all_time';
let chartPomoInstance = null;
let chartJeeInstance = null;
let autoSyncDebounceTimer = null;
let html5QrScanner = null;

// ============================================================================
// 1. UTILITY & FORMAT HELPERS
// ============================================================================

function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDurationStr(hours) {
  const totalMins = Math.round((Number(hours) || 0) * 60);
  if (totalMins <= 0) return "0h";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatMinutesStr(mins) {
  const totalMins = Math.round(Number(mins) || 0);
  if (totalMins <= 0) return "0h";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return new Date(dateStr);
}

function getWeekDateRange(dateStr = null) {
  const target = dateStr ? parseLocalDate(dateStr) : new Date();
  const dayOfWeek = target.getDay(); // 0 is Sun, 1 is Mon
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  
  const mon = new Date(target);
  mon.setDate(target.getDate() + diffToMon);
  
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  
  const toStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    weekStart: toStr(mon),
    weekEnd: toStr(sun)
  };
}

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
// 2. LOCAL-FIRST INDEXEDDB ENGINE
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

      // 6. Study Sessions (Pomodoro)
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
    if (!db) return resolve([]);
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, item) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPutBatch(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!db || !items || items.length === 0) return resolve();
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetPending(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve([]);
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

// Seed default syllabus structure from INITIAL_SEED_DATA if fresh install or incomplete
async function seedDefaultSubjectsIfEmpty() {
  try {
    if (!window.INITIAL_SEED_DATA) return;
    const data = window.INITIAL_SEED_DATA;

    const subjects = await dbGetAll('subjects');
    const chapters = await dbGetAll('chapters');
    const lectures = await dbGetAll('lectures');

    const needsFullSeed = subjects.length === 0 || chapters.length === 0;

    if (needsFullSeed) {
      console.log('[IndexedDB] Seeding full JEE dataset from INITIAL_SEED_DATA...');
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

// Migration: Ensure all 91 chapters and 398 lectures exist with canonical sequence_no and names
// Preserves all existing user progress, completions, and study sessions
async function migrateChapterSequenceNumbers() {
  try {
    if (!window.INITIAL_SEED_DATA || !window.INITIAL_SEED_DATA.chapters) return;

    const seedChapters = window.INITIAL_SEED_DATA.chapters;
    const seedLectures = window.INITIAL_SEED_DATA.lectures || [];
    const seedSubjects = window.INITIAL_SEED_DATA.subjects || [];

    const localChapters = await dbGetAll('chapters');
    const localLectures = await dbGetAll('lectures');
    const localSubjects = await dbGetAll('subjects');

    const migrationVersion = '2026-09-28-v6-audit-repair';
    const done = await getSetting('chapter_seq_migration', '');
    if (done === migrationVersion && localChapters.length === 91 && localLectures.length >= 398) {
      return; // Already up to date
    }

    console.log('[Migration] Verifying and repairing syllabus integrity...');

    // 1. Ensure all 5 subjects exist
    const localSubCids = new Set(localSubjects.map(s => s.client_id));
    const subsToInsert = [];
    seedSubjects.forEach(ss => {
      if (!localSubCids.has(ss.client_id)) {
        subsToInsert.push({ ...ss, sync_status: 'synced' });
      }
    });
    if (subsToInsert.length > 0) {
      await dbPutBatch('subjects', subsToInsert);
      console.log(`[Migration] Inserted ${subsToInsert.length} missing subjects`);
    }

    // 2. Ensure all 91 chapters exist with exact canonical sequence_no and name
    const localChMap = new Map(localChapters.map(c => [c.client_id, c]));
    const chsToInsert = [];
    const chsToUpdate = [];

    seedChapters.forEach(canonical => {
      const existing = localChMap.get(canonical.client_id);
      if (!existing) {
        chsToInsert.push({ ...canonical, sync_status: 'synced' });
      } else {
        let changed = false;
        if (existing.sequence_no !== canonical.sequence_no) {
          existing.sequence_no = canonical.sequence_no;
          changed = true;
        }
        if (canonical.name && existing.name !== canonical.name) {
          existing.name = canonical.name;
          changed = true;
        }
        if (canonical.subject_client_id && existing.subject_client_id !== canonical.subject_client_id) {
          existing.subject_client_id = canonical.subject_client_id;
          changed = true;
        }
        if (canonical.target_hours !== undefined && existing.target_hours !== canonical.target_hours) {
          existing.target_hours = canonical.target_hours;
          changed = true;
        }
        if (changed) {
          chsToUpdate.push(existing);
        }
      }
    });

    if (chsToInsert.length > 0) {
      await dbPutBatch('chapters', chsToInsert);
      console.log(`[Migration] Inserted ${chsToInsert.length} missing chapters`);
    }
    if (chsToUpdate.length > 0) {
      await dbPutBatch('chapters', chsToUpdate);
      console.log(`[Migration] Updated ${chsToUpdate.length} chapters with canonical sequence_no`);
    }

    // 3. Ensure all 398 canonical lectures exist without wiping progress
    const localLecMap = new Map(localLectures.map(l => [l.client_id, l]));
    const lecsToInsert = [];
    const lecsToUpdate = [];

    seedLectures.forEach(sl => {
      const existing = localLecMap.get(sl.client_id);
      if (!existing) {
        lecsToInsert.push({ ...sl, sync_status: 'synced' });
      } else {
        let changed = false;
        if (sl.lecture_name && existing.lecture_name !== sl.lecture_name) {
          existing.lecture_name = sl.lecture_name;
          changed = true;
        }
        if (sl.topic && existing.topic !== sl.topic) {
          existing.topic = sl.topic;
          changed = true;
        }
        if (sl.chapter_client_id && existing.chapter_client_id !== sl.chapter_client_id) {
          existing.chapter_client_id = sl.chapter_client_id;
          changed = true;
        }
        if (changed) {
          lecsToUpdate.push(existing);
        }
      }
    });

    if (lecsToInsert.length > 0) {
      await dbPutBatch('lectures', lecsToInsert);
      console.log(`[Migration] Inserted ${lecsToInsert.length} missing lectures`);
    }
    if (lecsToUpdate.length > 0) {
      await dbPutBatch('lectures', lecsToUpdate);
      console.log(`[Migration] Updated ${lecsToUpdate.length} lecture metadata (progress preserved)`);
    }

    // 4. Ensure Physical Chemistry has ZERO lecture records
    const pchemBadLecs = localLectures.filter(l => 
      l.subject_client_id === 'subj_physical_chemistry' || 
      (l.chapter_client_id && seedChapters.find(sc => sc.client_id === l.chapter_client_id && sc.subject_client_id === 'subj_physical_chemistry'))
    );
    if (pchemBadLecs.length > 0) {
      console.log(`[Migration] Removing ${pchemBadLecs.length} invalid lecture records from Physical Chemistry`);
      for (const bl of pchemBadLecs) {
        await dbDelete('lectures', bl.client_id);
      }
    }

    await setSetting('chapter_seq_migration', migrationVersion);
    console.log('[Migration] Syllabus migration complete: 91 chapters, 398 lectures verified.');
  } catch (err) {
    console.error('[Migration] Chapter seq migration error:', err);
  }
}

// ============================================================================
// 3. SUPABASE INITIALIZATION & AUTHENTICATION
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
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          currentUser = session.user;
          await setSetting('cloud_access_token', session.access_token);
          await setSetting('cloud_refresh_token', session.refresh_token);
          await setSetting('cloud_user_id', session.user.id);
          await setSetting('cloud_user_email', session.user.email);
          await setSetting('cloud_sync_enabled', 'true');
          updateAuthUI(session.user.email);
        } else if (event === 'SIGNED_OUT') {
          currentUser = null;
          updateAuthUI(null);
          setSyncStatus('Offline / Local', 'slate');
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
    // 1. Check existing client session in memory / localStorage
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      updateAuthUI(currentUser.email);
      setSyncStatus('Connected', 'emerald');
      return currentUser;
    }

    // 2. Check stored credentials (auto-reauth to avoid stale refresh token crashes)
    const storedEmail = await getSetting('cloud_user_email');
    const storedPassword = await getSetting('cloud_user_password');
    if (storedEmail && storedPassword) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: storedEmail,
        password: storedPassword
      });
      if (!error && data && data.user) {
        currentUser = data.user;
        updateAuthUI(currentUser.email);
        setSyncStatus('Connected', 'emerald');
        return currentUser;
      }
    }

    // 3. Fallback: stored tokens
    const storedToken = await getSetting('cloud_access_token');
    const storedRefreshToken = await getSetting('cloud_refresh_token');
    if (storedToken && storedRefreshToken) {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: storedToken,
        refresh_token: storedRefreshToken
      });
      if (!error && data && data.user) {
        currentUser = data.user;
        updateAuthUI(currentUser.email || storedEmail);
        setSyncStatus('Connected', 'emerald');
        return currentUser;
      }
    }
  } catch (err) {
    console.error('[Supabase] Restore session error:', err);
  }

  currentUser = null;
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

// ---------------- QR SCANNER & PAIRING CODE ----------------

async function startQrScanner() {
  const wrapper = document.getElementById('qr-scanner-wrapper');
  const startBtn = document.getElementById('btn-start-qr');
  if (wrapper) wrapper.classList.remove('hidden');
  if (startBtn) startBtn.classList.add('hidden');

  try {
    if (window.Html5Qrcode) {
      if (html5QrScanner) {
        try { await html5QrScanner.stop(); } catch(_) {}
      }
      // Initialize with hardware acceleration and QR_CODE format only
      html5QrScanner = new Html5Qrcode("qr-reader", {
        formatsToSupport: [0 /* Html5QrcodeSupportedFormats.QR_CODE */],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        verbose: false
      });

      // Request high-resolution back camera for dense QR scanning
      const cameraConfig = {
        facingMode: "environment"
      };

      const scanConfig = { 
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Dynamic square maximizing scan area without cropping out dense codes
          const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.95);
          return { width: Math.max(edge, 240), height: Math.max(edge, 240) };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        videoConstraints: {
          facingMode: "environment",
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      };

      await html5QrScanner.start(
        cameraConfig,
        scanConfig,
        (decodedText) => {
          console.log('[QR] Detected payload from camera');
          stopQrScanner();
          applyPairingPayload(decodedText);
        },
        (errorMessage) => {
          // Normal frame scan attempt, ignore
        }
      );
    } else {
      showToast('QR scanner library not ready', 'error');
    }
  } catch (err) {
    console.error('[QR] Scanner start error:', err);
    let msg = 'Failed to start camera';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = 'Camera permission denied. Please grant camera permission or paste pairing code below.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = 'No camera found. Please paste pairing code below.';
    } else if (err.name === 'NotReadableError') {
      msg = 'Camera is in use by another app.';
    } else {
      msg = `Camera error: ${err.message || err}`;
    }
    showToast(msg, 'error');
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

async function pasteFromClipboardAndLink() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const input = document.getElementById('pairing-code-input');
        if (input) input.value = text.trim();
        showToast('Pasting from clipboard & linking...', 'info');
        await applyPairingPayload(text.trim());
        return;
      }
    }
    showToast('Please paste the code into the text box and tap Proceed.', 'info');
  } catch (err) {
    console.warn('[Clipboard] Error reading clipboard:', err);
    showToast('Please paste the code into the text box and tap Proceed.', 'info');
  }
}

async function handlePairingCodeSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('pairing-code-input');
  if (!input || !input.value.trim()) {
    showToast('Please paste the pairing string from your Windows PC', 'error');
    return;
  }
  await applyPairingPayload(input.value.trim());
}

async function applyPairingPayload(payloadStr) {
  if (!payloadStr) {
    showToast('Please enter or paste a pairing code', 'error');
    return;
  }
  try {
    let raw = payloadStr.trim().replace(/^["']|["']$/g, '');
    let payload = null;
    try {
      if (raw.startsWith('{')) {
        payload = JSON.parse(raw);
      } else {
        const cleaned = raw.replace(/[\r\n\s]/g, '');
        payload = JSON.parse(atob(cleaned));
      }
    } catch (parseErr) {
      console.error('[Pairing] Parse error:', parseErr);
      throw new Error('Invalid or unsupported QR / pairing code. Please scan the pairing QR code from Windows PC Settings.');
    }

    if (!payload || typeof payload !== 'object' || (!payload.password && (!payload.access_token || !payload.refresh_token))) {
      throw new Error('Malformed pairing payload. Missing authentication tokens.');
    }

    setSyncStatus('Pairing...', 'amber');
    showToast('Linking with Windows PC account...', 'info');
    if (!supabaseClient) initSupabase();

    currentUser = null;

    // Prefer dedicated credential login so Android gets its own independent session
    if (payload.email && payload.password) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: payload.email,
        password: payload.password
      });
      if (!error && data && data.user) {
        currentUser = data.user;
        await setSetting('cloud_user_password', payload.password);
      } else {
        console.warn('[Pairing] signInWithPassword failed, falling back to setSession:', error);
      }
    }

    // Fallback to session tokens if password login was not used or failed
    if (!currentUser && payload.access_token && payload.refresh_token) {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token
      });
      if (!error && data && data.user) {
        currentUser = data.user;
      } else if (error) {
        throw new Error(`Authentication error: ${error.message || error}`);
      }
    }

    if (!currentUser || !currentUser.id) {
      throw new Error('Pairing failed: Could not establish valid Supabase user session.');
    }

    // Persist session tokens and user metadata in app_settings
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      await setSetting('cloud_access_token', session.access_token);
      await setSetting('cloud_refresh_token', session.refresh_token);
    }
    await setSetting('cloud_user_id', currentUser.id);
    await setSetting('cloud_user_email', currentUser.email);
    await setSetting('cloud_sync_enabled', 'true');
    // Clear last sync time to force a full cloud pull on new pairing
    await setSetting('cloud_last_sync_time', '');

    updateAuthUI(currentUser.email);
    showToast(`Paired successfully as ${currentUser.email}! Downloading data...`, 'success');
    closeAllSheets();

    // Immediately pull full cloud database
    await syncNow();
    refreshCurrentView();
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
    await setSetting('cloud_access_token', '');
    await setSetting('cloud_refresh_token', '');
    await setSetting('cloud_user_password', '');
    await setSetting('cloud_user_id', '');
    await setSetting('cloud_user_email', '');
    await setSetting('cloud_sync_enabled', 'false');
    await setSetting('cloud_last_sync_time', '');

    updateAuthUI(null);
    setSyncStatus('Offline / Local', 'slate');
    showToast('Disconnected from cloud sync. Local data preserved.', 'info');
    refreshCurrentView();
  } catch (err) {
    console.error('[Auth] Logout error:', err);
  }
}

// ============================================================================
// 4. BIDIRECTIONAL DELTA SYNC ENGINE (MATCHES WINDOWS `cloud_sync.py`)
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
    console.error('SYNC ERROR\nSTAGE: AUTHENTICATION\nERROR: Cloud Sync is not logged in or disabled.');
    setSyncStatus('Not Logged In', 'rose');
    return;
  }

  // Verify and ensure active session with Supabase
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
      const restored = await restoreUserSession();
      if (!restored) {
        console.error('SYNC ERROR\nSTAGE: AUTHENTICATION\nERROR: Session expired and could not be restored.');
        setSyncStatus('Not Logged In', 'rose');
        return;
      }
    }
  } catch (authErr) {
    console.error('SYNC ERROR\nSTAGE: AUTHENTICATION\nERROR:', authErr);
    setSyncStatus('Auth Error', 'rose');
    return;
  }

  syncInProgress = true;
  setSyncStatus('Syncing...', 'amber');

  const userId = currentUser.id;
  console.log('SYNC START');
  console.log(`[Sync] Enabled: true, User ID: ${userId}`);

  try {
    let pushedCount = 0;
    let pulledCount = 0;

    const lastSyncTime = await getSetting('cloud_last_sync_time', '');
    const stores = ['subjects', 'chapters', 'lectures', 'tests', 'weekly_targets', 'study_sessions', 'revisions'];

    // 1. PUSH LOCAL PENDING CHANGES
    try {
      for (const st of stores) {
        const pushed = await pushStoreChanges(st, userId);
        pushedCount += pushed;
      }
      console.log(`UPLOAD RESULT: Pushed ${pushedCount} items`);
    } catch (pushErr) {
      console.error('SYNC ERROR\nSTAGE: UPLOAD\nERROR:', pushErr);
      throw pushErr;
    }

    // 2. PULL CLOUD CHANGES
    try {
      for (const st of stores) {
        const pulled = await pullStoreChanges(st, userId, lastSyncTime);
        pulledCount += pulled;
      }
      console.log(`DOWNLOAD RESULT: Pulled ${pulledCount} items`);
    } catch (pullErr) {
      console.error('SYNC ERROR\nSTAGE: DOWNLOAD\nERROR:', pullErr);
      throw pullErr;
    }

    // 3. MERGE SUCCESS CONFIRMATION
    console.log('MERGE RESULT: Successfully merged into IndexedDB');

    const nowIso = new Date().toISOString();
    await setSetting('cloud_last_sync_time', nowIso);

    const lastTimeElem = document.getElementById('sync-last-time');
    if (lastTimeElem) {
      const d = new Date(nowIso);
      lastTimeElem.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    setSyncStatus('Synced', 'emerald');
    await updatePendingCountUI();
    console.log(`SYNC SUCCESS: Pushed: ${pushedCount}, Pulled: ${pulledCount}`);
    if (pushedCount > 0 || pulledCount > 0) {
      showToast(`Synced! ↑${pushedCount} ↓${pulledCount}`, 'sync');
    } else {
      showToast('All data up to date with cloud', 'success');
    }
    refreshCurrentView();
  } catch (err) {
    const errMsg = err.message || String(err);
    console.error('SYNC ERROR\nSTAGE: GENERAL\nERROR:', errMsg);
    setSyncStatus(`Sync failed: ${errMsg.slice(0, 35)}`, 'rose');
    showToast(`Sync failed: ${errMsg.slice(0, 50)}`, 'error');
  } finally {
    syncInProgress = false;
  }
}

async function pushStoreChanges(storeName, userId) {
  const pendingItems = await dbGetPending(storeName);
  if (pendingItems.length === 0) return 0;

  console.log(`[Sync] Pushing ${pendingItems.length} pending items for ${storeName}`);
  const nowIso = new Date().toISOString();

  // Format payload for Supabase
  const payload = pendingItems.map(item => {
    const cleanItem = { ...item, user_id: userId };
    delete cleanItem.sync_status;
    cleanItem.updated_at = nowIso;

    // Normalize booleans for lectures / tests / revisions
    if (storeName === 'lectures') {
      cleanItem.is_completed = Boolean(cleanItem.is_completed);
      cleanItem.is_dpp_completed = Boolean(cleanItem.is_dpp_completed);
      cleanItem.revision1_done = Boolean(cleanItem.revision1_done);
      cleanItem.revision2_done = Boolean(cleanItem.revision2_done);
      cleanItem.is_backlog = Boolean(cleanItem.is_backlog);
      cleanItem.is_archived = Boolean(cleanItem.is_archived);
      console.log(`[Sync] -> Lecture ${cleanItem.lecture_no} (${cleanItem.client_id}): completed=${cleanItem.is_completed}, dpp=${cleanItem.is_dpp_completed}`);
    } else if (storeName === 'study_sessions') {
      cleanItem.duration_minutes = Number(cleanItem.duration_minutes) || 0;
      cleanItem.duration_hours = Number(cleanItem.duration_hours) || 0;
    } else if (storeName === 'revisions') {
      cleanItem.is_completed = Boolean(cleanItem.is_completed);
    }
    return cleanItem;
  });

  // Batch upsert in chunks of 50
  for (let i = 0; i < payload.length; i += 50) {
    const chunk = payload.slice(i, i + 50);
    const { data, error } = await supabaseClient.from(storeName).upsert(chunk, { onConflict: 'user_id,client_id' });
    if (error) {
      console.error(`[Sync] UPSERT FAILED for ${storeName}:`, error);
      throw error;
    }
    console.log(`[Sync] [OK] Upserted chunk ${i/50 + 1} for ${storeName} (${chunk.length} records)`);
  }

  // Mark local items as synced ONLY after successful cloud confirmation
  pendingItems.forEach(item => item.sync_status = 'synced');
  await dbPutBatch(storeName, pendingItems);

  return pendingItems.length;
}

async function pullStoreChanges(storeName, userId, lastSyncTime) {
  let allCloudRows = [];
  let from = 0;
  const pageSize = 1000;

  // Study sessions are never filtered by clock skew to prevent dropped records across devices
  let bufferedTime = null;
  if (lastSyncTime && storeName !== 'study_sessions') {
    const bufferMs = 60 * 1000;
    bufferedTime = new Date(new Date(lastSyncTime).getTime() - bufferMs).toISOString();
  }

  // Range pagination to fetch all rows reliably
  while (true) {
    let query = supabaseClient.from(storeName).select('*').eq('user_id', userId);
    if (bufferedTime) {
      query = query.gt('updated_at', bufferedTime);
    }
    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) {
      console.error(`[Sync] Pull error for ${storeName}:`, error);
      throw error;
    }
    if (!data || data.length === 0) break;
    allCloudRows = allCloudRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allCloudRows.length === 0) return 0;

  const localItems = await dbGetAll(storeName);
  const localMap = new Map();
  const externalMap = new Map();

  for (const it of localItems) {
    if (it.client_id) localMap.set(it.client_id, it);
    if (storeName === 'study_sessions' && it.external_session_id && it.source) {
      externalMap.set(`${it.source}_${it.external_session_id}`, it);
    }
  }

  const toSave = [];

  for (const cloudItem of allCloudRows) {
    // Normalize numeric fields for study sessions
    if (storeName === 'study_sessions') {
      cloudItem.duration_minutes = Number(cloudItem.duration_minutes) || 0;
      cloudItem.duration_hours = Number(cloudItem.duration_hours) || (Math.round((cloudItem.duration_minutes / 60) * 100) / 100);
    }

    let existing = localMap.get(cloudItem.client_id);
    let matchedByExternal = false;
    if (!existing && storeName === 'study_sessions' && cloudItem.external_session_id && cloudItem.source) {
      existing = externalMap.get(`${cloudItem.source}_${cloudItem.external_session_id}`);
      if (existing) matchedByExternal = true;
    }

    if (!existing) {
      // New from cloud — accept it
      cloudItem.sync_status = 'synced';
      toSave.push(cloudItem);
      if (storeName === 'lectures') {
        console.log(`[Sync] NEW from cloud: Lecture ${cloudItem.lecture_no} (${cloudItem.client_id}) completed=${cloudItem.is_completed}`);
      }
    } else {
      if (storeName === 'study_sessions') {
        // Study session conflict resolution:
        // 1. If local session has a pending deletion, protect it against cloud overwrite!
        if (existing.sync_status === 'pending' && existing.deleted_at) {
          continue;
        }

        // 2. If cloud deletion arrives, cloud tombstone wins
        if (cloudItem.deleted_at) {
          existing.deleted_at = cloudItem.deleted_at;
          existing.sync_status = 'synced';
          toSave.push(existing);
          continue;
        }

        // 3. If local session has pending changes and not deleted, keep local data
        if (existing.sync_status === 'pending' && (Number(existing.duration_minutes) || 0) >= cloudItem.duration_minutes) {
          continue;
        }

        // 4. Cloud is newer/greater or local is synced: accept cloudItem
        if (matchedByExternal && existing.client_id !== cloudItem.client_id) {
          // Delete old mismatched local ID to avoid duplicates
          await dbDelete('study_sessions', existing.client_id);
        }
        const merged = { ...existing, ...cloudItem, sync_status: 'synced' };
        toSave.push(merged);
      } else {
        // Standard conflict resolution:
        if (existing.sync_status === 'pending') {
          // Local has unpushed changes — keep local, skip cloud overwrite
          if (storeName === 'lectures') {
            console.log(`[Sync] SKIP (local pending): Lecture ${existing.lecture_no} (${cloudItem.client_id}) - local completed=${existing.is_completed}`);
          }
          continue;
        } else {
          // Local is synced — cloud update is newer, accept it
          const merged = { ...cloudItem, sync_status: 'synced' };
          toSave.push(merged);
          if (storeName === 'lectures' && cloudItem.is_completed !== existing.is_completed) {
            console.log(`[Sync] UPDATE from cloud: Lecture ${cloudItem.lecture_no} (${cloudItem.client_id}) completed: ${existing.is_completed} → ${cloudItem.is_completed}`);
          }
        }
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
// 5. STUDY ANALYTICS & POMODORO CALCULATIONS (MATCHES WINDOWS ENGINE)
// ============================================================================

async function calculateStudyAnalytics(timeFilter = 'all_time') {
  const sessions = await dbGetAll('study_sessions');
  // Pomodoro sessions only (exclude Physical Chemistry syllabus tracking hours)
  const activeSessions = sessions.filter(s => 
    !s.deleted_at && 
    (s.source === 'Pomodoro' || (s.subject !== 'Physical Chemistry' && !s.client_id?.startsWith('pch_') && !s.external_session_id?.startsWith('pch_')))
  );

  const todayStr = getTodayDateStr();
  const { weekStart, weekEnd } = getWeekDateRange(todayStr);
  const curDate = new Date();
  const monthStart = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}-01`;

  const getSessionMins = (s) => {
    if (s.duration_minutes != null && Number(s.duration_minutes) > 0) {
      return Number(s.duration_minutes);
    }
    return Math.round((Number(s.duration_hours) || 0) * 60);
  };

  // 1. Today
  const todaySessions = activeSessions.filter(s => s.date === todayStr);
  let todayMins = 0;
  todaySessions.forEach(s => {
    todayMins += getSessionMins(s);
  });
  const todayHours = Math.round((todayMins / 60) * 100) / 100;
  const todayAvgDur = todaySessions.length > 0 ? Math.round(todayMins / todaySessions.length) : 0;

  // 2. Week (Mon - Sun)
  const weekSessions = activeSessions.filter(s => s.date >= weekStart && s.date <= weekEnd);
  let weekMins = 0;
  const weekDatesSet = new Set();
  weekSessions.forEach(s => {
    weekMins += getSessionMins(s);
    if (s.date) weekDatesSet.add(s.date);
  });
  const weekHours = Math.round((weekMins / 60) * 100) / 100;
  const weekDaysStudied = weekDatesSet.size;

  // 3. Month
  const monthSessions = activeSessions.filter(s => s.date >= monthStart);
  let monthMins = 0;
  const monthDatesSet = new Set();
  monthSessions.forEach(s => {
    monthMins += getSessionMins(s);
    if (s.date) monthDatesSet.add(s.date);
  });
  const monthHours = Math.round((monthMins / 60) * 100) / 100;
  const monthDaysStudied = monthDatesSet.size;

  // 4. Total All-Time
  let totalMins = 0;
  const allDatesSet = new Set();
  activeSessions.forEach(s => {
    totalMins += getSessionMins(s);
    if (s.date) allDatesSet.add(s.date);
  });
  const totalHours = Math.round((totalMins / 60) * 100) / 100;
  const totalDaysStudied = allDatesSet.size;

  // 5. Streaks
  let currentStreak = 0;
  let checkDate = new Date();
  const dateToStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  while (allDatesSet.has(dateToStr(checkDate))) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  if (currentStreak === 0) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    while (allDatesSet.has(dateToStr(yesterday))) {
      currentStreak++;
      yesterday.setDate(yesterday.getDate() - 1);
    }
  }

  // 6. 28-Day Consistency Heatmap Grid
  const heatmapMatrix = [];
  const dayAbbrs = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  for (let d = 27; d >= 0; d--) {
    const dtObj = new Date();
    dtObj.setDate(dtObj.getDate() - d);
    const dStr = dateToStr(dtObj);

    const dSessions = activeSessions.filter(s => s.date === dStr);
    let dm = 0;
    dSessions.forEach(s => dm += getSessionMins(s));
    const dh = Math.round((dm / 60) * 100) / 100;

    let level = 0;
    if (dh > 0) {
      if (dh < 2.0) level = 1;
      else if (dh < 4.0) level = 2;
      else if (dh < 6.0) level = 3;
      else level = 4;
    }

    heatmapMatrix.push({
      date: dStr,
      day_name: dayAbbrs[dtObj.getDay()],
      hours: dh,
      formatted: formatMinutesStr(dm),
      sessions: dSessions.length,
      level: level
    });
  }

  // 7. Monday-Sunday Current Week Days Breakdown
  const weekDays = [];
  const dayAbbrs7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const curMon = parseLocalDate(weekStart);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(curMon);
    dt.setDate(curMon.getDate() + i);
    const ds = dateToStr(dt);
    const dsList = activeSessions.filter(s => s.date === ds);
    let dm = 0;
    dsList.forEach(s => dm += getSessionMins(s));
    weekDays.push({
      date: ds,
      dayName: dayAbbrs7[dt.getDay()],
      minutes: dm,
      hours: Math.round((dm / 60) * 10) / 10,
      formatted: formatMinutesStr(dm),
      isToday: ds === todayStr,
      sessionsCount: dsList.length
    });
  }

  // 8. Time Filter Chart Data
  let chartLabels = [];
  let chartValues = [];
  let filterTotalHours = 0;

  if (timeFilter === 'today') {
    if (todaySessions.length > 0) {
      chartLabels = todaySessions.map((s, i) => `#${i + 1} ${s.start_time || ''}`.trim());
      chartValues = todaySessions.map(s => Math.round((getSessionMins(s) / 60) * 100) / 100);
      filterTotalHours = todayHours;
    } else {
      chartLabels = ['Today'];
      chartValues = [0];
    }
  } else if (timeFilter === 'this_week') {
    const mon = parseLocalDate(weekStart);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      const ds = dateToStr(dt);
      const dsList = activeSessions.filter(s => s.date === ds);
      let hm = 0;
      dsList.forEach(s => hm += getSessionMins(s));
      const h = Math.round((hm / 60) * 100) / 100;
      chartLabels.push(dayAbbrs[dt.getDay()]);
      chartValues.push(h);
      filterTotalHours += h;
    }
  } else if (timeFilter === 'last_week') {
    const mon = parseLocalDate(weekStart);
    mon.setDate(mon.getDate() - 7);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      const ds = dateToStr(dt);
      const dsList = activeSessions.filter(s => s.date === ds);
      let hm = 0;
      dsList.forEach(s => hm += getSessionMins(s));
      const h = Math.round((hm / 60) * 100) / 100;
      chartLabels.push(dayAbbrs[dt.getDay()]);
      chartValues.push(h);
      filterTotalHours += h;
    }
  } else if (timeFilter === 'last_4_weeks') {
    for (let d = 27; d >= 0; d--) {
      const dtObj = new Date();
      dtObj.setDate(dtObj.getDate() - d);
      const dStr = dateToStr(dtObj);
      const dsList = activeSessions.filter(s => s.date === dStr);
      let hm = 0;
      dsList.forEach(s => hm += getSessionMins(s));
      const h = Math.round((hm / 60) * 100) / 100;
      chartLabels.push(dStr.slice(5));
      chartValues.push(h);
      filterTotalHours += h;
    }
  } else {
    // All Time (by Month)
    const monthMap = new Map();
    activeSessions.forEach(s => {
      if (s.date) {
        const mKey = s.date.slice(0, 7);
        const cur = monthMap.get(mKey) || 0;
        monthMap.set(mKey, cur + getSessionMins(s));
      }
    });
    if (monthMap.size > 0) {
      const sortedKeys = Array.from(monthMap.keys()).sort();
      chartLabels = sortedKeys;
      chartValues = sortedKeys.map(k => Math.round((monthMap.get(k) / 60) * 100) / 100);
      filterTotalHours = totalHours;
    } else {
      chartLabels = ['Total'];
      chartValues = [0];
    }
  }

  // 9. Recent Sessions (last 20)
  const recentSessions = [...activeSessions].sort((a, b) => {
    return (b.date || '').localeCompare(a.date || '') || (b.start_time || '').localeCompare(a.start_time || '');
  }).slice(0, 20);

  return {
    has_data: activeSessions.length > 0,
    today_summary: {
      hours: todayHours,
      minutes: todayMins,
      formatted: formatMinutesStr(todayMins),
      sessions: todaySessions.length,
      avg_duration: formatMinutesStr(todayAvgDur)
    },
    week_summary: {
      hours: weekHours,
      minutes: weekMins,
      formatted: formatMinutesStr(weekMins),
      days_studied: weekDaysStudied,
      sessions: weekSessions.length
    },
    month_summary: {
      hours: monthHours,
      minutes: monthMins,
      formatted: formatMinutesStr(monthMins),
      days_studied: monthDaysStudied,
      sessions: monthSessions.length
    },
    total_summary: {
      hours: totalHours,
      minutes: totalMins,
      formatted: formatMinutesStr(totalMins),
      days_studied: totalDaysStudied,
      sessions: activeSessions.length
    },
    week_days: weekDays,
    consistency: {
      current_streak: currentStreak,
      days_studied: totalDaysStudied,
      heatmap_matrix: heatmapMatrix
    },
    filtered_data: {
      filter: timeFilter,
      formatted: formatDurationStr(filterTotalHours),
      chart_labels: chartLabels,
      chart_values: chartValues
    },
    recent_sessions: recentSessions
  };
}

// ============================================================================
// 6. VIEW CONTROLLER & NAVIGATION
// ============================================================================

let currentPChemChapterId = null;

function switchView(viewName, param = null) {
  currentView = viewName;
  ['dashboard', 'subjects', 'pchem', 'lectures', 'practice', 'analytics'].forEach(v => {
    const elem = document.getElementById(`view-${v}`);
    if (elem) elem.classList.toggle('hidden', v !== viewName);
  });

  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const btnView = btn.getAttribute('data-view');
    const isActive = btnView === viewName || (viewName === 'pchem' && btnView === 'subjects');
    btn.classList.toggle('active', isActive);
  });

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'subjects') renderSubjectsView();
  if (viewName === 'pchem') {
    if (typeof param === 'string') currentPChemChapterId = param;
    renderPChemHourTracker(currentPChemChapterId);
  }
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
  if (viewName === 'analytics') {
    if (param === 'study_time' || param === 'jee_overview' || param === 'cloud_sync') {
      currentAnalyticsTab = param;
    }
    renderAnalyticsView();
  }

  if (window.lucide) lucide.createIcons();
}

function refreshCurrentView() {
  switchView(currentView, currentView === 'pchem' ? currentPChemChapterId : activeChapterFilter);
}

// Helper to extract completed hour numbers for a Physical Chemistry chapter
function getChapterCompletedHours(sessions, chapter) {
  const chapterName = typeof chapter === 'string' ? chapter : (chapter ? chapter.name : '');
  const chapterId = typeof chapter === 'object' && chapter ? chapter.client_id : (typeof chapter === 'string' ? chapter : '');
  const activeSessions = (sessions || []).filter(s => 
    !s.deleted_at && 
    (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry')) &&
    (s.chapter === chapterName || (chapterId && (s.client_id?.includes(chapterId) || s.external_session_id?.includes(chapterId))))
  );
  const hourSet = new Set();
  activeSessions.forEach(s => {
    const t = s.topic || '';
    if (t.startsWith('Hour ')) {
      const h = parseInt(t.replace('Hour ', '').trim(), 10);
      if (!isNaN(h)) hourSet.add(h);
    }
  });
  return hourSet;
}

// Toggle an individual hour for a Physical Chemistry chapter
async function toggleChapterHour(chapterClientId, hourNo) {
  const chapters = await dbGetAll('chapters');
  const ch = chapters.find(c => c.client_id === chapterClientId);
  if (!ch) return;

  const sessionId = `pch_${chapterClientId}_h${hourNo}`;
  const sessions = await dbGetAll('study_sessions');
  const existing = sessions.find(s => s.client_id === sessionId || s.external_session_id === sessionId);

  const nowIso = new Date().toISOString();
  if (existing) {
    if (existing.deleted_at) {
      existing.deleted_at = null;
      existing.updated_at = nowIso;
      existing.sync_status = 'pending';
      await dbPut('study_sessions', existing);
    } else {
      existing.deleted_at = nowIso;
      existing.updated_at = nowIso;
      existing.sync_status = 'pending';
      await dbPut('study_sessions', existing);
    }
  } else {
    const todayStr = getTodayDateStr();
    const newSession = {
      client_id: sessionId,
      source: 'Physical Chemistry',
      external_session_id: sessionId,
      date: todayStr,
      start_time: '00:00:00',
      end_time: '01:00:00',
      duration_minutes: 60,
      duration_hours: 1.0,
      subject: 'Physical Chemistry',
      chapter: ch.name,
      topic: `Hour ${hourNo}`,
      activity: 'Hours',
      notes: '',
      sync_status: 'pending',
      created_at: nowIso,
      updated_at: nowIso
    };
    await dbPut('study_sessions', newSession);
  }

  triggerDebouncedAutoSync();
  refreshCurrentView();
}

// ---------------- DYNAMIC GREETING & MOTIVATION HELPERS ----------------
function getGreeting(userName = 'Aayush', dateObj = new Date()) {
  const hour = dateObj.getHours();
  let timeStr = 'Good morning';
  let emoji = ' ☀️';
  if (hour >= 12 && hour < 17) {
    timeStr = 'Good afternoon';
    emoji = '';
  } else if (hour >= 17 && hour < 22) {
    timeStr = 'Good evening';
    emoji = '';
  } else if (hour >= 22 || hour < 5) {
    timeStr = 'Good night';
    emoji = '';
  }
  return `${timeStr}, ${userName}${emoji}`;
}

function getWeeklyTargetMotivation({
  weeklyTarget = 0,
  weeklyAchieved = 0,
  weeklyPct = 0,
  remainingTarget = 0,
  isAchieved = false,
  weeklyStudyMinutes = 0,
  dateObj = new Date()
}) {
  // If no target configured or target is 0
  if (!weeklyTarget || weeklyTarget <= 0) {
    if (weeklyStudyMinutes > 0) {
      return {
        text: "You're making steady progress this week. Set your weekly target to stay focused.",
        badge: "Study Active",
        status: "info",
        icon: "flame"
      };
    }
    return {
      text: "Set your weekly target to start tracking progress.",
      badge: "Set Target",
      status: "info",
      icon: "target"
    };
  }

  // 1. Target already achieved or exceeded
  if (isAchieved || weeklyPct >= 100 || remainingTarget === 0) {
    if (weeklyAchieved > weeklyTarget || weeklyPct > 100) {
      return {
        text: "You're ahead of your weekly target. Keep the momentum going.",
        badge: "Ahead of Target",
        status: "ahead",
        icon: "trending-up"
      };
    }
    return {
      text: "Weekly target achieved. Great work.",
      badge: "Target Achieved",
      status: "achieved",
      icon: "award"
    };
  }

  // 2. Close to target (within 20% or 2 units left)
  if (weeklyPct >= 80 || (remainingTarget <= 2 && remainingTarget > 0)) {
    return {
      text: "You're close to your weekly target. Keep going.",
      badge: "Almost There",
      status: "close",
      icon: "zap"
    };
  }

  // 3. Pace calculation based on current day of week and hour
  // Mon: day 1, Sun: day 7
  const day = dateObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayIndex = day === 0 ? 7 : day;
  const elapsedFraction = Math.min(1.0, ((dayIndex - 1) + (dateObj.getHours() / 24)) / 7);
  const expectedPacePct = Math.round(elapsedFraction * 100);

  // Ahead of pace
  if (weeklyPct >= expectedPacePct + 8 && weeklyAchieved > 0) {
    return {
      text: "You're ahead of your weekly target. Keep the momentum going.",
      badge: "Ahead of Pace",
      status: "ahead",
      icon: "trending-up"
    };
  }

  // Behind pace
  if (weeklyPct < expectedPacePct - 15) {
    return {
      text: "You're behind your weekly target. Keep pushing.",
      badge: "Behind Target",
      status: "behind",
      icon: "arrow-up-circle"
    };
  }

  // On pace
  return {
    text: "You're on track with your weekly target. Keep going.",
    badge: "On Track",
    status: "on_track",
    icon: "target"
  };
}

// ---------------- DASHBOARD ----------------
async function renderDashboard() {
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');
  const tests = await dbGetAll('tests');
  const weeklyTargets = await dbGetAll('weekly_targets');
  const studySessions = await dbGetAll('study_sessions');
  const studyData = await calculateStudyAnalytics('all_time');

  const todayStr = getTodayDateStr();
  const { weekStart, weekEnd } = getWeekDateRange(todayStr);

  const activeLectures = lectures.filter(l => !l.deleted_at);
  const totalLectures = activeLectures.length;
  const completedLectures = activeLectures.filter(l => l.is_completed).length;
  const lecsPct = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;

  // Physical Chemistry hours calculation from genuine chapters & session data
  const pcChapters = chapters.filter(c => !c.deleted_at && (c.subject_client_id === 'subj_physical_chemistry' || c.subject_id === 3));
  const pcTotalHours = pcChapters.reduce((acc, c) => acc + (Number(c.target_hours) || 0), 0) || (pcChapters.length > 0 ? 68 : 0);
  const pcCompletedHours = pcChapters.reduce((acc, ch) => acc + getChapterCompletedHours(studySessions, ch).size, 0);

  const totalUnits = totalLectures + pcTotalHours;
  const completedUnits = completedLectures + pcCompletedHours;
  const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
  const completedTests = tests.filter(t => !t.deleted_at && t.status === 'completed').length;

  // A. Dynamic Greeting & Date
  const now = new Date();
  let userName = await getSetting('user_name', '');
  if (!userName && currentUser) {
    userName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || (currentUser.email ? currentUser.email.split('@')[0] : '');
    if (userName) userName = userName.charAt(0).toUpperCase() + userName.slice(1);
  }
  if (!userName) userName = 'Aayush';

  const greetingElem = document.getElementById('dash-greeting');
  if (greetingElem) greetingElem.textContent = getGreeting(userName, now);

  const datePill = document.getElementById('dash-date-pill');
  if (datePill) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    datePill.textContent = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`;
  }

  // Streak update in header (0d if 0, genuine count)
  const streakCounter = document.getElementById('header-streak-text');
  if (streakCounter) {
    const streak = (studyData.consistency && typeof studyData.consistency.current_streak === 'number') ? studyData.consistency.current_streak : 0;
    streakCounter.textContent = `${streak}d Streak`;
  }

  // B. High-Contrast Macro Stats
  const lecsCompletedElem = document.getElementById('dash-lectures-completed');
  if (lecsCompletedElem) lecsCompletedElem.textContent = `${completedLectures}/${totalLectures}`;
  const lecsPctElem = document.getElementById('dash-lectures-pct');
  if (lecsPctElem) lecsPctElem.textContent = `${lecsPct}% Done`;
  
  const overallProgElem = document.getElementById('dash-overall-progress');
  if (overallProgElem) overallProgElem.textContent = `${progressPct}%`;
  const syllabusDetailElem = document.getElementById('dash-syllabus-detail');
  if (syllabusDetailElem) syllabusDetailElem.textContent = `${completedUnits}/${totalUnits} Units`;

  const testsDoneElem = document.getElementById('dash-tests-done');
  if (testsDoneElem) testsDoneElem.textContent = completedTests;
  const testsStatusElem = document.getElementById('dash-tests-status');
  if (testsStatusElem) {
    const upcomingTestsCount = tests.filter(t => !t.deleted_at && t.test_date >= todayStr && t.status !== 'completed').length;
    testsStatusElem.textContent = upcomingTestsCount > 0 ? `${upcomingTestsCount} Upcoming` : `${completedTests} Done`;
  }

  // C. Pomodoro / Study Time Analytics Card
  const studyTodayElem = document.getElementById('dash-study-today');
  if (studyTodayElem) studyTodayElem.textContent = formatMinutesStr(studyData.today_summary.minutes);
  const studyTodaySubElem = document.getElementById('dash-study-today-sub');
  if (studyTodaySubElem) studyTodaySubElem.textContent = formatMinutesStr(studyData.today_summary.minutes);

  const studyWeekElem = document.getElementById('dash-study-week');
  if (studyWeekElem) studyWeekElem.textContent = formatMinutesStr(studyData.week_summary.minutes);
  
  const studySessionsElem = document.getElementById('dash-study-sessions');
  if (studySessionsElem) studySessionsElem.textContent = studyData.today_summary.sessions;

  // Daily target
  const dailyTargetHours = Number(await getSetting('daily_target_hours', 6)) || 6;
  const targetDailyMinutes = dailyTargetHours * 60;
  const achievedDailyMinutes = studyData.today_summary.minutes || 0;
  const dailyTargetPct = targetDailyMinutes > 0 ? Math.min(100, Math.round((achievedDailyMinutes / targetDailyMinutes) * 100)) : 0;
  
  const studyProgressBar = document.getElementById('dash-study-progress-bar');
  if (studyProgressBar) studyProgressBar.style.width = `${dailyTargetPct}%`;
  const studyTargetText = document.getElementById('dash-study-target-text');
  if (studyTargetText) studyTargetText.textContent = `Daily Target: ${dailyTargetHours}h (${dailyTargetPct}% achieved)`;

  // D. Lecture Analytics Card
  const todayCompletedLecs = activeLectures.filter(l => 
    l.is_completed && 
    (l.completed_at ? l.completed_at.startsWith(todayStr) : l.scheduled_date === todayStr)
  ).length;

  const weekCompletedLecs = activeLectures.filter(l => 
    l.is_completed && 
    (l.completed_at ? (l.completed_at >= weekStart && l.completed_at <= weekEnd + 'T23:59:59') : (l.scheduled_date >= weekStart && l.scheduled_date <= weekEnd))
  ).length;

  const lecTodayElem = document.getElementById('dash-lec-today');
  if (lecTodayElem) lecTodayElem.textContent = `${todayCompletedLecs} lecs`;
  const lecWeekElem = document.getElementById('dash-lec-week');
  if (lecWeekElem) lecWeekElem.textContent = `${weekCompletedLecs} lecs`;
  const lecTotalElem = document.getElementById('dash-lec-total');
  if (lecTotalElem) lecTotalElem.textContent = `${completedLectures}/${totalLectures}`;
  const lecPctElem = document.getElementById('dash-lec-pct');
  if (lecPctElem) lecPctElem.textContent = `${lecsPct}%`;

  // F. Weekly Study Activity (Mon - Sun Bars)
  const activityContainer = document.getElementById('dash-weekly-activity-bars');
  if (activityContainer && studyData.week_days) {
    const maxDayMins = Math.max(...studyData.week_days.map(d => d.minutes), 60);
    activityContainer.innerHTML = studyData.week_days.map(day => {
      const heightPct = day.minutes > 0 ? Math.min(100, Math.max(12, Math.round((day.minutes / maxDayMins) * 100))) : 4;
      const barColor = day.isToday ? 'bg-indigo-600' : (day.minutes > 0 ? 'bg-amber-500' : 'bg-slate-200');
      const dayPill = day.isToday ? 'bg-indigo-600 text-white rounded px-1' : 'text-slate-500';

      return `
        <div class="flex flex-col items-center flex-1 min-w-0">
          <span class="text-[9px] font-bold text-slate-500 mb-1 truncate">${day.formatted !== '0h' && day.formatted !== '0m' ? day.formatted : '-'}</span>
          <div class="w-full h-24 bg-slate-100 rounded-lg flex items-end justify-center p-1 ${day.isToday ? 'ring-2 ring-indigo-500/30' : ''}">
            <div class="w-full rounded ${barColor} transition-all duration-300" style="height: ${heightPct}%;"></div>
          </div>
          <span class="text-[10px] font-bold mt-1.5 ${dayPill}">${day.dayName}</span>
        </div>
      `;
    }).join('');
  }
  const weeklyTotalHours = document.getElementById('dash-weekly-total-hours');
  if (weeklyTotalHours) weeklyTotalHours.textContent = `${formatMinutesStr(studyData.week_summary.minutes)} this week`;

  // H. Weekly Targets Quota Card & Motivation
  let totalWeeklyTargetUnits = 0;
  let totalWeeklyAchievedUnits = 0;

  const weeklyTargetsList = document.getElementById('dash-weekly-targets-list');
  if (weeklyTargetsList) {
    weeklyTargetsList.innerHTML = subjects.map(sub => {
      const custom = weeklyTargets.find(wt => wt.week_start === weekStart && wt.subject_client_id === sub.client_id);
      const targetVal = custom ? custom.target_value : sub.weekly_target_val;

      let achievedVal = 0;
      if (sub.target_type === 'hours') {
        const pSessions = (studySessions || []).filter(s => 
          !s.deleted_at &&
          (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry')) &&
          s.date >= weekStart && s.date <= weekEnd
        );
        let pMins = 0;
        pSessions.forEach(s => {
          pMins += (s.duration_minutes != null && Number(s.duration_minutes) > 0) ? Number(s.duration_minutes) : Math.round((Number(s.duration_hours) || 1) * 60);
        });
        achievedVal = Math.round(pMins / 60);
      } else {
        achievedVal = activeLectures.filter(l => 
          l.subject_client_id === sub.client_id && 
          l.is_completed && 
          (l.completed_at ? (l.completed_at >= weekStart && l.completed_at <= weekEnd + 'T23:59:59') : (l.scheduled_date >= weekStart && l.scheduled_date <= weekEnd))
        ).length;
      }

      totalWeeklyTargetUnits += (targetVal || 0);
      totalWeeklyAchievedUnits += achievedVal;

      const pct = targetVal > 0 ? Math.min(100, Math.round((achievedVal / targetVal) * 100)) : 0;
      const unit = sub.target_type === 'hours' ? 'h' : 'lecs';

      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-bold">
            <span class="text-slate-800">${sub.display_name || sub.name}</span>
            <span class="text-slate-500">${achievedVal}/${targetVal} ${unit} (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" style="width: ${pct}%; background-color: ${sub.color || '#4f46e5'};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  const remainingWeeklyUnits = Math.max(0, totalWeeklyTargetUnits - totalWeeklyAchievedUnits);
  const weeklyPct = totalWeeklyTargetUnits > 0 ? Math.round((totalWeeklyAchievedUnits / totalWeeklyTargetUnits) * 100) : 0;
  const isTargetAchieved = totalWeeklyTargetUnits > 0 && totalWeeklyAchievedUnits >= totalWeeklyTargetUnits;

  // Dynamic Weekly Target Motivation Banner Update
  const motivation = getWeeklyTargetMotivation({
    weeklyTarget: totalWeeklyTargetUnits,
    weeklyAchieved: totalWeeklyAchievedUnits,
    weeklyPct: weeklyPct,
    remainingTarget: remainingWeeklyUnits,
    isAchieved: isTargetAchieved,
    weeklyStudyMinutes: studyData.week_summary.minutes,
    dateObj: now
  });

  const motTextElem = document.getElementById('dash-motivation-text');
  if (motTextElem) motTextElem.textContent = motivation.text;

  const motBadgeElem = document.getElementById('dash-motivation-badge');
  if (motBadgeElem) {
    motBadgeElem.textContent = motivation.badge;
    motBadgeElem.className = 'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white ';
    if (motivation.status === 'achieved') motBadgeElem.className += 'bg-emerald-500/80';
    else if (motivation.status === 'ahead') motBadgeElem.className += 'bg-teal-500/80';
    else if (motivation.status === 'close') motBadgeElem.className += 'bg-amber-500/80';
    else if (motivation.status === 'behind') motBadgeElem.className += 'bg-rose-500/80';
    else motBadgeElem.className += 'bg-white/25';
  }

  const motStatElem = document.getElementById('dash-motivation-stat');
  if (motStatElem) {
    motStatElem.textContent = totalWeeklyTargetUnits > 0 ? `${weeklyPct}% achieved (${totalWeeklyAchievedUnits}/${totalWeeklyTargetUnits})` : `${formatMinutesStr(studyData.week_summary.minutes)} studied`;
  }

  const motRemainingElem = document.getElementById('dash-motivation-remaining');
  if (motRemainingElem) {
    motRemainingElem.textContent = totalWeeklyTargetUnits > 0 ? (remainingWeeklyUnits === 0 ? 'Goal Met!' : `${remainingWeeklyUnits} left`) : '—';
    motRemainingElem.className = `text-sm font-black ${isTargetAchieved ? 'text-emerald-300' : 'text-white'}`;
  }

  const motIconElem = document.getElementById('dash-motivation-icon');
  if (motIconElem && motivation.icon) {
    motIconElem.setAttribute('data-lucide', motivation.icon);
  }

  const weeklyTargetTotal = document.getElementById('dash-weekly-target-total');
  if (weeklyTargetTotal) weeklyTargetTotal.textContent = `${totalWeeklyTargetUnits}`;
  const weeklyCompletedTotal = document.getElementById('dash-weekly-completed-total');
  if (weeklyCompletedTotal) weeklyCompletedTotal.textContent = `${totalWeeklyAchievedUnits}`;
  const weeklyRemainingTotal = document.getElementById('dash-weekly-remaining-total');
  if (weeklyRemainingTotal) weeklyRemainingTotal.textContent = `${remainingWeeklyUnits}`;
  const weeklyPctTotal = document.getElementById('dash-weekly-pct-total');
  if (weeklyPctTotal) weeklyPctTotal.textContent = `${weeklyPct}%`;
  const weeklyProgressBar = document.getElementById('dash-weekly-progress-bar');
  if (weeklyProgressBar) weeklyProgressBar.style.width = `${Math.min(100, weeklyPct)}%`;

  // E. JEE Test Analytics & Upcoming Card
  const testCompletedCount = document.getElementById('dash-test-completed-count');
  if (testCompletedCount) testCompletedCount.textContent = completedTests;

  const testAvgScore = document.getElementById('dash-test-avg-score');
  if (testAvgScore) {
    const scoredTests = tests.filter(t => !t.deleted_at && t.status === 'completed' && t.score != null && t.total_marks > 0);
    if (scoredTests.length > 0) {
      const avgPct = Math.round(scoredTests.reduce((acc, t) => acc + (t.score / t.total_marks) * 100, 0) / scoredTests.length);
      testAvgScore.textContent = `${avgPct}% Avg Score`;
    } else {
      testAvgScore.textContent = `${completedTests} Completed`;
    }
  }

  const activeTests = tests.filter(t => !t.deleted_at && t.test_date >= todayStr && t.status !== 'completed')
                           .sort((a, b) => (a.test_date || '').localeCompare(b.test_date || ''));
  const nextTest = activeTests[0];
  const upcomingCard = document.getElementById('dash-upcoming-test-card');
  if (upcomingCard) {
    if (nextTest) {
      upcomingCard.classList.remove('hidden');
      const daysLeft = Math.max(0, Math.ceil((new Date(nextTest.test_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24)));
      document.getElementById('dash-test-name').textContent = nextTest.test_name;
      document.getElementById('dash-test-pill-type').textContent = nextTest.test_type || 'Part Test';
      document.getElementById('dash-test-date').textContent = nextTest.test_date;
      document.getElementById('dash-test-days-left').textContent = daysLeft === 0 ? 'Today' : `In ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
      document.getElementById('dash-test-syllabus').textContent = nextTest.physics_syllabus || nextTest.notes || 'Full JEE Syllabus';
    } else {
      upcomingCard.classList.add('hidden');
    }
  }

  // Subject Progress Overview (Includes Physical Chemistry as hours)
  const subjectListElem = document.getElementById('dash-subject-progress-list');
  if (subjectListElem) {
    subjectListElem.innerHTML = subjects.map(sub => {
      let subDone = 0;
      let subTotal = 0;
      let unit = 'Lecs';
      if (sub.target_type === 'hours') {
        subDone = pcCompletedHours;
        subTotal = pcTotalHours;
        unit = 'Hours';
      } else {
        const subLectures = activeLectures.filter(l => l.subject_client_id === sub.client_id);
        subDone = subLectures.filter(l => l.is_completed).length;
        subTotal = subLectures.length;
      }
      const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0;

      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-bold">
            <span class="text-slate-700">${sub.display_name || sub.name}</span>
            <span class="text-slate-500">${subDone}/${subTotal} ${unit} (${pct}%)</span>
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

// Chemistry branch filter state: 'all' | 'physical' | 'inorganic' | 'organic'
let currentChemistryBranch = 'all';

// ---------------- SUBJECTS & CHAPTERS ----------------
async function renderSubjectsView() {
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');
  const lectures = await dbGetAll('lectures');
  const studySessions = await dbGetAll('study_sessions');

  const tabsContainer = document.getElementById('subject-tabs-container');
  if (tabsContainer) {
    const isChemistryActive = currentSubjectFilter === 'chemistry' || 
      currentSubjectFilter === 'subj_physical_chemistry' || 
      currentSubjectFilter === 'subj_inorganic_chemistry' || 
      currentSubjectFilter === 'subj_organic_chemistry';

    tabsContainer.innerHTML = `
      <button onclick="setMainSubjectFilter('all')" class="pill ${currentSubjectFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
        All
      </button>
      <button onclick="setMainSubjectFilter('subj_physics')" class="pill ${currentSubjectFilter === 'subj_physics' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
        Physics
      </button>
      <button onclick="setMainSubjectFilter('subj_mathematics')" class="pill ${currentSubjectFilter === 'subj_mathematics' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
        Maths
      </button>
      <button onclick="setMainSubjectFilter('chemistry')" class="pill ${isChemistryActive ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'} whitespace-nowrap">
        Chemistry
      </button>
    `;

    // Add Chemistry Branch Sub-Tabs when Chemistry is active
    if (isChemistryActive) {
      tabsContainer.innerHTML += `
        <div class="w-full flex gap-1.5 pt-1.5 border-t border-slate-200/80 overflow-x-auto scrollbar-none">
          <button onclick="setChemistryBranch('all')" class="pill text-[11px] ${currentChemistryBranch === 'all' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            All Chem (30)
          </button>
          <button onclick="setChemistryBranch('physical')" class="pill text-[11px] ${currentChemistryBranch === 'physical' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Physical (9 ch &bull; 68h)
          </button>
          <button onclick="setChemistryBranch('inorganic')" class="pill text-[11px] ${currentChemistryBranch === 'inorganic' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Inorganic (9 ch)
          </button>
          <button onclick="setChemistryBranch('organic')" class="pill text-[11px] ${currentChemistryBranch === 'organic' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Organic (12 ch)
          </button>
        </div>
      `;
    }
  }

  const chaptersContainer = document.getElementById('chapters-list-container');
  if (!chaptersContainer) return;

  // CASE 1: ALL SUBJECTS VIEW
  // Displays the 3 main subject cards (Physics, Mathematics, Chemistry)
  // Chemistry card explicitly exposes the 3 branches: Physical (Hour-based), Inorganic (Lecture-based), Organic (Lecture-based)
  if (currentSubjectFilter === 'all') {
    const activeLectures = lectures.filter(l => !l.deleted_at);

    // Physics Stats (33 chapters)
    const phyLectures = activeLectures.filter(l => l.subject_client_id === 'subj_physics');
    const phyDone = phyLectures.filter(l => l.is_completed).length;
    const phyPct = phyLectures.length > 0 ? Math.round((phyDone / phyLectures.length) * 100) : 0;

    // Maths Stats (28 chapters)
    const mathLectures = activeLectures.filter(l => l.subject_client_id === 'subj_mathematics');
    const mathDone = mathLectures.filter(l => l.is_completed).length;
    const mathPct = mathLectures.length > 0 ? Math.round((mathDone / mathLectures.length) * 100) : 0;

    // Chemistry Branches:
    // 1. Physical Chemistry: 9 chapters, 68 hours (Hour-based)
    const pcSessions = (studySessions || []).filter(s => 
      !s.deleted_at && (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry'))
    );
    const pcCompletedHours = pcSessions.length;
    const pcTotalHours = 68;
    const pcPct = Math.round((pcCompletedHours / pcTotalHours) * 100);

    // 2. Inorganic Chemistry: 9 chapters (Lecture-based)
    const iocLectures = activeLectures.filter(l => l.subject_client_id === 'subj_inorganic_chemistry');
    const iocDone = iocLectures.filter(l => l.is_completed).length;
    const iocPct = iocLectures.length > 0 ? Math.round((iocDone / iocLectures.length) * 100) : 0;

    // 3. Organic Chemistry: 12 chapters (Lecture-based)
    const ocLectures = activeLectures.filter(l => l.subject_client_id === 'subj_organic_chemistry');
    const ocDone = ocLectures.filter(l => l.is_completed).length;
    const ocPct = ocLectures.length > 0 ? Math.round((ocDone / ocLectures.length) * 100) : 0;

    chaptersContainer.innerHTML = `
      <div class="space-y-3.5">
        <!-- 1. PHYSICS CARD -->
        <div class="touch-card p-4 space-y-3 border-l-4 border-indigo-600 cursor-pointer transition active:scale-99" onclick="setMainSubjectFilter('subj_physics')">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm">
                PHY
              </div>
              <div>
                <h3 class="text-sm font-black text-slate-900">Physics</h3>
                <span class="text-[11px] text-slate-500 font-semibold">33 Chapters &bull; Lecture-based</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-sm font-black text-indigo-600">${phyPct}%</span>
              <div class="text-[11px] text-slate-400 font-bold">${phyDone}/${phyLectures.length} Lecs</div>
            </div>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300 bg-indigo-600" style="width: ${phyPct}%"></div>
          </div>
        </div>

        <!-- 2. MATHEMATICS CARD -->
        <div class="touch-card p-4 space-y-3 border-l-4 border-emerald-600 cursor-pointer transition active:scale-99" onclick="setMainSubjectFilter('subj_mathematics')">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm">
                MTH
              </div>
              <div>
                <h3 class="text-sm font-black text-slate-900">Mathematics</h3>
                <span class="text-[11px] text-slate-500 font-semibold">28 Chapters &bull; Lecture-based</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-sm font-black text-emerald-600">${mathPct}%</span>
              <div class="text-[11px] text-slate-400 font-bold">${mathDone}/${mathLectures.length} Lecs</div>
            </div>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300 bg-emerald-600" style="width: ${mathPct}%"></div>
          </div>
        </div>

        <!-- 3. CHEMISTRY CARD WITH 3 EXPLICIT BRANCHES -->
        <div class="touch-card p-4 space-y-3.5 border-l-4 border-amber-600">
          <div class="flex items-center justify-between cursor-pointer" onclick="setMainSubjectFilter('chemistry')">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm">
                CHM
              </div>
              <div>
                <h3 class="text-sm font-black text-slate-900">Chemistry</h3>
                <span class="text-[11px] text-slate-500 font-semibold">30 Chapters across 3 Branches</span>
              </div>
            </div>
            <button onclick="event.stopPropagation(); setMainSubjectFilter('chemistry');" class="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              View All &rarr;
            </button>
          </div>

          <!-- The 3 Explicit Chemistry Branches -->
          <div class="space-y-2 pt-1 border-t border-slate-100">
            <!-- Branch A: Physical Chemistry (Hour-based) -->
            <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition" onclick="setChemistryBranch('physical')">
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-black text-amber-950">Physical Chemistry</span>
                    <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Hour-based</span>
                  </div>
                  <div class="text-[10px] text-amber-800 font-medium mt-0.5">9 Chapters &bull; 68 Target Hours</div>
                </div>
                <div class="text-right">
                  <span class="text-xs font-black text-amber-800">${pcPct}%</span>
                  <div class="text-[10px] text-amber-700 font-bold">${pcCompletedHours}/${pcTotalHours} Hours</div>
                </div>
              </div>
              <div class="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden mt-2">
                <div class="h-full rounded-full transition-all duration-300 bg-amber-500" style="width: ${pcPct}%"></div>
              </div>
            </div>

            <!-- Branch B: Inorganic Chemistry (Lecture-based) -->
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition" onclick="setChemistryBranch('inorganic')">
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-black text-slate-800">Inorganic Chemistry</span>
                    <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Lecture-based</span>
                  </div>
                  <div class="text-[10px] text-slate-500 font-medium mt-0.5">9 Chapters &bull; ${iocLectures.length} Lectures</div>
                </div>
                <div class="text-right">
                  <span class="text-xs font-black text-slate-700">${iocPct}%</span>
                  <div class="text-[10px] text-slate-400 font-bold">${iocDone}/${iocLectures.length} Lecs</div>
                </div>
              </div>
              <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div class="h-full rounded-full transition-all duration-300 bg-slate-600" style="width: ${iocPct}%"></div>
              </div>
            </div>

            <!-- Branch C: Organic Chemistry (Lecture-based) -->
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition" onclick="setChemistryBranch('organic')">
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-black text-slate-800">Organic Chemistry</span>
                    <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Lecture-based</span>
                  </div>
                  <div class="text-[10px] text-slate-500 font-medium mt-0.5">12 Chapters &bull; ${ocLectures.length} Lectures</div>
                </div>
                <div class="text-right">
                  <span class="text-xs font-black text-slate-700">${ocPct}%</span>
                  <div class="text-[10px] text-slate-400 font-bold">${ocDone}/${ocLectures.length} Lecs</div>
                </div>
              </div>
              <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div class="h-full rounded-full transition-all duration-300 bg-slate-600" style="width: ${ocPct}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    return;
  }

  // CASE 2: FILTERED CHAPTERS VIEW (Physics, Mathematics, or Chemistry branches)
  const filteredChapters = chapters.filter(ch => {
    if (ch.deleted_at) return false;

    if (currentSubjectFilter === 'subj_physics') return ch.subject_client_id === 'subj_physics';
    if (currentSubjectFilter === 'subj_mathematics') return ch.subject_client_id === 'subj_mathematics';

    // Chemistry filtering
    const isChem = ch.subject_client_id === 'subj_physical_chemistry' || 
                   ch.subject_client_id === 'subj_inorganic_chemistry' || 
                   ch.subject_client_id === 'subj_organic_chemistry';

    if (!isChem) return false;

    if (currentChemistryBranch === 'physical') return ch.subject_client_id === 'subj_physical_chemistry';
    if (currentChemistryBranch === 'inorganic') return ch.subject_client_id === 'subj_inorganic_chemistry';
    if (currentChemistryBranch === 'organic') return ch.subject_client_id === 'subj_organic_chemistry';
    return true;
  }).sort((a, b) => {
    const subA = subjects.find(s => s.client_id === a.subject_client_id);
    const subB = subjects.find(s => s.client_id === b.subject_client_id);
    const subOrdA = subA ? (subA.sort_order || 0) : 0;
    const subOrdB = subB ? (subB.sort_order || 0) : 0;
    if (subOrdA !== subOrdB) return subOrdA - subOrdB;
    return (a.sequence_no || 0) - (b.sequence_no || 0);
  });

  if (filteredChapters.length === 0) {
    chaptersContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No chapters found for this selection.</div>`;
  } else {
    chaptersContainer.innerHTML = filteredChapters.map(ch => {
      const parentSub = subjects.find(s => s.client_id === ch.subject_client_id);
      const isHoursBased = parentSub && parentSub.target_type === 'hours';

      let doneCount = 0;
      let totalCount = 0;
      let unit = 'Lecs';

      if (isHoursBased) {
        const completedSet = getChapterCompletedHours(studySessions, ch);
        doneCount = completedSet.size;
        totalCount = ch.target_hours || 0;
        unit = 'Hours';
      } else {
        const chLectures = lectures.filter(l => !l.deleted_at && l.chapter_client_id === ch.client_id);
        doneCount = chLectures.filter(l => l.is_completed).length;
        totalCount = chLectures.length;
        unit = 'Lecs';
      }

      const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      const color = parentSub ? parentSub.color : '#4f46e5';

      return `
        <div class="touch-card p-3.5 space-y-2 border-l-4 transition active:scale-99 cursor-pointer" style="border-left-color: ${color}" onclick="openChapter('${ch.client_id}')">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">CH ${ch.sequence_no != null ? ch.sequence_no : ''}</span>
              <h3 class="text-xs font-bold text-slate-800 mt-1">${ch.name}</h3>
            </div>
            <div class="text-right">
              <span class="text-xs font-black" style="color: ${color}">${pct}%</span>
              <div class="text-[10px] text-slate-400">${doneCount}/${totalCount} ${unit}</div>
            </div>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300" style="width: ${pct}%; background-color: ${color}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (window.lucide) lucide.createIcons();
}

function setMainSubjectFilter(subKey) {
  currentSubjectFilter = subKey;
  if (subKey === 'chemistry') {
    currentChemistryBranch = 'all';
  }
  renderSubjectsView();
}

function setChemistryBranch(branchKey) {
  currentSubjectFilter = 'chemistry';
  currentChemistryBranch = branchKey;
  renderSubjectsView();
}

function filterSubjectChapters(subId) {
  currentSubjectFilter = subId;
  renderSubjectsView();
}

async function openChapter(chId) {
  const chapters = await dbGetAll('chapters');
  const ch = chapters.find(c => c.client_id === chId);
  if (!ch) return;
  if (ch.subject_client_id === 'subj_physical_chemistry') {
    currentPChemChapterId = chId;
    switchView('pchem', chId);
  } else {
    activeChapterFilter = chId;
    switchView('lectures', chId);
  }
}

function filterLecturesByChapter(chId) {
  openChapter(chId);
}

function clearChapterFilter() {
  activeChapterFilter = null;
  renderSubjectsView();
}

// ---------------- PHYSICAL CHEMISTRY HOUR TRACKER (HOUR-BASED ONLY) ----------------
async function renderPChemHourTracker(targetChapterId = null) {
  const chapters = await dbGetAll('chapters');
  const subjects = await dbGetAll('subjects');
  const studySessions = await dbGetAll('study_sessions');

  const container = document.getElementById('pchem-hours-container');
  if (!container) return;

  const pchemChapters = chapters
    .filter(c => !c.deleted_at && c.subject_client_id === 'subj_physical_chemistry')
    .sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));

  let activeChapter = null;
  if (targetChapterId) {
    activeChapter = pchemChapters.find(c => c.client_id === targetChapterId);
  }
  if (!activeChapter && pchemChapters.length > 0) {
    activeChapter = pchemChapters[0];
  }

  if (!activeChapter) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 text-xs">
        No Physical Chemistry chapters found.
      </div>
    `;
    return;
  }

  currentPChemChapterId = activeChapter.client_id;
  const targetHours = activeChapter.target_hours || 0;
  const completedSet = getChapterCompletedHours(studySessions, activeChapter);
  const completedCount = completedSet.size;
  const pct = targetHours > 0 ? Math.round((completedCount / targetHours) * 100) : 0;

  container.innerHTML = `
    <!-- Top Action & Navigation Bar -->
    <div class="flex items-center justify-between gap-2">
      <button onclick="switchView('subjects')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 active:scale-95 transition">
        <i data-lucide="arrow-left" class="w-4 h-4"></i> Chapters
      </button>

      <!-- Chapter Switcher Dropdown (1 to 9) -->
      <select onchange="renderPChemHourTracker(this.value)" class="bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-950 focus:outline-amber-500 shadow-xs max-w-[200px] truncate">
        ${pchemChapters.map(c => `
          <option value="${c.client_id}" ${c.client_id === activeChapter.client_id ? 'selected' : ''}>
            CH ${c.sequence_no}: ${c.name} (${c.target_hours}h)
          </option>
        `).join('')}
      </select>
    </div>

    <!-- Chapter Info Card -->
    <div class="card-amber p-4 space-y-2 rounded-2xl">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-black text-amber-800 uppercase tracking-wider">
          PHYSICAL CHEMISTRY &bull; CHAPTER ${activeChapter.sequence_no}
        </span>
        <span class="pill bg-amber-200/80 text-amber-950 font-black text-[11px]">
          ${completedCount} / ${targetHours} Hours (${pct}%)
        </span>
      </div>
      <h2 class="text-base font-black text-amber-950">${activeChapter.name}</h2>
      <div class="text-xs text-amber-800 font-semibold">
        Hour-based tracking &bull; Target: ${targetHours} hours
      </div>
      <div class="w-full h-2 bg-amber-200/60 rounded-full overflow-hidden mt-1">
        <div class="h-full rounded-full transition-all duration-300 bg-amber-500" style="width: ${pct}%;"></div>
      </div>
    </div>

    <!-- Hour Checklist (1 to target_hours) -->
    <div class="space-y-2 pt-1">
      <div class="text-xs font-black text-slate-700 uppercase tracking-wider px-1">
        Hour-by-Hour Checklist
      </div>
      ${Array.from({ length: targetHours }, (_, i) => i + 1).map(hNum => {
        const isDone = completedSet.has(hNum);
        return `
          <div class="touch-card p-3 flex items-center justify-between gap-3 ${isDone ? 'bg-amber-50/70 border-amber-300' : 'bg-white'} cursor-pointer transition active:scale-99" onclick="toggleChapterHour('${activeChapter.client_id}', ${hNum})">
            <div class="flex items-center gap-3">
              <div class="touch-checkbox ${isDone ? 'checked' : ''}" style="${isDone ? 'background-color: #f59e0b; border-color: #f59e0b;' : ''}">
                ${isDone ? '✓' : ''}
              </div>
              <span class="text-sm ${isDone ? 'text-amber-950 font-black' : 'text-slate-800 font-semibold'}">
                ${hNum} hour${hNum > 1 ? 's' : ''}
              </span>
            </div>
            <span class="text-[11px] font-bold ${isDone ? 'text-amber-700' : 'text-slate-400'}">
              ${isDone ? 'Completed' : 'Pending'}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// ---------------- LECTURE-BASED SUBJECTS CHECKLIST (NO PHYSICAL CHEMISTRY) ----------------
async function renderLecturesList(targetChapterId = null) {
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');

  const container = document.getElementById('lectures-container');
  if (!container) return;

  // STRICT RULE: Physical Chemistry is NEVER rendered in Lectures view!
  if (targetChapterId) {
    const chObj = chapters.find(c => c.client_id === targetChapterId);
    if (chObj && chObj.subject_client_id === 'subj_physical_chemistry') {
      switchView('pchem', targetChapterId);
      return;
    }
  }

  // All lecture-based chapters
  const lectureChapters = chapters
    .filter(c => !c.deleted_at && c.subject_client_id !== 'subj_physical_chemistry');

  let activeChapterObj = null;
  const chId = targetChapterId !== null ? targetChapterId : activeChapterFilter;
  if (chId) {
    activeChapterObj = lectureChapters.find(c => c.client_id === chId);
  }

  // If no chapter selected, default to Physics Chapter 1 (never Physical Chemistry!)
  if (!activeChapterObj) {
    activeChapterObj = lectureChapters.find(c => c.subject_client_id === 'subj_physics' && c.sequence_no === 1) || lectureChapters[0];
  }

  if (!activeChapterObj) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">No lecture chapters found. Go to Syllabus and select a chapter.</div>`;
    return;
  }

  activeChapterFilter = activeChapterObj.client_id;
  const parentSub = subjects.find(s => s.client_id === activeChapterObj.subject_client_id);
  const color = parentSub ? parentSub.color : '#4f46e5';

  // Chapters of the same subject for dropdown switcher
  const siblingChapters = lectureChapters
    .filter(c => c.subject_client_id === activeChapterObj.subject_client_id)
    .sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));

  // Populate subject filter dropdown with ONLY lecture-based subjects
  const subSelect = document.getElementById('lecture-subject-filter');
  if (subSelect && subSelect.options.length <= 1) {
    const lectureSubjects = subjects.filter(s => !s.deleted_at && s.target_type === 'lectures');
    subSelect.innerHTML = `<option value="all">All Lecture Subjects</option>` + lectureSubjects.map(s => `
      <option value="${s.client_id}">${s.display_name || s.name}</option>
    `).join('');
  }

  // Get and sort lectures
  let chapterLectures = lectures
    .filter(l => !l.deleted_at && l.chapter_client_id === activeChapterObj.client_id)
    .sort((a, b) => (a.lecture_no || 0) - (b.lecture_no || 0));

  const completedLecs = chapterLectures.filter(l => l.is_completed).length;
  const completedDpps = chapterLectures.filter(l => l.is_dpp_completed).length;
  const pct = chapterLectures.length > 0 ? Math.round((completedLecs / chapterLectures.length) * 100) : 0;

  // Filter by search / status if applicable
  const searchInput = document.getElementById('lecture-search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  let displayLectures = chapterLectures;

  if (query) {
    displayLectures = displayLectures.filter(l => 
      (l.lecture_name && l.lecture_name.toLowerCase().includes(query)) ||
      (l.topic && l.topic.toLowerCase().includes(query)) ||
      String(l.lecture_no).includes(query)
    );
  }

  if (currentLectureStatusFilter === 'pending') {
    displayLectures = displayLectures.filter(l => !l.is_completed);
  } else if (currentLectureStatusFilter === 'completed') {
    displayLectures = displayLectures.filter(l => l.is_completed);
  }

  let headerHtml = `
    <!-- Top Nav: Return button + Chapter Switcher -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <button onclick="switchView('subjects')" class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 active:scale-95 transition">
        <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Chapters
      </button>

      <select onchange="openChapter(this.value)" class="bg-white border border-indigo-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-indigo-950 focus:outline-indigo-500 shadow-xs max-w-[200px] truncate">
        ${siblingChapters.map(c => `
          <option value="${c.client_id}" ${c.client_id === activeChapterObj.client_id ? 'selected' : ''}>
            CH ${c.sequence_no}: ${c.name}
          </option>
        `).join('')}
      </select>
    </div>

    <!-- Chapter Header Card -->
    <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-3">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-black text-indigo-600 uppercase tracking-wider">
          ${parentSub ? (parentSub.display_name || parentSub.name) : 'Subject'} &bull; CH ${activeChapterObj.sequence_no}
        </span>
        <span class="text-xs font-black text-indigo-700">${pct}%</span>
      </div>
      <h2 class="text-sm font-black text-slate-900 mt-0.5">${activeChapterObj.name}</h2>
      <div class="text-xs font-bold text-slate-600 mt-1">
        <span class="text-indigo-700 font-extrabold">${completedLecs}/${chapterLectures.length} Lectures</span> &bull; 
        <span class="text-amber-700 font-extrabold">${completedDpps}/${chapterLectures.length} DPPs</span>
      </div>
      <div class="w-full h-1.5 bg-indigo-200/60 rounded-full overflow-hidden mt-2">
        <div class="h-full rounded-full transition-all duration-300 bg-indigo-600" style="width: ${pct}%;"></div>
      </div>
    </div>
  `;

  if (displayLectures.length === 0) {
    container.innerHTML = headerHtml + `<div class="text-center py-8 text-slate-400 text-xs">No lectures matching filter.</div>`;
  } else {
    container.innerHTML = headerHtml + `
      <div class="space-y-2">
        ${displayLectures.map(l => `
          <div class="touch-card p-3 flex items-center justify-between gap-3 ${l.is_completed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white'}">
            <!-- Lecture Checkbox + Number ONLY (clean, no repeated chapter title) -->
            <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="toggleLectureCompletion('${l.client_id}')">
              <div class="touch-checkbox ${l.is_completed ? 'checked' : ''}">
                ${l.is_completed ? '✓' : ''}
              </div>
              <div class="min-w-0">
                <span class="text-sm font-bold ${l.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}">
                  Lecture ${l.lecture_no}
                </span>
                ${l.topic && l.topic !== `Lecture ${l.lecture_no}` ? `
                  <div class="text-[11px] text-slate-400 truncate">${l.topic}</div>
                ` : ''}
              </div>
            </div>

            <!-- DPP Checkbox Beside Each Lecture -->
            <div class="flex items-center gap-2 flex-shrink-0 cursor-pointer" onclick="toggleDppCompletion('${l.client_id}')">
              <span class="text-xs text-slate-500 font-bold">DPP</span>
              <div class="touch-checkbox ${l.is_dpp_completed ? 'checked' : ''}">
                ${l.is_dpp_completed ? '✓' : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

function setLectureStatusFilter(status) {
  currentLectureStatusFilter = status;
  ['all', 'pending', 'completed'].forEach(s => {
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

// ---------------- ANALYTICS & STUDY TIME ----------------
function switchAnalyticsTab(tab) {
  currentAnalyticsTab = tab;
  ['study', 'jee', 'sync'].forEach(t => {
    const subElem = document.getElementById(`an-sub-${t}`);
    if (subElem) {
      const match = (t === 'study' && tab === 'study_time') || (t === 'jee' && tab === 'jee_overview') || (t === 'sync' && tab === 'cloud_sync');
      subElem.classList.toggle('hidden', !match);
    }
  });

  ['study', 'jee', 'sync'].forEach(t => {
    const btn = document.getElementById(`an-tab-${t}`);
    if (btn) {
      const match = (t === 'study' && tab === 'study_time') || (t === 'jee' && tab === 'jee_overview') || (t === 'sync' && tab === 'cloud_sync');
      if (match) {
        btn.className = 'py-1.5 rounded-lg bg-white text-indigo-700 shadow-xs font-bold';
      } else {
        btn.className = 'py-1.5 rounded-lg text-slate-600 font-bold';
      }
    }
  });

  renderAnalyticsView();
}

function setPomodoroTimeFilter(filter) {
  currentPomodoroFilter = filter;
  ['today', 'this_week', 'last_week', 'this_month', 'last_month', 'last_4_weeks', 'all_time'].forEach(f => {
    const btn = document.getElementById(`pf-${f}`);
    if (btn) {
      btn.classList.toggle('active', f === filter);
    }
  });
  renderAnalyticsView();
}

async function renderAnalyticsView() {
  const studyData = await calculateStudyAnalytics(currentPomodoroFilter);
  const subjects = await dbGetAll('subjects');
  const lectures = await dbGetAll('lectures');
  const weeklyTargets = await dbGetAll('weekly_targets');
  const studySessions = await dbGetAll('study_sessions');

  const activeLectures = lectures.filter(l => !l.deleted_at);
  const completedLecs = activeLectures.filter(l => l.is_completed).length;
  const completedDpps = activeLectures.filter(l => l.is_dpp_completed).length;
  const lecsPct = activeLectures.length > 0 ? Math.round((completedLecs / activeLectures.length) * 100) : 0;
  const dppsPct = activeLectures.length > 0 ? Math.round((completedDpps / activeLectures.length) * 100) : 0;

  // 1. Study Time Subtab Stats
  const statToday = document.getElementById('pomo-stat-today');
  const statTodaySub = document.getElementById('pomo-stat-today-sub');
  const statWeek = document.getElementById('pomo-stat-week');
  const statWeekSub = document.getElementById('pomo-stat-week-sub');
  const statMonth = document.getElementById('pomo-stat-month');
  const statMonthSub = document.getElementById('pomo-stat-month-sub');
  const statTotal = document.getElementById('pomo-stat-total');
  const statTotalSub = document.getElementById('pomo-stat-total-sub');

  if (statToday) statToday.textContent = studyData.today_summary.formatted;
  if (statTodaySub) statTodaySub.textContent = `${studyData.today_summary.sessions} sessions`;
  if (statWeek) statWeek.textContent = studyData.week_summary.formatted;
  if (statWeekSub) statWeekSub.textContent = `${studyData.week_summary.days_studied} studied days`;
  if (statMonth) statMonth.textContent = studyData.month_summary.formatted;
  if (statMonthSub) statMonthSub.textContent = `${studyData.month_summary.days_studied} studied days`;
  if (statTotal) statTotal.textContent = studyData.total_summary.formatted;
  if (statTotalSub) statTotalSub.textContent = `${studyData.total_summary.sessions} sessions`;

  const filterSummary = document.getElementById('pomo-filter-summary');
  if (filterSummary) filterSummary.textContent = `Total: ${studyData.filtered_data.formatted}`;

  // Study Time Trend Chart
  const pomoCanvas = document.getElementById('chart-pomo-filter');
  if (pomoCanvas && window.Chart) {
    if (chartPomoInstance) chartPomoInstance.destroy();
    chartPomoInstance = new Chart(pomoCanvas, {
      type: 'bar',
      data: {
        labels: studyData.filtered_data.chart_labels,
        datasets: [{
          label: 'Study Hours',
          data: studyData.filtered_data.chart_values,
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
          x: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  // Heatmap Matrix
  const heatmapContainer = document.getElementById('heatmap-container');
  const heatmapDaysCount = document.getElementById('heatmap-days-count');
  const heatmapStreakCount = document.getElementById('heatmap-streak-count');
  if (heatmapDaysCount) heatmapDaysCount.textContent = `${studyData.consistency.days_studied} Days`;
  if (heatmapStreakCount) heatmapStreakCount.textContent = `🔥 ${studyData.consistency.current_streak}d Streak`;

  if (heatmapContainer) {
    heatmapContainer.innerHTML = (studyData.consistency.heatmap_matrix || []).map(c => `
      <div class="heatmap-cell level-${c.level} text-center flex flex-col justify-center" title="${c.date}: ${c.formatted} (${c.sessions} sessions)">
        <span class="text-[9px] font-bold text-slate-500">${c.day_name}</span>
        <span class="text-[10px] font-black text-slate-800">${c.hours > 0 ? c.hours + 'h' : '—'}</span>
      </div>
    `).join('');
  }

  // Recent Sessions List
  const recentContainer = document.getElementById('recent-sessions-list');
  const recentCountElem = document.getElementById('recent-sessions-count');
  if (recentCountElem) recentCountElem.textContent = `${(studyData.recent_sessions || []).length} Sessions`;

  if (recentContainer) {
    if ((studyData.recent_sessions || []).length === 0) {
      recentContainer.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">No study sessions imported yet.</div>`;
    } else {
      recentContainer.innerHTML = studyData.recent_sessions.map(s => `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <div class="font-bold text-slate-800">${escapeHtml(s.subject || 'Study Session')}</div>
            <div class="text-[10px] text-slate-500">📅 ${s.date} ${s.start_time ? '• ' + s.start_time : ''}</div>
          </div>
          <div class="flex items-center gap-2.5">
            <div class="text-right">
              <div class="font-black text-amber-700">${formatDurationStr(s.duration_hours)}</div>
              <div class="text-[10px] text-slate-400">${s.source || 'Pomodoro'}</div>
            </div>
            <button type="button" onclick="confirmDeleteStudySession('${s.client_id}')" class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition active:scale-95 cursor-pointer" title="Delete session" aria-label="Delete session">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. JEE Progress Subtab Stats
  const jeeLecPctElem = document.getElementById('an-jee-lec-pct');
  const jeeLecDetailElem = document.getElementById('an-jee-lec-detail');
  const jeeDppPctElem = document.getElementById('an-jee-dpp-pct');
  const jeeDppDetailElem = document.getElementById('an-jee-dpp-detail');

  if (jeeLecPctElem) jeeLecPctElem.textContent = `${lecsPct}%`;
  if (jeeLecDetailElem) jeeLecDetailElem.textContent = `${completedLecs} / ${activeLectures.length} completed`;
  if (jeeDppPctElem) jeeDppPctElem.textContent = `${dppsPct}%`;
  if (jeeDppDetailElem) jeeDppDetailElem.textContent = `${completedDpps} / ${activeLectures.length} completed`;

  // JEE Subject Doughnut Chart
  const jeeCanvas = document.getElementById('chart-subject-distribution');
  if (jeeCanvas && window.Chart) {
    if (chartJeeInstance) chartJeeInstance.destroy();

    const pcCompletedHours = (studySessions || []).filter(s => 
      !s.deleted_at && (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry'))
    ).length;

    const labels = subjects.map(s => s.display_name || s.name);
    const data = subjects.map(s => {
      if (s.target_type === 'hours') return pcCompletedHours;
      return activeLectures.filter(l => l.subject_client_id === s.client_id && l.is_completed).length;
    });
    const colors = subjects.map(s => s.color || '#4f46e5');

    chartJeeInstance = new Chart(jeeCanvas, {
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
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } } }
        },
        cutout: '65%'
      }
    });
  }

  // Weekly Targets Quota Summary
  const targetsSummary = document.getElementById('an-weekly-targets-summary');
  if (targetsSummary) {
    const todayStr = getTodayDateStr();
    const { weekStart, weekEnd } = getWeekDateRange(todayStr);

    targetsSummary.innerHTML = subjects.map(sub => {
      const custom = weeklyTargets.find(wt => wt.week_start === weekStart && wt.subject_client_id === sub.client_id);
      const targetVal = custom ? custom.target_value : sub.weekly_target_val;
      let achieved = 0;
      if (sub.target_type === 'lectures') {
        achieved = activeLectures.filter(l => 
          l.subject_client_id === sub.client_id && l.is_completed && 
          ((l.completed_at && l.completed_at >= weekStart && l.completed_at <= weekEnd + 'T23:59:59') || (l.scheduled_date >= weekStart && l.scheduled_date <= weekEnd))
        ).length;
      } else {
        const pSessions = (studyData.recent_sessions || []).filter(s => 
          (s.subject.includes('Physical') || s.subject === 'Physical Chemistry') &&
          s.date >= weekStart && s.date <= weekEnd
        );
        let ph = 0;
        pSessions.forEach(s => ph += (Number(s.duration_hours) || 0));
        achieved = Math.round(ph * 10) / 10;
      }
      const pct = targetVal > 0 ? Math.min(100, Math.round((achieved / targetVal) * 100)) : 0;
      const unit = sub.target_type === 'lectures' ? 'lecs' : 'h';

      return `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <div class="font-bold text-slate-800">${sub.display_name || sub.name}</div>
            <div class="text-[10px] text-slate-500">Target: ${targetVal} ${unit}</div>
          </div>
          <div class="text-right">
            <span class="font-bold text-indigo-600">${achieved}/${targetVal} (${pct}%)</span>
          </div>
        </div>
      `;
    }).join('');
  }

  await updatePendingCountUI();
  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// 7. MODALS & FORMS
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

async function openLogStudyModal() {
  const subjects = await dbGetAll('subjects');
  const subSelect = document.getElementById('study-form-subject');
  if (subSelect) {
    subSelect.innerHTML = subjects.map(s => `
      <option value="${s.client_id}">${s.display_name || s.name}</option>
    `).join('');
  }
  const dateInput = document.getElementById('study-form-date');
  if (dateInput) dateInput.value = getTodayDateStr();
  const durInput = document.getElementById('study-form-duration');
  if (durInput) durInput.value = 60;
  const topicInput = document.getElementById('study-form-topic');
  if (topicInput) topicInput.value = '';

  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-log-study').classList.add('open');
}

async function handleLogStudySubmit(e) {
  e.preventDefault();
  const subId = document.getElementById('study-form-subject').value;
  const subjects = await dbGetAll('subjects');
  const sub = subjects.find(s => s.client_id === subId);
  const subjectName = sub ? (sub.display_name || sub.name) : 'Study Session';
  const date = document.getElementById('study-form-date').value || getTodayDateStr();
  const durationMins = parseInt(document.getElementById('study-form-duration').value, 10) || 60;
  const topic = document.getElementById('study-form-topic').value.trim() || 'Focus Session';
  const nowIso = new Date().toISOString();

  const newSession = {
    client_id: generateUUID(),
    source: 'Pomodoro',
    external_session_id: `manual_${Date.now()}`,
    date: date,
    start_time: new Date().toTimeString().slice(0, 8),
    end_time: new Date(Date.now() + durationMins * 60000).toTimeString().slice(0, 8),
    duration_minutes: durationMins,
    duration_hours: Math.round((durationMins / 60) * 100) / 100,
    subject: subjectName,
    chapter: '',
    topic: topic,
    activity: 'Pomodoro Focus',
    notes: '',
    sync_status: 'pending',
    created_at: nowIso,
    updated_at: nowIso
  };

  await dbPut('study_sessions', newSession);
  showToast(`Logged ${formatMinutesStr(durationMins)} focus session!`, 'success');
  closeAllSheets();
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

let sessionToDeleteClientId = null;

async function confirmDeleteStudySession(clientId) {
  if (!clientId) return;
  const session = await dbGet('study_sessions', clientId);
  if (!session) {
    showToast('Session not found', 'error');
    return;
  }
  sessionToDeleteClientId = clientId;
  const detailElem = document.getElementById('delete-session-details');
  if (detailElem) {
    const mins = Number(session.duration_minutes) || Math.round((Number(session.duration_hours) || 0) * 60);
    const durStr = formatDurationStr(session.duration_hours || (mins / 60));
    detailElem.innerHTML = `
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Subject:</span> <span class="font-bold text-slate-800">${escapeHtml(session.subject || 'Pomodoro Focus')}</span></div>
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Date:</span> <span class="font-bold text-slate-800">${session.date || ''} ${session.start_time ? '• ' + session.start_time : ''}</span></div>
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Duration:</span> <span class="font-black text-rose-600">${durStr} (${mins}m)</span></div>
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Source:</span> <span class="text-slate-600">${session.source || 'Pomodoro'}</span></div>
    `;
  }
  const modal = document.getElementById('modal-delete-session');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteSessionModal() {
  sessionToDeleteClientId = null;
  const modal = document.getElementById('modal-delete-session');
  if (modal) modal.classList.add('hidden');
}

async function executeDeleteStudySession() {
  if (!sessionToDeleteClientId) return;
  const clientId = sessionToDeleteClientId;
  closeDeleteSessionModal();

  try {
    const session = await dbGet('study_sessions', clientId);
    if (!session) {
      showToast('Session not found', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    session.deleted_at = nowIso;
    session.sync_status = 'pending';
    session.updated_at = nowIso;
    await dbPut('study_sessions', session);

    showToast('Pomodoro session deleted', 'info');

    // Immediately update UI datasets
    await renderDashboard();
    await renderStudyAnalyticsView();

    // Trigger cloud sync
    triggerDebouncedAutoSync();
    if (navigator.onLine && isCloudSyncConfigured()) {
      syncNow().catch(err => console.warn('[Sync] Immediate sync after delete failed:', err));
    }
  } catch (err) {
    console.error('Error deleting study session:', err);
    showToast('Failed to delete session', 'error');
  }
}

async function openEditWeeklyTargetsModal() {
  const subjects = await dbGetAll('subjects');
  const weeklyTargets = await dbGetAll('weekly_targets');
  const todayStr = getTodayDateStr();
  const { weekStart, weekEnd } = getWeekDateRange(todayStr);

  const weekLabel = document.getElementById('sheet-target-week-label');
  if (weekLabel) weekLabel.textContent = `${weekStart} to ${weekEnd}`;

  const container = document.getElementById('weekly-targets-inputs-container');
  if (container) {
    container.innerHTML = subjects.map(sub => {
      const custom = weeklyTargets.find(wt => wt.week_start === weekStart && wt.subject_client_id === sub.client_id);
      const targetVal = custom ? custom.target_value : sub.weekly_target_val;
      const unit = sub.target_type === 'hours' ? 'hours' : 'lectures';
      return `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold text-slate-800">${sub.display_name || sub.name}</div>
            <div class="text-[10px] text-slate-500 capitalize">Unit: ${unit}</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <input type="number" id="wt-input-${sub.client_id}" value="${targetVal}" min="0" step="1"
              class="w-20 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-900 text-right focus:outline-emerald-600">
            <span class="text-[11px] font-bold text-slate-500">${unit === 'hours' ? 'h' : 'lecs'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet-edit-weekly-targets').classList.add('open');
}

async function handleEditWeeklyTargetsSubmit(e) {
  e.preventDefault();
  const subjects = await dbGetAll('subjects');
  const weeklyTargets = await dbGetAll('weekly_targets');
  const todayStr = getTodayDateStr();
  const { weekStart } = getWeekDateRange(todayStr);
  const nowIso = new Date().toISOString();

  for (const sub of subjects) {
    const input = document.getElementById(`wt-input-${sub.client_id}`);
    const newVal = input ? Math.max(0, parseFloat(input.value) || 0) : (sub.weekly_target_val || 0);
    const existing = weeklyTargets.find(wt => wt.week_start === weekStart && wt.subject_client_id === sub.client_id);
    if (existing) {
      existing.target_value = newVal;
      existing.updated_at = nowIso;
      existing.sync_status = 'pending';
      await dbPut('weekly_targets', existing);
    } else {
      const newTarget = {
        client_id: generateUUID(),
        week_start: weekStart,
        subject_id: sub.id || 0,
        subject_client_id: sub.client_id,
        target_value: newVal,
        sync_status: 'pending',
        created_at: nowIso,
        updated_at: nowIso
      };
      await dbPut('weekly_targets', newTarget);
    }
  }

  showToast('Weekly targets updated!', 'success');
  closeAllSheets();
  triggerDebouncedAutoSync();
  refreshCurrentView();
}

// ============================================================================
// 8. APP BOOTSTRAP
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initIndexedDB();
    await seedDefaultSubjectsIfEmpty();
    await migrateChapterSequenceNumbers(); // Fix sequence_no values for existing installs
    initSupabase();
    await restoreUserSession();

    // Render initial UI immediately
    switchView('dashboard');

    // Run background sync if online & authenticated
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

    // Periodic auto-sync and time-based dashboard refresh
    setInterval(() => {
      if (currentView === 'dashboard') {
        renderDashboard();
      }
      if (navigator.onLine && currentUser && !syncInProgress) {
        syncNow();
      }
    }, 60000);

    // Refresh active view when app returns to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshCurrentView();
      }
    });

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('[App] Bootstrap error:', err);
  }
});
