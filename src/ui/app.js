/**
 * AAYUSH 360 - Frontend Core Application Logic (UI Overhaul V2)
 * Clean White Canvas + Colorful Feature Cards + Modern Typography (Plus Jakarta Sans)
 * 100% Offline Standalone Architecture
 */

// Global state
const state = {
  currentView: 'dashboard',
  dashboardData: null,
  subjects: [],
  chapters: [],
  lectures: [],
  selectedLectureIds: new Set(),
  filters: {
    subject_id: '',
    chapter_id: '',
    status: '',
    dpp_status: '',
    search: '',
    sort_by: 'date'
  },
  lectureViewMode: 'grid', // 'grid' | 'table'
  dppFilters: {
    subject_id: '',
    status: '', // '', 'pending', 'completed'
    search: '',
    view_mode: 'grid', // 'grid' | 'table'
    limit: 60 // 60, 120, 'all'
  },
  pomodoroFilter: 'all_time',
  selectedSubjectId: null,
  selectedChapterId: null,
  chapterSearch: '',
  lectureSearch: '',
  chapterLectures: [],
  analyticsTab: 'overview',
  analyticsTimeFilter: 'all',
  testCalendar: {
    year: 2026,
    month: 10
  },
  charts: {}
};

// ==================== STRING & ESCAPING HELPERS ====================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJsParam(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateNice(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = String(parseInt(parts[2], 10)).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(parts[1], 10) - 1;
      return `${day} ${months[monthIdx] || parts[1]}`;
    }
  } catch (e) {}
  return dateStr;
}

function getSubjectAccentInfo(subjName) {
  if (subjName === 'Physics') {
    return {
      cardAccentClass: 'subject-accent-physics',
      badgeClass: 'bg-orange-100 text-orange-800 border border-orange-200',
      accentColor: '#ea580c',
      icon: 'zap'
    };
  } else if (subjName === 'Mathematics') {
    return {
      cardAccentClass: 'subject-accent-maths',
      badgeClass: 'bg-pink-100 text-pink-800 border border-pink-200',
      accentColor: '#db2777',
      icon: 'calculator'
    };
  } else if (subjName === 'Physical Chemistry') {
    return {
      cardAccentClass: 'subject-accent-phys-chem',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      accentColor: '#16a34a',
      icon: 'flask-conical'
    };
  } else if (subjName === 'Inorganic Chemistry') {
    return {
      cardAccentClass: 'subject-accent-inorg-chem',
      badgeClass: 'bg-teal-100 text-teal-800 border border-teal-200',
      accentColor: '#0d9488',
      icon: 'layers'
    };
  } else if (subjName === 'Organic Chemistry') {
    return {
      cardAccentClass: 'subject-accent-org-chem',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200',
      accentColor: '#e11d48',
      icon: 'flower-2'
    };
  }
  return {
    cardAccentClass: 'subject-accent-physics',
    badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    accentColor: '#4f46e5',
    icon: 'book-open'
  };
}

// ==================== NATIVE API WRAPPER ====================
async function callApi(method, ...args) {
  try {
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[method] === 'function') {
      return await window.pywebview.api[method](...args);
    } else {
      console.warn(`[Mock API] Native call ${method} not available, simulating...`);
      return mockApi(method, ...args);
    }
  } catch (err) {
    console.error(`API Error in ${method}:`, err);
    showToast(`Error: ${err.message || err}`, 'error');
    throw err;
  }
}

// Fallback mock if opened directly in browser for visual layout check
function mockApi(method, ...args) {
  if (method === 'get_dashboard_data') {
    return {
      user_name: 'Aayush',
      current_date: '2026-09-28',
      streak: 1,
      study_time_card: { has_data: false, today_hours: 0, week_hours: 0, month_hours: 0, sync_status: 'Not configured' },
      today_stats: { total_lectures: 4, completed_lectures: 1, completed_dpps: 0, phys_chem_hours: 0.0 },
      overall_stats: { total_lectures: 398, completed_lectures: 32, completed_dpps: 20, completion_percentage: 8.0, backlog_count: 5 },
      subjects: [
        { id: 1, name: 'Physics', display_name: 'Physics', color: '#ea580c', resource_name: 'PW 1.0', current_val: 4, target_val: 16, target_type: 'lectures', percentage: 25.0, remaining: 12 },
        { id: 2, name: 'Mathematics', display_name: 'Mathematics', color: '#db2777', resource_name: 'Mission 100', current_val: 2, target_val: 5, target_type: 'lectures', percentage: 40.0, remaining: 3 },
        { id: 3, name: 'Physical Chemistry', display_name: 'Physical Chemistry', color: '#16a34a', resource_name: 'One Shot lectures', current_val: 0, target_val: 7.0, target_type: 'hours', percentage: 0.0, remaining: 7.0 },
        { id: 4, name: 'Inorganic Chemistry', display_name: 'Inorganic Chemistry', color: '#0d9488', resource_name: 'Prayas 2.0', current_val: 1, target_val: 4, target_type: 'lectures', percentage: 25.0, remaining: 3 },
        { id: 5, name: 'Organic Chemistry', display_name: 'Organic Chemistry', color: '#e11d48', resource_name: 'Prayas 2.0', current_val: 2, target_val: 6, target_type: 'lectures', percentage: 33.3, remaining: 4 },
      ],
      upcoming_test: { test_name: 'JEE Mains-1 (Test 01)', test_type: 'Part Test', test_date: '2026-10-11', days_left: 13, physics_syllabus: 'Kinematics 1D & 2D, NLM', chemistry_syllabus: 'Periodic Classification, Chemical Bonding', maths_syllabus: 'Sets, Relations & Functions, Trigonometry' },
      today_tasks: []
    };
  }
  if (method === 'get_study_analytics') {
    return {
      has_data: false,
      pomodoro_status: 'Not configured',
      pomodoro_data_source: 'Not configured',
      pomodoro_last_sync: 'Never',
      today_hours: 0.0,
      week_hours: 0.0,
      month_hours: 0.0,
      total_hours: 0.0,
      average_daily_hours: 0.0,
      current_streak: 0,
      longest_streak: 0,
      days_studied: 0,
      days_without_study: 0,
      subject_hours: {},
      chapter_hours: {},
      activity_hours: {}
    };
  }
  if (method === 'get_pomodoro_integration_status') {
    return { status: 'Disabled', enabled: false, data_source: 'Not configured', last_sync: 'Never', sessions_count: 0, is_configured: false };
  }
  if (method === 'get_live_session_status') {
    return { is_active: false, elapsed_minutes: 0, status: 'Idle' };
  }
  if (method === 'delete_study_session') {
    return { success: true };
  }
  if (method === 'get_lectures') return [];
  if (method === 'get_tests') return [];
  if (method === 'get_subjects_and_chapters') return [];
  if (method === 'list_backups') return [];
  if (method === 'add_dpp') return { success: true, id: 999 };
  return { success: true };
}

// ==================== REAL-TIME LIVE POMODORO TICKER ====================
let _liveTickerInterval = null;
function startLivePomodoroTicker() {
  if (_liveTickerInterval) return;
  _liveTickerInterval = setInterval(async () => {
    try {
      if (document.querySelector('.modal.open')) return;
      const live = await callApi('get_live_session_status');
      if (!live) return;
      const wasActive = state._lastLiveActive || false;
      const wasMins = state._lastLiveMins || 0;
      const isNowActive = Boolean(live.is_active);
      const isNowMins = Number(live.elapsed_minutes) || 0;

      state._lastLiveActive = isNowActive;
      state._lastLiveMins = isNowMins;

      // Update whenever active state or elapsed minutes changed, or when session ends
      if (isNowActive || wasActive || isNowMins !== wasMins) {
        if (state.currentView === 'dashboard') {
          const dash = await callApi('get_dashboard_data');
          state.dashboardData = dash;
          renderDashboard(document.getElementById('view-content'));
        } else if (state.currentView === 'pomodoro') {
          renderPomodoro(document.getElementById('view-content'));
        }
      }
    } catch (e) {
      // Quiet background poll
    }
  }, 2500);
}

// ==================== APP INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', async () => {
  setupGreeting();
  await loadInitialData();
  navigateTo('dashboard');
  startLivePomodoroTicker();
  if (window.lucide) lucide.createIcons();
});

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return {
      text: 'Good Morning, Aayush',
      icon: '☀️',
      headline: "Ready for today's JEE grind?",
      subtext: "Conquer your daily targets with sharp focus. Every solved numerical builds IIT-level mastery.",
      period: 'morning'
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      text: 'Good Afternoon, Aayush',
      icon: '🌤️',
      headline: 'Keep the afternoon momentum high!',
      subtext: "Complete your scheduled lectures and tackle today's DPP problem sets with full concentration.",
      period: 'afternoon'
    };
  } else if (hour >= 17 && hour < 22) {
    return {
      text: 'Good Evening, Aayush',
      icon: '🌆',
      headline: "Time to consolidate today's concepts!",
      subtext: "Wrap up remaining DPP numericals, review formulas, and prepare for tomorrow's syllabus.",
      period: 'evening'
    };
  } else {
    return {
      text: 'Good Night, Aayush',
      icon: '🌙',
      headline: 'Late night focus session.',
      subtext: "Solidify today's achievements, log your final study hours, and get restorative rest for tomorrow.",
      period: 'night'
    };
  }
}

function getFormattedFullDate() {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return new Date().toLocaleDateString('en-GB', options);
}

function setupGreeting() {
  const greeting = getTimeBasedGreeting();
  const greetEl = document.getElementById('header-greeting');
  if (greetEl) greetEl.textContent = `${greeting.text} ${greeting.icon}`;

  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    dateEl.textContent = getFormattedFullDate();
  }
}

async function loadInitialData() {
  try {
    const dash = await callApi('get_dashboard_data');
    state.dashboardData = dash;
    updateHeaderMetrics(dash);

    const subjs = await callApi('get_subjects_and_chapters');
    state.subjects = subjs;

    updateCloudSyncHeaderUI();
  } catch (e) {
    console.error('Failed to load initial data:', e);
  }
}

function updateHeaderMetrics(dash) {
  if (!dash) return;
  const streakEl = document.getElementById('streak-counter');
  if (streakEl) streakEl.textContent = `${dash.streak || 1} Day Streak`;

  const testPill = document.getElementById('header-test-pill');
  const testText = document.getElementById('header-test-text');
  if (dash.upcoming_test) {
    testPill.classList.remove('hidden');
    const days = Math.round(dash.upcoming_test.days_left);
    testText.textContent = `${dash.upcoming_test.test_name}: ${days <= 0 ? 'TODAY' : days + 'd left'}`;
  }

  const backlogCountEl = document.getElementById('sidebar-backlog-count');
  if (backlogCountEl && dash.overall_stats) {
    backlogCountEl.textContent = dash.overall_stats.backlog_count || 0;
  }

  const todayBadge = document.getElementById('nav-today-badge');
  if (todayBadge && dash.today_stats) {
    const pending = (dash.today_stats.total_lectures || 0) - (dash.today_stats.completed_lectures || 0);
    todayBadge.textContent = Math.max(0, pending);
  }
}

// ==================== NAVIGATION ROUTING ====================
function navigateTo(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const navVal = item.getAttribute('data-nav');
    if (navVal === viewName) {
      item.classList.add('active');
    }
  });

  const container = document.getElementById('view-content');
  if (!container) return;

  switch (viewName) {
    case 'dashboard':
      renderDashboard(container);
      break;
    case 'today':
      renderToday(container);
      break;
    case 'lectures':
      state.selectedSubjectId = state.selectedSubjectId || 1;
      state.selectedChapterId = null;
      renderSubjectHub(state.selectedSubjectId, container);
      break;
    case 'subject_physics':
      state.selectedSubjectId = 1;
      state.selectedChapterId = null;
      state.chapterSearch = '';
      renderSubjectHub(1, container);
      break;
    case 'subject_maths':
      state.selectedSubjectId = 2;
      state.selectedChapterId = null;
      state.chapterSearch = '';
      renderSubjectHub(2, container);
      break;
    case 'subject_physical_chem':
      state.selectedSubjectId = 3;
      state.selectedChapterId = null;
      state.chapterSearch = '';
      renderSubjectHub(3, container);
      break;
    case 'subject_inorganic_chem':
      state.selectedSubjectId = 4;
      state.selectedChapterId = null;
      state.chapterSearch = '';
      renderSubjectHub(4, container);
      break;
    case 'subject_organic_chem':
      state.selectedSubjectId = 5;
      state.selectedChapterId = null;
      state.chapterSearch = '';
      renderSubjectHub(5, container);
      break;
    case 'dpp':
      renderDPP(container);
      break;
    case 'tests':
      renderTests(container);
      break;
    case 'pomodoro':
    case 'study_analytics':
      renderPomodoro(container);
      break;
    case 'analytics':
      renderAnalytics(container);
      break;
    case 'settings':
      renderSettings(container);
      break;
    default:
      renderDashboard(container);
  }

  if (window.lucide) lucide.createIcons();
}

function renderDashboardWeeklyChart(subjects) {
  const canvasEl = document.getElementById('chart-dash-velocity');
  if (!canvasEl || !window.Chart) return;
  if (state.charts['dash-velocity']) {
    state.charts['dash-velocity'].destroy();
  }
  const labels = (subjects || []).map(s => s.display_name.replace(' Chemistry', ' Chem'));
  const currentVals = (subjects || []).map(s => s.current_val || 0);
  const targetVals = (subjects || []).map(s => s.target_val || 0);

  state.charts['dash-velocity'] = new Chart(canvasEl, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Completed / Current',
          data: currentVals,
          backgroundColor: ['#ea580c', '#db2777', '#16a34a', '#0d9488', '#e11d48'],
          borderRadius: 6
        },
        {
          label: 'Target Goal',
          data: targetVals,
          backgroundColor: '#e2e8f0',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Plus Jakarta Sans', size: 11, weight: '700' }, boxWidth: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 10 } }
        }
      }
    }
  });
}

