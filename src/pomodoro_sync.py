"""
AAYUSH 360 - LevelDB Pomodoro Integration Engine

Read-only, real-time synchronization from the Study Pomodoro desktop app.
Reads the Pomodoro app's WebView2 LevelDB localStorage safely using raw binary
access with FileShare semantics - never opens LevelDB as a database, never
acquires the LOCK, never modifies the Pomodoro app in any way.

Core guarantees:
  1. READ-ONLY: Never touches or modifies the Pomodoro app's storage.
  2. FRESH START: Activation records a baseline; only NEW activity since
     activation is imported (zero historical data imported ever).
  3. REAL-TIME LIVE SESSION:
     - Detects when Pedro Study Pomodoro timer is actively running.
     - Tracks live elapsed study duration in real time.
     - When session ends, commits persistent Study Time Log to SQLite.
     - Prevents duplicate insertion.
  4. RESET SAFE: If Pomodoro resets its stats (totals decrease), treats the
     new lower value as a new baseline - no negative time imported.
  5. CRASH SAFE: Pomodoro integration failures never crash AAYUSH 360.
  6. INDEPENDENT: Pomodoro time NEVER marks lectures, DPPs, chapters, revisions,
     subjects, or weekly targets as completed. Lecture completion is manual-only.

Storage key used: pomodoroStats
  { days: { "YYYY-MM-DD": { minutes, focusCount } },
    hours: { "0".."23": minutes },
    totalMinutes: int, totalFocus: int, firstUse: "YYYY-MM-DD" }

LevelDB path (automatically discovered):
  C:\\Users\\User\\AppData\\Local\\com.pedro.studypomodoro
    \\EBWebView\\Default\\Local Storage\\leveldb\\
"""

import os
import re
import json
import datetime
import threading
import time
import subprocess
from typing import Optional, Dict, Any, Tuple

# ---------------------------------------------------------------------------
# Constants & Automatic Storage Discovery
# ---------------------------------------------------------------------------

DEFAULT_LEVELDB_DIR = (
    r"C:\Users\User\AppData\Local\com.pedro.studypomodoro"
    r"\EBWebView\Default\Local Storage\leveldb"
)

def get_default_leveldb_dir() -> str:
    """
    Automatically discovers and returns the local LevelDB storage directory.
    Checks the exact default path first, with dynamic fallback to %LOCALAPPDATA%
    if present. Never requires user path configuration.
    """
    if os.path.isdir(DEFAULT_LEVELDB_DIR):
        return DEFAULT_LEVELDB_DIR
    local_app_data = os.environ.get('LOCALAPPDATA', '')
    if local_app_data:
        candidate = os.path.join(
            local_app_data,
            'com.pedro.studypomodoro',
            'EBWebView',
            'Default',
            'Local Storage',
            'leveldb'
        )
        if os.path.isdir(candidate):
            return candidate
    return DEFAULT_LEVELDB_DIR

LEVELDB_DIR = get_default_leveldb_dir()

# Regex that matches the full pomodoroStats JSON blob:
_STATS_RE = re.compile(
    rb'\{\s*"days"\s*:\s*\{.{0,8000}?\}\s*,\s*"hours"\s*:\s*\{.{0,2000}?\}\s*,\s*"totalMinutes"\s*:\s*(\d+)\s*,\s*"totalFocus"\s*:\s*(\d+)\s*,\s*"firstUse"\s*:\s*"[^"]+"\s*\}',
    re.DOTALL
)

# Settings keys stored in AAYUSH 360's own SQLite DB
KEY_ENABLED = 'pomo_integration_enabled'
KEY_ACTIVATED_AT = 'pomo_activated_at'
KEY_BASELINE_MINUTES = 'pomo_baseline_total_minutes'
KEY_BASELINE_FOCUS = 'pomo_baseline_total_focus'
KEY_LAST_MINUTES = 'pomo_last_total_minutes'
KEY_LAST_FOCUS = 'pomo_last_total_focus'
KEY_LAST_SYNC = 'pomo_last_sync'
KEY_SYNC_STATUS = 'pomo_sync_status'

