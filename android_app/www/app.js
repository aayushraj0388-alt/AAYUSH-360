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
  if (totalMins <= 0) return "0m";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getWeekDateRange(dateStr = null) {
  const target = dateStr ? new Date(dateStr) : new Date();
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

    const migrationVersion = '2026-09-28-v5-audit-repair';
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
      refreshCurrentView();
    }
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

  // 1-minute safety window against device clock skew
  let bufferedTime = null;
  if (lastSyncTime) {
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
  const localMap = new Map(localItems.map(it => [it.client_id, it]));
  const toSave = [];

  for (const cloudItem of allCloudRows) {
    const existing = localMap.get(cloudItem.client_id);
    if (!existing) {
      // New from cloud — accept it
      cloudItem.sync_status = 'synced';
      toSave.push(cloudItem);
      if (storeName === 'lectures') {
        console.log(`[Sync] NEW from cloud: Lecture ${cloudItem.lecture_no} (${cloudItem.client_id}) completed=${cloudItem.is_completed}`);
      }
    } else {
      // Conflict resolution:
      // If local item has pending changes, keep local (it will push next cycle)
      // UNLESS the local pending change was already pushed this cycle (sync_status would still be pending if push failed)
      if (existing.sync_status === 'pending') {
        // Local has unpushed changes — keep local, skip cloud overwrite
        if (storeName === 'lectures') {
          console.log(`[Sync] SKIP (local pending): Lecture ${existing.lecture_no} (${cloudItem.client_id}) - local completed=${existing.is_completed}`);
        }
        continue;
      } else {
        // Local is synced — cloud update is newer, accept it
        // Preserve local fields that Android may have set that cloud might not have
        const merged = { ...cloudItem, sync_status: 'synced' };
        toSave.push(merged);
        if (storeName === 'lectures' && cloudItem.is_completed !== existing.is_completed) {
          console.log(`[Sync] UPDATE from cloud: Lecture ${cloudItem.lecture_no} (${cloudItem.client_id}) completed: ${existing.is_completed} → ${cloudItem.is_completed}`);
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
  const activeSessions = sessions.filter(s => !s.deleted_at);

  const todayStr = getTodayDateStr();
  const { weekStart, weekEnd } = getWeekDateRange(todayStr);
  const curDate = new Date();
  const monthStart = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}-01`;

  // 1. Today
  const todaySessions = activeSessions.filter(s => s.date === todayStr);
  let todayHours = 0;
  let todayMins = 0;
  todaySessions.forEach(s => {
    todayHours += (Number(s.duration_hours) || 0);
    todayMins += (Number(s.duration_minutes) || 0);
  });
  const todayAvgDur = todaySessions.length > 0 ? Math.round(todayMins / todaySessions.length) : 0;

  // 2. Week (Mon - Sun)
  const weekSessions = activeSessions.filter(s => s.date >= weekStart && s.date <= weekEnd);
  let weekHours = 0;
  const weekDatesSet = new Set();
  weekSessions.forEach(s => {
    weekHours += (Number(s.duration_hours) || 0);
    if (s.date) weekDatesSet.add(s.date);
  });
  const weekDaysStudied = weekDatesSet.size;

  // 3. Month
  const monthSessions = activeSessions.filter(s => s.date >= monthStart);
  let monthHours = 0;
  const monthDatesSet = new Set();
  monthSessions.forEach(s => {
    monthHours += (Number(s.duration_hours) || 0);
    if (s.date) monthDatesSet.add(s.date);
  });
  const monthDaysStudied = monthDatesSet.size;

  // 4. Total All-Time
  let totalHours = 0;
  const allDatesSet = new Set();
  activeSessions.forEach(s => {
    totalHours += (Number(s.duration_hours) || 0);
    if (s.date) allDatesSet.add(s.date);
  });
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
    let dh = 0;
    dSessions.forEach(s => dh += (Number(s.duration_hours) || 0));
    dh = Math.round(dh * 100) / 100;

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
      formatted: formatDurationStr(dh),
      sessions: dSessions.length,
      level: level
    });
  }

  // 7. Time Filter Chart Data
  let chartLabels = [];
  let chartValues = [];
  let filterTotalHours = 0;

  if (timeFilter === 'today') {
    if (todaySessions.length > 0) {
      chartLabels = todaySessions.map((s, i) => `#${i + 1} ${s.start_time || ''}`.trim());
      chartValues = todaySessions.map(s => Math.round((Number(s.duration_hours) || 0) * 100) / 100);
      filterTotalHours = todayHours;
    } else {
      chartLabels = ['Today'];
      chartValues = [0];
    }
  } else if (timeFilter === 'this_week') {
    const mon = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      const ds = dateToStr(dt);
      const dsList = activeSessions.filter(s => s.date === ds);
      let h = 0;
      dsList.forEach(s => h += (Number(s.duration_hours) || 0));
      chartLabels.push(dayAbbrs[dt.getDay()]);
      chartValues.push(Math.round(h * 100) / 100);
      filterTotalHours += h;
    }
  } else if (timeFilter === 'last_week') {
    const mon = new Date(weekStart);
    mon.setDate(mon.getDate() - 7);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      const ds = dateToStr(dt);
      const dsList = activeSessions.filter(s => s.date === ds);
      let h = 0;
      dsList.forEach(s => h += (Number(s.duration_hours) || 0));
      chartLabels.push(dayAbbrs[dt.getDay()]);
      chartValues.push(Math.round(h * 100) / 100);
      filterTotalHours += h;
    }
  } else if (timeFilter === 'last_4_weeks') {
    for (let d = 27; d >= 0; d--) {
      const dtObj = new Date();
      dtObj.setDate(dtObj.getDate() - d);
      const dStr = dateToStr(dtObj);
      const dsList = activeSessions.filter(s => s.date === dStr);
      let h = 0;
      dsList.forEach(s => h += (Number(s.duration_hours) || 0));
      chartLabels.push(dStr.slice(5));
      chartValues.push(Math.round(h * 100) / 100);
      filterTotalHours += h;
    }
  } else {
    // All Time (by Month)
    const monthMap = new Map();
    activeSessions.forEach(s => {
      if (s.date) {
        const mKey = s.date.slice(0, 7);
        const cur = monthMap.get(mKey) || 0;
        monthMap.set(mKey, cur + (Number(s.duration_hours) || 0));
      }
    });
    if (monthMap.size > 0) {
      const sortedKeys = Array.from(monthMap.keys()).sort();
      chartLabels = sortedKeys;
      chartValues = sortedKeys.map(k => Math.round(monthMap.get(k) * 100) / 100);
      filterTotalHours = totalHours;
    } else {
      chartLabels = ['Total'];
      chartValues = [0];
    }
  }

  // 8. Recent Sessions (last 20)
  const recentSessions = [...activeSessions].sort((a, b) => {
    return (b.date || '').localeCompare(a.date || '') || (b.start_time || '').localeCompare(a.start_time || '');
  }).slice(0, 20);

  return {
    has_data: activeSessions.length > 0,
    today_summary: {
      hours: Math.round(todayHours * 100) / 100,
      formatted: formatDurationStr(todayHours),
      sessions: todaySessions.length,
      avg_duration: formatMinutesStr(todayAvgDur)
    },
    week_summary: {
      hours: Math.round(weekHours * 100) / 100,
      formatted: formatDurationStr(weekHours),
      days_studied: weekDaysStudied,
      sessions: weekSessions.length
    },
    month_summary: {
      hours: Math.round(monthHours * 100) / 100,
      formatted: formatDurationStr(monthHours),
      days_studied: monthDaysStudied,
      sessions: monthSessions.length
    },
    total_summary: {
      hours: Math.round(totalHours * 100) / 100,
      formatted: formatDurationStr(totalHours),
      days_studied: totalDaysStudied,
      sessions: activeSessions.length
    },
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
  if (viewName === 'analytics') {
    if (param === 'study_time' || param === 'jee_overview' || param === 'cloud_sync') {
      currentAnalyticsTab = param;
    }
    renderAnalyticsView();
  }

  if (window.lucide) lucide.createIcons();
}