// ==================== 1. DASHBOARD VIEW (PERSONAL JEE COMMAND CENTER) ====================
async function renderDashboard(container) {
  const dash = await callApi('get_dashboard_data');
  state.dashboardData = dash;
  updateHeaderMetrics(dash);

  const greeting = getTimeBasedGreeting();
  const fullDate = getFormattedFullDate();
  const todayStats = dash.today_stats || {};
  const overallStats = dash.overall_stats || {};
  const subjects = dash.subjects || [];
  const upcomingTest = dash.upcoming_test;
  const studyCard = dash.study_time_card || { has_data: false, today_hours: 0, week_hours: 0, month_hours: 0 };

  const todayLecPct = todayStats.total_lectures > 0 ? Math.round((todayStats.completed_lectures / todayStats.total_lectures) * 100) : 0;
  const todayDppPct = todayStats.total_lectures > 0 ? Math.round((todayStats.completed_dpps / todayStats.total_lectures) * 100) : 0;

  if (!state.subjects || state.subjects.length === 0) {
    state.subjects = await callApi('get_subjects_and_chapters');
  }

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <!-- 1. PERSONALIZED HERO BANNER (Section 4 & 5) -->
      <div class="p-6 md:p-8 rounded-2xl relative overflow-hidden border border-orange-200/60 bg-gradient-to-br from-white via-orange-50/40 to-amber-50/30 shadow-xs">
        <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 min-w-0">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-[11px] font-black px-3 py-1 rounded-full bg-orange-100 text-orange-900 border border-orange-200 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="award" class="w-3.5 h-3.5 text-orange-600"></i> Target: JEE Main & Advanced 2027
              </span>
              <span class="text-xs font-bold text-slate-500 flex items-center gap-1">
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i> ${escapeHtml(fullDate)}
              </span>
            </div>
            <h1 class="text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>${escapeHtml(greeting.text)} 👋</span>
              <span class="text-2xl">${greeting.icon}</span>
            </h1>
            <p class="text-base font-bold text-orange-950 mt-1">${escapeHtml(greeting.headline)}</p>
            <p class="text-xs text-slate-600 mt-1 max-w-2xl break-words font-medium leading-relaxed">
              ${escapeHtml(greeting.subtext)}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3 flex-shrink-0">
            <button onclick="navigateTo('today')" class="px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold shadow-sm hover:shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer">
              <i data-lucide="crosshair" class="w-4 h-4"></i> Enter Today Command Center &rarr;
            </button>
            ${overallStats.backlog_count > 0 ? `
              <button onclick="triggerSmartRedistribute()" class="px-4 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="alert-circle" class="w-4 h-4 text-rose-600"></i> Reschedule Backlog (${overallStats.backlog_count})
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Live Pomodoro Banner (if active) -->
      ${studyCard.is_live ? `
      <div class="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-2xl flex items-center justify-between shadow-xs animate-pulse cursor-pointer mb-5" onclick="navigateTo('pomodoro')">
        <div class="flex items-center gap-2.5">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div>
            <span class="text-xs font-black text-emerald-950 uppercase tracking-wide">
              Currently Studying — Live Pomodoro Timer Running
            </span>
            <span class="text-xs font-extrabold text-emerald-800 ml-2 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
              ${studyCard.live_str || 'Active'}
            </span>
          </div>
        </div>
        <span class="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1">
          Open Pomodoro Command &rarr;
        </span>
      </div>
      ` : ''}

      <!-- 2. DAILY SNAPSHOT (4 LARGE VIBRANT CARDS - Section 6 & 8) -->
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <i data-lucide="sun" class="w-4 h-4 text-orange-600"></i> Today's Snapshot
          </h2>
          <span class="text-xs font-semibold text-slate-500">${escapeHtml(fullDate)}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Card 1: Today Lectures (Warm Orange) -->
          <div class="card-orange p-5 cursor-pointer flex flex-col justify-between min-w-0" onclick="navigateTo('today')">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-orange-900 uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="book-open" class="w-4 h-4 text-orange-600"></i> Lectures
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-200/80 text-orange-950">${todayStats.total_lectures || 0} Target</span>
              </div>
              <div class="stat-hero-number text-orange-950 mt-1">
                ${todayStats.completed_lectures || 0} <span class="text-lg font-bold text-orange-700">/ ${todayStats.total_lectures || 0}</span>
              </div>
              <div class="text-xs font-semibold text-orange-900 mt-0.5">Lectures Completed Today</div>
              <div class="w-full bg-orange-200/60 h-2.5 rounded-full mt-3 overflow-hidden border border-black/5">
                <div class="bg-orange-600 h-full rounded-full transition-all duration-300" style="width: ${todayLecPct}%"></div>
              </div>
            </div>
            <div class="flex justify-between items-center text-[11px] text-orange-900 font-bold mt-4 pt-2.5 border-t border-orange-200/60">
              <span>${todayStats.total_lectures - todayStats.completed_lectures} remaining</span>
              <span class="hover:underline flex items-center gap-1">Open Plan &rarr;</span>
            </div>
          </div>

          <!-- Card 2: Today DPP (Golden Yellow) -->
          <div class="card-yellow p-5 cursor-pointer flex flex-col justify-between min-w-0" onclick="navigateTo('dpp')">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="clipboard-check" class="w-4 h-4 text-amber-700"></i> Daily Practice
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950">DPP</span>
              </div>
              <div class="stat-hero-number text-amber-950 mt-1">
                ${todayStats.completed_dpps || 0} <span class="text-lg font-bold text-amber-800">/ ${todayStats.total_lectures || 0}</span>
              </div>
              <div class="text-xs font-semibold text-amber-900 mt-0.5">Problem Sets Solved Today</div>
              <div class="w-full bg-amber-200/80 h-2.5 rounded-full mt-3 overflow-hidden border border-black/5">
                <div class="bg-amber-500 h-full rounded-full transition-all duration-300" style="width: ${todayDppPct}%"></div>
              </div>
            </div>
            <div class="flex justify-between items-center text-[11px] text-amber-950 font-bold mt-4 pt-2.5 border-t border-amber-200/80">
              <span>${todayDppPct}% completed</span>
              <span class="hover:underline flex items-center gap-1">DPP Center &rarr;</span>
            </div>
          </div>

          <!-- Card 3: Pomodoro Focus Time (Warm Amber) -->
          <div class="card-amber p-5 cursor-pointer flex flex-col justify-between min-w-0" onclick="navigateTo('pomodoro')">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="timer" class="w-4 h-4 text-amber-700"></i> Study Time
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${studyCard.is_live ? 'bg-emerald-100 text-emerald-950 border border-emerald-400 animate-pulse font-extrabold flex items-center gap-1' : (studyCard.has_data ? 'bg-amber-200/80 text-amber-950' : 'bg-slate-200/80 text-slate-700')}">
                  ${studyCard.is_live ? '🟢 ' + (studyCard.live_str || 'Studying') : (studyCard.has_data ? (studyCard.sync_status || 'Synced') : 'Pomodoro')}
                </span>
              </div>
              <div class="stat-hero-number text-amber-950 mt-1">
                ${studyCard.today_hours > 0 ? (studyCard.today_str || studyCard.today_hours + 'h') : (studyCard.is_live ? (studyCard.live_str || '1m') : '0h 00m')}
              </div>
              <div class="text-xs font-semibold ${studyCard.is_live ? 'text-emerald-800 font-extrabold' : 'text-amber-900'} mt-0.5">
                ${studyCard.is_live ? '🟢 Currently Studying (Live Session)' : 'Focused Focus Log Today'}
              </div>
              <div class="text-[11px] text-amber-900/90 mt-2.5 font-medium">
                Week: <span class="font-bold text-amber-950">${studyCard.week_hours > 0 ? studyCard.week_str : '0h 00m'}</span> • Streak: <span class="font-bold text-amber-950">${dash.streak || 1}d</span> 🔥
              </div>
            </div>
            <div class="flex justify-between items-center text-[11px] text-amber-950 font-bold mt-4 pt-2.5 border-t border-amber-200/80">
              <span>${studyCard.is_live ? 'Live Session Active' : '100% Genuine Focus'}</span>
              <span class="hover:underline flex items-center gap-1">Pomodoro &rarr;</span>
            </div>
          </div>

          <!-- Card 4: Weekly Target Progress (Fresh Green) -->
          <div class="card-green p-5 cursor-pointer flex flex-col justify-between min-w-0" onclick="openWeeklyTargetsModal('${dash.week_start || ''}')">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="target" class="w-4 h-4 text-emerald-600"></i> Weekly Target
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950">Attainment</span>
              </div>
              <div class="stat-hero-number text-emerald-950 mt-1">
                ${overallStats.completion_percentage || 0}%
              </div>
              <div class="text-xs font-semibold text-emerald-900 mt-0.5">Overall Goal Attainment</div>
              <div class="w-full bg-emerald-200/60 h-2.5 rounded-full mt-3 overflow-hidden border border-black/5">
                <div class="bg-emerald-600 h-full rounded-full transition-all duration-300" style="width: ${overallStats.completion_percentage || 0}%"></div>
              </div>
            </div>
            <div class="flex justify-between items-center text-[11px] text-emerald-950 font-bold mt-4 pt-2.5 border-t border-emerald-200/60">
              <span>5 Subjects Active</span>
              <span class="hover:underline flex items-center gap-1">Edit Targets &rarr;</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. THIS WEEK: TARGET VS ACHIEVED CHART & METERS (Section 8) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <!-- Velocity Chart (7 cols on lg) -->
        <div class="lg:col-span-7 modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl flex flex-col justify-between">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div>
              <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="bar-chart-2" class="w-4 h-4 text-orange-600"></i> This Week: Target vs Achieved
              </h2>
              <span class="text-xs text-slate-500 font-medium">Curriculum pace across 5 subjects</span>
            </div>
            <span class="text-xs font-bold text-slate-600 font-mono">${dash.week_start || ''} &rarr; ${dash.week_end || ''}</span>
          </div>
          <div class="h-56 relative w-full">
            <canvas id="chart-dash-velocity"></canvas>
          </div>
        </div>

        <!-- Weekly Progress Breakdown (5 cols on lg) -->
        <div class="lg:col-span-5 modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl flex flex-col justify-between">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-emerald-600"></i> Weekly Breakdown
            </h2>
            <button onclick="openWeeklyTargetsModal('${dash.week_start || ''}')" class="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit
            </button>
          </div>

          <div class="space-y-2.5">
            ${subjects.map(s => {
              const isHours = s.target_type === 'hours';
              const unit = isHours ? 'h' : ' lecs';
              let accentColor = '#ea580c';
              if (s.name === 'Mathematics') accentColor = '#db2777';
              else if (s.name === 'Physical Chemistry') accentColor = '#16a34a';
              else if (s.name === 'Inorganic Chemistry') accentColor = '#0d9488';
              else if (s.name === 'Organic Chemistry') accentColor = '#e11d48';

              return `
                <div class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition cursor-pointer" onclick="navigateToSubjectById(${s.id})">
                  <div class="flex items-center justify-between text-xs font-bold mb-1">
                    <span class="text-slate-900 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full" style="background-color: ${accentColor};"></span>
                      ${escapeHtml(s.display_name)}
                    </span>
                    <span class="font-extrabold text-slate-800">${s.current_val} / ${s.target_val}${unit} <span class="text-slate-400 font-normal">(${s.percentage}%)</span></span>
                  </div>
                  <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-300" style="width: ${s.percentage}%; background-color: ${accentColor};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 4. SUBJECT PROGRESS: CURRICULUM MASTERY (5 DISTINCT CARDS - Section 8 & 9) -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl min-w-0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b border-slate-100">
          <div>
            <h2 class="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="layers" class="w-5 h-5 text-indigo-600"></i> Subject Curriculum Progress
            </h2>
            <span class="text-xs text-slate-500 font-medium">Click any subject card to directly view and manage chapters</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          ${(state.subjects || []).map(s => {
            const chs = s.chapters || [];
            const totLecs = chs.reduce((a, c) => a + (c.total_lectures || 0), 0);
            const compLecs = chs.reduce((a, c) => a + (c.completed_lectures || 0), 0);
            const compDpp = chs.reduce((a, c) => a + (c.dpp_completed || 0), 0);
            const lecsPct = totLecs > 0 ? Math.round((compLecs / totLecs) * 100) : 0;
            const dppPct = totLecs > 0 ? Math.round((compDpp / totLecs) * 100) : 0;

            const colorInfo = getSubjectColorInfo(s.name);

            return `
              <div onclick="navigateToSubjectById(${s.id})" class="${colorInfo.cardClass} p-4 flex flex-col justify-between cursor-pointer min-w-0 transition hover:scale-[1.02] shadow-xs hover:shadow-md">
                <div class="min-w-0">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="font-black text-sm text-slate-900 truncate">${escapeHtml(s.display_name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${colorInfo.badgeBg} font-bold flex-shrink-0">${chs.length} Ch</span>
                  </div>
                  <div class="text-[11px] text-slate-600 font-medium truncate mb-3">${escapeHtml(s.resource_name || '')}</div>

                  <!-- Parallel Progress Bars (Section 11) -->
                  <div class="space-y-2">
                    <div>
                      <div class="flex justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                        <span>Lectures</span>
                        <span>${compLecs} / ${totLecs}</span>
                      </div>
                      <div class="w-full bg-white/80 h-2 rounded-full overflow-hidden border border-black/5">
                        <div class="h-full rounded-full transition-all duration-300" style="width: ${lecsPct}%; background-color: ${colorInfo.accentColor};"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-[11px] font-bold text-amber-900 mb-0.5">
                        <span>DPP</span>
                        <span>${compDpp} / ${totLecs}</span>
                      </div>
                      <div class="w-full bg-white/80 h-2 rounded-full overflow-hidden border border-black/5">
                        <div class="h-full rounded-full transition-all duration-300" style="width: ${dppPct}%; background-color: #f59e0b;"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-4 pt-2.5 border-t border-black/5 flex items-center justify-between text-xs font-bold" style="color: ${colorInfo.accentColor};">
                  <span>Open Chapters</span>
                  <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 5. BACKLOG RADAR & UPCOMING JEE TESTS (BALANCED SPLIT ROW - Section 8) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Backlog Radar (Coral/Rose Card) -->
        <div class="card-rose p-5 flex flex-col justify-between min-w-0">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="alert-circle" class="w-4 h-4 text-rose-600"></i> Backlog Radar
              </span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${overallStats.backlog_count > 0 ? 'bg-rose-200 text-rose-900' : 'bg-emerald-100 text-emerald-800'}">
                ${overallStats.backlog_count > 0 ? 'Action Needed' : 'Clean'}
              </span>
            </div>
            <div class="stat-hero-number text-rose-950 mt-1">
              ${overallStats.backlog_count || 0} <span class="text-sm font-semibold text-rose-800">Overdue Lectures</span>
            </div>
            <p class="text-xs text-rose-900/90 mt-1 font-medium leading-relaxed">
              Missed lectures scheduled before today. The smart backlog redistributor spreads them smoothly across open study days while respecting test revision buffers.
            </p>
          </div>

          <div class="mt-5 pt-3 border-t border-rose-200/60 flex items-center justify-between">
            <span class="text-xs font-bold text-rose-800">Zero overload guarantee</span>
            <button onclick="triggerSmartRedistribute()" class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Reschedule Now &rarr;
            </button>
          </div>
        </div>

        <!-- Upcoming JEE Tests Card (Red/Pink Card) -->
        <div class="card-rose p-5 flex flex-col justify-between min-w-0" onclick="navigateTo('tests')">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <i data-lucide="award" class="w-4 h-4 text-rose-600"></i> Next Milestone Test
              </span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">
                ${upcomingTest ? (upcomingTest.days_left <= 0 ? 'TODAY' : Math.round(upcomingTest.days_left) + 'd Left') : '14 Tests'}
              </span>
            </div>
            <div class="text-xl font-black text-rose-950 mt-1 truncate">
              ${upcomingTest ? upcomingTest.test_name : 'JEE Mains-1 (Test 01)'}
            </div>
            <div class="text-xs font-bold text-rose-800 mt-0.5">
              ${upcomingTest ? `Exam Date: ${upcomingTest.test_date} • ${upcomingTest.test_type}` : '14 Official Tests Tracked'}
            </div>
            ${upcomingTest ? `
              <div class="mt-3 space-y-1 text-xs">
                <div class="truncate text-[11px]"><span class="font-bold text-orange-700">Phy:</span> ${escapeHtml(upcomingTest.physics_syllabus)}</div>
                <div class="truncate text-[11px]"><span class="font-bold text-emerald-700">Chem:</span> ${escapeHtml(upcomingTest.chemistry_syllabus)}</div>
                <div class="truncate text-[11px]"><span class="font-bold text-pink-700">Math:</span> ${escapeHtml(upcomingTest.maths_syllabus)}</div>
              </div>
            ` : ''}
          </div>

          <div class="mt-4 pt-3 border-t border-rose-200/60 flex items-center justify-between">
            <span class="text-xs font-bold text-rose-800">Decoupled score logging</span>
            <span class="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1 cursor-pointer">
              Open Test Center &rarr;
            </span>
          </div>
        </div>
      </div>

      <!-- 6. LECTURE VS DPP PRACTICE BALANCE (Section 8) -->
      <div class="card-yellow p-5 min-w-0">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <i data-lucide="scale" class="w-4 h-4 text-amber-700"></i> Lecture vs DPP Numerical Balance
            </div>
            <h3 class="text-lg font-black text-amber-950">Daily Numerical Practice Discipline</h3>
            <p class="text-xs text-amber-900 mt-1 max-w-xl font-medium">
              Every video lecture has exactly 1 matching DPP. Completing the DPP immediately after class ensures formulas turn into reflex problem-solving.
            </p>
          </div>
          <div class="flex items-center gap-6 flex-shrink-0">
            <div class="text-center">
              <div class="text-[10px] font-bold text-amber-800 uppercase">Lectures Covered</div>
              <div class="text-xl font-black text-amber-950">${overallStats.completion_percentage || 0}%</div>
            </div>
            <div class="text-center">
              <div class="text-[10px] font-bold text-amber-800 uppercase">DPPs Solved</div>
              <div class="text-xl font-black text-amber-950">${Math.round(((overallStats.completed_dpps || 0) / (overallStats.total_lectures || 1)) * 100)}%</div>
            </div>
            <button onclick="navigateTo('dpp')" class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer">
              Open DPP Center &rarr;
            </button>
          </div>
        </div>
      </div>

      <!-- 7. TODAY'S ACTION PLAN QUICK VIEW (Section 8) -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl min-w-0">
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <h3 class="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <i data-lucide="check-circle-2" class="w-5 h-5 text-orange-600"></i> Today's Assigned Tasks (${(dash.today_tasks || []).length})
          </h3>
          <button onclick="navigateTo('today')" class="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 cursor-pointer">
            Open Full Today Center &rarr;
          </button>
        </div>

        ${dash.today_tasks && dash.today_tasks.length > 0 ? `
          <div class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            ${dash.today_tasks.map(t => {
              const isLecDone = Boolean(t.is_completed);
              const isDppDone = Boolean(t.is_dpp_completed);
              return `
                <div class="p-3.5 rounded-xl border ${isLecDone && isDppDone ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'} flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs min-w-0 transition hover:bg-slate-100/60">
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-slate-900 break-words ${isLecDone ? 'line-through text-slate-400' : ''}">
                      Lecture #${t.lecture_no}
                    </div>
                    <div class="text-[11px] text-slate-500 break-words mt-0.5">
                      ${escapeHtml(t.subject_name)} • ${escapeHtml(t.chapter_name)}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    <button onclick="toggleLectureQuick(${t.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isLecDone ? 'btn-action-completed' : 'btn-action-pending-lecture'}">
                      <i data-lucide="${isLecDone ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>
                      ${isLecDone ? '✓ LECTURE COMPLETED' : 'COMPLETE LECTURE'}
                    </button>
                    <button onclick="toggleDppQuick(${t.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isDppDone ? 'btn-action-completed' : 'btn-action-pending-dpp'}">
                      <i data-lucide="${isDppDone ? 'check-circle-2' : 'clock'}" class="w-3.5 h-3.5"></i>
                      ${isDppDone ? '✓ DPP COMPLETED' : `COMPLETE DPP #${t.dpp_no}`}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="py-10 text-center text-slate-500 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <i data-lucide="calendar-check" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>
            <div class="font-bold text-slate-700">No lectures scheduled for today!</div>
            <div class="text-slate-400 mt-0.5">Great time to clear backlog or practice additional numericals.</div>
            <div class="mt-3 flex items-center justify-center gap-2">
              <button onclick="navigateTo('subject_physics')" class="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-bold cursor-pointer">Explore Physics</button>
              <button onclick="navigateTo('dpp')" class="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold cursor-pointer">Open DPP Tracker</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  renderDashboardWeeklyChart(subjects);
}

// ==================== 2. TODAY COMMAND CENTER ====================
function setTodayFilter(filter) {
  state.todayFilter = filter;
  renderToday(document.getElementById('view-content'));
}

async function renderToday(container) {
  if (!container) container = document.getElementById('view-content');
  if (!container) return;

  const dash = await callApi('get_dashboard_data');
  state.dashboardData = dash;
  updateHeaderMetrics(dash);

  const allTasks = dash.today_tasks || [];
  const currentFilter = state.todayFilter || 'all';

  const totalTodayTasks = allTasks.length;
  const completedTodayLecs = allTasks.filter(t => t.is_completed).length;
  const completedTodayDpps = allTasks.filter(t => t.is_dpp_completed).length;
  const pendingTodayTasks = allTasks.filter(t => !t.is_completed || !t.is_dpp_completed).length;
  const fullyDoneTodayTasks = allTasks.filter(t => t.is_completed && t.is_dpp_completed).length;

  const lecProgressPct = totalTodayTasks > 0 ? Math.round((completedTodayLecs / totalTodayTasks) * 100) : 0;
  const dppProgressPct = totalTodayTasks > 0 ? Math.round((completedTodayDpps / totalTodayTasks) * 100) : 0;
  const todayStudyStr = (dash.study_time_card && dash.study_time_card.today_str) || '0h';

  // Filter tasks based on selected filter tab
  let displayTasks = allTasks;
  if (currentFilter === 'pending') {
    displayTasks = allTasks.filter(t => !t.is_completed || !t.is_dpp_completed);
  } else if (currentFilter === 'completed') {
    displayTasks = allTasks.filter(t => t.is_completed && t.is_dpp_completed);
  }

  const grouped = {};
  state.subjects.forEach(s => { grouped[s.name] = []; });
  displayTasks.forEach(t => {
    if (!grouped[t.subject_name]) grouped[t.subject_name] = [];
    grouped[t.subject_name].push(t);
  });

  const greeting = getTimeBasedGreeting();
  const fullDate = getFormattedFullDate();

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <!-- 1. Hero Command Header -->
      <div class="p-6 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-rose-50 border border-orange-200/80 shadow-xs min-w-0">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-orange-600 text-white uppercase tracking-wider shadow-xs">
                DAILY BATTLE PLAN
              </span>
              <span class="text-xs font-bold text-slate-500">${fullDate}</span>
              <span class="text-slate-300">•</span>
              <span class="text-xs font-bold text-orange-700">🔥 ${dash.streak || 0} Day Streak</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>${greeting}</span>
            </h1>
            <p class="text-xs text-slate-600 mt-1 max-w-xl font-medium">
              Execute daily lectures and practice problems. Stay disciplined and tick off each target with clarity.
            </p>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <button onclick="triggerSmartRedistribute()" class="px-3.5 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-rose-600"></i>
              <span>Smart Reschedule</span>
            </button>
            <button onclick="openAddLectureModal()" class="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer">
              <i data-lucide="plus" class="w-4 h-4"></i>
              <span>Add Today Task</span>
            </button>
          </div>
        </div>

        <!-- 2. Top 3 Execution Snapshot Cards -->
        <div class="mt-5 pt-4 border-t border-orange-200/60 grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <!-- Lectures Done -->
          <div class="bg-white/95 p-4 rounded-xl border border-orange-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-xs font-black text-orange-900 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide">
                <i data-lucide="book-open" class="w-4 h-4 text-orange-600"></i>
                Today's Lectures
              </span>
              <span class="text-sm font-black text-orange-600">${lecProgressPct}%</span>
            </div>
            <div class="text-xs text-slate-600 font-semibold mb-2">
              <span class="text-slate-900 font-bold">${completedTodayLecs}</span> / ${totalTodayTasks} lectures completed
            </div>
            <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${lecProgressPct}%; background-color: #ea580c;"></div>
            </div>
          </div>

          <!-- DPP Solved -->
          <div class="bg-white/95 p-4 rounded-xl border border-amber-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-xs font-black text-amber-900 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide">
                <i data-lucide="file-check-2" class="w-4 h-4 text-amber-500"></i>
                Today's DPP Practice
              </span>
              <span class="text-sm font-black text-amber-600">${dppProgressPct}%</span>
            </div>
            <div class="text-xs text-slate-600 font-semibold mb-2">
              <span class="text-slate-900 font-bold">${completedTodayDpps}</span> / ${totalTodayTasks} DPPs solved
            </div>
            <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${dppProgressPct}%; background-color: #f59e0b;"></div>
            </div>
          </div>

          <!-- Deep Study Time -->
          <div class="bg-white/95 p-4 rounded-xl border border-emerald-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-xs font-black text-emerald-900 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide">
                <i data-lucide="clock" class="w-4 h-4 text-emerald-600"></i>
                Focus Time Today
              </span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                ${dash.study_time_card && dash.study_time_card.has_data ? 'Pomodoro Synced' : 'Standby'}
              </span>
            </div>
            <div class="text-lg font-black text-emerald-950">
              ${todayStudyStr} <span class="text-xs font-medium text-slate-500">logged</span>
            </div>
            <div class="text-[11px] text-slate-500 font-medium">
              Target: 6.0h focus daily • Phys Chem: ${dash.today_stats.phys_chem_hours || 0}h
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Task Filter Toolbar -->
      <div class="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-slate-500 font-bold mr-1">Filter Tasks:</span>
          <button onclick="setTodayFilter('all')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'all' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">
            All (${totalTodayTasks})
          </button>
          <button onclick="setTodayFilter('pending')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-50 text-amber-800 hover:bg-amber-50'}">
            ⏳ Pending (${pendingTodayTasks})
          </button>
          <button onclick="setTodayFilter('completed')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${currentFilter === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-50 text-emerald-700 hover:bg-emerald-50'}">
            ✓ Completed (${fullyDoneTodayTasks})
          </button>
        </div>

        <div class="text-xs text-slate-500 font-medium">
          Showing <span class="font-bold text-slate-900">${displayTasks.length}</span> tasks for today
        </div>
      </div>

      <!-- 4. Subject Task Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        ${state.subjects.map(s => {
          const subTasks = grouped[s.name] || [];
          const isPhysChem = s.name === 'Physical Chemistry';

          // Match card style with subject identity
          let cardStyle = 'card-orange';
          let badgeColor = 'bg-orange-100 text-orange-800';
          let barColor = '#ea580c';
          if (s.name === 'Mathematics') { cardStyle = 'card-pink'; badgeColor = 'bg-pink-100 text-pink-800'; barColor = '#db2777'; }
          else if (s.name === 'Physical Chemistry') { cardStyle = 'card-green'; badgeColor = 'bg-emerald-100 text-emerald-800'; barColor = '#16a34a'; }
          else if (s.name === 'Inorganic Chemistry') { cardStyle = 'card-teal'; badgeColor = 'bg-teal-100 text-teal-800'; barColor = '#0d9488'; }
          else if (s.name === 'Organic Chemistry') { cardStyle = 'card-rose'; badgeColor = 'bg-rose-100 text-rose-800'; barColor = '#e11d48'; }

          return `
            <div class="${cardStyle} p-5 flex flex-col justify-between min-w-0">
              <div class="min-w-0">
                <div class="flex items-center justify-between mb-3 pb-2 border-b border-black/5">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${barColor};"></span>
                    <h3 class="font-black text-sm text-slate-900 truncate">${s.display_name}</h3>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${badgeColor} font-bold truncate">${s.resource_name}</span>
                  </div>
                  <span class="text-xs font-bold text-slate-700 flex-shrink-0">${subTasks.length} ${subTasks.length === 1 ? 'task' : 'tasks'}</span>
                </div>

                ${isPhysChem ? `
                  <div class="p-3 bg-white/80 border border-emerald-200 rounded-xl mb-3">
                    <div class="flex justify-between items-center text-xs text-emerald-900 font-bold mb-1">
                      <span>Physical Chemistry Target: 7h/week</span>
                      <button onclick="navigateTo('pomodoro')" class="text-[11px] text-emerald-700 font-bold underline hover:text-emerald-800 cursor-pointer">View Study Hours</button>
                    </div>
                    <div class="text-xl font-black text-emerald-950">
                      ${dash.today_stats.phys_chem_hours || 0}h logged today
                    </div>
                    <p class="text-[10px] text-slate-500 mt-1">Tracked strictly via external Pomodoro application.</p>
                  </div>
                ` : ''}

                ${subTasks.length > 0 ? `
                  <div class="space-y-3">
                    ${subTasks.map(t => {
                      const isLecDone = Boolean(t.is_completed);
                      const isDppDone = Boolean(t.is_dpp_completed);
                      const niceDate = formatDateNice(t.scheduled_date);
                      return `
                        <div class="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition shadow-xs min-w-0 flex flex-col justify-between gap-3">
                          <div class="min-w-0">
                            <div class="flex items-center justify-between gap-2 mb-1">
                              <span class="font-extrabold text-xs sm:text-sm text-slate-900 ${isLecDone ? 'line-through text-slate-400' : ''}">Lecture #${t.lecture_no}</span>
                              ${t.is_backlog ? '<span class="badge badge-backlog text-[10px] font-bold">Backlog Task</span>' : ''}
                            </div>
                            <div class="text-[11px] text-slate-500 break-words mt-0.5 font-medium">
                              ${escapeHtml(t.chapter_name)}${niceDate ? ` • ${niceDate}` : ''}
                            </div>
                          </div>

                          <!-- Obvious Action Buttons -->
                          <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <!-- Lecture Button -->
                              <button onclick="toggleLectureQuick(${t.id})" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isLecDone ? 'btn-action-completed' : 'btn-action-pending-lecture'}">
                                <i data-lucide="${isLecDone ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>
                                ${isLecDone ? '✓ LECTURE DONE' : 'COMPLETE LECTURE'}
                              </button>

                              <!-- DPP Button -->
                              <button onclick="toggleDppQuick(${t.id})" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isDppDone ? 'btn-action-completed' : 'btn-action-pending-dpp'}">
                                <i data-lucide="${isDppDone ? 'check-circle-2' : 'clock'}" class="w-3.5 h-3.5"></i>
                                ${isDppDone ? '✓ DPP DONE' : `COMPLETE DPP #${t.dpp_no}`}
                              </button>
                            </div>

                            <button onclick="openEditLectureModal(${t.id})" class="text-[11px] text-slate-500 hover:text-slate-800 font-semibold cursor-pointer">
                              Edit &rarr;
                            </button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : `
                  <div class="py-8 text-center text-slate-400 text-xs font-medium bg-white/50 rounded-xl border border-dashed border-black/5">
                    No lectures scheduled for ${s.display_name} today.
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

async function toggleLectureQuick(id) {
  try {
    const res = await callApi('toggle_lecture_completion', id);
    if (res && res.success) {
      if (state.currentView === 'lectures') {
        const lec = state.lectures.find(l => l.id === id);
        if (lec) lec.is_completed = res.is_completed ? 1 : 0;
        const card = document.getElementById(`lec-card-${id}`);
        if (card) {
          const isDone = Boolean(res.is_completed);
          if (isDone) card.classList.add('is-completed');
          else card.classList.remove('is-completed');
          const icon = card.querySelector('.lec-check-icon');
          const text = card.querySelector('.lec-title-text');
          if (icon) {
            icon.textContent = isDone ? '✓' : '';
            if (isDone) icon.classList.add('checked');
            else icon.classList.remove('checked');
          }
          if (text) {
            if (isDone) text.classList.add('line-through', 'text-slate-400');
            else text.classList.remove('line-through', 'text-slate-400');
          }
        }
        updateLectureTopSummary();
        loadInitialData();
      } else {
        await loadInitialData();
        refreshCurrentView();
      }
    }
  } catch (err) {
    console.error('toggleLectureQuick error:', err);
  }
}

async function toggleDppQuick(id) {
  try {
    const res = await callApi('toggle_dpp_completion', id);
    if (res && res.success) {
      if (state.currentView === 'lectures') {
        const lec = state.lectures.find(l => l.id === id);
        if (lec) lec.is_dpp_completed = res.is_dpp_completed ? 1 : 0;
        const card = document.getElementById(`lec-card-${id}`);
        if (card) {
          const isDone = Boolean(res.is_dpp_completed);
          const icon = card.querySelector('.dpp-check-icon');
          const text = card.querySelector('.dpp-title-text');
          if (icon) {
            icon.textContent = isDone ? '✓' : '';
            if (isDone) icon.classList.add('dpp-checked');
            else icon.classList.remove('dpp-checked');
          }
          if (text) {
            if (isDone) text.classList.add('line-through', 'text-slate-400');
            else text.classList.remove('line-through', 'text-slate-400');
          }
        }
        updateLectureTopSummary();
        loadInitialData();
      } else {
        await loadInitialData();
        refreshCurrentView();
      }
    }
  } catch (err) {
    console.error('toggleDppQuick error:', err);
  }
}


function refreshCurrentView() {
  const container = document.getElementById('view-content');
  if (!container) return;
  if (state.currentView === 'dashboard') renderDashboard(container);
  else if (state.currentView === 'today') renderToday(container);
  else if (state.currentView === 'lectures') renderSubjectHub(state.selectedSubjectId || 1, container);
  else if (state.currentView === 'dpp') renderDPP(container);
  else if (state.currentView === 'tests') renderTests(container);
  else if (state.currentView === 'pomodoro') renderPomodoro(container);
  else if (state.currentView === 'analytics') renderAnalytics(container);
  else if (state.currentView === 'settings') renderSettings(container);
  else if (state.currentView && state.currentView.startsWith('subject_')) {
    const map = {
      'subject_physics': 1,
      'subject_maths': 2,
      'subject_physical_chem': 3,
      'subject_inorganic_chem': 4,
      'subject_organic_chem': 5
    };
    renderSubjectHub(map[state.currentView] || 1, container);
  }
}

// ==================== 3. DEDICATED SUBJECT & CHAPTER SYSTEM ====================

function getSubjectColorInfo(subjectName) {
  switch (subjectName) {
    case 'Mathematics':
    case 'Maths':
      return { cardClass: 'card-pink', accentColor: '#db2777', badgeBg: 'bg-pink-100 text-pink-800', chkClass: 'checked-maths' };
    case 'Physical Chemistry':
      return { cardClass: 'card-green', accentColor: '#16a34a', badgeBg: 'bg-emerald-100 text-emerald-800', chkClass: 'checked-physchem' };
    case 'Inorganic Chemistry':
      return { cardClass: 'card-teal', accentColor: '#0d9488', badgeBg: 'bg-teal-100 text-teal-800', chkClass: 'checked-inorg' };
    case 'Organic Chemistry':
      return { cardClass: 'card-rose', accentColor: '#e11d48', badgeBg: 'bg-rose-100 text-rose-800', chkClass: 'checked-org' };
    case 'Physics':
    default:
      return { cardClass: 'card-orange', accentColor: '#ea580c', badgeBg: 'bg-orange-100 text-orange-800', chkClass: 'checked-physics' };
  }
}

function navigateToSubjectById(subjectId) {
  const map = {
    1: 'subject_physics',
    2: 'subject_maths',
    3: 'subject_physical_chem',
    4: 'subject_inorganic_chem',
    5: 'subject_organic_chem'
  };
  navigateTo(map[subjectId] || 'subject_physics');
}

async function renderSubjectHub(subjectId, container) {
  if (!container) container = document.getElementById('view-content');
  if (!container) return;

  state.selectedSubjectId = subjectId;

  // If a chapter is selected, render the chapter checklist view directly
  if (state.selectedChapterId) {
    return renderChapterView(subjectId, state.selectedChapterId, container);
  }

  const subjects = await callApi('get_subjects_and_chapters');
  state.subjects = subjects;
  const s = subjects.find(item => item.id == subjectId) || subjects[0];
  if (!s) return;

  const colorInfo = getSubjectColorInfo(s.name);
  const chapters = s.chapters || [];

  // Calculate subject-level totals
  const totalLecs = chapters.reduce((acc, c) => acc + (c.total_lectures || 0), 0);
  const completedLecs = chapters.reduce((acc, c) => acc + (c.completed_lectures || 0), 0);
  const completedDpps = chapters.reduce((acc, c) => acc + (c.dpp_completed || 0), 0);
  const pendingLecs = Math.max(0, totalLecs - completedLecs);
  const pendingDpps = Math.max(0, totalLecs - completedDpps);
  const lecProgressPct = totalLecs > 0 ? Math.round((completedLecs / totalLecs) * 100) : 0;
  const dppProgressPct = totalLecs > 0 ? Math.round((completedDpps / totalLecs) * 100) : 0;

  // Filter chapters based on chapter search input
  const query = (state.chapterSearch || '').toLowerCase().trim();
  const filteredChapters = query
    ? chapters.filter(c => c.name.toLowerCase().includes(query))
    : chapters;

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <!-- Subject Hero Header -->
      <div class="${colorInfo.cardClass} p-6 min-w-0 rounded-2xl">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-black px-2.5 py-1 rounded-full ${colorInfo.badgeBg} uppercase tracking-wider">
                JEE Main & Advanced 2027
              </span>
              <span class="text-xs font-semibold text-slate-600">Resource: ${escapeHtml(s.resource_name || '')}</span>
            </div>
            <h1 class="text-3xl font-black text-slate-900 tracking-tight mt-1">${escapeHtml(s.display_name)}</h1>
            <div class="text-xs font-bold text-slate-700 mt-1 flex items-center gap-2 flex-wrap">
              <span>${escapeHtml(s.display_name)}</span>
              <span class="text-slate-300">•</span>
              <span style="color: ${colorInfo.accentColor}; font-extrabold;">${lecProgressPct}% Complete</span>
              <span class="text-slate-300">•</span>
              <span>${completedLecs}/${totalLecs} Lectures</span>
              <span class="text-slate-300">•</span>
              <span class="text-amber-700 font-bold">${completedDpps}/${totalLecs} DPPs</span>
            </div>
            <p class="text-xs text-slate-600 mt-1 max-w-xl break-words font-medium">
              Curriculum progress, chapter syllabus breakdown, and daily practice problem tracking.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button onclick="openAddLectureModal(${s.id})" class="px-4 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer" style="background-color: ${colorInfo.accentColor};">
              <i data-lucide="plus" class="w-4 h-4"></i>
              <span>Add Lecture</span>
            </button>
          </div>
        </div>

        <!-- Subject Progress (Lectures & DPP) -->
        <div class="mt-5 pt-4 border-t border-black/5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/90 p-4 rounded-xl border border-black/5 shadow-xs">
            <div class="flex items-center justify-between text-xs font-black text-slate-800 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide">
                <i data-lucide="book-open" class="w-4 h-4" style="color: ${colorInfo.accentColor};"></i>
                Lectures Progress
              </span>
              <span class="text-sm font-extrabold" style="color: ${colorInfo.accentColor};">${lecProgressPct}%</span>
            </div>
            <div class="text-xs text-slate-600 font-semibold mb-2">
              <span class="text-slate-900 font-bold">${completedLecs}</span> / ${totalLecs} lectures completed • <span class="text-slate-500 font-normal">${pendingLecs} pending</span>
            </div>
            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-black/5">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${lecProgressPct}%; background-color: ${colorInfo.accentColor};"></div>
            </div>
          </div>

          <div class="bg-white/90 p-4 rounded-xl border border-black/5 shadow-xs">
            <div class="flex items-center justify-between text-xs font-black text-slate-800 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide text-amber-900">
                <i data-lucide="file-check-2" class="w-4 h-4 text-amber-500"></i>
                DPP Progress
              </span>
              <span class="text-sm font-extrabold text-amber-600">${dppProgressPct}%</span>
            </div>
            <div class="text-xs text-slate-600 font-semibold mb-2">
              <span class="text-slate-900 font-bold">${completedDpps}</span> / ${totalLecs} DPP completed • <span class="text-slate-500 font-normal">${pendingDpps} pending</span>
            </div>
            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-black/5">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${dppProgressPct}%; background-color: #f59e0b;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Search Chapters & Chapter Syllabus Section -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl min-w-0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
          <div>
            <h2 class="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="layers" class="w-5 h-5" style="color: ${colorInfo.accentColor};"></i>
              Chapters (${chapters.length})
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">Click any chapter to view and manage its lectures and DPPs.</p>
          </div>

          <div class="relative w-full sm:w-64">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></i>
            <input type="text" id="chapter-search-input" value="${escapeHtml(state.chapterSearch || '')}" oninput="handleSearchChaptersInput(event)" placeholder="Search ${escapeHtml(s.display_name)} chapters..." class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:border-blue-500 transition">
          </div>
        </div>

        ${filteredChapters.length === 0 ? `
          <div class="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <i data-lucide="search-x" class="w-8 h-8 text-slate-400 mx-auto mb-2"></i>
            <p class="text-xs font-bold text-slate-700">No chapters match "${escapeHtml(state.chapterSearch)}"</p>
            <button onclick="clearChapterSearch()" class="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer">Clear Search</button>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${filteredChapters.map(ch => {
              const chTot = ch.total_lectures || 0;
              const chComp = ch.completed_lectures || 0;
              const chDppComp = ch.dpp_completed || 0;
              const chPct = chTot > 0 ? Math.round((chComp / chTot) * 100) : 0;
              const chStatus = (chComp === chTot && chDppComp === chTot && chTot > 0) ? 'Completed' : ((chComp > 0 || chDppComp > 0) ? 'In Progress' : 'Not Started');
              const chStatusBadge = chStatus === 'Completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : (chStatus === 'In Progress' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200');

              const chDppPct = chTot > 0 ? Math.round((chDppComp / chTot) * 100) : 0;
              return `
                <div onclick="openChapterView(${s.id}, ${ch.id})" class="chapter-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer min-w-0 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:shadow-md transition">
                  <div class="min-w-0">
                    <div class="flex items-start justify-between gap-2 mb-2.5">
                      <h3 class="font-extrabold text-sm text-slate-900 break-words leading-snug">${escapeHtml(ch.name)}</h3>
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${chStatusBadge}">${chStatus}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          ${chTot} lecs
                        </span>
                      </div>
                    </div>

                    <!-- Dual Parallel Progress Bars (Lectures & DPP) -->
                    <div class="space-y-2.5 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <!-- Lectures Progress -->
                      <div>
                        <div class="flex justify-between items-center text-[11px] font-bold mb-1">
                          <span class="text-slate-600 flex items-center gap-1">
                            <i data-lucide="book-open" class="w-3 h-3" style="color: ${colorInfo.accentColor};"></i>
                            ${chComp} / ${chTot} lectures completed
                          </span>
                          <span class="font-black" style="color: ${colorInfo.accentColor};">${chPct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div class="h-full rounded-full transition-all duration-300" style="width: ${chPct}%; background-color: ${colorInfo.accentColor};"></div>
                        </div>
                      </div>

                      <!-- DPP Progress -->
                      <div>
                        <div class="flex justify-between items-center text-[11px] font-bold mb-1">
                          <span class="text-amber-800 flex items-center gap-1">
                            <i data-lucide="file-check-2" class="w-3 h-3 text-amber-500"></i>
                            ${chDppComp} / ${chTot} DPP completed
                          </span>
                          <span class="font-black text-amber-600">${chDppPct}%</span>
                        </div>
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div class="h-full rounded-full transition-all duration-300" style="width: ${chDppPct}%; background-color: #f59e0b;"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                    <button type="button" onclick="event.stopPropagation(); handleRenumberChapterPrompt(${ch.id}, '${escapeJsParam(ch.name)}')" class="text-slate-400 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition" title="Renumber sequential lectures">
                      <i data-lucide="list-ordered" class="w-3.5 h-3.5"></i>
                      <span class="text-[11px]">Renumber</span>
                    </button>
                    <span class="flex items-center gap-1 hover:underline font-extrabold" style="color: ${colorInfo.accentColor};">
                      <span>View Chapter</span>
                      <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function handleSearchChaptersInput(e) {
  state.chapterSearch = e.target.value;
  renderSubjectHub(state.selectedSubjectId, document.getElementById('view-content'));
}

function clearChapterSearch() {
  state.chapterSearch = '';
  renderSubjectHub(state.selectedSubjectId, document.getElementById('view-content'));
}

function openChapterView(subjectId, chapterId) {
  state.selectedSubjectId = subjectId;
  state.selectedChapterId = chapterId;
  state.lectureSearch = '';
  renderChapterView(subjectId, chapterId, document.getElementById('view-content'));
}

function backToSubjectChapters() {
  state.selectedChapterId = null;
  state.lectureSearch = '';
  renderSubjectHub(state.selectedSubjectId, document.getElementById('view-content'));
}

async function renderChapterView(subjectId, chapterId, container) {
  if (!container) container = document.getElementById('view-content');
  if (!container) return;

  const subjects = await callApi('get_subjects_and_chapters');
  state.subjects = subjects;
  const s = subjects.find(item => item.id == subjectId) || subjects[0];
  if (!s) return backToSubjectChapters();

  const ch = (s.chapters || []).find(c => c.id == chapterId);
  if (!ch) return backToSubjectChapters();

  const colorInfo = getSubjectColorInfo(s.name);
  const lectures = await callApi('get_lectures', { chapter_id: chapterId });
  lectures.sort((a, b) => (a.lecture_no || 0) - (b.lecture_no || 0));
  state.chapterLectures = lectures;

  const totalLecs = lectures.length;
  const completedLecs = lectures.filter(l => l.is_completed).length;
  const completedDpps = lectures.filter(l => l.is_dpp_completed).length;
  const pendingLecs = Math.max(0, totalLecs - completedLecs);
  const pendingDpps = Math.max(0, totalLecs - completedDpps);
  const lecPct = totalLecs > 0 ? Math.round((completedLecs / totalLecs) * 100) : 0;
  const dppPct = totalLecs > 0 ? Math.round((completedDpps / totalLecs) * 100) : 0;
  const todayStr = getTodayDateString();

  const query = (state.lectureSearch || '').toLowerCase().trim();
  const filteredLectures = query
    ? lectures.filter(l =>
        String(l.lecture_no).includes(query) ||
        (l.lecture_name && l.lecture_name.toLowerCase().includes(query)) ||
        (l.topic && l.topic.toLowerCase().includes(query)) ||
        String(l.dpp_no).includes(query) ||
        (l.scheduled_date && l.scheduled_date.includes(query))
      )
    : lectures;

  container.innerHTML = `
    <div class="space-y-5 min-w-0">
      <!-- Back Button & Chapter Title Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 min-w-0">
        <div>
          <button type="button" onclick="backToSubjectChapters()" class="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500 hover:text-slate-900 transition mb-1.5 cursor-pointer">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
            <span>Back to ${escapeHtml(s.display_name)}</span>
          </button>
          <h1 class="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
            <span>${escapeHtml(ch.name)}</span>
          </h1>
          <div class="text-xs font-semibold text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-900">${totalLecs} Lectures</span> •
            <span class="text-emerald-700 font-bold">${completedLecs} Completed</span> •
            <span class="text-slate-500 font-medium">${pendingLecs} Pending</span> •
            <span class="text-amber-800 font-bold">${completedDpps}/${totalLecs} DPPs</span>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <button type="button" onclick="openAddLectureModal(${subjectId}, ${chapterId})" class="px-4 py-2 rounded-xl text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer" style="background-color: ${colorInfo.accentColor};">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add Lecture</span>
          </button>
          <button type="button" onclick="openAddDppModal(${subjectId}, ${chapterId})" class="px-4 py-2 rounded-xl text-amber-950 font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer bg-amber-400 hover:bg-amber-500">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add DPP</span>
          </button>
        </div>
      </div>

      <!-- Chapter Summary Block: Dual Metrics & Dual Progress Bars (Section 7) -->
      <div class="modern-card p-4 sm:p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Lecture Progress -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <div class="flex justify-between items-center text-xs font-extrabold text-slate-800 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide">
                <i data-lucide="book-open" class="w-4 h-4" style="color: ${colorInfo.accentColor};"></i>
                Lectures Progress: <span id="ch-lec-count">${completedLecs} / ${totalLecs} completed</span>
              </span>
              <span id="ch-lec-pct" class="text-sm font-black" style="color: ${colorInfo.accentColor};">${lecPct}%</span>
            </div>
            <div class="text-[11px] text-slate-500 font-medium mb-2" id="ch-lec-pending">
              ${pendingLecs} pending
            </div>
            <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div id="ch-lec-bar" class="h-full rounded-full transition-all duration-300" style="width: ${lecPct}%; background-color: ${colorInfo.accentColor};"></div>
            </div>
          </div>

          <!-- DPP Progress -->
          <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <div class="flex justify-between items-center text-xs font-extrabold text-slate-800 mb-1">
              <span class="flex items-center gap-1.5 uppercase tracking-wide text-amber-900">
                <i data-lucide="file-check-2" class="w-4 h-4 text-amber-500"></i>
                DPP Progress: <span id="ch-dpp-count">${completedDpps} / ${totalLecs} completed</span>
              </span>
              <span id="ch-dpp-pct" class="text-sm font-black text-amber-600">${dppPct}%</span>
            </div>
            <div class="text-[11px] text-slate-500 font-medium mb-2" id="ch-dpp-pending">
              ${pendingDpps} pending
            </div>
            <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div id="ch-dpp-bar" class="h-full rounded-full transition-all duration-300" style="width: ${dppPct}%; background-color: #f59e0b;"></div>
            </div>
          </div>
        </div>

        <!-- In-Chapter Search Input -->
        <div class="relative mt-4">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></i>
          <input type="text" id="chapter-lec-search" value="${escapeHtml(state.lectureSearch || '')}" oninput="handleSearchLecturesInput(event)" placeholder="Search lectures in this chapter..." class="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:border-blue-500 transition">
        </div>
      </div>

      <!-- Two Distinct Checklists: LECTURES and DPP (Sections 3, 4, 5, 6, 8, 9) -->
      ${filteredLectures.length === 0 ? `
        <div class="p-8 text-center bg-white border border-slate-200 rounded-2xl">
          <i data-lucide="search-x" class="w-8 h-8 text-slate-300 mx-auto mb-2"></i>
          <p class="text-xs font-bold text-slate-600">No lectures found matching search criteria.</p>
        </div>
      ` : `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <!-- Column 1: LECTURES CHECKLIST -->
          <div class="modern-card p-4 sm:p-5 bg-white border border-slate-200 shadow-xs rounded-2xl space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="book-open" class="w-4 h-4" style="color: ${colorInfo.accentColor};"></i>
                Lectures Checklist
              </h2>
              <span id="col-lec-count" class="text-xs font-bold text-slate-500">${completedLecs} / ${totalLecs} Done</span>
            </div>

            <div class="space-y-2">
              ${filteredLectures.map(l => {
                const isOverdue = !l.is_completed && l.scheduled_date && l.scheduled_date < todayStr;
                const isToday = !l.is_completed && l.scheduled_date && l.scheduled_date === todayStr;
                const niceDate = formatDateNice(l.scheduled_date);
                const lecLabel = 'Lecture ' + l.lecture_no;

                return `
                  <div class="chapter-check-row flex items-center justify-between p-3 gap-3 ${l.is_completed ? 'is-done' : ''}" id="ch-lec-row-${l.id}">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      <button type="button" onclick="handleLectureCheckToggle(${l.id}, event)"
                        class="check-box-toggle ${l.is_completed ? ('checked ' + (colorInfo.chkClass || '')) : ''}"
                        id="ch-lec-box-${l.id}"
                        style="${l.is_completed ? `background-color: ${colorInfo.accentColor}; border-color: ${colorInfo.accentColor};` : ''}"
                        title="Click to toggle Lecture ${l.lecture_no}">
                        ${l.is_completed ? '✓' : ''}
                      </button>
                      <div class="min-w-0 flex-1 flex items-center justify-between gap-3 flex-wrap">
                        <div class="min-w-0 flex items-center gap-2">
                          <span class="font-extrabold text-xs sm:text-sm text-slate-900 ${l.is_completed ? 'line-through text-slate-400' : ''}" id="ch-lec-title-${l.id}">
                            ${lecLabel}
                          </span>
                          ${niceDate ? `
                            <span class="text-slate-400 font-bold">—</span>
                            <span class="text-xs font-semibold text-slate-500 font-mono">${niceDate}</span>
                          ` : ''}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span class="badge-overdue ${isOverdue ? '' : 'hidden'}" id="ch-lec-overdue-${l.id}">OVERDUE</span>
                          <span class="badge-today ${isToday ? '' : 'hidden'}" id="ch-lec-today-${l.id}">TODAY</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button type="button" onclick="openEditLectureModal(${l.id})" class="p-1.5 text-slate-400 hover:text-indigo-600 transition cursor-pointer" title="Edit Lecture">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                      </button>
                      <button type="button" onclick="handleQuickDeleteLecture(${l.id}, ${l.lecture_no}, event)" class="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer" title="Delete Lecture">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Column 2: DPP CHECKLIST -->
          <div class="modern-card p-4 sm:p-5 bg-white border border-slate-200 shadow-xs rounded-2xl space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 class="text-sm font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="file-check-2" class="w-4 h-4 text-amber-500"></i>
                DPP Checklist
              </h2>
              <span id="col-dpp-count" class="text-xs font-bold text-amber-800">${completedDpps} / ${totalLecs} Done</span>
            </div>

            <div class="space-y-2">
              ${filteredLectures.map(l => {
                const isDppOverdue = !l.is_dpp_completed && l.scheduled_date && l.scheduled_date < todayStr;
                const isDppToday = !l.is_dpp_completed && l.scheduled_date && l.scheduled_date === todayStr;
                const niceDate = formatDateNice(l.scheduled_date);
                const dppNum = l.dpp_no || l.lecture_no;
                const dppLabel = 'DPP ' + dppNum;
                let cleanDppTitle = '';
                if (l.topic && l.topic.trim()) {
                  cleanDppTitle = l.topic.trim();
                } else if (l.lecture_name) {
                  if (l.lecture_name.includes(':')) {
                    cleanDppTitle = l.lecture_name.split(':').slice(1).join(':').trim();
                  } else if (l.lecture_name !== `Lecture ${l.lecture_no}` && l.lecture_name !== `DPP ${dppNum}`) {
                    cleanDppTitle = l.lecture_name;
                  }
                }

                return `
                  <div class="chapter-check-row flex items-center justify-between p-3 gap-3 ${l.is_dpp_completed ? 'is-done' : ''}" id="ch-dpp-row-${l.id}">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      <button type="button" onclick="handleDppCheckToggle(${l.id}, event)"
                        class="check-box-toggle dpp-toggle ${l.is_dpp_completed ? 'checked' : ''}"
                        id="ch-dpp-box-${l.id}"
                        style="${l.is_dpp_completed ? 'background-color: #f59e0b; border-color: #f59e0b;' : ''}"
                        title="Click to toggle DPP ${dppNum}">
                        ${l.is_dpp_completed ? '✓' : ''}
                      </button>
                      <div class="min-w-0 flex-1 flex items-center justify-between gap-3 flex-wrap">
                        <div class="min-w-0 flex items-center gap-2">
                          <span class="font-extrabold text-xs sm:text-sm text-slate-900 ${l.is_dpp_completed ? 'line-through text-slate-400' : ''}" id="ch-dpp-title-${l.id}">
                            ${dppLabel}
                          </span>
                          ${cleanDppTitle && cleanDppTitle !== `DPP ${dppNum}` ? `
                            <span class="text-xs text-slate-400 truncate max-w-[200px]" title="${escapeHtml(cleanDppTitle)}" id="ch-dpp-sub-${l.id}">
                              • ${escapeHtml(cleanDppTitle)}
                            </span>
                          ` : ''}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          ${niceDate ? `<span class="text-xs font-semibold text-slate-500 font-mono">${niceDate}</span>` : ''}
                          <span class="badge-overdue ${isDppOverdue ? '' : 'hidden'}" id="ch-dpp-overdue-${l.id}">OVERDUE</span>
                          <span class="badge-today ${isDppToday ? '' : 'hidden'}" id="ch-dpp-today-${l.id}">TODAY</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button type="button" onclick="openEditDppModal(${l.id})" class="p-1.5 text-slate-400 hover:text-amber-600 transition cursor-pointer" title="Edit DPP">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                      </button>
                      <button type="button" onclick="handleQuickDeleteDpp(${l.id}, ${dppNum}, event)" class="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer" title="Delete DPP">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function handleSearchLecturesInput(e) {
  state.lectureSearch = e.target.value;
  renderChapterView(state.selectedSubjectId, state.selectedChapterId, document.getElementById('view-content'));
}

async function handleLectureCheckToggle(id, event) {
  if (event) event.stopPropagation();

  const lec = (state.chapterLectures || []).find(l => l.id === id);
  const newStatus = lec ? !lec.is_completed : true;

  const s = state.subjects.find(sub => sub.id == state.selectedSubjectId);
  const colorInfo = s ? getSubjectColorInfo(s.name) : { accentColor: '#ea580c', chkClass: 'checked-physics' };

  // Immediate 0ms UI update
  const box = document.getElementById(`ch-lec-box-${id}`);
  const row = document.getElementById(`ch-lec-row-${id}`);
  const title = document.getElementById(`ch-lec-title-${id}`);
  const sub = document.getElementById(`ch-lec-sub-${id}`);
  const overdueBadge = document.getElementById(`ch-lec-overdue-${id}`);
  const todayBadge = document.getElementById(`ch-lec-today-${id}`);

  if (box) {
    if (newStatus) {
      box.classList.add('checked');
      box.classList.add('check-pop');
      if (colorInfo.chkClass) box.classList.add(colorInfo.chkClass);
      box.textContent = '✓';
      box.style.backgroundColor = colorInfo.accentColor;
      box.style.borderColor = colorInfo.accentColor;
      setTimeout(() => box.classList.remove('check-pop'), 250);
    } else {
      box.classList.remove('checked', 'check-pop');
      if (colorInfo.chkClass) box.classList.remove(colorInfo.chkClass);
      box.textContent = '';
      box.style.backgroundColor = '#ffffff';
      box.style.borderColor = '#cbd5e1';
    }
  }

  if (row) {
    if (newStatus) {
      row.classList.add('is-done', 'glow-celebrate');
      setTimeout(() => row.classList.remove('glow-celebrate'), 700);
    } else {
      row.classList.remove('is-done', 'glow-celebrate');
    }
  }

  if (title) {
    if (newStatus) title.classList.add('line-through', 'text-slate-400');
    else title.classList.remove('line-through', 'text-slate-400');
  }

  if (sub) {
    if (newStatus) sub.classList.add('text-slate-400');
    else sub.classList.remove('text-slate-400');
  }

  if (overdueBadge) {
    if (newStatus) {
      overdueBadge.classList.add('hidden');
    } else {
      const todayStr = getTodayDateString();
      if (lec && lec.scheduled_date && lec.scheduled_date < todayStr) {
        overdueBadge.classList.remove('hidden');
      }
    }
  }

  if (todayBadge) {
    if (newStatus) {
      todayBadge.classList.add('hidden');
    } else {
      const todayStr = getTodayDateString();
      if (lec && lec.scheduled_date && lec.scheduled_date === todayStr) {
        todayBadge.classList.remove('hidden');
      }
    }
  }

  if (lec) lec.is_completed = newStatus ? 1 : 0;
  updateChapterChecklistHeaderMetrics();

  // Background persistence
  try {
    const res = await callApi('toggle_lecture_completion', id);
    if (!res || !res.success) {
      if (lec) lec.is_completed = !newStatus ? 1 : 0;
      updateChapterChecklistHeaderMetrics();
      showToast('Failed to update lecture status', 'error');
    } else {
      loadInitialData();
    }
  } catch (err) {
    console.error('Error toggling lecture:', err);
  }
}

async function handleDppCheckToggle(id, event) {
  if (event) event.stopPropagation();

  const lec = (state.chapterLectures || []).find(l => l.id === id);
  const newStatus = lec ? !lec.is_dpp_completed : true;

  // Immediate 0ms UI update
  const box = document.getElementById(`ch-dpp-box-${id}`);
  const row = document.getElementById(`ch-dpp-row-${id}`);
  const title = document.getElementById(`ch-dpp-title-${id}`);
  const sub = document.getElementById(`ch-dpp-sub-${id}`);
  const overdueBadge = document.getElementById(`ch-dpp-overdue-${id}`);
  const todayBadge = document.getElementById(`ch-dpp-today-${id}`);

  if (box) {
    if (newStatus) {
      box.classList.add('checked');
      box.classList.add('check-pop');
      box.textContent = '✓';
      box.style.backgroundColor = '#f59e0b';
      box.style.borderColor = '#f59e0b';
      setTimeout(() => box.classList.remove('check-pop'), 250);
    } else {
      box.classList.remove('checked', 'check-pop');
      box.textContent = '';
      box.style.backgroundColor = '#ffffff';
      box.style.borderColor = '#cbd5e1';
    }
  }

  if (row) {
    if (newStatus) {
      row.classList.add('is-done', 'glow-celebrate');
      setTimeout(() => row.classList.remove('glow-celebrate'), 700);
    } else {
      row.classList.remove('is-done', 'glow-celebrate');
    }
  }

  if (title) {
    if (newStatus) title.classList.add('line-through', 'text-slate-400');
    else title.classList.remove('line-through', 'text-slate-400');
  }

  if (sub) {
    if (newStatus) sub.classList.add('text-slate-400');
    else sub.classList.remove('text-slate-400');
  }

  if (overdueBadge) {
    if (newStatus) {
      overdueBadge.classList.add('hidden');
    } else {
      const todayStr = getTodayDateString();
      if (lec && lec.scheduled_date && lec.scheduled_date < todayStr) {
        overdueBadge.classList.remove('hidden');
      }
    }
  }

  if (todayBadge) {
    if (newStatus) {
      todayBadge.classList.add('hidden');
    } else {
      const todayStr = getTodayDateString();
      if (lec && lec.scheduled_date && lec.scheduled_date === todayStr) {
        todayBadge.classList.remove('hidden');
      }
    }
  }

  if (lec) lec.is_dpp_completed = newStatus ? 1 : 0;
  updateChapterChecklistHeaderMetrics();

  // Background persistence
  try {
    const res = await callApi('toggle_dpp_completion', id);
    if (!res || !res.success) {
      if (lec) lec.is_dpp_completed = !newStatus ? 1 : 0;
      updateChapterChecklistHeaderMetrics();
      showToast('Failed to update DPP status', 'error');
    } else {
      loadInitialData();
    }
  } catch (err) {
    console.error('Error toggling DPP:', err);
  }
}

async function handleQuickDeleteLecture(id, lecNo, event) {
  if (event) event.stopPropagation();
  if (confirm(`Are you sure you want to delete Lecture ${lecNo}?`)) {
    const res = await callApi('delete_lecture', id, false);
    if (res && res.success) {
      showToast(`Lecture ${lecNo} deleted.`, 'success');
      await loadInitialData();
      refreshCurrentView();
    } else {
      showToast(res ? res.error : 'Failed to delete lecture', 'error');
    }
  }
}

async function handleQuickDeleteDpp(id, dppNo, event) {
  if (event) event.stopPropagation();
  if (confirm(`Are you sure you want to remove DPP ${dppNo}?`)) {
    const res = await callApi('delete_dpp', id);
    if (res && res.success) {
      showToast(`DPP ${dppNo} removed.`, 'success');
      await loadInitialData();
      refreshCurrentView();
    } else {
      showToast(res ? res.error : 'Failed to remove DPP', 'error');
    }
  }
}

function updateChapterChecklistHeaderMetrics() {
  const lecs = state.chapterLectures || [];
  const total = lecs.length;
  const compLecs = lecs.filter(l => l.is_completed).length;
  const compDpp = lecs.filter(l => l.is_dpp_completed).length;
  const pendingLecs = Math.max(0, total - compLecs);
  const pendingDpps = Math.max(0, total - compDpp);
  const lecPct = total > 0 ? Math.round((compLecs / total) * 100) : 0;
  const dppPct = total > 0 ? Math.round((compDpp / total) * 100) : 0;

  const lecsCountEl = document.getElementById('ch-lec-count');
  if (lecsCountEl) lecsCountEl.textContent = `${compLecs} / ${total} completed`;

  const lecsPendingEl = document.getElementById('ch-lec-pending');
  if (lecsPendingEl) lecsPendingEl.textContent = `${pendingLecs} pending`;

  const lecPctEl = document.getElementById('ch-lec-pct');
  if (lecPctEl) lecPctEl.textContent = `${lecPct}%`;

  const lecBarEl = document.getElementById('ch-lec-bar');
  if (lecBarEl) lecBarEl.style.width = `${lecPct}%`;

  const dppCountEl = document.getElementById('ch-dpp-count');
  if (dppCountEl) dppCountEl.textContent = `${compDpp} / ${total} completed`;

  const dppPendingEl = document.getElementById('ch-dpp-pending');
  if (dppPendingEl) dppPendingEl.textContent = `${pendingDpps} pending`;

  const dppPctEl = document.getElementById('ch-dpp-pct');
  if (dppPctEl) dppPctEl.textContent = `${dppPct}%`;

  const dppBarEl = document.getElementById('ch-dpp-bar');
  if (dppBarEl) dppBarEl.style.width = `${dppPct}%`;

  const colLecEl = document.getElementById('col-lec-count');
  if (colLecEl) colLecEl.textContent = `${compLecs} / ${total} Done`;

  const colDppEl = document.getElementById('col-dpp-count');
  if (colDppEl) colDppEl.textContent = `${compDpp} / ${total} Done`;

  const headerSummaryEl = document.getElementById('ch-header-summary');
  if (headerSummaryEl) {
    headerSummaryEl.innerHTML = `
      <span class="font-bold text-slate-900">${total} Lectures</span> •
      <span class="text-emerald-700 font-bold">${compLecs} Completed</span> •
      <span class="text-slate-500 font-medium">${pendingLecs} Pending</span> •
      <span class="text-amber-800 font-bold">${compDpp}/${total} DPPs</span>
    `;
  }
}

function filterBySubjectAndChapter(subjectId, chapterId) {
  openChapterView(subjectId, chapterId);
}

function renderLectures(container) {
  renderSubjectHub(state.selectedSubjectId || 1, container);
}

async function handleRenumberChapterPrompt(chapterId, chapterName) {
  const startNum = prompt(`Renumber all lectures in "${chapterName}" sequentially starting from:`, "1");
  if (startNum && !isNaN(parseInt(startNum))) {
    const res = await callApi('renumber_chapter', chapterId, parseInt(startNum), 'date');
    if (res.success) {
      showToast(`Renumbers complete! ${res.count} lectures updated.`, 'success');
      await loadInitialData();
      refreshCurrentView();
    }
  }
}

// ==================== 5. DPP COMMAND CENTER (GOLDEN THEME & WRAPPING SAFE) ====================
async function renderDPP(container) {
  const allLectures = await callApi('get_lectures', {});
  const totalCount = allLectures.length;
  const completedCount = allLectures.filter(l => l.is_dpp_completed).length;
  const pendingCount = totalCount - completedCount;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Filter lectures based on state.dppFilters
  let filtered = allLectures;
  if (state.dppFilters.subject_id) {
    filtered = filtered.filter(l => l.subject_id == state.dppFilters.subject_id);
  }
  if (state.dppFilters.status === 'completed') {
    filtered = filtered.filter(l => l.is_dpp_completed);
  } else if (state.dppFilters.status === 'pending') {
    filtered = filtered.filter(l => !l.is_dpp_completed);
  }
  if (state.dppFilters.search) {
    const q = state.dppFilters.search.toLowerCase().trim();
    filtered = filtered.filter(l => 
      (l.lecture_name && l.lecture_name.toLowerCase().includes(q)) ||
      (l.chapter_name && l.chapter_name.toLowerCase().includes(q)) ||
      (l.topic && l.topic.toLowerCase().includes(q)) ||
      String(l.dpp_no).includes(q) ||
      String(l.lecture_no).includes(q) ||
      (l.subject_name && l.subject_name.toLowerCase().includes(q))
    );
  }

  const limit = state.dppFilters.limit;
  const displayLectures = (limit === 'all' || !limit) ? filtered : filtered.slice(0, parseInt(limit));

  container.innerHTML = `
    <div class="space-y-5 min-w-0">
      <!-- DPP Header Banner (Golden Yellow Theme) -->
      <div class="card-yellow p-6 min-w-0">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black tracking-wide flex items-center gap-1.5 shadow-xs">
                <i data-lucide="file-check-2" class="w-4 h-4"></i> DPP Tracker
              </span>
              <span class="text-xs text-amber-900 font-bold">Independent Completion System</span>
            </div>
            <h1 class="text-2xl font-black text-amber-950 tracking-tight mt-1.5">Daily Practice Problems Command</h1>
            <p class="text-xs text-amber-900/90 mt-1 max-w-xl break-words font-medium">
              Every lecture corresponds to exactly 1 DPP. Complete lectures and DPPs independently.
            </p>
          </div>

          <!-- Progress Counters -->
          <div class="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <div class="px-3.5 py-2 rounded-xl bg-white/90 border border-amber-300 text-center">
              <div class="text-[10px] text-amber-800 font-extrabold uppercase">Total</div>
              <div class="text-lg font-black text-amber-950">${totalCount}</div>
            </div>
            <div class="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-center">
              <div class="text-[10px] text-emerald-800 font-extrabold uppercase">Completed</div>
              <div class="text-lg font-black text-emerald-900">${completedCount}</div>
            </div>
            <div class="px-3.5 py-2 rounded-xl bg-amber-100 border border-amber-300 text-center">
              <div class="text-[10px] text-amber-900 font-extrabold uppercase">Pending</div>
              <div class="text-lg font-black text-amber-950">${pendingCount}</div>
            </div>
            <div class="px-3.5 py-2 rounded-xl bg-amber-500 text-white text-center min-w-[75px] shadow-xs">
              <div class="text-[10px] font-extrabold uppercase text-amber-100">Done %</div>
              <div class="text-lg font-black">${completionPct}%</div>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mt-4 pt-3 border-t border-amber-200/80 flex items-center gap-3">
          <div class="flex-1 bg-amber-200/70 h-2.5 rounded-full overflow-hidden">
            <div class="bg-amber-600 h-full rounded-full transition-all duration-300" style="width: ${completionPct}%"></div>
          </div>
          <span class="text-xs font-bold text-amber-950">${completedCount} of ${totalCount} solved</span>
        </div>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs min-w-0">
        <div class="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div class="relative min-w-[200px] flex-1 max-w-xs">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400"></i>
            <input type="text" id="dpp-search-input" value="${escapeHtml(state.dppFilters.search)}" oninput="handleDppSearch(event)" placeholder="Search DPP title, #, chapter..." class="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 transition">
          </div>

          <select id="dpp-filter-subject" onchange="handleDppSubjectFilter(event)" class="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500">
            <option value="">All Subjects (${totalCount})</option>
            ${state.subjects.map(s => {
              const count = allLectures.filter(l => l.subject_id == s.id).length;
              return `<option value="${s.id}" ${state.dppFilters.subject_id == s.id ? 'selected' : ''}>${s.display_name} (${count})</option>`;
            }).join('')}
          </select>

          <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button onclick="handleDppStatusFilter('')" class="px-2.5 py-1 rounded-md text-xs font-bold transition ${state.dppFilters.status === '' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
              All (${totalCount})
            </button>
            <button onclick="handleDppStatusFilter('pending')" class="px-2.5 py-1 rounded-md text-xs font-bold transition ${state.dppFilters.status === 'pending' ? 'bg-amber-500 text-white shadow-xs' : 'text-amber-800 hover:bg-amber-50'}">
              🟡 Pending (${pendingCount})
            </button>
            <button onclick="handleDppStatusFilter('completed')" class="px-2.5 py-1 rounded-md text-xs font-bold transition ${state.dppFilters.status === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}">
              🟢 Completed (${completedCount})
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2.5 self-end md:self-auto flex-shrink-0">
          <div class="flex items-center gap-1.5 text-slate-500 font-bold">
            <span>Show:</span>
            <select onchange="setDppLimit(this.value)" class="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500">
              <option value="60" ${limit == 60 ? 'selected' : ''}>60</option>
              <option value="120" ${limit == 120 ? 'selected' : ''}>120</option>
              <option value="all" ${limit === 'all' ? 'selected' : ''}>All (${filtered.length})</option>
            </select>
          </div>

          <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button onclick="setDppViewMode('grid')" class="px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${state.dppFilters.view_mode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}">
              <i data-lucide="layout-grid" class="w-3.5 h-3.5"></i> Cards
            </button>
            <button onclick="setDppViewMode('table')" class="px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${state.dppFilters.view_mode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}">
              <i data-lucide="table" class="w-3.5 h-3.5"></i> Table
            </button>
          </div>
        </div>
      </div>

      <!-- DPP Content View -->
      ${displayLectures.length === 0 ? `
        <div class="modern-card p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
          <div class="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <i data-lucide="filter" class="w-6 h-6"></i>
          </div>
          <h3 class="text-base font-bold text-slate-800">No DPPs match your filter criteria</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">Try clearing search keywords or selecting "All" status.</p>
          <button onclick="resetDppFilters()" class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition">
            Reset Filters
          </button>
        </div>
      ` : state.dppFilters.view_mode === 'table' ? `
        <!-- Table View -->
        <div class="modern-card overflow-hidden border border-slate-200 bg-white shadow-xs rounded-2xl min-w-0">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-700">
              <thead class="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider select-none font-bold">
                <tr>
                  <th class="p-3.5 w-20 text-center">DPP #</th>
                  <th class="p-3.5 w-36">Subject</th>
                  <th class="p-3.5 w-48">Chapter</th>
                  <th class="p-3.5 min-w-[220px] max-w-md">DPP Title</th>
                  <th class="p-3.5 w-24 text-center">Lec #</th>
                  <th class="p-3.5 w-28">Date</th>
                  <th class="p-3.5 w-32 text-center">Status</th>
                  <th class="p-3.5 w-40 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-sans">
                ${displayLectures.map(l => {
                  const isDone = Boolean(l.is_dpp_completed);
                  return `
                    <tr class="hover:bg-slate-50/80 transition">
                      <td class="p-3.5 text-center">
                        <span class="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-black text-[11px]">
                          DPP #${l.dpp_no}
                        </span>
                      </td>
                      <td class="p-3.5">
                        <div class="flex items-center gap-1.5">
                          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${l.subject_color};"></span>
                          <span class="font-extrabold text-slate-900">${l.subject_name}</span>
                        </div>
                      </td>
                      <td class="p-3.5">
                        <div class="text-xs text-slate-600 break-words font-medium">${escapeHtml(l.chapter_name)}</div>
                      </td>
                      <td class="p-3.5 min-w-[220px] max-w-md">
                        <div class="dpp-title text-xs font-bold text-slate-900 break-words leading-relaxed" title="${escapeHtml(l.lecture_name)}">
                          ${escapeHtml(l.lecture_name)}
                        </div>
                      </td>
                      <td class="p-3.5 text-center font-bold text-slate-600">
                        Lec #${l.lecture_no}
                      </td>
                      <td class="p-3.5 text-slate-500 font-mono text-[11px]">
                        ${l.scheduled_date}
                      </td>
                      <td class="p-3.5 text-center">
                        <span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${isDone ? 'dpp-badge-completed' : 'dpp-badge-pending'}">
                          ${isDone ? '🟢 Completed' : '🟡 Pending'}
                        </span>
                      </td>
                      <td class="p-3.5 text-center">
                        <button onclick="toggleDppTracker(${l.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs flex items-center justify-center gap-1 mx-auto ${isDone ? 'btn-action-completed' : 'btn-action-pending-dpp'}">
                          <i data-lucide="${isDone ? 'check-circle-2' : 'clock'}" class="w-3.5 h-3.5"></i>
                          ${isDone ? '✓ DPP COMPLETED' : 'MARK COMPLETE'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <!-- Card Grid View with Golden Identity -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full min-w-0">
          ${displayLectures.map(l => {
            const isDone = Boolean(l.is_dpp_completed);
            return `
              <div class="dpp-card p-4 min-w-0 border ${isDone ? 'border-emerald-300' : 'border-amber-300'}">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-black tracking-wide flex items-center gap-1.5 shadow-xs flex-shrink-0">
                    <i data-lucide="file-check-2" class="w-3.5 h-3.5"></i> DPP #${l.dpp_no}
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border truncate bg-white" style="border-color: ${l.subject_color}; color: ${l.subject_color};">
                    ${l.subject_name}
                  </span>
                </div>

                <div class="flex-1 my-1.5 min-w-0">
                  <h3 class="dpp-title text-sm font-black text-slate-900 break-words leading-snug" title="${escapeHtml(l.lecture_name)}">
                    ${escapeHtml(l.lecture_name)}
                  </h3>

                  <div class="text-xs text-slate-600 font-medium break-words mt-2.5 flex items-start gap-1.5">
                    <i data-lucide="book-open" class="w-3.5 h-3.5 flex-shrink-0 text-slate-400 mt-0.5"></i>
                    <span class="break-words line-clamp-2">${escapeHtml(l.chapter_name)}</span>
                  </div>

                  <div class="text-[11px] text-slate-400 flex items-center justify-between pt-2 mt-2 border-t border-amber-200/60 font-semibold">
                    <span class="text-slate-600">Lecture #${l.lecture_no}</span>
                    <span class="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                      <i data-lucide="calendar" class="w-3 h-3 text-slate-400"></i> ${l.scheduled_date}
                    </span>
                  </div>
                </div>

                <!-- Bottom Status & Anchored Action Button -->
                <div class="mt-4 pt-3 border-t border-amber-200/60 flex flex-col gap-2">
                  <div class="w-full text-center py-1 rounded-lg text-xs font-bold ${isDone ? 'dpp-badge-completed' : 'dpp-badge-pending'} flex items-center justify-center gap-1.5">
                    <i data-lucide="${isDone ? 'check-circle-2' : 'clock'}" class="w-3.5 h-3.5"></i>
                    ${isDone ? '🟢 COMPLETED' : '🟡 PENDING'}
                  </div>

                  <button onclick="toggleDppTracker(${l.id})" class="w-full py-2 px-3 rounded-lg text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${isDone ? 'btn-action-completed' : 'btn-action-pending-dpp'}">
                    <i data-lucide="${isDone ? 'check-circle-2' : 'check'}" class="w-3.5 h-3.5"></i>
                    ${isDone ? '✓ DPP COMPLETED' : 'MARK DPP COMPLETE'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function handleDppSearch(e) {
  state.dppFilters.search = e.target.value;
  renderDPP(document.getElementById('view-content'));
}

function handleDppSubjectFilter(e) {
  state.dppFilters.subject_id = e.target.value;
  renderDPP(document.getElementById('view-content'));
}

function handleDppStatusFilter(status) {
  state.dppFilters.status = status;
  renderDPP(document.getElementById('view-content'));
}

function setDppViewMode(mode) {
  state.dppFilters.view_mode = mode;
  renderDPP(document.getElementById('view-content'));
}

function setDppLimit(limit) {
  state.dppFilters.limit = limit;
  renderDPP(document.getElementById('view-content'));
}

function resetDppFilters() {
  state.dppFilters.search = '';
  state.dppFilters.subject_id = '';
  state.dppFilters.status = '';
  renderDPP(document.getElementById('view-content'));
}

async function toggleDppTracker(id) {
  await toggleDppQuick(id);
}

// Revision feature completely removed per specifications.


// ==================== 7. TESTS VIEW & EMBEDDED TEST CALENDAR ====================
async function renderTests(container) {
  const tests = await callApi('get_tests');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Calculate days in the selected test calendar month
  const year = state.testCalendar.year;
  const month = state.testCalendar.month;
  const firstDay = new Date(year, month - 1, 1).getDay(); // Sunday = 0
  const daysInMonth = new Date(year, month, 0).getDate();

  // Map tests belonging to this month
  const monthTestsMap = {};
  tests.forEach(t => {
    if (t.test_date) {
      const parts = t.test_date.split('-');
      if (parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
        const day = parseInt(parts[2]);
        if (!monthTestsMap[day]) monthTestsMap[day] = [];
        monthTestsMap[day].push(t);
      }
    }
  });

  const calendarGrid = [];
  for (let i = 0; i < firstDay; i++) {
    calendarGrid.push({ empty: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarGrid.push({ day: d, tests: monthTestsMap[d] || [] });
  }

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <!-- Test Hero Banner (Coral / Red Identity) -->
      <div class="card-rose p-6 min-w-0">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2.5 py-1 rounded-full bg-rose-600 text-white text-xs font-black tracking-wide">
                JEE Main 2027
              </span>
              <span class="text-xs font-bold text-rose-900">Official Exam Simulation</span>
            </div>
            <h1 class="text-2xl font-black text-rose-950 tracking-tight mt-1">JEE Main Test Schedule & Calendar</h1>
            <p class="text-xs text-rose-900/90 mt-1 max-w-xl break-words font-medium">
              14 Official Tests (12 Part Tests + 2 Full Tests). Dedicated test calendar showing ONLY test days, syllabi, and decoupled score tracking.
            </p>
          </div>

          <div class="flex items-center gap-2.5 flex-shrink-0">
            <div class="px-4 py-2.5 rounded-xl bg-white/90 border border-rose-200 text-center">
              <div class="text-[10px] text-rose-800 font-extrabold uppercase">Total Tests</div>
              <div class="text-xl font-black text-rose-950">${tests.length}</div>
            </div>
            <div class="px-4 py-2.5 rounded-xl bg-white/90 border border-rose-200 text-center">
              <div class="text-[10px] text-rose-800 font-extrabold uppercase">Completed</div>
              <div class="text-xl font-black text-emerald-800">${tests.filter(t => t.status === 'completed').length}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- DEDICATED TEST CALENDAR (ONLY TESTS - NO REGULAR WORKLOAD) -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl min-w-0">
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div>
            <h2 class="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="calendar" class="w-5 h-5 text-rose-600"></i> Monthly Test Schedule
            </h2>
            <p class="text-[11px] text-slate-500 font-medium">Shows only official JEE test dates. Regular lectures and DPPs are not included here.</p>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="prevTestMonth()" class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 shadow-xs">&larr; Prev</button>
            <span class="font-black text-sm text-slate-900 px-2">${monthNames[state.testCalendar.month - 1]} ${state.testCalendar.year}</span>
            <button onclick="nextTestMonth()" class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 shadow-xs">Next &rarr;</button>
          </div>
        </div>

        <div class="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 uppercase mb-2">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>

        <!-- Month Grid -->
        <div class="grid grid-cols-7 gap-2">
          ${calendarGrid.map(cell => {
            if (cell.empty) {
              return `<div class="p-2 min-h-[90px] rounded-xl bg-slate-50/50 border border-dashed border-slate-200"></div>`;
            }
            const hasTests = cell.tests.length > 0;
            return `
              <div class="p-2 min-h-[90px] rounded-xl border flex flex-col justify-between text-xs transition ${hasTests ? 'bg-rose-50/90 border-rose-300 shadow-xs' : 'bg-white border-slate-200'}">
                <div class="flex items-center justify-between">
                  <span class="font-extrabold ${hasTests ? 'text-rose-950 font-black' : 'text-slate-700'}">${cell.day}</span>
                  ${hasTests ? `<span class="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black">TEST</span>` : ''}
                </div>

                ${hasTests ? `
                  <div class="space-y-1 my-1">
                    ${cell.tests.map(t => `
                      <div class="p-1 rounded bg-white border border-rose-200 text-[10px] font-bold text-rose-900 break-words shadow-2xs">
                        Test #${t.test_no || 1}: ${escapeHtml(t.test_name.split('(')[0])}
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="text-[10px] text-slate-300 italic text-center py-2">No test</div>
                `}

                <div class="text-[9px] font-bold ${hasTests ? 'text-rose-700' : 'text-slate-300'}">
                  ${hasTests ? `${cell.tests[0].status === 'completed' ? 'Completed' : 'Scheduled'}` : '—'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- TEST LIST CARDS -->
      <div class="space-y-3">
        <h2 class="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <i data-lucide="award" class="w-5 h-5 text-rose-600"></i> All 14 Test Checkpoints & Scores
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${tests.map(t => {
            const isDone = t.status === 'completed';
            const todayStr = getTodayDateString();
            let countdownBadge = '';
            if (isDone) {
              countdownBadge = '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">✓ Completed</span>';
            } else if (t.test_date === todayStr) {
              countdownBadge = '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">🎯 Today!</span>';
            } else if (t.test_date > todayStr) {
              const diffDays = Math.ceil((new Date(t.test_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
              countdownBadge = `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">In ${diffDays} day${diffDays === 1 ? '' : 's'}</span>`;
            } else {
              countdownBadge = '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Pending Score</span>';
            }

            return `
              <div class="p-5 rounded-2xl bg-white border ${isDone ? 'border-emerald-300 shadow-xs' : 'border-rose-200 hover:border-rose-300'} shadow-sm hover:shadow-md transition flex flex-col justify-between min-w-0">
                <div class="min-w-0">
                  <div class="flex items-center justify-between mb-2">
                    <span class="badge ${isDone ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'} font-bold">
                      ${t.test_type}
                    </span>
                    <div class="flex items-center gap-2">
                      ${countdownBadge}
                      <span class="text-xs font-bold text-slate-500 font-mono">${t.test_date}</span>
                    </div>
                  </div>

                  <h3 class="text-base font-black text-slate-900 break-words">Test #${t.test_no || 1}: ${escapeHtml(t.test_name)}</h3>

                  ${isDone ? `
                    <div class="my-2.5 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center text-xs">
                      <span class="text-emerald-900 font-black">Score: ${t.score} / ${t.total_marks || 300}</span>
                      <span class="text-slate-600 font-semibold">Acc: ${t.accuracy || 0}% • ${t.time_taken_minutes || 0}m</span>
                    </div>
                  ` : ''}

                  <!-- Color-Coded Syllabus Breakdown Pills -->
                  <div class="mt-3.5 pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div class="flex items-start gap-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-800 flex-shrink-0">PHYSICS</span>
                      <span class="text-slate-600 font-medium break-words text-[11px] leading-tight">${escapeHtml(t.physics_syllabus)}</span>
                    </div>
                    <div class="flex items-start gap-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black bg-teal-100 text-teal-800 flex-shrink-0">CHEMISTRY</span>
                      <span class="text-slate-600 font-medium break-words text-[11px] leading-tight">${escapeHtml(t.chemistry_syllabus)}</span>
                    </div>
                    <div class="flex items-start gap-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black bg-pink-100 text-pink-800 flex-shrink-0">MATHS</span>
                      <span class="text-slate-600 font-medium break-words text-[11px] leading-tight">${escapeHtml(t.maths_syllabus)}</span>
                    </div>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button onclick="toggleTestQuick(${t.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isDone ? 'btn-action-completed' : 'btn-action-pending-lecture'}">
                    <i data-lucide="${isDone ? 'check-circle-2' : 'circle'}" class="w-3.5 h-3.5"></i>
                    ${isDone ? '✓ TEST COMPLETED' : 'COMPLETE TEST'}
                  </button>
                  <button onclick="openTestScoreModal(${t.id})" class="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer transition">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                    ${isDone ? 'Edit Score' : 'Log Score'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function prevTestMonth() {
  if (state.testCalendar.month === 1) {
    state.testCalendar.month = 12;
    state.testCalendar.year--;
  } else {
    state.testCalendar.month--;
  }
  renderTests(document.getElementById('view-content'));
}

function nextTestMonth() {
  if (state.testCalendar.month === 12) {
    state.testCalendar.month = 1;
    state.testCalendar.year++;
  } else {
    state.testCalendar.month++;
  }
  renderTests(document.getElementById('view-content'));
}

async function toggleTestQuick(testId) {
  const res = await callApi('toggle_test_completion', testId);
  if (res.success) {
    showToast(`Test marked as ${res.status}! Score can be entered anytime.`, 'success');
    await loadInitialData();
    renderTests(document.getElementById('view-content'));
  }
}

// ==================== 8. ANALYTICS & JEE COMMAND CENTER ====================
async function setAnalyticsTab(tab) {
  state.analyticsTab = tab;
  await renderAnalytics(document.getElementById('view-content'));
}

async function setAnalyticsTimeFilter(filter) {
  state.analyticsTimeFilter = filter;
  await renderAnalytics(document.getElementById('view-content'));
}

async function renderAnalytics(container) {
  const currentTab = state.analyticsTab || 'overview';
  const analyticsData = await callApi('get_comprehensive_analytics', state.analyticsTimeFilter || 'all');
  const studyData = await callApi('get_study_analytics', state.pomodoroFilter || 'all_time');

  const lecs = analyticsData.lecture_analytics || {};
  const dpps = analyticsData.dpp_analytics || {};
  const wt = analyticsData.weekly_targets || {};
  const tests = analyticsData.tests_analytics || {};
  const recs = analyticsData.recommendations || [];
  const subjects = wt.subject_cards || [];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'lectures', label: 'Lectures', icon: 'book-open' },
    { id: 'dpp', label: 'DPP', icon: 'file-check-2' },
    { id: 'study_time', label: 'Study Time', icon: 'clock' },
    { id: 'weekly_targets', label: 'Weekly Targets', icon: 'target' },
    { id: 'tests', label: 'Tests', icon: 'award' }
  ];

  let tabContent = '';

  if (currentTab === 'overview') {
    tabContent = `
      <!-- Top 4 KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 1. Lectures -->
        <div class="card-orange p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs font-bold text-orange-800 uppercase tracking-wider mb-2">
              <span class="flex items-center gap-1.5"><i data-lucide="book-open" class="w-4 h-4 text-orange-600"></i> Lectures</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-orange-200/80 text-orange-950 font-bold">${lecs.lec_pct || 0}% Done</span>
            </div>
            <div class="stat-hero-number text-orange-950">${lecs.comp_lecs || 0} <span class="text-base text-orange-700">/ ${lecs.total_lecs || 398}</span></div>
            <div class="text-xs text-orange-800 font-semibold mt-1">${lecs.pending_lecs || 0} remaining • ${lecs.overdue_lecs || 0} backlog</div>
          </div>
          <div class="w-full bg-orange-200/70 h-2 rounded-full overflow-hidden mt-3">
            <div class="h-full bg-orange-600 rounded-full" style="width: ${lecs.lec_pct || 0}%"></div>
          </div>
        </div>

        <!-- 2. DPPs -->
        <div class="card-yellow p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
              <span class="flex items-center gap-1.5"><i data-lucide="file-check-2" class="w-4 h-4 text-amber-700"></i> DPP Practice</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 font-bold">${dpps.dpp_pct || 0}% Done</span>
            </div>
            <div class="stat-hero-number text-amber-950">${dpps.comp_dpps || 0} <span class="text-base text-amber-800">/ ${dpps.total_dpps || 398}</span></div>
            <div class="text-xs text-amber-900 font-semibold mt-1">Gap to lectures: ${dpps.dpp_gap > 0 ? '+' + dpps.dpp_gap + '%' : dpps.dpp_gap + '%'}</div>
          </div>
          <div class="w-full bg-amber-200/80 h-2 rounded-full overflow-hidden mt-3">
            <div class="h-full bg-amber-500 rounded-full" style="width: ${dpps.dpp_pct || 0}%"></div>
          </div>
        </div>

        <!-- 3. Weekly Quota -->
        <div class="card-green p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
              <span class="flex items-center gap-1.5"><i data-lucide="target" class="w-4 h-4 text-emerald-600"></i> Weekly Targets</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-950 font-bold">Current Wk</span>
            </div>
            <div class="stat-hero-number text-emerald-950">${wt.overall_lec_pct || 0}% <span class="text-sm font-semibold text-emerald-700">lecs</span></div>
            <div class="text-xs text-emerald-800 font-semibold mt-1">Physical Chem: ${wt.overall_hours_pct || 0}% of 7.0h</div>
          </div>
          <div class="w-full bg-emerald-200/70 h-2 rounded-full overflow-hidden mt-3">
            <div class="h-full bg-emerald-600 rounded-full" style="width: ${wt.overall_lec_pct || 0}%"></div>
          </div>
        </div>

        <!-- 4. Study Hours -->
        <div class="card-amber p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
              <span class="flex items-center gap-1.5"><i data-lucide="clock" class="w-4 h-4 text-amber-700"></i> Focus Time</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${studyData.is_configured ? 'bg-amber-200 text-amber-950' : 'bg-slate-200 text-slate-700'} font-bold">
                ${studyData.is_configured ? 'Pomodoro' : 'Not Configured'}
              </span>
            </div>
            <div class="stat-hero-number text-amber-950">${studyData.today_summary?.duration_str || '0h 00m'}</div>
            <div class="text-xs text-amber-900 font-semibold mt-1">This week: ${studyData.week_summary?.duration_str || '0h 00m'} • Streak: ${studyData.consistency?.current_streak || 0}d</div>
          </div>
          <div class="text-[11px] text-amber-800/80 mt-3 pt-2 border-t border-amber-200/60 font-semibold">
            Strictly external Pomodoro data
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
          <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <i data-lucide="bar-chart-2" class="w-4 h-4 text-orange-600"></i> Subject Syllabus Coverage (Lectures)
            </h3>
            <span class="text-xs text-slate-400 font-medium">398 Total</span>
          </div>
          <div class="h-64">
            <canvas id="chart-overview-coverage"></canvas>
          </div>
        </div>

        <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
          <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <i data-lucide="target" class="w-4 h-4 text-emerald-600"></i> Weekly Target Attainment (%)
            </h3>
            <button onclick="openWeeklyTargetsModal('${wt.week_start || ''}')" class="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline">
              Edit Targets
            </button>
          </div>
          <div class="h-64">
            <canvas id="chart-overview-targets"></canvas>
          </div>
        </div>
      </div>

      <!-- Actionable Insights & Recommendations -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i> Actionable JEE Preparation Insights
          </h3>
          <span class="text-xs text-slate-400 font-medium">${recs.length} Recommendations</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${recs.map(r => `
            <div class="p-3.5 rounded-xl border ${r.type === 'warning' ? 'bg-rose-50/50 border-rose-200 text-rose-900' : (r.type === 'success' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-800')} flex items-start gap-3">
              <i data-lucide="${r.icon || 'info'}" class="w-5 h-5 flex-shrink-0 mt-0.5 ${r.type === 'warning' ? 'text-rose-600' : (r.type === 'success' ? 'text-emerald-600' : 'text-blue-600')}"></i>
              <div class="text-xs">
                <div class="font-extrabold mb-0.5">${escapeHtml(r.subject)}</div>
                <div class="leading-relaxed opacity-90">${escapeHtml(r.message)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (currentTab === 'lectures') {
    tabContent = `
      <!-- Lecture Metrics Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Lectures</div>
          <div class="text-2xl font-black text-slate-900 mt-1">${lecs.total_lecs || 398}</div>
          <div class="text-xs text-slate-500 mt-0.5 font-medium">All 5 Subjects</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-emerald-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Completed</div>
          <div class="text-2xl font-black text-emerald-700 mt-1">${lecs.comp_lecs || 0}</div>
          <div class="text-xs text-emerald-800 mt-0.5 font-medium">${lecs.lec_pct || 0}% overall coverage</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-rose-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-rose-700">Backlog (Overdue)</div>
          <div class="text-2xl font-black text-rose-700 mt-1">${lecs.overdue_lecs || 0}</div>
          <div class="text-xs text-rose-800 mt-0.5 font-medium">Requires rescheduling</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-orange-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-orange-700">Done This Week</div>
          <div class="text-2xl font-black text-orange-700 mt-1">${lecs.comp_this_week || 0}</div>
          <div class="text-xs text-orange-800 mt-0.5 font-medium">${lecs.comp_today || 0} completed today</div>
        </div>
      </div>

      <!-- 14-Day Completion Trend Chart -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <i data-lucide="trending-up" class="w-4 h-4 text-orange-600"></i> 14-Day Lecture Completion Velocity
          </h3>
          <span class="text-xs text-slate-500 font-medium">Daily Completed Count</span>
        </div>
        <div class="h-64">
          <canvas id="chart-lec-trend"></canvas>
        </div>
      </div>

      <!-- Subject Breakdown Table -->
      <div class="modern-card overflow-hidden bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-slate-900">Curriculum Progress by Subject</h3>
          <button onclick="navigateTo('subject_physics')" class="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1">
            Open Subjects &rarr;
          </button>
        </div>
        <table class="w-full text-left text-xs text-slate-700">
          <thead class="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
            <tr>
              <th class="p-3.5">Subject</th>
              <th class="p-3.5 text-center">Total</th>
              <th class="p-3.5 text-center">Completed</th>
              <th class="p-3.5 text-center">Backlog</th>
              <th class="p-3.5 w-48">Progress</th>
              <th class="p-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${subjects.map(s => `
              <tr class="hover:bg-slate-50/80">
                <td class="p-3.5 font-bold text-slate-900">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${s.color};"></span>
                    <span>${s.display_name}</span>
                  </div>
                </td>
                <td class="p-3.5 text-center font-semibold">${s.total_lectures}</td>
                <td class="p-3.5 text-center font-bold text-emerald-700">${s.completed_lectures}</td>
                <td class="p-3.5 text-center font-bold ${s.backlog > 0 ? 'text-rose-600' : 'text-slate-400'}">${s.backlog}</td>
                <td class="p-3.5">
                  <div class="flex items-center gap-2">
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div class="h-full rounded-full" style="width: ${s.lecture_pct}%; background-color: ${s.color};"></div>
                    </div>
                    <span class="text-[11px] font-bold text-slate-700 w-10 text-right">${s.lecture_pct}%</span>
                  </div>
                </td>
                <td class="p-3.5 text-right">
                  <button onclick="navigateToSubjectById(${s.id})" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition">
                    View
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentTab === 'dpp') {
    tabContent = `
      <!-- DPP Overview Banner -->
      <div class="card-yellow p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <i data-lucide="file-check-2" class="w-4 h-4 text-amber-700"></i> Daily Practice Problems
            </div>
            <h2 class="text-2xl font-black text-amber-950">Independent DPP Attainment</h2>
            <p class="text-xs text-amber-900 mt-1 max-w-xl font-medium">
              Every lecture corresponds to exactly 1 DPP. Completion is tracked independently to ensure deep numerical practice without artificial coupling.
            </p>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button onclick="navigateTo('dpp')" class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="external-link" class="w-4 h-4"></i> Open DPP Tracker
            </button>
          </div>
        </div>
      </div>

      <!-- DPP Metrics Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total DPPs</div>
          <div class="text-2xl font-black text-slate-900 mt-1">${dpps.total_dpps || 398}</div>
          <div class="text-xs text-slate-500 mt-0.5">1 per lecture</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-amber-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-800">DPPs Completed</div>
          <div class="text-2xl font-black text-amber-700 mt-1">${dpps.comp_dpps || 0}</div>
          <div class="text-xs text-amber-800 mt-0.5 font-medium">${dpps.dpp_pct || 0}% overall</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pending DPPs</div>
          <div class="text-2xl font-black text-slate-700 mt-1">${dpps.pending_dpps || 0}</div>
          <div class="text-xs text-slate-500 mt-0.5 font-medium">Remaining practice</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-orange-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-orange-800">Lecture vs DPP Gap</div>
          <div class="text-2xl font-black text-orange-700 mt-1">${dpps.dpp_gap}%</div>
          <div class="text-xs text-orange-800 mt-0.5 font-medium">${dpps.dpp_gap > 10 ? 'Action Recommended' : 'Healthy Balance'}</div>
        </div>
      </div>

      <!-- Subject DPP Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${subjects.map(s => `
          <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="font-extrabold text-sm text-slate-900">${s.display_name}</span>
                <span class="text-xs font-bold text-amber-700">${s.dpp_pct}%</span>
              </div>
              <div class="text-xl font-black text-slate-900 my-1">
                ${s.completed_dpps} <span class="text-xs font-normal text-slate-500">/ ${s.total_lectures} DPPs</span>
              </div>
              <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
                <div class="h-full rounded-full bg-amber-500 transition-all" style="width: ${s.dpp_pct}%;"></div>
              </div>
            </div>
            <div class="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-xs font-semibold text-slate-600">
              <span>Remaining: ${s.total_lectures - s.completed_dpps}</span>
              <button onclick="navigateTo('dpp'); state.dppFilters.subject_id = ${s.id}; renderDPP(document.getElementById('view-content'));" class="text-amber-700 hover:text-amber-800 font-bold underline">
                Filter DPPs &rarr;
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (currentTab === 'study_time') {
    tabContent = `
      <!-- Top Study Time Notification -->
      <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2.5 text-amber-900 font-semibold">
          <i data-lucide="info" class="w-5 h-5 text-amber-600 flex-shrink-0"></i>
          <span>Study sessions are 100% sourced from your external Pomodoro application. No artificial hours can be entered.</span>
        </div>
        <button onclick="navigateTo('pomodoro')" class="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition flex-shrink-0">
          Open Pomodoro Workspace
        </button>
      </div>

      <!-- 4 Top Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 rounded-xl bg-white border border-amber-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-800">Today</div>
          <div class="text-2xl font-black text-amber-950 mt-1">${studyData.today_summary?.duration_str || '0h 00m'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${studyData.today_summary?.sessions || 0} sessions</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-amber-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-800">This Week</div>
          <div class="text-2xl font-black text-amber-950 mt-1">${studyData.week_summary?.duration_str || '0h 00m'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${studyData.week_summary?.sessions || 0} sessions • ${studyData.week_summary?.days_studied || 0} days</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-amber-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-800">This Month</div>
          <div class="text-2xl font-black text-amber-950 mt-1">${studyData.month_summary?.duration_str || '0h 00m'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${studyData.month_summary?.sessions || 0} sessions</div>
        </div>
        <div class="p-4 rounded-xl bg-white border border-amber-200 shadow-xs">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-800">Total Focus Time</div>
          <div class="text-2xl font-black text-amber-950 mt-1">${studyData.total_summary?.duration_str || '0h 00m'}</div>
          <div class="text-xs text-slate-500 mt-0.5">${studyData.total_summary?.sessions || 0} sessions</div>
        </div>
      </div>

      <!-- 28-Day Consistency Heatmap Grid -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <i data-lucide="flame" class="w-4 h-4 text-orange-600"></i> 28-Day Study Consistency Matrix
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Current streak: ${studyData.consistency?.current_streak || 0} days • Longest: ${studyData.consistency?.longest_streak || 0} days</p>
          </div>
          <div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
            <span>Less</span>
            <span class="w-3 h-3 rounded bg-slate-100"></span>
            <span class="w-3 h-3 rounded bg-amber-200"></span>
            <span class="w-3 h-3 rounded bg-amber-400"></span>
            <span class="w-3 h-3 rounded bg-amber-600"></span>
            <span>More</span>
          </div>
        </div>
        <div class="grid grid-cols-7 sm:grid-cols-14 gap-2">
          ${(studyData.consistency?.matrix_28_days || []).map(cell => `
            <div class="heatmap-cell heatmap-level-${cell.level} p-2 text-center" title="${cell.date}: ${cell.duration_str} (${cell.sessions} sessions)">
              <div class="text-[9px] font-bold opacity-70">${cell.date.slice(5)}</div>
              <div class="text-xs font-black mt-0.5">${cell.hours > 0 ? cell.hours + 'h' : '—'}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Daily Study Hours Chart -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <i data-lucide="bar-chart-2" class="w-4 h-4 text-amber-600"></i> Daily Study Hours
          </h3>
          <span class="text-xs text-slate-400 font-medium">Actual Time Recorded</span>
        </div>
        <div class="h-64">
          <canvas id="chart-study-daily"></canvas>
        </div>
      </div>
    `;
  } else if (currentTab === 'weekly_targets') {
    tabContent = `
      <!-- Weekly Targets Header Banner -->
      <div class="card-green p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <i data-lucide="target" class="w-4 h-4 text-emerald-600"></i> Weekly Quotas & Attainment
            </div>
            <h2 class="text-2xl font-black text-emerald-950">Week: ${wt.week_start || ''} &rarr; ${wt.week_end || ''}</h2>
            <p class="text-xs text-emerald-900 mt-1 max-w-xl font-medium">
              Physics (16 lecs), Maths (5 lecs), Organic Chem (6 lecs), Inorganic Chem (4 lecs), Physical Chem (7.0 hours). Targets are fully editable per week.
            </p>
          </div>
          <button onclick="openWeeklyTargetsModal('${wt.week_start || ''}')" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 flex-shrink-0">
            <i data-lucide="edit-3" class="w-4 h-4"></i> Edit This Week's Targets
          </button>
        </div>
      </div>

      <!-- 5 Subject Cards with Status -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        ${subjects.map(s => {
          const isHours = s.target_type === 'hours';
          const unit = isHours ? 'hours' : 'lecs';
          return `
            <div class="modern-card p-4 bg-white border border-slate-200 shadow-xs rounded-2xl flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="font-extrabold text-xs text-slate-900 truncate">${s.display_name}</span>
                  <span class="badge ${s.status_color === 'emerald' ? 'badge-completed' : (s.status_color === 'amber' ? 'badge-in-progress' : 'badge-backlog')} text-[9px] font-bold">
                    ${s.status_label}
                  </span>
                </div>
                <div class="text-xl font-black text-slate-900 my-1">
                  ${s.achieved_val} <span class="text-xs font-normal text-slate-500">/ ${s.target_val} ${unit}</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                  <div class="h-full rounded-full transition-all" style="width: ${s.percentage}%; background-color: ${s.color};"></div>
                </div>
              </div>
              <div class="text-[10px] font-bold text-slate-600 mt-3 pt-2 border-t border-slate-100 flex justify-between">
                <span>${s.remaining_val === 0 ? 'Achieved!' : s.remaining_val + ' ' + unit + ' left'}</span>
                <span class="font-black" style="color: ${s.color};">${s.percentage}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Mon-Sun Daily Execution Breakdown Table -->
      <div class="modern-card overflow-hidden bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-slate-900">Current Week Daily Execution (Mon &rarr; Sun)</h3>
          <span class="text-xs text-slate-500 font-medium">Lectures, DPPs & Pomodoro Focus</span>
        </div>
        <table class="w-full text-left text-xs text-slate-700">
          <thead class="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
            <tr>
              <th class="p-3.5">Day</th>
              <th class="p-3.5">Date</th>
              <th class="p-3.5 text-center">Lectures Done</th>
              <th class="p-3.5 text-center">DPPs Done</th>
              <th class="p-3.5 text-center">Study Hours</th>
              <th class="p-3.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${(wt.daily_breakdown || []).map(d => `
              <tr class="${d.is_today ? 'bg-orange-50/50 font-semibold' : 'hover:bg-slate-50/80'}">
                <td class="p-3.5 font-bold text-slate-900">${d.day_name} ${d.is_today ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-200 text-orange-950 font-bold ml-1">Today</span>' : ''}</td>
                <td class="p-3.5 text-slate-500 font-mono text-[11px]">${d.date}</td>
                <td class="p-3.5 text-center font-bold text-emerald-700">${d.achieved} <span class="text-slate-400 font-normal">/ ${d.planned}</span></td>
                <td class="p-3.5 text-center font-bold text-amber-700">${d.dpp_achieved} <span class="text-slate-400 font-normal">/ ${d.dpp_planned}</span></td>
                <td class="p-3.5 text-center font-bold text-slate-900">${d.hours > 0 ? d.hours + 'h' : '—'}</td>
                <td class="p-3.5 text-center">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${d.achieved >= d.planned && d.planned > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                    ${d.planned === 0 ? 'Rest / Free' : (d.achieved >= d.planned ? 'Complete' : 'Pending')}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Week-over-Week Attainment Trend -->
      <div class="modern-card p-5 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h3 class="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-4 h-4 text-emerald-600"></i> Week-over-Week Quota Attainment (12 Weeks)
          </h3>
          <span class="text-xs text-slate-500 font-medium">Target vs Done</span>
        </div>
        <div class="h-64">
          <canvas id="chart-wow-targets"></canvas>
        </div>
      </div>
    `;
  } else if (currentTab === 'tests') {
    const allTests = tests.all_tests || [];
    const compTests = tests.completed_tests || 0;
    const totalTests = tests.total_tests || 14;
    const upcoming = tests.upcoming_tests || [];
    const nextTest = upcoming.length > 0 ? upcoming[0] : null;

    tabContent = `
      <!-- Tests Header Spotlight -->
      <div class="card-rose p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-extrabold text-rose-800 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <i data-lucide="award" class="w-4 h-4 text-rose-600"></i> Official Test Series
            </div>
            <h2 class="text-2xl font-black text-rose-950">${compTests} / ${totalTests} Tests Completed</h2>
            <p class="text-xs text-rose-900 mt-1 max-w-xl font-medium">
              14 JEE Main Official Full-Syllabus & Part-Syllabus tests with embedded calendar tracking and scores.
            </p>
          </div>
          <button onclick="navigateTo('tests')" class="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 flex-shrink-0">
            <i data-lucide="calendar" class="w-4 h-4"></i> Open Test Calendar
          </button>
        </div>
      </div>

      ${nextTest ? `
        <!-- Next Upcoming Test Spotlight -->
        <div class="modern-card p-5 bg-white border border-rose-200 shadow-xs rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="min-w-0">
            <span class="badge badge-backlog text-[10px] font-bold uppercase tracking-wider">Next Upcoming Test</span>
            <h3 class="text-base font-black text-slate-900 mt-1">${escapeHtml(nextTest.test_name)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Date: <span class="font-bold text-slate-700">${nextTest.test_date}</span> • Type: <span class="font-bold text-slate-700">${nextTest.test_type}</span></p>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <div class="text-right">
              <div class="text-2xl font-black text-rose-600">${nextTest.days_left !== undefined ? Math.round(nextTest.days_left) : '—'}</div>
              <div class="text-[10px] font-bold text-slate-400 uppercase">Days Left</div>
            </div>
            <button onclick="openTestSyllabusModal(${nextTest.id})" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition">
              View Syllabus
            </button>
          </div>
        </div>
      ` : ''}

      <!-- All Tests List -->
      <div class="modern-card overflow-hidden bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-slate-900">14 JEE Main Scheduled Tests</h3>
          <span class="text-xs text-slate-500 font-medium">Decoupled syllabus tracking</span>
        </div>
        <table class="w-full text-left text-xs text-slate-700">
          <thead class="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
            <tr>
              <th class="p-3.5 w-16">#</th>
              <th class="p-3.5">Test Name</th>
              <th class="p-3.5">Date</th>
              <th class="p-3.5">Type</th>
              <th class="p-3.5 text-center">Score</th>
              <th class="p-3.5 text-center">Status</th>
              <th class="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${allTests.map(t => {
              const isDone = t.status === 'completed';
              return `
                <tr class="hover:bg-slate-50/80">
                  <td class="p-3.5 font-bold text-slate-500">T-${t.id}</td>
                  <td class="p-3.5 font-bold text-slate-900">${escapeHtml(t.test_name)}</td>
                  <td class="p-3.5 font-mono text-[11px] text-slate-600">${t.test_date}</td>
                  <td class="p-3.5"><span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">${t.test_type}</span></td>
                  <td class="p-3.5 text-center font-bold text-slate-900">${t.score_marks !== null && t.score_marks !== undefined ? t.score_marks + ' / ' + (t.total_marks || 300) : '—'}</td>
                  <td class="p-3.5 text-center">
                    <span class="badge ${isDone ? 'badge-completed' : 'badge-in-progress'} text-[10px] font-bold">
                      ${isDone ? 'Completed' : 'Upcoming'}
                    </span>
                  </td>
                  <td class="p-3.5 text-right">
                    <button onclick="openTestSyllabusModal(${t.id})" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition">
                      Syllabus
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <!-- Analytics Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 class="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-6 h-6 text-emerald-600"></i> JEE Command Center & Analytics
          </h1>
          <p class="text-xs text-slate-500 font-medium mt-0.5">Comprehensive curriculum progress, practice execution, weekly target attainment, and genuine Pomodoro study analytics.</p>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="navigateTo('pomodoro')" class="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition flex items-center gap-1.5">
            <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-600"></i> Pomodoro View
          </button>
        </div>
      </div>

      <!-- 6-Tab Navigation Bar -->
      <div class="flex items-center gap-1 border-b border-slate-200 overflow-x-auto pb-px">
        ${tabs.map(t => {
          const isActive = t.id === currentTab;
          return `
            <button onclick="setAnalyticsTab('${t.id}')" class="px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 flex-shrink-0 ${isActive ? 'bg-white border-t border-l border-r border-slate-200 text-orange-600 shadow-xs -mb-px' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'}">
              <i data-lucide="${t.icon}" class="w-4 h-4 ${isActive ? 'text-orange-600' : 'text-slate-400'}"></i>
              <span>${t.label}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Tab Content Body -->
      <div class="space-y-5">
        ${tabContent}
      </div>
    </div>
  `;

  lucide.createIcons();

  // Delayed Chart Render
  setTimeout(() => {
    if (currentTab === 'overview') {
      const c1 = document.getElementById('chart-overview-coverage')?.getContext('2d');
      if (c1) {
        if (state.charts['overview-coverage']) state.charts['overview-coverage'].destroy();
        state.charts['overview-coverage'] = new Chart(c1, {
          type: 'bar',
          data: {
            labels: subjects.map(s => s.display_name),
            datasets: [
              {
                label: 'Completed',
                data: subjects.map(s => s.completed_lectures),
                backgroundColor: '#16a34a',
                borderRadius: 6
              },
              {
                label: 'Remaining',
                data: subjects.map(s => s.total_lectures - s.completed_lectures),
                backgroundColor: '#e2e8f0',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } } },
              y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 } } }
            },
            plugins: {
              legend: { position: 'top', labels: { font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } } }
            }
          }
        });
      }

      const c2 = document.getElementById('chart-overview-targets')?.getContext('2d');
      if (c2) {
        if (state.charts['overview-targets']) state.charts['overview-targets'].destroy();
        state.charts['overview-targets'] = new Chart(c2, {
          type: 'bar',
          data: {
            labels: subjects.map(s => s.display_name),
            datasets: [{
              label: 'Attainment %',
              data: subjects.map(s => s.percentage),
              backgroundColor: ['#ea580c', '#db2777', '#16a34a', '#0d9488', '#e11d48'],
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } },
              x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }
    } else if (currentTab === 'lectures') {
      const cLec = document.getElementById('chart-lec-trend')?.getContext('2d');
      if (cLec && lecs.daily_completion_trend) {
        if (state.charts['lec-trend']) state.charts['lec-trend'].destroy();
        state.charts['lec-trend'] = new Chart(cLec, {
          type: 'line',
          data: {
            labels: lecs.daily_completion_trend.map(d => d.date.slice(5)),
            datasets: [{
              label: 'Completed Lectures',
              data: lecs.daily_completion_trend.map(d => d.completed),
              borderColor: '#ea580c',
              backgroundColor: 'rgba(234, 88, 12, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 4,
              pointBackgroundColor: '#ea580c'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1 } },
              x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }
    } else if (currentTab === 'study_time') {
      const cStudy = document.getElementById('chart-study-daily')?.getContext('2d');
      if (cStudy && studyData.filtered_data) {
        if (state.charts['study-daily']) state.charts['study-daily'].destroy();
        state.charts['study-daily'] = new Chart(cStudy, {
          type: 'bar',
          data: {
            labels: studyData.filtered_data.chart_labels || [],
            datasets: [{
              label: 'Study Hours',
              data: studyData.filtered_data.chart_values || [],
              backgroundColor: '#f59e0b',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + 'h' } },
              x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }
    } else if (currentTab === 'weekly_targets') {
      const cWow = document.getElementById('chart-wow-targets')?.getContext('2d');
      if (cWow && wt.week_over_week) {
        if (state.charts['wow-targets']) state.charts['wow-targets'].destroy();
        state.charts['wow-targets'] = new Chart(cWow, {
          type: 'bar',
          data: {
            labels: wt.week_over_week.map(w => w.week_label),
            datasets: [{
              label: 'Attainment %',
              data: wt.week_over_week.map(w => w.percentage),
              backgroundColor: '#16a34a',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } },
              x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }
    }
  }, 100);
}


// ==================== 9. POMODORO DEDICATED VIEW (READ-ONLY STUDY TIME) ====================
async function renderPomodoro(container) {
  const currentFilter = state.pomodoroFilter || 'all_time';

  // Fetch both integration status AND study analytics in parallel
  const [pomoStatus, data] = await Promise.all([
    callApi('get_pomodoro_integration_status'),
    callApi('get_study_analytics', currentFilter)
  ]);

  const isEnabled = pomoStatus && pomoStatus.enabled;

  // ── 1. NOT ENABLED ─────────────────────────────────────────────────────────
  if (!isEnabled) {
    container.innerHTML = `
      <div class="space-y-6 min-w-0">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                External Study Time
              </span>
              <span class="text-xs font-semibold text-slate-400 flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-slate-300"></span> Not enabled
              </span>
            </div>
            <h1 class="text-2xl font-black text-slate-900 tracking-tight">POMODORO</h1>
            <p class="text-xs text-slate-500 mt-0.5 font-medium">Read-only study time from Study Pomodoro app</p>
          </div>
        </div>

        <div class="p-8 max-w-xl mx-auto bg-white border border-amber-200 rounded-3xl shadow-sm text-center my-8 space-y-5">
          <div class="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <i data-lucide="clock" class="w-8 h-8"></i>
          </div>
          <div>
            <h2 class="text-lg font-black text-slate-900">Pomodoro Integration</h2>
            <p class="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mt-1">
              Connect to your Study Pomodoro desktop app. AAYUSH 360 reads its LevelDB storage in real time.
              Only NEW activity after enabling is imported — zero historical data.
            </p>
          </div>

          <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-left max-w-sm mx-auto space-y-1.5 text-slate-700">
            <div class="flex justify-between"><span class="text-slate-500 font-medium">Storage:</span> <span class="font-bold text-slate-800 font-mono text-[10px]">LevelDB (WebView2)</span></div>
            <div class="flex justify-between"><span class="text-slate-500 font-medium">Access:</span> <span class="font-bold text-emerald-700">Read-only binary</span></div>
            <div class="flex justify-between"><span class="text-slate-500 font-medium">Lecture completion:</span> <span class="font-bold text-slate-800">Manual only — never auto</span></div>
            <div class="flex justify-between"><span class="text-slate-500 font-medium">Historical data:</span> <span class="font-bold text-rose-700">Never imported</span></div>
          </div>

          <div class="pt-2">
            <button onclick="handleEnablePomodoroIntegration()" class="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-2 active:scale-95">
              <i data-lucide="play" class="w-4 h-4"></i> Enable Integration (Start Fresh)
            </button>
            <p class="text-[10px] text-slate-400 mt-2">Current Pomodoro totals become the baseline. 0 minutes imported immediately.</p>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // ── 2. ENABLED ──────────────────────────────────────────────────────────────
  const today   = data.today_summary   || {};
  const week    = data.week_summary    || {};
  const month   = data.month_summary   || {};
  const filtered = data.filtered_data  || {};
  const filterKey = filtered.filter || currentFilter;
  const isF = (k) => filterKey === k ? 'active' : '';

  const statusDot = {
    'Connected': 'bg-emerald-500',
    'Waiting':   'bg-amber-400',
    'Error':     'bg-rose-500',
    'Disabled':  'bg-slate-300',
  }[pomoStatus.status] || 'bg-slate-300';

  const statusColor = {
    'Connected': 'text-emerald-600',
    'Waiting':   'text-amber-600',
    'Error':     'text-rose-600',
    'Disabled':  'text-slate-500',
  }[pomoStatus.status] || 'text-slate-500';

  container.innerHTML = `
    <div class="space-y-6 min-w-0">

      <!-- ① TOP HEADER -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 min-w-0">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
              Study Command
            </span>
            <span class="text-xs font-bold ${statusColor} flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${statusDot}"></span> ${pomoStatus.status}
            </span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">POMODORO</h1>
          <p class="text-xs text-slate-500 mt-0.5 font-medium">Real-time delta sync — only NEW activity since activation is imported</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[11px] text-slate-400 font-medium hidden sm:inline">Last sync: ${escapeHtml(pomoStatus.last_sync || 'Never')}</span>
          <button onclick="syncPomodoroNow()" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition active:scale-95">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync Now
          </button>
          <button onclick="handleDisablePomodoroIntegration()" class="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition" title="Disable Integration">
            <i data-lucide="pause-circle" class="w-4 h-4"></i>
          </button>
          <button onclick="handleResetPomodoroIntegration()" class="px-3.5 py-2 rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition" title="Reset baseline">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- LIVE RUNNING TIMER BANNER (if active) -->
      ${pomoStatus.is_live ? `
      <div class="p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-2 border-emerald-500 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-pulse">
        <div class="flex items-center gap-3.5">
          <span class="relative flex h-4 w-4">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-600"></span>
          </span>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-black text-emerald-950 uppercase tracking-wider bg-emerald-200 px-2 py-0.5 rounded-full">
                Live Session Active
              </span>
              <span class="text-xs font-bold text-emerald-800">Pedro Study Pomodoro Timer Running</span>
            </div>
            <p class="text-xs text-emerald-900 mt-1 font-medium">
              Elapsed time in this session: <b class="text-emerald-950 font-extrabold text-sm">${pomoStatus.live_str || pomoStatus.live_minutes + 'm'}</b>.
              Updates in real time without manual sync. Persistent log will be saved automatically when session ends.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 self-end sm:self-center">
          <span class="text-2xl font-black text-emerald-900 font-mono">${pomoStatus.live_str || pomoStatus.live_minutes + 'm'}</span>
        </div>
      </div>
      ` : ''}

      <!-- ② INTEGRATION STATUS CARD -->
      <div class="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
        <div>
          <div class="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Status</div>
          <div class="font-extrabold text-slate-900">${escapeHtml(pomoStatus.status)}</div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Integration Started</div>
          <div class="font-bold text-slate-700">${escapeHtml(pomoStatus.activated_at || '—')}</div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Baseline (at activation)</div>
          <div class="font-bold text-slate-700">${pomoStatus.baseline_minutes || 0} min / ${pomoStatus.baseline_focus || 0} sessions</div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Last Sync</div>
          <div class="font-bold text-slate-700">${escapeHtml(pomoStatus.last_sync || 'Never')}</div>
        </div>
      </div>

      <!-- ③ SINCE-ACTIVATION STAT CARDS -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 min-w-0">
        <div class="card-orange p-5 flex flex-col justify-between min-w-0">
          <div>
            <span class="text-[10px] font-black text-orange-900 uppercase tracking-wider flex items-center gap-1">
              <i data-lucide="sun" class="w-3.5 h-3.5 text-orange-600"></i> TODAY
            </span>
            <div class="stat-hero-number text-orange-950 mt-1">${pomoStatus.today_formatted || '0m'}</div>
            <div class="text-xs font-extrabold text-orange-900 mt-0.5">${today.sessions || 0} session${(today.sessions || 0) === 1 ? '' : 's'}</div>
          </div>
          <div class="text-[10px] text-orange-800 font-semibold mt-3 pt-2 border-t border-orange-200/60">Imported today since activation</div>
        </div>
        <div class="card-yellow p-5 flex flex-col justify-between min-w-0">
          <div>
            <span class="text-[10px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-amber-600"></i> THIS WEEK
            </span>
            <div class="stat-hero-number text-amber-950 mt-1">${pomoStatus.week_formatted || '0m'}</div>
            <div class="text-xs font-extrabold text-amber-900 mt-0.5">${week.days_studied || 0} studied days</div>
          </div>
          <div class="text-[10px] text-amber-800 font-semibold mt-3 pt-2 border-t border-amber-200/60">New Pomodoro time this week</div>
        </div>
        <div class="card-green p-5 flex flex-col justify-between min-w-0">
          <div>
            <span class="text-[10px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1">
              <i data-lucide="calendar-range" class="w-3.5 h-3.5 text-emerald-600"></i> THIS MONTH
            </span>
            <div class="stat-hero-number text-emerald-950 mt-1">${pomoStatus.month_formatted || '0m'}</div>
            <div class="text-xs font-extrabold text-emerald-900 mt-0.5">${month.days_studied || 0} studied days</div>
          </div>
          <div class="text-[10px] text-emerald-800 font-semibold mt-3 pt-2 border-t border-emerald-200/60">New Pomodoro time this month</div>
        </div>
        <div class="card-rose p-5 flex flex-col justify-between min-w-0">
          <div>
            <span class="text-[10px] font-black text-rose-900 uppercase tracking-wider flex items-center gap-1">
              <i data-lucide="archive" class="w-3.5 h-3.5 text-rose-600"></i> TOTAL (SINCE START)
            </span>
            <div class="stat-hero-number text-rose-950 mt-1">${pomoStatus.total_formatted || '0m'}</div>
            <div class="text-xs font-extrabold text-rose-900 mt-0.5">${pomoStatus.total_sessions_imported || 0} sessions imported</div>
          </div>
          <div class="text-[10px] text-rose-800 font-semibold mt-3 pt-2 border-t border-rose-200/60">Since integration activated</div>
        </div>
      </div>

      <!-- ④ LECTURE INDEPENDENCE NOTICE -->
      <div class="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3 text-xs min-w-0">
        <i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"></i>
        <div class="text-blue-900">
          <span class="font-black">Pomodoro time is for analytics only.</span>
          Study minutes <span class="font-bold">never</span> automatically mark lectures, DPPs, or chapters as completed.
          Lecture completion is controlled <span class="font-bold">exclusively</span> by your manual action inside AAYUSH 360.
        </div>
      </div>

      ${!data.has_data ? `
      <div class="p-8 max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl shadow-sm text-center my-4 space-y-3">
        <div class="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <i data-lucide="clock" class="w-7 h-7"></i>
        </div>
        <h2 class="text-base font-black text-slate-900">No study sessions recorded yet</h2>
        <p class="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
          Integration is active. Complete a session in the Pomodoro app — AAYUSH 360 will detect and import only the new minutes.
          Last sync: ${escapeHtml(pomoStatus.last_sync || 'never')}.
        </p>
        <button onclick="syncPomodoroNow()" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-2">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync Now
        </button>
      </div>
      ` : `

      <!-- ⑤ TIME FILTERS -->
      <div class="modern-card p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Time Filter:</span>
          <button onclick="setPomodoroTimeFilter('today')" class="filter-pill ${isF('today')}">Today</button>
          <button onclick="setPomodoroTimeFilter('this_week')" class="filter-pill ${isF('this_week')}">This week</button>
          <button onclick="setPomodoroTimeFilter('last_week')" class="filter-pill ${isF('last_week')}">Last week</button>
          <button onclick="setPomodoroTimeFilter('this_month')" class="filter-pill ${isF('this_month')}">This month</button>
          <button onclick="setPomodoroTimeFilter('last_month')" class="filter-pill ${isF('last_month')}">Last month</button>
          <button onclick="setPomodoroTimeFilter('last_4_weeks')" class="filter-pill ${isF('last_4_weeks')}">Last 4 weeks</button>
          <button onclick="setPomodoroTimeFilter('last_8_weeks')" class="filter-pill ${isF('last_8_weeks')}">Last 8 weeks</button>
          <button onclick="setPomodoroTimeFilter('last_12_weeks')" class="filter-pill ${isF('last_12_weeks')}">Last 12 weeks</button>
          <button onclick="setPomodoroTimeFilter('all_time')" class="filter-pill ${isF('all_time')}">All time</button>
        </div>
      </div>

      <!-- ⑥ CHART + SOURCE PANEL -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0">
        <div class="lg:col-span-8 modern-card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0">
          <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 class="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <i data-lucide="bar-chart-2" class="w-4 h-4 text-amber-500"></i>
                Pomodoro Study Time (${formatFilterDisplayName(filterKey)})
              </h3>
              <div class="text-xs text-slate-500 mt-0.5">
                Total: <b>${filtered.formatted || '0h'}</b> across <b>${filtered.sessions || 0}</b> sessions (${filtered.days_studied || 0} studied days)
              </div>
            </div>
            <span class="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              Avg: ${filtered.avg_per_studied_day || '0h'} / day
            </span>
          </div>
          <div class="h-64 relative"><canvas id="chart-pomo-filter"></canvas></div>
        </div>
        <div class="lg:col-span-4 modern-card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0 flex flex-col">
          <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h3 class="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-indigo-500"></i> Source
            </h3>
          </div>
          <div class="py-8 text-center text-xs text-slate-400 flex-1 flex flex-col items-center justify-center gap-2">
            <i data-lucide="clock" class="w-8 h-8 text-amber-300"></i>
            <div class="font-bold text-slate-600">Pomodoro Study Time</div>
            <div class="text-[11px] text-slate-400">No subject/task data available<br>from the Pomodoro app storage</div>
          </div>
        </div>
      </div>

      <!-- ⑦ WEEK BREAKDOWN -->
      <div class="modern-card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="calendar" class="w-4 h-4 text-orange-500"></i> Weekly Breakdown (Mon – Sun)
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Pomodoro study time recorded since integration activation.</p>
          </div>
          <span class="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Total: ${week.formatted || '0h'}</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          ${(data.week_view && data.week_view.daily_breakdown ? data.week_view.daily_breakdown : []).map(d => `
            <div class="p-3.5 rounded-xl border ${d.is_today ? 'bg-amber-50/80 border-amber-300' : 'bg-slate-50 border-slate-200'} flex flex-col justify-between text-center min-w-0">
              <div>
                <span class="text-[10px] font-black tracking-wider uppercase ${d.is_today ? 'text-amber-800' : 'text-slate-500'}">${d.day_name} ${d.is_today ? '• Today' : ''}</span>
                <div class="text-lg font-black text-slate-900 mt-1">${d.hours > 0 ? d.formatted : '0h'}</div>
              </div>
              <div class="text-[10px] font-semibold text-slate-500 mt-2 pt-1 border-t border-black/5">${d.sessions} session${d.sessions === 1 ? '' : 's'}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- ⑧ 28-DAY HEATMAP -->
      <div class="modern-card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="flame" class="w-4 h-4 text-orange-500"></i> Study Consistency Matrix
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">A studied day requires at least 1 minute of recorded Pomodoro time.</p>
          </div>
          <div class="flex items-center gap-3 text-xs font-bold">
            <span class="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">${data.days_studied || 0} Days Studied</span>
            <span class="px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">🔥 ${data.current_streak || 0}d Streak</span>
          </div>
        </div>
        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Last 28 Days Activity Heatmap</div>
        <div class="heatmap-grid">
          ${(data.heatmap_matrix || []).map(c => `
            <div class="heatmap-cell level-${c.level} p-1 text-center flex flex-col justify-center cursor-pointer" title="${c.date}: ${c.formatted} (${c.sessions} sessions)">
              <span class="text-[9px] font-bold text-slate-600">${c.day_name}</span>
              <span class="text-[10px] font-black text-slate-800">${c.hours > 0 ? c.hours + 'h' : '—'}</span>
            </div>
          `).join('')}
        </div>
        <div class="flex items-center justify-end gap-2 text-[10px] font-bold text-slate-500 mt-3">
          <span>Less</span>
          <span class="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200"></span>
          <span class="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-200"></span>
          <span class="w-3.5 h-3.5 rounded bg-emerald-300 border border-emerald-400"></span>
          <span class="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-600"></span>
          <span class="w-3.5 h-3.5 rounded bg-emerald-700"></span>
          <span>More</span>
        </div>
      </div>

      <!-- ⑨ RECENT SESSIONS TABLE -->
      <div class="modern-card p-5 bg-white border border-slate-200 rounded-2xl shadow-xs min-w-0">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i data-lucide="list" class="w-4 h-4 text-amber-500"></i> Imported Pomodoro Sessions
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Read-only. Each record = new activity detected since integration activation.</p>
          </div>
          <span class="text-xs font-semibold text-slate-500">Showing last ${(data.recent_sessions || []).length}</span>
        </div>
        ${(data.recent_sessions || []).length > 0 ? `
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-700">
              <thead class="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 uppercase tracking-wider select-none font-bold">
                <tr>
                  <th class="p-3 w-28">Date</th>
                  <th class="p-3 w-32">Duration</th>
                  <th class="p-3 w-48">Source</th>
                  <th class="p-3 min-w-[200px]">Notes</th>
                  <th class="p-3 w-20 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${(data.recent_sessions || []).map(s => `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">${s.date}</td>
                    <td class="p-3 font-extrabold text-amber-800 whitespace-nowrap">${s.formatted_duration}</td>
                    <td class="p-3 font-bold text-slate-700">${escapeHtml(s.subject || 'Pomodoro Study Time')}</td>
                    <td class="p-3 text-slate-500 text-[11px] break-words max-w-md">${escapeHtml(s.notes) || '—'}</td>
                    <td class="p-3 text-right whitespace-nowrap">
                      <button onclick="handleDeleteStudySession(${s.id})" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer" title="Delete this session log">
                        <i data-lucide="trash-2" class="w-3 h-3"></i> Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="py-8 text-center text-xs text-slate-400">No session records yet. Complete a Pomodoro session and sync.</div>`}
      </div>
      `}

      <!-- ⑩ CONTROL PANEL -->
      <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs text-xs min-w-0">
        <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Integration Controls</div>
        <div class="flex flex-wrap gap-3">
          <button onclick="syncPomodoroNow()" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition flex items-center gap-1.5 active:scale-95">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync Now
          </button>
          <button onclick="handleResetPomodoroIntegration()" class="px-4 py-2 rounded-xl bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 font-bold transition flex items-center gap-1.5">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Reset Integration
          </button>
          <button onclick="handleDisablePomodoroIntegration()" class="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold transition flex items-center gap-1.5">
            <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i> Disable Integration
          </button>
        </div>
        <div class="mt-3 text-[10px] text-slate-400 space-y-0.5">
          <div>• <b>Sync Now</b>: imports new minutes since last check. READ-ONLY. Never modifies Pomodoro app.</div>
          <div>• <b>Reset Integration</b>: saves new baseline at current Pomodoro totals. Existing AAYUSH 360 records are kept.</div>
          <div>• <b>Disable Integration</b>: stops automatic syncing. Existing records are kept. Re-enabling creates a fresh baseline.</div>
        </div>
      </div>

    </div>
  `;

  lucide.createIcons();

  if (data.has_data) {
    setTimeout(() => {
      const canvas = document.getElementById('chart-pomo-filter');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (state.charts['pomo-filter']) state.charts['pomo-filter'].destroy();
      const chartType = (filtered.chart_type) || 'bar';
      const isLine = chartType === 'line';
      state.charts['pomo-filter'] = new Chart(ctx, {
        type: chartType,
        data: {
          labels: filtered.chart_labels || [],
          datasets: [{ label: 'Pomodoro Study Hours', data: filtered.chart_values || [],
            backgroundColor: isLine ? 'rgba(245,158,11,0.15)' : '#f59e0b',
            borderColor: '#f59e0b', borderWidth: 2, fill: isLine, tension: 0.25,
            borderRadius: isLine ? 0 : 6 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} hours` } } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { weight: 'bold' } } },
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: 'bold' } } }
          }
        }
      });
    }, 100);
  }
}

function formatFilterDisplayName(f) {
  const map = { today:'Today', this_week:'This Week', last_week:'Last Week',
    this_month:'This Month', last_month:'Last Month', last_4_weeks:'Last 4 Weeks',
    last_8_weeks:'Last 8 Weeks', last_12_weeks:'Last 12 Weeks', all_time:'All Time' };
  return map[f] || f;
}

function setPomodoroTimeFilter(filterKey) {
  state.pomodoroFilter = filterKey;
  renderPomodoro(document.getElementById('view-content'));
}

async function syncPomodoroNow() {
  try {
    showToast('Syncing with Pomodoro app...', 'info');
    const res = await callApi('sync_pomodoro_data');
    if (res && res.success) {
      const msg = res.new_minutes > 0
        ? `Imported ${res.new_minutes} new minutes!`
        : (res.message || 'Sync complete — no new activity.');
      showToast(msg, res.new_minutes > 0 ? 'success' : 'info');
      await loadInitialData();
      renderPomodoro(document.getElementById('view-content'));
    } else {
      showToast(res.error || 'Sync failed', 'error');
    }
  } catch (e) {
    showToast(`Sync error: ${e.message || e}`, 'error');
  }
}

async function handleEnablePomodoroIntegration() {
  try {
    showToast('Enabling integration and recording baseline...', 'info');
    const res = await callApi('enable_pomodoro_integration');
    if (res && res.success) {
      showToast(`Integration enabled. Baseline: ${res.baseline_minutes || 0} min. Only NEW activity will be imported.`, 'success');
      await loadInitialData();
      renderPomodoro(document.getElementById('view-content'));
    } else {
      showToast(res.error || 'Failed to enable integration', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message || e}`, 'error');
  }
}

async function handleDisablePomodoroIntegration() {
  if (!confirm('Disable Pomodoro integration?\n\nAutomatic syncing will stop. Existing imported records will be kept.\nThe Pomodoro app is not modified.')) return;
  try {
    const res = await callApi('disable_pomodoro_integration');
    if (res && res.success) {
      showToast('Integration disabled. Existing records kept.', 'success');
      await loadInitialData();
      renderPomodoro(document.getElementById('view-content'));
    } else {
      showToast(res.error || 'Failed to disable', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message || e}`, 'error');
  }
}

async function handleResetPomodoroIntegration() {
  if (!confirm(
    'Reset integration baseline?\n\n' +
    '• Current Pomodoro totals become the new starting point.\n' +
    '• Only activity AFTER this reset will be imported.\n' +
    '• Existing AAYUSH 360 records are NOT deleted.\n' +
    '• The Pomodoro app is NOT modified.'
  )) return;
  try {
    const res = await callApi('reset_pomodoro_integration');
    if (res && res.success) {
      showToast(`Baseline reset to ${res.baseline_minutes || 0} min. Only future activity counts.`, 'success');
      await loadInitialData();
      renderPomodoro(document.getElementById('view-content'));
    } else {
      showToast(res.error || 'Failed to reset', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message || e}`, 'error');
  }
}

async function handleDeleteStudySession(sessionId) {
  if (!confirm('Delete this study session log from AAYUSH 360?\n\nDashboard totals and Pomodoro analytics will update immediately.\n(The Pedro Pomodoro app is not modified)')) return;
  try {
    const res = await callApi('delete_study_session', sessionId);
    if (res && res.success) {
      showToast('Study session log deleted.', 'info');
      await loadInitialData();
      if (state.currentView === 'pomodoro') {
        renderPomodoro(document.getElementById('view-content'));
      } else if (state.currentView === 'dashboard') {
        renderDashboard(document.getElementById('view-content'));
      }
    } else {
      showToast('Failed to delete session', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message || e}`, 'error');
  }
}

// Backward compatibility alias
const renderStudyAnalytics = renderPomodoro;


// ==================== 10. SETTINGS & INTEGRATIONS VIEW ====================
async function renderSettings(container) {
  const cloudStatus = await callApi('get_cloud_sync_status');
  const pomoStatus = await callApi('get_pomodoro_integration_status');
  const backups = await callApi('list_backups');

  container.innerHTML = `
    <div class="space-y-6 min-w-0">
      <div class="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h1 class="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <i data-lucide="settings" class="w-6 h-6 text-slate-600"></i> Settings & Integrations
          </h1>
          <p class="text-xs text-slate-500 font-medium">Configure Supabase cloud sync, Pomodoro integration, manage backups, and export data.</p>
        </div>
      </div>

      <!-- Supabase Cloud Sync Section -->
      <div class="card-blue p-6 min-w-0 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white shadow-xs">
        <div class="flex items-center justify-between mb-3 min-w-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
              <i data-lucide="cloud" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-extrabold text-sky-950 truncate">Supabase Cloud Sync</h3>
              <p class="text-xs text-sky-900/80 truncate">Local-first bidirectional sync (Windows Desktop & Android).</p>
            </div>
          </div>
          <span class="badge flex-shrink-0 ${cloudStatus && cloudStatus.enabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold' : 'bg-slate-100 text-slate-600 font-bold border border-slate-300'}">
            ${cloudStatus ? cloudStatus.status : 'Not connected'}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 my-4 p-3.5 bg-white/90 rounded-xl border border-sky-200 text-xs">
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Cloud Status:</div>
            <div class="font-extrabold text-slate-900 mt-0.5">${cloudStatus ? cloudStatus.status : 'Not connected'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Connected Account:</div>
            <div class="font-bold text-slate-800 mt-0.5 text-[11px] truncate">${(cloudStatus && cloudStatus.email) ? cloudStatus.email : 'None (Operating 100% Offline)'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Last Cloud Sync:</div>
            <div class="font-extrabold text-slate-700 mt-0.5">${(cloudStatus && cloudStatus.last_sync) ? cloudStatus.last_sync.replace('T', ' ').slice(0, 19) : 'Never'}</div>
          </div>
          ${(cloudStatus && cloudStatus.enabled) ? `
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Pending Local Changes:</div>
            <div class="font-bold text-slate-700 mt-0.5">${cloudStatus.pending_changes || 0} records queued</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Project URL:</div>
            <div class="font-bold text-slate-700 mt-0.5 text-[10px] truncate">${cloudStatus.project_url || '—'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Data Architecture:</div>
            <div class="font-bold text-emerald-700 mt-0.5">Local-First (SQLite + Cloud)</div>
          </div>
          ` : ''}
        </div>

        <div class="p-3 bg-sky-50/80 border border-sky-200 rounded-xl text-[11px] text-sky-900 mb-4 flex items-start gap-2">
          <i data-lucide="shield-check" class="w-3.5 h-3.5 text-sky-600 flex-shrink-0 mt-0.5"></i>
          <span><b>Local-First Assurance:</b> AAYUSH 360 never requires continuous internet. Your lectures, notes, targets, and tests live in SQLite on your PC. Cloud sync seamlessly links your progress to your phone without data loss.</span>
        </div>

        <div class="flex flex-wrap gap-2">
          ${(!cloudStatus || !cloudStatus.enabled) ? `
            <button onclick="openCloudAuthModal('signin')" class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="log-in" class="w-3.5 h-3.5"></i> Sign In to Cloud
            </button>
            <button onclick="openCloudAuthModal('signup')" class="px-4 py-2 rounded-lg bg-white hover:bg-sky-50 text-sky-700 font-bold text-xs border border-sky-300 transition flex items-center gap-1.5">
              <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> Create Cloud Account
            </button>
          ` : `
            <button onclick="handleCloudSyncNow()" class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync Now
            </button>
            <button onclick="handleCloudSignOut()" class="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-300 transition flex items-center gap-1.5">
              <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Disconnect / Sign Out
            </button>
          `}
        </div>
      </div>

      <!-- Pomodoro Integration Section -->
      <div class="card-yellow p-6 min-w-0">
        <div class="flex items-center justify-between mb-3 min-w-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-extrabold text-amber-950 truncate">Pomodoro Integration</h3>
              <p class="text-xs text-amber-900/80 truncate">Read-only delta sync from Study Pomodoro desktop app (LevelDB).</p>
            </div>
          </div>
          <span class="badge flex-shrink-0 ${pomoStatus.enabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold' : 'bg-white text-slate-600 font-bold border border-amber-300'}">
            ${pomoStatus.status || 'Not configured'}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 my-4 p-3.5 bg-white/90 rounded-xl border border-amber-300 text-xs">
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Status:</div>
            <div class="font-extrabold text-slate-900 mt-0.5">${pomoStatus.status || 'Not configured'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Integration started:</div>
            <div class="font-bold text-slate-800 mt-0.5 text-[11px]">${pomoStatus.activated_at || '—'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Last sync:</div>
            <div class="font-extrabold text-slate-700 mt-0.5">${pomoStatus.last_sync || 'Never'}</div>
          </div>
          ${pomoStatus.enabled ? `
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Baseline at activation:</div>
            <div class="font-bold text-slate-700 mt-0.5">${pomoStatus.baseline_minutes || 0} min / ${pomoStatus.baseline_focus || 0} sessions</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Today imported:</div>
            <div class="font-bold text-slate-700 mt-0.5">${pomoStatus.today_formatted || '0m'}</div>
          </div>
          <div>
            <div class="text-slate-500 text-[11px] font-bold">Total imported (since start):</div>
            <div class="font-bold text-slate-700 mt-0.5">${pomoStatus.total_formatted || '0m'} / ${pomoStatus.total_sessions_imported || 0} sessions</div>
          </div>
          ` : ''}
        </div>

        <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 mb-4 flex items-start gap-2">
          <i data-lucide="info" class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5"></i>
          <span><b>Lecture completion is always manual.</b> Pomodoro time contributes only to study-time analytics. It never marks lectures, DPPs, or chapters as completed.</span>
        </div>

        <div class="flex flex-wrap gap-2">
          ${!pomoStatus.enabled ? `
            <button onclick="handleEnablePomodoroIntegration()" class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="play" class="w-3.5 h-3.5"></i> Enable Integration (Fresh Baseline)
            </button>
          ` : `
            <button onclick="syncPomodoroNow()" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync Now
            </button>
            <button onclick="handleResetPomodoroIntegration()" class="px-4 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs border border-amber-300 transition flex items-center gap-1.5">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Reset Baseline
            </button>
            <button onclick="handleDisablePomodoroIntegration()" class="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-300 transition flex items-center gap-1.5">
              <i data-lucide="pause-circle" class="w-3.5 h-3.5"></i> Disable Integration
            </button>
            <button onclick="navigateTo('pomodoro')" class="px-4 py-2 rounded-lg bg-white hover:bg-amber-50 text-amber-700 font-bold text-xs border border-amber-200 transition flex items-center gap-1.5">
              <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i> View Pomodoro Analytics
            </button>
          `}
        </div>
      </div>


      <!-- Backup Management -->
      <div class="modern-card p-5 border border-slate-200 bg-white shadow-xs rounded-2xl min-w-0">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600"></i> Local Database Backups
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Stored safely in AppData/Aayush360/backups/. Automatic on every startup.</p>
          </div>
          <button onclick="handleCreateManualBackup()" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs">
            + Create Backup Now
          </button>
        </div>

        <div class="space-y-2 max-h-48 overflow-y-auto">
          ${backups && backups.length > 0 ? backups.map(b => `
            <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span class="font-bold text-slate-800">${b.file_path.split(/[\\/]/).pop()}</span>
                <span class="text-[10px] text-slate-400 ml-2">${b.timestamp}</span>
              </div>
              <button onclick="handleRestoreBackupPrompt('${escapeJsParam(b.file_path)}')" class="px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200 hover:bg-blue-100">
                Restore
              </button>
            </div>
          `).join('') : '<div class="text-xs text-slate-400 py-3 text-center">No backups recorded yet.</div>'}
        </div>
      </div>

      <!-- Planner Re-import -->
      <div class="modern-card p-5 border border-slate-200 bg-white shadow-xs rounded-2xl min-w-0">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
          <i data-lucide="refresh-cw" class="w-4 h-4 text-blue-600"></i> Planner Re-Import & Sync
        </h3>
        <p class="text-xs text-slate-500 mb-4">Re-scan the 6 PDF planners from your directory without destroying existing completion progress or custom notes.</p>
        <button onclick="handleReimportPlanners(true)" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs">
          Re-scan Planners (Preserve Progress)
        </button>
      </div>

      <!-- JSON Export -->
      <div class="modern-card p-5 border border-slate-200 bg-white shadow-xs rounded-2xl min-w-0">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
          <i data-lucide="download" class="w-4 h-4 text-purple-600"></i> Export All Study Data (JSON)
        </h3>
        <p class="text-xs text-slate-500 mb-3">Download a full JSON dump of your database including all edits, study sessions, question logs, and test results.</p>
        <button onclick="handleExportData()" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-xs">
          Export JSON
        </button>
      </div>
    </div>
  `;
}

// Legacy handler — redirects to enable integration (path input no longer used)
async function handleSavePomodoroPathSetting() {
  return handleEnablePomodoroIntegration();
}

// Alias used in Settings "Sync Now" button
async function handleSyncPomodoroDirect() {
  return syncPomodoroNow();
}


async function handleCreateManualBackup() {
  const res = await callApi('create_manual_backup');
  if (res.success) {
    showToast('Manual database backup created successfully!', 'success');
    renderSettings(document.getElementById('view-content'));
  }
}

async function handleRestoreBackupPrompt(filePath) {
  if (confirm(`Are you sure you want to restore backup: ${filePath}?\nCurrent database will be replaced.`)) {
    const res = await callApi('restore_backup', filePath);
    if (res.success) {
      showToast('Database restored! Reloading application data...', 'success');
      await loadInitialData();
      navigateTo('dashboard');
    }
  }
}

async function handleReimportPlanners(preserve) {
  if (confirm('Re-scan all PDF planners from project directory?\nExisting completion checkboxes and notes will be preserved.')) {
    const res = await callApi('reimport_planners_action', preserve);
    if (res.success) {
      showToast('Planners re-scanned successfully!', 'success');
      await loadInitialData();
      navigateTo('subject_physics');
    }
  }
}

async function handleExportData() {
  const res = await callApi('export_full_database_json');
  if (res.success) {
    showToast(`Data exported to: ${res.exported_file}`, 'success');
  }
}

// ==================== MODALS ====================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function openAddLectureModal(subjectId, chapterId) {
  const sId = subjectId || state.selectedSubjectId || 1;
  const cId = chapterId || state.selectedChapterId;
  const subjSelect = document.getElementById('add-lec-subject');
  if (subjSelect && sId) {
    subjSelect.value = sId;
  }
  populateAddLectureChapters();
  const chapSelect = document.getElementById('add-lec-chapter');
  if (chapSelect && cId) {
    chapSelect.value = cId;
  }

  // Pre-fill next lecture number if inside a chapter
  const lecs = state.chapterLectures || [];
  const nextNo = lecs.length > 0 ? Math.max(...lecs.map(l => l.lecture_no || 0)) + 1 : 1;
  const noInput = document.getElementById('add-lec-no');
  if (noInput) noInput.value = nextNo;
  const dppInput = document.getElementById('add-lec-dpp');
  if (dppInput) dppInput.value = nextNo;

  const dateInput = document.getElementById('add-lec-date');
  if (dateInput) dateInput.value = getTodayDateString();

  const nameInput = document.getElementById('add-lec-name');
  if (nameInput) {
    nameInput.value = `Lecture ${nextNo}`;
    setTimeout(() => nameInput.focus(), 100);
  }

  openModal('modal-add-lecture');
}

function openAddDppModal(subjectId, chapterId) {
  const sId = subjectId || state.selectedSubjectId || 1;
  const cId = chapterId || state.selectedChapterId;
  const subj = state.subjects.find(s => s.id == sId);
  const ch = subj ? (subj.chapters || []).find(c => c.id == cId) : null;

  document.getElementById('add-dpp-subj-id').value = sId;
  document.getElementById('add-dpp-chap-id').value = cId;
  const subTitleEl = document.getElementById('add-dpp-subtitle');
  if (subTitleEl) {
    subTitleEl.textContent = `${subj ? subj.display_name : 'Subject'} • ${ch ? ch.name : 'Chapter'}`;
  }

  const lecs = state.chapterLectures || [];
  const nextNo = lecs.length > 0 ? Math.max(...lecs.map(l => l.dpp_no || l.lecture_no || 0)) + 1 : 1;
  document.getElementById('add-dpp-no').value = nextNo;
  document.getElementById('add-dpp-date').value = getTodayDateString();
  document.getElementById('add-dpp-title').value = `DPP ${nextNo}`;
  document.getElementById('add-dpp-notes').value = '';

  openModal('modal-add-dpp');
  setTimeout(() => document.getElementById('add-dpp-title')?.focus(), 100);
}

async function handleAddDppSubmit(e) {
  e.preventDefault();
  const subjId = parseInt(document.getElementById('add-dpp-subj-id').value);
  const chapId = parseInt(document.getElementById('add-dpp-chap-id').value);
  const dppNo = parseInt(document.getElementById('add-dpp-no').value);
  const schedDate = document.getElementById('add-dpp-date').value;
  const dppTitle = document.getElementById('add-dpp-title').value;
  const notes = document.getElementById('add-dpp-notes').value;

  const res = await callApi('add_dpp', {
    subject_id: subjId,
    chapter_id: chapId,
    dpp_no: dppNo,
    dpp_title: dppTitle,
    scheduled_date: schedDate,
    notes: notes
  });

  if (res.success) {
    showToast(`DPP ${dppNo} added successfully!`, 'success');
    closeModal('modal-add-dpp');
    await loadInitialData();
    refreshCurrentView();
  } else {
    showToast(res.error || 'Failed to add DPP', 'error');
  }
}

function populateAddLectureChapters() {
  const subjId = document.getElementById('add-lec-subject')?.value;
  const select = document.getElementById('add-lec-chapter');
  if (!select || !subjId) return;

  const s = state.subjects.find(sub => sub.id == subjId);
  const chaps = s ? s.chapters || [] : [];
  select.innerHTML = chaps.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function handleAddLectureSubmit(e) {
  e.preventDefault();
  const subjId = parseInt(document.getElementById('add-lec-subject').value);
  const chapId = parseInt(document.getElementById('add-lec-chapter').value);
  const lecNo = parseInt(document.getElementById('add-lec-no').value);
  const dppNo = parseInt(document.getElementById('add-lec-dpp').value) || lecNo;
  const schedDate = document.getElementById('add-lec-date').value;
  const lecName = document.getElementById('add-lec-name').value;
  const topic = document.getElementById('add-lec-topic').value;
  const resource = document.getElementById('add-lec-resource').value;
  const batch = document.getElementById('add-lec-batch').value;
  const autoRenumber = document.getElementById('add-lec-renumber').checked;

  const res = await callApi('add_lecture', {
    subject_id: subjId,
    chapter_id: chapId,
    lecture_no: lecNo,
    dpp_no: dppNo,
    scheduled_date: schedDate,
    lecture_name: lecName,
    topic: topic,
    resource: resource,
    batch: batch
  }, autoRenumber);

  if (res.success) {
    showToast(`Lecture added successfully! (ID: ${res.id})`, 'success');
    closeModal('modal-add-lecture');
    await loadInitialData();
    refreshCurrentView();
  }
}

async function openEditLectureModal(id) {
  const lec = await callApi('get_lecture', id);
  if (!lec) return;

  const subj = state.subjects.find(s => s.id == lec.subject_id);
  const subjName = subj ? subj.display_name : (lec.subject_name || 'Subject');

  document.getElementById('edit-lec-id').value = lec.id;
  document.getElementById('edit-lec-subtitle').textContent = `Lecture #${lec.lecture_no} • ${subjName} • ${lec.chapter_name || ''}`;
  document.getElementById('edit-lec-subject').value = lec.subject_id;
  
  populateEditLectureChapters();
  setTimeout(() => {
    document.getElementById('edit-lec-chapter').value = lec.chapter_id;
  }, 50);

  document.getElementById('edit-lec-no').value = lec.lecture_no;
  document.getElementById('edit-lec-dpp').value = lec.dpp_no;
  document.getElementById('edit-lec-date').value = lec.scheduled_date;
  document.getElementById('edit-lec-name').value = lec.lecture_name;
  document.getElementById('edit-lec-topic').value = lec.topic || '';
  document.getElementById('edit-lec-resource').value = lec.resource || '';
  document.getElementById('edit-lec-batch').value = lec.batch || '';

  document.getElementById('edit-lec-completed').checked = Boolean(lec.is_completed);
  document.getElementById('edit-lec-dpp-completed').checked = Boolean(lec.is_dpp_completed);
  document.getElementById('edit-lec-completed-date').textContent = lec.is_completed ? `Completed: ${lec.completed_at || 'Done'}` : 'Status: Pending';

  document.getElementById('edit-lec-q-prac').value = lec.questions_practiced || 0;
  document.getElementById('edit-lec-q-corr').value = lec.questions_correct || 0;
  document.getElementById('edit-lec-q-inc').value = lec.questions_incorrect || 0;
  document.getElementById('edit-lec-notes').value = lec.notes || '';

  openModal('modal-edit-lecture');
}

async function openEditDppModal(id) {
  const lec = (state.lectures && state.lectures.find(l => l.id == id)) || await callApi('get_lecture', id);
  if (!lec) return;

  const subj = state.subjects.find(s => s.id == lec.subject_id);
  const subjName = subj ? subj.display_name : (lec.subject_name || 'Subject');

  document.getElementById('edit-dpp-lecture-id').value = lec.id;
  document.getElementById('edit-dpp-modal-heading').innerHTML = `<i data-lucide="clipboard-check" class="w-5 h-5 text-amber-600"></i> ${lec.dpp_no ? 'Edit DPP' : 'Add DPP'}`;
  document.getElementById('edit-dpp-subtitle').textContent = `Lecture #${lec.lecture_no} • ${subjName} • ${lec.chapter_name || ''}`;
  document.getElementById('edit-dpp-no').value = lec.dpp_no || lec.lecture_no;
  document.getElementById('edit-dpp-date').value = lec.scheduled_date || getTodayDateString();
  document.getElementById('edit-dpp-topic').value = lec.topic || '';
  document.getElementById('edit-dpp-completed').checked = Boolean(lec.is_dpp_completed);
  document.getElementById('edit-dpp-notes').value = lec.notes || '';

  openModal('modal-edit-dpp');
  lucide.createIcons();
}

async function handleEditDppSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('edit-dpp-lecture-id').value);
  const dppNo = parseInt(document.getElementById('edit-dpp-no').value) || 1;
  const schedDate = document.getElementById('edit-dpp-date').value;
  const topic = document.getElementById('edit-dpp-topic').value;
  const isDppComp = document.getElementById('edit-dpp-completed').checked;
  const notes = document.getElementById('edit-dpp-notes').value;

  const res = await callApi('update_lecture', id, {
    dpp_no: dppNo,
    scheduled_date: schedDate,
    topic: topic,
    is_dpp_completed: isDppComp,
    notes: notes
  }, false);

  if (res.success) {
    showToast('DPP updated successfully!', 'success');
    closeModal('modal-edit-dpp');
    await loadInitialData();
    refreshCurrentView();
  } else {
    showToast(res.error || 'Failed to update DPP', 'error');
  }
}

function populateEditLectureChapters() {
  const subjId = document.getElementById('edit-lec-subject')?.value;
  const select = document.getElementById('edit-lec-chapter');
  if (!select || !subjId) return;

  const s = state.subjects.find(sub => sub.id == subjId);
  const chaps = s ? s.chapters || [] : [];
  select.innerHTML = chaps.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function handleEditLectureSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('edit-lec-id').value);
  const subjId = parseInt(document.getElementById('edit-lec-subject').value);
  const chapId = parseInt(document.getElementById('edit-lec-chapter').value);
  const lecNo = parseInt(document.getElementById('edit-lec-no').value);
  const dppNo = parseInt(document.getElementById('edit-lec-dpp').value);
  const schedDate = document.getElementById('edit-lec-date').value;
  const lecName = document.getElementById('edit-lec-name').value;
  const topic = document.getElementById('edit-lec-topic').value;
  const resource = document.getElementById('edit-lec-resource').value;
  const batch = document.getElementById('edit-lec-batch').value;

  const isComp = document.getElementById('edit-lec-completed').checked;
  const isDppComp = document.getElementById('edit-lec-dpp-completed').checked;

  const qPrac = parseInt(document.getElementById('edit-lec-q-prac').value) || 0;
  const qCorr = parseInt(document.getElementById('edit-lec-q-corr').value) || 0;
  const qInc = parseInt(document.getElementById('edit-lec-q-inc').value) || 0;
  const notes = document.getElementById('edit-lec-notes').value;

  const res = await callApi('update_lecture', id, {
    subject_id: subjId,
    chapter_id: chapId,
    lecture_no: lecNo,
    dpp_no: dppNo,
    scheduled_date: schedDate,
    lecture_name: lecName,
    topic: topic,
    resource: resource,
    batch: batch,
    is_completed: isComp,
    is_dpp_completed: isDppComp,
    questions_practiced: qPrac,
    questions_correct: qCorr,
    questions_incorrect: qInc,
    notes: notes
  }, false);

  if (res.success) {
    showToast('Lecture updated successfully!', 'success');
    closeModal('modal-edit-lecture');
    await loadInitialData();
    refreshCurrentView();
  }
}

async function handleDuplicateCurrentLecture() {
  const id = parseInt(document.getElementById('edit-lec-id').value);
  if (!id) return;
  const res = await callApi('duplicate_lecture', id);
  if (res.success) {
    showToast('Lecture duplicated successfully!', 'success');
    closeModal('modal-edit-lecture');
    await loadInitialData();
    refreshCurrentView();
  }
}

async function handleDeleteCurrentLecture() {
  const id = parseInt(document.getElementById('edit-lec-id').value);
  if (!id) return;
  if (confirm('Are you sure you want to delete this lecture?')) {
    const res = await callApi('delete_lecture', id, false);
    if (res.success) {
      showToast('Lecture deleted.', 'success');
      closeModal('modal-edit-lecture');
      await loadInitialData();
      refreshCurrentView();
    }
  }
}

function openBulkEditModal() {
  if (state.selectedLectureIds.size === 0) {
    showToast('Please select at least one lecture first.', 'error');
    return;
  }
  document.getElementById('bulk-selected-count').textContent = `${state.selectedLectureIds.size} lectures`;
  handleBulkOperationChange();
  openModal('modal-bulk-edit');
}

function handleBulkOperationChange() {
  const op = document.getElementById('bulk-operation').value;
  const dynamic = document.getElementById('bulk-dynamic-input');
  if (!dynamic) return;

  if (op === 'shift_date') {
    dynamic.innerHTML = `
      <label class="block text-slate-700 font-semibold mb-1">Shift Days (+ for forward, - for backward)</label>
      <input type="number" id="bulk-param-days" value="1" step="1" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none">
    `;
  } else if (op === 'change_date') {
    dynamic.innerHTML = `
      <label class="block text-slate-700 font-semibold mb-1">New Scheduled Date</label>
      <input type="date" id="bulk-param-date" value="${new Date().toISOString().slice(0, 10)}" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none">
    `;
  } else if (op === 'change_status') {
    dynamic.innerHTML = `
      <label class="block text-slate-700 font-semibold mb-1">Mark Completion Status</label>
      <select id="bulk-param-status" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none">
        <option value="completed">Completed</option>
        <option value="pending">Pending</option>
      </select>
    `;
  } else if (op === 'change_dpp_status') {
    dynamic.innerHTML = `
      <label class="block text-slate-700 font-semibold mb-1">Mark DPP Status</label>
      <select id="bulk-param-dpp-status" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none">
        <option value="completed">Completed</option>
        <option value="pending">Pending</option>
      </select>
    `;
  } else if (op === 'change_resource') {
    dynamic.innerHTML = `
      <label class="block text-slate-700 font-semibold mb-1">New Resource Name</label>
      <input type="text" id="bulk-param-resource" placeholder="e.g. Prayas 2.0" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none">
    `;
  } else if (op === 'delete') {
    dynamic.innerHTML = `
      <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
        <b>Warning:</b> This will delete all ${state.selectedLectureIds.size} selected lectures.
      </div>
    `;
  }
}

async function handleBulkEditSubmit(e) {
  e.preventDefault();
  const op = document.getElementById('bulk-operation').value;
  const ids = Array.from(state.selectedLectureIds);

  let params = {};
  if (op === 'shift_date') params.days = parseInt(document.getElementById('bulk-param-days').value);
  else if (op === 'change_date') params.new_date = document.getElementById('bulk-param-date').value;
  else if (op === 'change_status') params.is_completed = document.getElementById('bulk-param-status').value === 'completed';
  else if (op === 'change_dpp_status') params.is_dpp_completed = document.getElementById('bulk-param-dpp-status').value === 'completed';
  else if (op === 'change_resource') params.resource = document.getElementById('bulk-param-resource').value;

  const res = await callApi('bulk_update_lectures', ids, op, params);
  if (res.success) {
    showToast(`Bulk operation "${op}" applied to ${res.updated_count} lectures!`, 'success');
    closeModal('modal-bulk-edit');
    clearSelectedLectures();
    await loadInitialData();
    refreshCurrentView();
  }
}

function openLogQuestionsModal() {
  document.getElementById('q-log-date').value = new Date().toISOString().slice(0, 10);
  calcAccuracyPreview();
  openModal('modal-log-questions');
}

function calcAccuracyPreview() {
  const prac = parseInt(document.getElementById('q-log-practiced')?.value) || 0;
  const corr = parseInt(document.getElementById('q-log-correct')?.value) || 0;
  const inc = parseInt(document.getElementById('q-log-incorrect')?.value) || 0;

  const preview = document.getElementById('q-log-accuracy-preview');
  if (preview) {
    if (prac > 0) {
      const pct = Math.round((corr / prac) * 100);
      preview.textContent = `${pct}% Accuracy`;
    } else {
      preview.textContent = '0% Accuracy';
    }
  }
}

async function handleLogQuestionsSubmit(e) {
  e.preventDefault();
  const subjId = parseInt(document.getElementById('q-log-subject').value);
  const dt = document.getElementById('q-log-date').value;
  const prac = parseInt(document.getElementById('q-log-practiced').value) || 0;
  const corr = parseInt(document.getElementById('q-log-correct').value) || 0;
  const inc = parseInt(document.getElementById('q-log-incorrect').value) || 0;
  const notes = document.getElementById('q-log-notes').value;

  const res = await callApi('log_question_practice', {
    subject_id: subjId,
    date: dt,
    questions_practiced: prac,
    correct: corr,
    incorrect: inc,
    notes: notes
  });

  if (res.success) {
    showToast('Question practice session logged!', 'success');
    closeModal('modal-log-questions');
    if (state.currentView === 'questions') renderQuestions(document.getElementById('view-content'));
  }
}

async function openTestScoreModal(testId) {
  const tests = await callApi('get_tests');
  const t = tests.find(item => item.id == testId);
  if (!t) return;

  document.getElementById('test-score-id').value = t.id;
  document.getElementById('test-score-subtitle').textContent = `Test #${t.test_no || 1}: ${t.test_name} (${t.test_date})`;
  document.getElementById('test-score-val').value = t.score !== null ? t.score : '';
  document.getElementById('test-score-total').value = t.total_marks || 300;
  document.getElementById('test-score-acc').value = t.accuracy !== null ? t.accuracy : '';
  document.getElementById('test-score-time').value = t.time_taken_minutes !== null ? t.time_taken_minutes : 180;
  document.getElementById('test-score-notes').value = t.notes || '';

  openModal('modal-test-score');
}

async function handleTestScoreSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('test-score-id').value);
  const score = parseFloat(document.getElementById('test-score-val').value);
  const total = parseFloat(document.getElementById('test-score-total').value) || 300;
  const acc = parseFloat(document.getElementById('test-score-acc').value) || 0;
  const time = parseInt(document.getElementById('test-score-time').value) || 180;
  const notes = document.getElementById('test-score-notes').value;

  const res = await callApi('update_test_score', id, {
    score: score,
    total_marks: total,
    accuracy: acc,
    time_taken_minutes: time,
    notes: notes
  });

  if (res.success) {
    showToast('Test score logged and marked completed!', 'success');
    closeModal('modal-test-score');
    await loadInitialData();
    renderTests(document.getElementById('view-content'));
  }
}

async function triggerSmartRedistribute() {
  if (confirm('Run smart backlog reschedule?\nUncompleted past lectures will be safely distributed across upcoming days without overloading.')) {
    const res = await callApi('smart_backlog_redistribute');
    if (res.success) {
      showToast(res.message, 'success');
      await loadInitialData();
      refreshCurrentView();
    }
  }
}

// ==================== WEEKLY TARGETS MODAL LOGIC ====================
let currentTargetsModalWeekStart = null;

async function openWeeklyTargetsModal(targetWeekStart) {
  if (!targetWeekStart) {
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);
    currentTargetsModalWeekStart = monday.toISOString().slice(0, 10);
  } else {
    currentTargetsModalWeekStart = targetWeekStart;
  }

  await loadAndRenderWeeklyTargetsModal(currentTargetsModalWeekStart);
  openModal('modal-weekly-targets');
}

async function loadAndRenderWeeklyTargetsModal(weekStart) {
  const data = await callApi('get_weekly_targets', weekStart);
  if (!data) return;

  currentTargetsModalWeekStart = data.week_start;
  const wsInput = document.getElementById('wt-modal-week-start');
  if (wsInput) wsInput.value = data.week_start;
  const labelEl = document.getElementById('wt-modal-week-label');
  if (labelEl) labelEl.textContent = `Target Week: ${data.week_start}`;
  const rangeEl = document.getElementById('wt-modal-week-range');
  if (rangeEl) rangeEl.textContent = `Monday ${data.week_start} to Sunday ${data.week_end}`;

  const container = document.getElementById('wt-modal-subjects-container');
  if (!container) return;

  container.innerHTML = (data.targets || []).map(t => {
    const isHours = t.target_type === 'hours';
    const step = isHours ? '0.5' : '1';
    return `
      <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-[170px]">
          <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${t.color};"></span>
          <div>
            <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              ${t.display_name}
              ${t.is_custom ? '<span class="text-[9px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">Custom</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-500">${t.resource_name} (Default: ${t.default_target_value} ${t.target_type})</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button type="button" onclick="adjustTargetInput(${t.subject_id}, ${isHours ? -0.5 : -1})" class="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition">
            -
          </button>
          <input type="number" id="wt-input-subj-${t.subject_id}" data-type="${t.target_type}" value="${t.target_value}" min="0" step="${step}" required class="w-16 bg-white border border-slate-300 rounded p-1 text-center font-bold text-slate-800 text-xs shadow-xs focus:outline-none">
          <button type="button" onclick="adjustTargetInput(${t.subject_id}, ${isHours ? 0.5 : 1})" class="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition">
            +
          </button>
          <span class="text-[11px] text-slate-500 font-medium min-w-[38px]">${t.target_type}</span>
        </div>
      </div>
    `;
  }).join('');
}

function adjustTargetInput(subjId, delta) {
  const input = document.getElementById(`wt-input-subj-${subjId}`);
  if (!input) return;
  const current = parseFloat(input.value) || 0;
  const next = Math.max(0, Math.round((current + delta) * 10) / 10);
  input.value = next;
}

function changeWeeklyTargetsModalWeek(deltaWeeks) {
  if (!currentTargetsModalWeekStart) return;
  const dt = new Date(currentTargetsModalWeekStart);
  dt.setDate(dt.getDate() + deltaWeeks * 7);
  const newWeekStart = dt.toISOString().slice(0, 10);
  loadAndRenderWeeklyTargetsModal(newWeekStart);
}

async function handleWeeklyTargetsSubmit(e) {
  e.preventDefault();
  const weekStart = document.getElementById('wt-modal-week-start').value;
  const inputs = document.querySelectorAll('[id^="wt-input-subj-"]');
  const targets = {};

  for (const input of inputs) {
    const subjId = input.id.replace('wt-input-subj-', '');
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
      showToast('Weekly target values cannot be negative!', 'error');
      return;
    }
    targets[subjId] = val;
  }

  const res = await callApi('set_weekly_targets', weekStart, targets);
  if (res.success) {
    showToast(`Weekly targets for week of ${weekStart} saved!`, 'success');
    closeModal('modal-weekly-targets');
    await loadInitialData();
    refreshCurrentView();
  } else {
    showToast(res.error || 'Failed to save weekly targets', 'error');
  }
}

// Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    info: 'bg-blue-600 text-white shadow-blue-500/20',
    success: 'bg-emerald-600 text-white shadow-emerald-500/20',
    error: 'bg-red-600 text-white shadow-red-500/20'
  };

  toast.className = `p-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==================== 15. SUPABASE CLOUD SYNC UI HANDLERS ====================

async function updateCloudSyncHeaderUI() {
  try {
    const status = await callApi('get_cloud_sync_status');
    const btn = document.getElementById('header-cloud-sync-btn');
    const text = document.getElementById('header-sync-status-text');
    if (!btn || !text) return;

    if (!status || !status.enabled) {
      btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shadow-sm transition cursor-pointer';
      text.textContent = 'Cloud Sync: Off';
    } else {
      if (status.status === 'Syncing...') {
        btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-800 text-xs font-semibold shadow-sm transition cursor-pointer animate-pulse';
        text.textContent = 'Syncing...';
      } else if (status.pending_changes > 0) {
        btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-300 hover:bg-sky-100 text-sky-800 text-xs font-semibold shadow-sm transition cursor-pointer';
        text.textContent = `Cloud: ${status.pending_changes} pending`;
      } else {
        btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold shadow-sm transition cursor-pointer';
        text.textContent = 'Cloud: Synced';
      }
    }
  } catch (e) {
    console.error('Error updating cloud sync header UI:', e);
  }
}

let cloudAuthMode = 'signin';

function openCloudAuthModal(mode = 'signin') {
  switchCloudAuthTab(mode);
  openModal('modal-cloud-auth');
}

function switchCloudAuthTab(mode) {
  cloudAuthMode = mode;
  const tabIn = document.getElementById('tab-cloud-signin');
  const tabUp = document.getElementById('tab-cloud-signup');
  const title = document.getElementById('cloud-auth-title');
  const btn = document.getElementById('cloud-auth-submit-btn');

  if (mode === 'signin') {
    if (tabIn) tabIn.className = 'flex-1 py-1.5 rounded-md bg-white text-slate-800 shadow-xs text-center transition font-bold';
    if (tabUp) tabUp.className = 'flex-1 py-1.5 rounded-md text-slate-500 hover:text-slate-800 text-center transition font-normal';
    if (title) title.textContent = 'Sign In to Supabase Cloud';
    if (btn) btn.textContent = 'Sign In';
  } else {
    if (tabUp) tabUp.className = 'flex-1 py-1.5 rounded-md bg-white text-slate-800 shadow-xs text-center transition font-bold';
    if (tabIn) tabIn.className = 'flex-1 py-1.5 rounded-md text-slate-500 hover:text-slate-800 text-center transition font-normal';
    if (title) title.textContent = 'Create Supabase Cloud Account';
    if (btn) btn.textContent = 'Create Account';
  }
}

async function handleCloudAuthSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('cloud-auth-email').value.trim();
  const password = document.getElementById('cloud-auth-password').value;
  const btn = document.getElementById('cloud-auth-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';

  try {
    let res;
    if (cloudAuthMode === 'signup') {
      res = await callApi('cloud_sign_up', email, password);
    } else {
      res = await callApi('cloud_sign_in', email, password);
    }

    if (res.success) {
      showToast(res.message || 'Connected to Supabase Cloud!', 'success');
      closeModal('modal-cloud-auth');
      await updateCloudSyncHeaderUI();
      if (state.currentView === 'settings') {
        renderSettings(document.getElementById('view-content'));
      }
    } else {
      showToast(res.error || 'Authentication failed', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = cloudAuthMode === 'signup' ? 'Create Account' : 'Sign In';
  }
}

async function handleHeaderSyncClick() {
  const status = await callApi('get_cloud_sync_status');
  if (!status || !status.enabled) {
    openCloudAuthModal('signin');
  } else {
    handleCloudSyncNow();
  }
}

async function handleCloudSyncNow() {
  showToast('Starting cloud synchronization...', 'info');
  await updateCloudSyncHeaderUI();
  const res = await callApi('cloud_sync_now');
  if (res.success) {
    showToast(res.message || 'Cloud sync complete!', 'success');
    await loadInitialData();
    if (state.currentView === 'settings') {
      renderSettings(document.getElementById('view-content'));
    }
  } else {
    showToast(`Sync warning: ${res.error}`, 'error');
  }
  await updateCloudSyncHeaderUI();
}

async function handleCloudSignOut() {
  if (confirm('Disconnect from Supabase Cloud Sync?\nYour local database and study progress on this PC remain completely safe.')) {
    const res = await callApi('cloud_sign_out');
    if (res.success) {
      showToast('Disconnected from Cloud Sync.', 'info');
      await updateCloudSyncHeaderUI();
      if (state.currentView === 'settings') {
        renderSettings(document.getElementById('view-content'));
      }
    }
  }
}