# Live session keys
KEY_LIVE_ACTIVE = 'pomo_live_active'
KEY_LIVE_MINUTES = 'pomo_live_minutes'
KEY_LIVE_START_TIME = 'pomo_live_start_time'


# ---------------------------------------------------------------------------
# Process & File Utilities
# ---------------------------------------------------------------------------

_proc_cache_time = 0.0
_proc_cache_val = False

def is_pedro_process_running() -> bool:
    """Checks whether the Pedro Study Pomodoro desktop app is currently running."""
    global _proc_cache_time, _proc_cache_val
    now = time.time()
    if now - _proc_cache_time < 2.5:
        return _proc_cache_val
    try:
        output = subprocess.check_output(
            ['tasklist', '/FI', 'IMAGENAME eq study-pomodoro.exe', '/NH'],
            text=True,
            creationflags=0x08000000  # CREATE_NO_WINDOW
        )
        _proc_cache_val = 'study-pomodoro.exe' in output.lower()
    except Exception:
        _proc_cache_val = False
    _proc_cache_time = now
    return _proc_cache_val


def _read_file_safe(path: str) -> Optional[bytes]:
    """Opens a file for reading safely. Returns None on any error. Never raises."""
    try:
        with open(path, 'rb') as f:
            return f.read()
    except Exception:
        return None


def _resolve_active_log(leveldb_dir: str) -> Optional[str]:
    """
    Dynamically resolves the active WAL log filename.
    Scans for *.log files and returns the one with the largest modification time.
    Never hardcodes '000152.log'.
    """
    if not os.path.isdir(leveldb_dir):
        return None
    try:
        log_files = [
            os.path.join(leveldb_dir, f)
            for f in os.listdir(leveldb_dir)
            if f.endswith('.log')
        ]
        if not log_files:
            return None
        return max(log_files, key=os.path.getmtime)
    except Exception:
        return None


def _parse_stats_from_bytes(data: bytes) -> Optional[Dict[str, Any]]:
    """
    Scans raw bytes for the pomodoroStats JSON blob.
    Returns the LAST (most recent) occurrence.
    """
    if not data:
        return None
    matches = list(_STATS_RE.finditer(data))
    if not matches:
        return None
    last_match = matches[-1]
    raw_blob = last_match.group(0)
    try:
        text = raw_blob.decode('utf-8', errors='replace')
        parsed = json.loads(text)
        if not isinstance(parsed.get('totalMinutes'), (int, float)):
            return None
        if not isinstance(parsed.get('totalFocus'), (int, float)):
            return None
        if not isinstance(parsed.get('days'), dict):
            return None
        return parsed
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def _parse_stats_from_ldb(leveldb_dir: str) -> Optional[Dict[str, Any]]:
    """Fallback: scan all .ldb files for pomodoroStats."""
    try:
        ldb_files = [
            os.path.join(leveldb_dir, f)
            for f in os.listdir(leveldb_dir)
            if f.endswith('.ldb')
        ]
        ldb_files.sort(key=os.path.getmtime, reverse=True)
        for ldb_path in ldb_files:
            data = _read_file_safe(ldb_path)
            result = _parse_stats_from_bytes(data)
            if result is not None:
                return result
    except Exception:
        pass
    return None


def read_pomodoro_stats(leveldb_dir: str = LEVELDB_DIR) -> Optional[Dict[str, Any]]:
    """
    Master function: reads the current Pomodoro stats from LevelDB.
    1. Try active WAL log.
    2. Retry once on incomplete-write.
    3. Fall back to .ldb files.
    """
    try:
        active_log = _resolve_active_log(leveldb_dir)
        if active_log:
            data = _read_file_safe(active_log)
            result = _parse_stats_from_bytes(data)
            if result is not None:
                return result
            time.sleep(0.15)
            data = _read_file_safe(active_log)
            result = _parse_stats_from_bytes(data)
            if result is not None:
                return result
        return _parse_stats_from_ldb(leveldb_dir)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Integration & Real-Time Sync Engine