function refreshCurrentView() {
  switchView(currentView);
}

// Helper to extract completed hour numbers for a Physical Chemistry chapter
function getChapterCompletedHours(sessions, chapterName) {
  const activeSessions = (sessions || []).filter(s => 
    !s.deleted_at && 
    (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry')) &&
    s.chapter === chapterName
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

// ---------------- DASHBOARD ----------------
async function renderDashboard() {
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const tests = await dbGetAll('tests');
  const weeklyTargets = await dbGetAll('weekly_targets');
  const studySessions = await dbGetAll('study_sessions');
  const studyData = await calculateStudyAnalytics('all_time');

  const activeLectures = lectures.filter(l => !l.deleted_at);
  const totalLectures = activeLectures.length || 398;
  const completedLectures = activeLectures.filter(l => l.is_completed).length;

  // Physical Chemistry hours (68 total hours across 9 chapters)
  const pcSessions = (studySessions || []).filter(s => 
    !s.deleted_at && 
    (s.subject && (s.subject.includes('Physical') || s.subject === 'Physical Chemistry'))
  );
  const pcCompletedHours = pcSessions.length;
  const pcTotalHours = 68;

  const totalUnits = totalLectures + pcTotalHours;
  const completedUnits = completedLectures + pcCompletedHours;
  const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
  const completedTests = tests.filter(t => !t.deleted_at && t.status === 'completed').length;

  // Streak update in header
  const streakCounter = document.getElementById('header-streak-text');
  if (streakCounter) streakCounter.textContent = `${studyData.consistency?.current_streak || 1}d Streak`;

  // Macro stats
  const lecsCompletedElem = document.getElementById('dash-lectures-completed');
  if (lecsCompletedElem) lecsCompletedElem.textContent = `${completedLectures}/${totalLectures}`;
  
  const overallProgElem = document.getElementById('dash-overall-progress');
  if (overallProgElem) overallProgElem.textContent = `${progressPct}%`;

  const testsDoneElem = document.getElementById('dash-tests-done');
  if (testsDoneElem) testsDoneElem.textContent = completedTests;

  // 1. Study Time Card
  const studyTodayElem = document.getElementById('dash-study-today');
  const studyWeekElem = document.getElementById('dash-study-week');
  const studyMonthElem = document.getElementById('dash-study-month');
  if (studyTodayElem) studyTodayElem.textContent = studyData.today_summary.formatted;
  if (studyWeekElem) studyWeekElem.textContent = studyData.week_summary.formatted;
  if (studyMonthElem) studyMonthElem.textContent = studyData.month_summary.formatted;

  // 2. Weekly Targets Quota Card
  const todayStr = getTodayDateStr();
  const { weekStart, weekEnd } = getWeekDateRange(todayStr);
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
        achievedVal = pSessions.length;
      } else {
        achievedVal = activeLectures.filter(l => 
          l.subject_client_id === sub.client_id && 
          l.is_completed && 
          ((l.completed_at && l.completed_at >= weekStart && l.completed_at <= weekEnd + 'T23:59:59') || (l.scheduled_date >= weekStart && l.scheduled_date <= weekEnd))
        ).length;
      }

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

  // 3. Upcoming JEE Test Card
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

  // 4. Today's Target Schedule
  const todayTasks = activeLectures.filter(l => (l.scheduled_date === todayStr || l.rescheduled_date === todayStr));
  const todayCountBadge = document.getElementById('dash-today-count');
  if (todayCountBadge) todayCountBadge.textContent = `${todayTasks.length} Tasks`;

  const todayList = document.getElementById('dash-today-list');
  if (todayList) {
    if (todayTasks.length === 0) {
      todayList.innerHTML = `<div class="text-center py-5 text-slate-400 text-xs">No scheduled lectures for today! Great time to study.</div>`;
    } else {
      todayList.innerHTML = todayTasks.map(l => {
        const sub = subjects.find(s => s.client_id === l.subject_client_id);
        return `
          <div class="p-2.5 rounded-xl border ${l.is_completed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'} flex items-center justify-between gap-2 shadow-2xs">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div onclick="toggleLectureCompletion('${l.client_id}')" class="touch-checkbox ${l.is_completed ? 'checked' : ''}">
                ${l.is_completed ? '✓' : ''}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white" style="background-color: ${sub ? sub.color : '#4f46e5'}">
                    ${sub ? (sub.display_name || sub.name).slice(0, 4).toUpperCase() : 'L'}
                  </span>
                  <span class="text-xs font-bold ${l.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}">
                    Lecture ${l.lecture_no}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="text-[10px] text-slate-500">DPP</span>
              <div onclick="toggleDppCompletion('${l.client_id}')" class="touch-checkbox ${l.is_dpp_completed ? 'checked' : ''}">
                ${l.is_dpp_completed ? '✓' : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 5. Subject Progress Overview (Includes Physical Chemistry as hours)
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
            All Chem
          </button>
          <button onclick="setChemistryBranch('physical')" class="pill text-[11px] ${currentChemistryBranch === 'physical' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Physical (Hours)
          </button>
          <button onclick="setChemistryBranch('inorganic')" class="pill text-[11px] ${currentChemistryBranch === 'inorganic' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Inorganic
          </button>
          <button onclick="setChemistryBranch('organic')" class="pill text-[11px] ${currentChemistryBranch === 'organic' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-900 border border-amber-200'} whitespace-nowrap">
            Organic
          </button>
        </div>
      `;
    }
  }

  // Filter chapters based on selected subject / chemistry branch
  const filteredChapters = chapters.filter(ch => {
    if (ch.deleted_at) return false;

    if (currentSubjectFilter === 'all') return true;
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

  const chaptersContainer = document.getElementById('chapters-list-container');
  if (chaptersContainer) {
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
          const completedSet = getChapterCompletedHours(studySessions, ch.name);
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
          <div class="touch-card p-3.5 space-y-2 border-l-4 transition active:scale-99 cursor-pointer" style="border-left-color: ${color}" onclick="filterLecturesByChapter('${ch.client_id}')">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">CH ${ch.sequence_no || '?'}</span>
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

function filterLecturesByChapter(chId) {
  activeChapterFilter = chId;
  switchView('lectures', chId);
}

function clearChapterFilter() {
  activeChapterFilter = null;
  renderSubjectsView();
}

// ---------------- LECTURES & HOURS CHECKLIST ----------------
async function renderLecturesList(targetChapterId = null) {
  const chId = targetChapterId !== null ? targetChapterId : activeChapterFilter;
  const lectures = await dbGetAll('lectures');
  const subjects = await dbGetAll('subjects');
  const chapters = await dbGetAll('chapters');
  const studySessions = await dbGetAll('study_sessions');

  const container = document.getElementById('lectures-container');
  if (!container) return;

  let activeChapterObj = null;
  if (chId) {
    activeChapterObj = chapters.find(c => c.client_id === chId);
  }

  // If no chapter selected, default to first chapter of active filter
  if (!activeChapterObj && chapters.length > 0) {
    activeChapterObj = chapters.find(c => !c.deleted_at);
  }

  if (!activeChapterObj) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">No chapter selected. Go to Subjects and tap a chapter.</div>`;
    return;
  }

  const parentSub = subjects.find(s => s.client_id === activeChapterObj.subject_client_id);
  const isHoursBased = parentSub && parentSub.target_type === 'hours';
  const color = parentSub ? parentSub.color : '#4f46e5';

  // 1. PHYSICAL CHEMISTRY HOURS CHECKLIST
  if (isHoursBased) {
    const targetHours = activeChapterObj.target_hours || 0;
    const completedSet = getChapterCompletedHours(studySessions, activeChapterObj.name);
    const completedCount = completedSet.size;
    const pct = targetHours > 0 ? Math.round((completedCount / targetHours) * 100) : 0;

    let hoursHtml = `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 flex items-center justify-between">
        <div>
          <div class="text-[10px] font-black text-amber-700 uppercase tracking-wider">${parentSub ? parentSub.display_name : 'Physical Chemistry'} &bull; CH ${activeChapterObj.sequence_no}</div>
          <h2 class="text-sm font-black text-slate-900 mt-0.5">${activeChapterObj.name}</h2>
          <div class="text-xs font-bold text-amber-800 mt-1">${completedCount} / ${targetHours} Hours Completed (${pct}%)</div>
        </div>
        <button onclick="switchView('subjects')" class="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold shadow-xs">
          Chapters
        </button>
      </div>

      <div class="space-y-2">
        ${Array.from({ length: targetHours }, (_, i) => i + 1).map(hNum => {
          const isDone = completedSet.has(hNum);
          return `
            <div class="touch-card p-3 flex items-center justify-between gap-3 ${isDone ? 'bg-amber-50/70 border-amber-300' : 'bg-white'} cursor-pointer" onclick="toggleChapterHour('${activeChapterObj.client_id}', ${hNum})">
              <div class="flex items-center gap-3">
                <div class="touch-checkbox ${isDone ? 'checked' : ''}" style="${isDone ? 'background-color: #f59e0b; border-color: #f59e0b;' : ''}">
                  ${isDone ? '✓' : ''}
                </div>
                <span class="text-sm font-bold ${isDone ? 'text-amber-950 font-black' : 'text-slate-800'}">
                  ${hNum} hour${hNum > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = hoursHtml;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // 2. STANDARD LECTURE CHECKLIST (Physics, Maths, Inorganic, Organic)
  const chapterLectures = lectures.filter(l => !l.deleted_at && l.chapter_client_id === activeChapterObj.client_id)
                                  .sort((a, b) => (a.lecture_no || 0) - (b.lecture_no || 0));

  const completedLecs = chapterLectures.filter(l => l.is_completed).length;
  const completedDpps = chapterLectures.filter(l => l.is_dpp_completed).length;
  const pct = chapterLectures.length > 0 ? Math.round((completedLecs / chapterLectures.length) * 100) : 0;

  let headerHtml = `
    <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-3 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-black text-indigo-600 uppercase tracking-wider">${parentSub ? parentSub.display_name : 'Subject'} &bull; CH ${activeChapterObj.sequence_no}</div>
        <h2 class="text-sm font-black text-slate-900 mt-0.5">${activeChapterObj.name}</h2>
        <div class="text-xs font-bold text-slate-600 mt-1">
          <span class="text-indigo-700 font-extrabold">${completedLecs}/${chapterLectures.length} Lectures</span> &bull; 
          <span class="text-amber-700 font-extrabold">${completedDpps}/${chapterLectures.length} DPPs</span>
        </div>
      </div>
      <button onclick="switchView('subjects')" class="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs">
        Chapters
      </button>
    </div>
  `;

  if (chapterLectures.length === 0) {
    container.innerHTML = headerHtml + `<div class="text-center py-10 text-slate-400 text-xs">No lectures found in this chapter.</div>`;
  } else {
    container.innerHTML = headerHtml + `
      <div class="space-y-2">
        ${chapterLectures.map(l => {
          return `
            <div class="touch-card p-3 flex items-center justify-between gap-3 ${l.is_completed ? 'bg-emerald-50/50' : 'bg-white'}">
              <!-- Lecture Checkbox + Number ONLY -->
              <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="toggleLectureCompletion('${l.client_id}')">
                <div class="touch-checkbox ${l.is_completed ? 'checked' : ''}">
                  ${l.is_completed ? '✓' : ''}
                </div>
                <span class="text-sm font-bold ${l.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}">
                  Lecture ${l.lecture_no}
                </span>
              </div>

              <!-- DPP Checkbox Beside Each Lecture -->
              <div class="flex items-center gap-2 flex-shrink-0 cursor-pointer" onclick="toggleDppCompletion('${l.client_id}')">
                <span class="text-xs text-slate-500 font-bold">DPP</span>
                <div class="touch-checkbox ${l.is_dpp_completed ? 'checked' : ''}">
                  ${l.is_dpp_completed ? '✓' : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
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
            <div class="font-bold text-slate-800">${s.subject || 'Study Session'}</div>
            <div class="text-[10px] text-slate-500">📅 ${s.date} ${s.start_time ? '• ' + s.start_time : ''}</div>
          </div>
          <div class="text-right">
            <div class="font-black text-amber-700">${formatDurationStr(s.duration_hours)}</div>
            <div class="text-[10px] text-slate-400">${s.source || 'Pomodoro'}</div>
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
    const labels = subjects.map(s => s.display_name || s.name);
    const data = subjects.map(s => activeLectures.filter(l => l.subject_client_id === s.client_id && l.is_completed).length);
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

    // Periodic auto-sync every 60 seconds
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