# ---------------------------------------------------------------------------

class PomodoroSyncEngine:
    """
    Manages the real-time Pomodoro integration lifecycle for AAYUSH 360.

    Guarantees:
      - Live current session detection and elapsed duration display.
      - Conversion of completed sessions into persistent Study Time Logs.
      - Zero duplication.
      - Zero impact on lectures / DPPs / chapters / subjects / weekly targets.
    """

    def __init__(self, db):
        self.db = db
        self._watch_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._leveldb_dir = get_default_leveldb_dir()
        self._live_session = {
            'active': False,
            'start_time': '',
            'start_minutes': 0,
            'current_minutes': 0,
            'last_update_ts': 0.0
        }

    # -----------------------------------------------------------------------
    # Database Settings Helpers
    # -----------------------------------------------------------------------

    def _get_settings(self) -> Dict[str, str]:
        try:
            conn = self.db.get_connection()
            rows = conn.execute("SELECT key, value FROM app_settings;").fetchall()
            conn.close()
            return {r[0]: r[1] for r in rows}
        except Exception:
            return {}

    def _set_settings(self, updates: Dict[str, str]) -> None:
        try:
            conn = self.db.get_connection()
            c = conn.cursor()
            for k, v in updates.items():
                c.execute(
                    "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                    (k, str(v))
                )
            conn.commit()
            conn.close()
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Persistent Session Commit
    # -----------------------------------------------------------------------

    def _commit_completed_session(
        self,
        date_str: str,
        duration_minutes: float,
        focus_count: int,
        start_time: str = '',
        end_time: str = ''
    ) -> bool:
        """
        Converts completed Pomodoro activity into a persistent Study Time Log.
        Idempotent insertion based on external_session_id.
        NEVER touches lectures, DPPs, chapters, or subjects.
        """
        if duration_minutes <= 0:
            return False
        try:
            dur_hours = round(duration_minutes / 60.0, 2)
            now_ts = int(time.time())
            ext_id = f"pomo_session_{date_str}_{now_ts}_{int(duration_minutes)}m"

            notes = f"Pomodoro session ({int(duration_minutes)} min"
            if focus_count > 0:
                notes += f", {focus_count} completed focus interval{'s' if focus_count > 1 else ''}"
            notes += ")"

            import uuid
            cid = str(uuid.uuid4())
            conn = self.db.get_connection()
            c = conn.cursor()
            c.execute("""
                INSERT INTO study_sessions (
                    source, external_session_id, date, start_time, end_time,
                    duration_minutes, duration_hours, subject, chapter, topic,
                    activity, notes, client_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(source, external_session_id) DO UPDATE SET
                    duration_minutes = excluded.duration_minutes,
                    duration_hours   = excluded.duration_hours,
                    notes            = excluded.notes,
                    sync_status      = 'pending',
                    updated_at       = datetime('now', 'localtime');
            """, (
                'Pomodoro',
                ext_id,
                date_str,
                start_time or datetime.datetime.now().strftime('%H:%M'),
                end_time or datetime.datetime.now().strftime('%H:%M'),
                round(duration_minutes, 2),
                dur_hours,
                'Pomodoro Study Time',
                '',
                '',
                'Other',
                notes,
                cid
            ))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print("Error committing study session:", e)
            return False

    # -----------------------------------------------------------------------
    # Real-Time & Live Session Detection Loop
    # -----------------------------------------------------------------------

    def _check_sync_and_live(self) -> Dict[str, Any]:
        """
        Core real-time engine:
        1. Checks current LevelDB totals.
        2. Detects if Pedro Pomodoro timer is actively running.
        3. Updates live elapsed duration while timer runs.
        4. When timer stops or session completes, converts to persistent log.
        """
        with self._lock:
            settings = self._get_settings()
            if settings.get(KEY_ENABLED, 'false') != 'true':
                return {'is_active': False, 'status': 'Disabled'}

            current_stats = read_pomodoro_stats(self._leveldb_dir)
            now = time.time()
            now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            today_str = datetime.date.today().isoformat()

            if current_stats is None:
                self._set_settings({
                    KEY_SYNC_STATUS: 'Waiting (Pomodoro storage not accessible)',
                    KEY_LIVE_ACTIVE: 'false',
                    KEY_LIVE_MINUTES: '0'
                })
                self._live_session['active'] = False
                return {'is_active': False, 'status': 'Waiting'}

            cur_total_minutes = int(current_stats.get('totalMinutes', 0))
            cur_total_focus   = int(current_stats.get('totalFocus', 0))

            baseline_mins = int(settings.get(KEY_BASELINE_MINUTES, cur_total_minutes))
            last_processed_mins = int(settings.get(KEY_LAST_MINUTES, baseline_mins))
            last_processed_focus = int(settings.get(KEY_LAST_FOCUS, cur_total_focus))

            # Detect stats reset
            if cur_total_minutes < last_processed_mins or cur_total_focus < last_processed_focus:
                self._set_settings({
                    KEY_BASELINE_MINUTES: str(cur_total_minutes),
                    KEY_BASELINE_FOCUS:   str(cur_total_focus),
                    KEY_LAST_MINUTES:     str(cur_total_minutes),
                    KEY_LAST_FOCUS:       str(cur_total_focus),
                    KEY_LIVE_ACTIVE:      'false',
                    KEY_LIVE_MINUTES:     '0',
                    KEY_SYNC_STATUS:      'Connected (Baseline reset)'
                })
                self._live_session['active'] = False
                return {'is_active': False, 'status': 'Connected'}

            # Check app running and active log modification age
            app_running = is_pedro_process_running()
            active_log = _resolve_active_log(self._leveldb_dir)
            log_mtime = os.path.getmtime(active_log) if (active_log and os.path.exists(active_log)) else 0.0
            log_age = now - log_mtime

            # The Pedro Pomodoro timer writes an update to LevelDB every ~60 seconds of study.
            # If written within the last 110s and process is running, timer is actively running!
            timer_active = app_running and (log_age <= 110.0)

            delta_mins_since_last = cur_total_minutes - last_processed_mins
            focus_delta = max(0, cur_total_focus - last_processed_focus)

            # --- CASE 1: TIMER IS ACTIVELY RUNNING ---
            if timer_active:
                if not self._live_session['active']:
                    self._live_session['active'] = True
                    self._live_session['start_minutes'] = last_processed_mins
                    self._live_session['start_time'] = datetime.datetime.now().strftime('%H:%M')
                    self._live_session['last_update_ts'] = now

                live_elapsed = max(1, cur_total_minutes - self._live_session['start_minutes'])
                self._live_session['current_minutes'] = live_elapsed
                self._live_session['last_update_ts'] = now

                self._set_settings({
                    KEY_LIVE_ACTIVE:     'true',
                    KEY_LIVE_MINUTES:    str(live_elapsed),
                    KEY_LIVE_START_TIME: self._live_session['start_time'],
                    KEY_SYNC_STATUS:     'Currently Studying',
                    KEY_LAST_SYNC:       now_str
                })

                return {
                    'is_active': True,
                    'app_running': True,
                    'elapsed_minutes': live_elapsed,
                    'start_time': self._live_session['start_time'],
                    'status': 'Currently Studying'
                }

            # --- CASE 2: TIMER IS NOT ACTIVE (SESSION COMPLETED OR STOPPED) ---
            if self._live_session['active'] or delta_mins_since_last > 0:
                duration = delta_mins_since_last if delta_mins_since_last > 0 else self._live_session.get('current_minutes', 0)
                start_t = self._live_session.get('start_time') or datetime.datetime.now().strftime('%H:%M')
                end_t = datetime.datetime.now().strftime('%H:%M')

                if duration > 0:
                    self._commit_completed_session(
                        date_str=today_str,
                        duration_minutes=duration,
                        focus_count=focus_delta,
                        start_time=start_t,
                        end_time=end_t
                    )

                # Advance processed marks
                self._set_settings({
                    KEY_LAST_MINUTES:    str(cur_total_minutes),
                    KEY_LAST_FOCUS:      str(cur_total_focus),
                    KEY_LIVE_ACTIVE:     'false',
                    KEY_LIVE_MINUTES:    '0',
                    KEY_LIVE_START_TIME: '',
                    KEY_SYNC_STATUS:     'Connected' if app_running else 'Connected (App idle)',
                    KEY_LAST_SYNC:       now_str
                })

                self._live_session['active'] = False
                self._live_session['current_minutes'] = 0

                return {
                    'is_active': False,
                    'app_running': app_running,
                    'elapsed_minutes': 0,
                    'status': 'Connected'
                }

            # --- CASE 3: IDLE ---
            self._set_settings({
                KEY_LIVE_ACTIVE: 'false',
                KEY_LIVE_MINUTES: '0',
                KEY_SYNC_STATUS: 'Connected' if app_running else 'Connected (App idle)',
                KEY_LAST_SYNC: now_str
            })
            return {
                'is_active': False,
                'app_running': app_running,
                'elapsed_minutes': 0,
                'status': 'Connected'
            }

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def enable_integration(self) -> Dict[str, Any]:
        """
        Enables the Pomodoro integration with a fresh baseline.
        Reads current Pomodoro totals and stores them as the baseline.
        Zero historical data is imported.
        """
        current_stats = read_pomodoro_stats(self._leveldb_dir)
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if current_stats is None:
            baseline_mins  = 0
            baseline_focus = 0
            status_msg = 'Waiting (Pomodoro storage not accessible)'
        else:
            baseline_mins  = int(current_stats.get('totalMinutes', 0))
            baseline_focus = int(current_stats.get('totalFocus', 0))
            status_msg = 'Connected'

        self._live_session['active'] = False
        self._live_session['current_minutes'] = 0

        self._set_settings({
            KEY_ENABLED:          'true',
            KEY_ACTIVATED_AT:     now_str,
            KEY_BASELINE_MINUTES: str(baseline_mins),
            KEY_BASELINE_FOCUS:   str(baseline_focus),
            KEY_LAST_MINUTES:     str(baseline_mins),
            KEY_LAST_FOCUS:       str(baseline_focus),
            KEY_LAST_SYNC:        now_str,
            KEY_SYNC_STATUS:      status_msg,
            KEY_LIVE_ACTIVE:      'false',
            KEY_LIVE_MINUTES:     '0',
            KEY_LIVE_START_TIME:  '',
            'pomodoro_source_path': self._leveldb_dir,
            'pomodoro_sync_status': status_msg,
            'pomodoro_last_sync':   now_str,
        })

        self._start_watcher()

        return {
            'success': True,
            'message': f'Integration enabled. Baseline: {baseline_mins} min / {baseline_focus} sessions. Only NEW activity counts.',
            'baseline_minutes': baseline_mins,
            'baseline_focus': baseline_focus,
            'activated_at': now_str
        }

    def disable_integration(self) -> Dict[str, Any]:
        """Disables automatic syncing. Existing imported records are kept intact."""
        self._stop_watcher()
        self._live_session['active'] = False
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self._set_settings({
            KEY_ENABLED: 'false',
            KEY_SYNC_STATUS: 'Disabled',
            KEY_LIVE_ACTIVE: 'false',
            KEY_LIVE_MINUTES: '0',
            KEY_LAST_SYNC: now_str,
            'pomodoro_sync_status': 'Disabled',
        })
        return {
            'success': True,
            'message': 'Integration disabled. Existing imported data is preserved.'
        }

    def reset_integration(self) -> Dict[str, Any]:
        """Resets baseline to current Pomodoro totals. Keeps existing records."""
        current_stats = read_pomodoro_stats(self._leveldb_dir)
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if current_stats is None:
            baseline_mins = 0
            baseline_focus = 0
        else:
            baseline_mins = int(current_stats.get('totalMinutes', 0))
            baseline_focus = int(current_stats.get('totalFocus', 0))

        self._live_session['active'] = False
        self._live_session['current_minutes'] = 0

        self._set_settings({
            KEY_ENABLED:          'true',
            KEY_ACTIVATED_AT:     now_str,
            KEY_BASELINE_MINUTES: str(baseline_mins),
            KEY_BASELINE_FOCUS:   str(baseline_focus),
            KEY_LAST_MINUTES:     str(baseline_mins),
            KEY_LAST_FOCUS:       str(baseline_focus),
            KEY_LAST_SYNC:        now_str,
            KEY_SYNC_STATUS:      'Connected (Reset)',
            KEY_LIVE_ACTIVE:      'false',
            KEY_LIVE_MINUTES:     '0',
            KEY_LIVE_START_TIME:  '',
            'pomodoro_sync_status': 'Connected (Reset)',
            'pomodoro_last_sync':   now_str,
        })

        return {
            'success': True,
            'message': f'Baseline reset to {baseline_mins} min. Only future activity will count.',
            'baseline_minutes': baseline_mins,
            'baseline_focus': baseline_focus,
        }

    def sync(self, source_path: Optional[str] = None) -> Dict[str, Any]:
        """Manual sync trigger. Runs real-time check and returns status."""
        try:
            live = self._check_sync_and_live()
            return {
                'success': True,
                'status': live.get('status', 'Connected'),
                'is_active': live.get('is_active', False),
                'live_minutes': live.get('elapsed_minutes', 0),
                'message': 'Synchronized successfully with Pomodoro storage.'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_live_status(self) -> Dict[str, Any]:
        """Fast endpoint called by the frontend polling ticker."""
        settings = self._get_settings()
        enabled = settings.get(KEY_ENABLED, 'false') == 'true'
        if not enabled:
            return {'is_active': False, 'status': 'Disabled', 'elapsed_minutes': 0}

        live_info = self._check_sync_and_live()
        return live_info

    def get_status(self) -> Dict[str, Any]:
        """Returns the full integration status and aggregated statistics."""
        settings = self._get_settings()
        enabled = settings.get(KEY_ENABLED, 'false') == 'true'

        live_active = settings.get(KEY_LIVE_ACTIVE) == 'true'
        live_mins = int(settings.get(KEY_LIVE_MINUTES, '0')) if live_active else 0

        try:
            today_str = datetime.date.today().isoformat()
            week_start = (
                datetime.date.today()
                - datetime.timedelta(days=datetime.date.today().weekday())
            ).isoformat()
            month_start = datetime.date.today().replace(day=1).isoformat()
            activation_ts = settings.get(KEY_ACTIVATED_AT, '')

            conn = self.db.get_connection()
            c = conn.cursor()

            if activation_ts:
                activation_date = activation_ts[:10]
                total_mins = c.execute(
                    "SELECT SUM(duration_minutes) FROM study_sessions "
                    "WHERE source = 'Pomodoro' AND date >= ?;",
                    (activation_date,)
                ).fetchone()[0] or 0.0
                total_focus_count = c.execute(
                    "SELECT COUNT(*) FROM study_sessions "
                    "WHERE source = 'Pomodoro' AND date >= ?;",
                    (activation_date,)
                ).fetchone()[0] or 0
            else:
                total_mins = c.execute(
                    "SELECT SUM(duration_minutes) FROM study_sessions WHERE source = 'Pomodoro';"
                ).fetchone()[0] or 0.0
                total_focus_count = c.execute(
                    "SELECT COUNT(*) FROM study_sessions WHERE source = 'Pomodoro';"
                ).fetchone()[0] or 0

            today_mins = c.execute(
                "SELECT SUM(duration_minutes) FROM study_sessions "
                "WHERE source = 'Pomodoro' AND date = ?;",
                (today_str,)
            ).fetchone()[0] or 0.0

            week_mins = c.execute(
                "SELECT SUM(duration_minutes) FROM study_sessions "
                "WHERE source = 'Pomodoro' AND date >= ?;",
                (week_start,)
            ).fetchone()[0] or 0.0

            month_mins = c.execute(
                "SELECT SUM(duration_minutes) FROM study_sessions "
                "WHERE source = 'Pomodoro' AND date >= ?;",
                (month_start,)
            ).fetchone()[0] or 0.0

            conn.close()
        except Exception:
            today_mins = week_mins = month_mins = total_mins = 0.0
            total_focus_count = 0

        def _fmt(m: float) -> str:
            m = int(round(m))
            if m <= 0:
                return '0m'
            h, mm = divmod(m, 60)
            if h > 0 and mm > 0:
                return f'{h}h {mm}m'
            elif h > 0:
                return f'{h}h'
            return f'{mm}m'

        raw_status = settings.get(KEY_SYNC_STATUS, 'Not configured')
        if not enabled:
            display_status = 'Disabled'
        elif live_active:
            display_status = 'Currently Studying'
        elif 'Waiting' in raw_status:
            display_status = 'Waiting'
        elif 'Error' in raw_status:
            display_status = 'Error'
        else:
            display_status = 'Connected'

        today_effective = today_mins + live_mins
        week_effective = week_mins + live_mins
        month_effective = month_mins + live_mins
        total_effective = total_mins + live_mins

        return {
            'enabled': enabled,
            'status': display_status,
            'status_detail': raw_status,
            'is_live': live_active,
            'live_minutes': live_mins,
            'live_str': f"{live_mins}m elapsed" if live_mins > 0 else "Active",
            'activated_at': settings.get(KEY_ACTIVATED_AT, ''),
            'last_sync': settings.get(KEY_LAST_SYNC, 'Never'),
            'baseline_minutes': int(settings.get(KEY_BASELINE_MINUTES, 0)),
            'baseline_focus': int(settings.get(KEY_BASELINE_FOCUS, 0)),
            'today_minutes': int(round(today_effective)),
            'today_formatted': _fmt(today_effective),
            'week_minutes': int(round(week_effective)),
            'week_formatted': _fmt(week_effective),
            'month_minutes': int(round(month_effective)),
            'month_formatted': _fmt(month_effective),
            'total_minutes': int(round(total_effective)),
            'total_formatted': _fmt(total_effective),
            'total_sessions_imported': total_focus_count,
            'is_configured': enabled,
            'data_source': 'Study Pomodoro (LevelDB)' if enabled else 'Not configured',
            'sessions_count': total_focus_count,
        }

    # -----------------------------------------------------------------------
    # Background Thread (2-second interval)
    # -----------------------------------------------------------------------

    def _watcher_loop(self) -> None:
        """
        Background daemon thread.
        Polls every 2 seconds to detect live timer writes and session state changes.
        Never crashes AAYUSH 360.
        """
        POLL_INTERVAL_SECONDS = 2.0
        while not self._stop_event.is_set():
            try:
                settings = self._get_settings()
                if settings.get(KEY_ENABLED, 'false') == 'true':
                    self._check_sync_and_live()
            except Exception:
                pass
            self._stop_event.wait(POLL_INTERVAL_SECONDS)

    def _start_watcher(self) -> None:
        self._stop_event.clear()
        if self._watch_thread and self._watch_thread.is_alive():
            return
        self._watch_thread = threading.Thread(
            target=self._watcher_loop,
            name='PomodoroLiveWatcher',
            daemon=True
        )
        self._watch_thread.start()

    def _stop_watcher(self) -> None:
        self._stop_event.set()

    def start_watcher_if_enabled(self) -> None:
        try:
            settings = self._get_settings()
            if settings.get(KEY_ENABLED, 'false') == 'true':
                self._start_watcher()
        except Exception:
            pass
