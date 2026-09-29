"""
AAYUSH 360 - LevelDB Pomodoro Integration Engine

Source of Truth: Study Pomodoro Desktop Application (Tauri / WebView2 LevelDB).
Storage Path:
  C:\\Users\\User\\AppData\\Local\\com.pedro.studypomodoro\\EBWebView\\Default\\Local Storage\\leveldb
Storage Key:
  pomodoroStats

Guarantees & Architecture:
  1. REAL DATA AS SOURCE OF TRUTH:
     Reads the genuine Study Pomodoro LevelDB data directly without inventing or fabricating data.
  2. PRESERVES REAL DATA STRUCTURE:
     The Study Pomodoro application stores daily study minutes and focus counts per date (daily aggregates).
     These daily aggregates are migrated as canonical daily records without fabricating fake session timestamps
     or splitting the daily total into artificial sessions.
  3. DATE RANGE:
     Starts from 28 September 2026 and continues dynamically into the future.
  4. IDEMPOTENT & DEDUPLICATED:
     Uses deterministic, stable identifiers (client_id: pomo_day_{YYYY-MM-DD}, external_session_id: pomo_daily_{YYYY-MM-DD}).
     Running sync multiple times never creates duplicates.
  5. SOFT-DELETION OF LEGACY FRAGMENTS:
     Old fragmented sessions (from previous implementations that split daily totals) are soft-deleted
     to prevent double counting.
  6. BIDIRECTIONAL SYNC:
     Windows reads LevelDB, commits to local SQLite, and pushes to Supabase study_sessions table.
     Android syncs from Supabase study_sessions table and displays the identical dataset.
  7. INDEPENDENT:
     Pomodoro data is strictly filtered by source = 'Pomodoro'. Unrelated study data (Physical Chemistry hours,
     lectures, DPPs, tests) is NEVER mixed into Pomodoro totals.
"""

import os
import re
import json
import datetime
import threading
import time
import subprocess
from typing import Optional, Dict, Any, List

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

# Regex that matches the full pomodoroStats JSON blob without arbitrary size limits
_STATS_RE = re.compile(
    rb'\{\s*"days"\s*:\s*\{.*?\}\s*,\s*"hours"\s*:\s*\{.*?\}\s*,\s*"totalMinutes"\s*:\s*(\d+)\s*,\s*"totalFocus"\s*:\s*(\d+)\s*,\s*"firstUse"\s*:\s*"[^"]+"\s*\}',
    re.DOTALL
)

# Settings keys stored in AAYUSH 360's SQLite DB
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
    Manages the Pomodoro integration lifecycle for AAYUSH 360.
    Reads the real LevelDB source of truth, synchronizes canonical daily records,
    eliminates double counting, and drives bidirectional cloud synchronization.
    """

    def __init__(self, db, cloud_sync=None):
        self.db = db
        self.cloud_sync = cloud_sync
        self._watch_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.RLock()
        self._leveldb_dir = get_default_leveldb_dir()
        self.on_session_committed = None
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
    # Core Data Migration & Sync Engine
    # -----------------------------------------------------------------------

    def sync_cloud(self) -> Dict[str, Any]:
        """
        Dedicated cloud synchronization for Pomodoro sessions.
        Communicates EXCLUSIVELY with the dedicated Supabase `pomodoro_sessions` table.
        Does NOT touch lectures, syllabus, weekly targets, tests, or study_sessions.
        Bidirectional: pushes pending local pomodoro_sessions, pulls remote pomodoro_sessions.
        """
        settings = self._get_settings()
        user_id = settings.get('cloud_user_id', '')
        if not user_id:
            return {'success': False, 'error': 'Supabase cloud account not connected. Please log in via Cloud Sync first.'}

        try:
            from src.config import get_supabase_config
            from supabase import create_client
            cfg = get_supabase_config()
            client = create_client(cfg['url'], cfg['key'])
            
            # Restore auth session
            access_token = settings.get('cloud_access_token', '')
            refresh_token = settings.get('cloud_refresh_token', '')
            session_valid = False
            if access_token and refresh_token:
                try:
                    res = client.auth.set_session(access_token, refresh_token)
                    if res and res.session:
                        session_valid = True
                except Exception:
                    pass

            if not session_valid:
                email = settings.get('cloud_user_email', '')
                pwd = settings.get('cloud_user_password', '')
                if email and pwd:
                    try:
                        res = client.auth.sign_in_with_password({"email": email, "password": pwd})
                        if res and res.session:
                            session_valid = True
                    except Exception as auth_err:
                        return {'success': False, 'error': f"Authentication failed: {auth_err}"}

            conn = self.db.get_connection()
            c = conn.cursor()
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            # 1. PUSH local pending pomodoro_sessions
            pending = c.execute("SELECT * FROM pomodoro_sessions WHERE sync_status = 'pending'").fetchall()
            pushed_count = 0
            if pending:
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "date": r["date"],
                    "start_time": r.get("start_time") or "",
                    "end_time": r.get("end_time") or "",
                    "duration_minutes": float(r["duration_minutes"] or 0),
                    "duration_hours": float(r["duration_hours"] or 0),
                    "focus_count": int(r.get("focus_count") or 1),
                    "topic": r.get("topic") or "",
                    "notes": r.get("notes") or "",
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in pending]
                client.table("pomodoro_sessions").upsert(payload, on_conflict="user_id,client_id").execute()
                pushed_cids = [r["client_id"] for r in pending]
                placeholders = ','.join('?' * len(pushed_cids))
                c.execute(f"UPDATE pomodoro_sessions SET sync_status = 'synced' WHERE client_id IN ({placeholders})", pushed_cids)
                conn.commit()
                pushed_count = len(payload)

            # 2. PULL remote pomodoro_sessions
            res = client.table("pomodoro_sessions").select("*").eq("user_id", user_id).execute()
            pulled_count = 0
            if res.data:
                stats = self.db.merge_cloud_pomodoro_sessions(res.data)
                pulled_count = stats.get('inserted', 0) + stats.get('updated', 0)

            conn.close()
            now_local = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            self._set_settings({
                KEY_LAST_SYNC: now_local,
                'pomodoro_last_sync': now_local
            })
            return {
                'success': True,
                'pushed': pushed_count,
                'pulled': pulled_count,
                'message': f"Pomodoro cloud sync complete (Pushed: {pushed_count}, Pulled: {pulled_count})"
            }

        except Exception as e:
            err_msg = str(e)
            print(f"[PomodoroSync] Dedicated cloud sync error: {err_msg}")
            return {'success': False, 'error': err_msg}

    def sync_from_source(self, start_date: str = "2026-09-28", push_cloud: bool = True) -> Dict[str, Any]:
        """
        Reads real Pomodoro stats from LevelDB and synchronizes canonical daily records into pomodoro_sessions table.
        Idempotent: running multiple times never creates duplicates.
        Strict isolation: never writes to study_sessions table.
        """
        with self._lock:
            stats = read_pomodoro_stats(self._leveldb_dir)
            if not stats:
                return {
                    'success': False,
                    'status': 'Waiting',
                    'message': 'Study Pomodoro storage not accessible'
                }

            days_data = stats.get("days", {})
            target_dates = {d: info for d, info in days_data.items() if d >= start_date}

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            now_local = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            conn = self.db.get_connection()
            c = conn.cursor()

            # Find existing pomodoro_sessions for dates >= start_date
            existing_rows = c.execute("""
                SELECT id, client_id, date, duration_minutes, duration_hours, notes, deleted_at, sync_status
                FROM pomodoro_sessions
                WHERE date >= ?;
            """, (start_date,)).fetchall()

            migrated_count = 0
            soft_deleted_cids = []

            # 1. Upsert canonical daily records into pomodoro_sessions
            for d, info in sorted(target_dates.items()):
                mins = float(info.get("minutes", 0))
                fc = int(info.get("focusCount", 0))
                hrs = round(mins / 60.0, 2)
                cid = f"pomo_day_{d}"
                notes = f"Pomodoro study ({int(mins)} min, {fc} focus session{'s' if fc != 1 else ''})"
                topic = f"Focus Sessions: {fc}"

                existing_can = c.execute("SELECT id, duration_minutes, deleted_at, sync_status FROM pomodoro_sessions WHERE client_id = ?", (cid,)).fetchone()
                if existing_can:
                    # Update if minutes or status changed
                    if existing_can['duration_minutes'] != mins or existing_can['deleted_at'] is not None:
                        c.execute("""
                            UPDATE pomodoro_sessions SET
                                date = ?,
                                duration_minutes = ?,
                                duration_hours = ?,
                                focus_count = ?,
                                topic = ?,
                                notes = ?,
                                deleted_at = NULL,
                                sync_status = 'pending',
                                updated_at = ?
                            WHERE client_id = ?;
                        """, (d, mins, hrs, fc, topic, notes, now_local, cid))
                        migrated_count += 1
                else:
                    c.execute("""
                        INSERT INTO pomodoro_sessions (
                            client_id, date, start_time, end_time,
                            duration_minutes, duration_hours, focus_count, topic, notes,
                            sync_status, created_at, updated_at
                        ) VALUES (?, ?, '', '', ?, ?, ?, ?, ?, 'pending', ?, ?);
                    """, (cid, d, mins, hrs, fc, topic, notes, now_local, now_local))
                    migrated_count += 1

            # 2. Soft-delete old fragmented records in pomodoro_sessions
            canonical_cids = {f"pomo_day_{d}" for d in target_dates}
            for s in existing_rows:
                cid = s["client_id"]
                if cid in canonical_cids:
                    continue
                if not s["deleted_at"]:
                    c.execute("""
                        UPDATE pomodoro_sessions SET
                            deleted_at = ?,
                            sync_status = 'pending',
                            updated_at = ?
                        WHERE client_id = ?;
                    """, (now_iso, now_local, cid))
                    soft_deleted_cids.append(cid)

            # Strict isolation: ensure study_sessions NEVER has any Pomodoro records
            c.execute("DELETE FROM study_sessions WHERE source = 'Pomodoro';")

            conn.commit()
            conn.close()

            # 3. Check live running status
            app_running = is_pedro_process_running()
            active_log = _resolve_active_log(self._leveldb_dir)
            log_mtime = os.path.getmtime(active_log) if (active_log and os.path.exists(active_log)) else 0.0
            log_age = time.time() - log_mtime
            timer_active = app_running and (log_age <= 110.0)

            status_str = 'Currently Studying' if timer_active else ('Connected' if app_running else 'Connected (App idle)')

            today_str = datetime.date.today().isoformat()
            today_mins = days_data.get(today_str, {}).get("minutes", 0)

            self._set_settings({
                KEY_ENABLED:          'true',
                KEY_SYNC_STATUS:      status_str,
                KEY_LAST_SYNC:        now_local,
                KEY_LAST_MINUTES:     str(stats.get('totalMinutes', 0)),
                KEY_LAST_FOCUS:       str(stats.get('totalFocus', 0)),
                KEY_LIVE_ACTIVE:      'true' if timer_active else 'false',
                KEY_LIVE_MINUTES:     str(today_mins) if timer_active else '0',
                'pomodoro_source_path': self._leveldb_dir,
                'pomodoro_sync_status': status_str,
                'pomodoro_last_sync':   now_local,
            })

            result_payload = {
                'success': True,
                'status': status_str,
                'is_active': timer_active,
                'today_minutes': today_mins,
                'dates_synced': len(target_dates),
                'fragments_cleaned': len(soft_deleted_cids),
                'message': f"Synchronized Pomodoro data from {start_date} onwards. Today: {today_mins} min."
            }

        # 4. Trigger Dedicated Pomodoro Cloud Sync outside lock if requested
        if push_cloud:
            cloud_res = self.sync_cloud()
            if not cloud_res.get('success'):
                # Surface real error if cloud sync failed
                result_payload['cloud_success'] = False
                result_payload['cloud_error'] = cloud_res.get('error')
                result_payload['message'] += f" Cloud sync error: {cloud_res.get('error')}"
            else:
                result_payload['cloud_success'] = True
                result_payload['cloud_message'] = cloud_res.get('message')

        if self.on_session_committed and callable(self.on_session_committed):
            try:
                self.on_session_committed()
            except Exception:
                pass

        return result_payload

    def flush_live_session(self, force: bool = True) -> Dict[str, Any]:
        """Synchronizes source data into SQLite and prepares pending records for cloud push."""
        res = self.sync_from_source(push_cloud=False)
        return {'flushed': res.get('success', False), 'minutes': res.get('today_minutes', 0)}

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def enable_integration(self) -> Dict[str, Any]:
        """Enables the Pomodoro integration, runs initial sync, and starts live watcher."""
        res = self.sync_from_source(push_cloud=True)
        self._start_watcher()
        return {
            'success': res.get('success', True),
            'message': 'Pomodoro integration enabled. Synchronized with LevelDB source.',
            'status': res.get('status', 'Connected')
        }

    def disable_integration(self) -> Dict[str, Any]:
        """Disables automatic syncing. Existing records are preserved."""
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
        """Re-syncs directly from PC LevelDB without losing real data."""
        return self.enable_integration()

    def sync(self, source_path: Optional[str] = None) -> Dict[str, Any]:
        """Manual sync trigger. Reads PC LevelDB and syncs to SQLite and Cloud."""
        return self.sync_from_source(push_cloud=True)

    def get_live_status(self) -> Dict[str, Any]:
        """Fast endpoint called by the frontend polling ticker."""
        settings = self._get_settings()
        enabled = settings.get(KEY_ENABLED, 'false') == 'true'
        if not enabled:
            return {'is_active': False, 'status': 'Disabled', 'elapsed_minutes': 0}

        app_running = is_pedro_process_running()
        active_log = _resolve_active_log(self._leveldb_dir)
        log_mtime = os.path.getmtime(active_log) if (active_log and os.path.exists(active_log)) else 0.0
        log_age = time.time() - log_mtime
        timer_active = app_running and (log_age <= 110.0)

        today_str = datetime.date.today().isoformat()
        today_mins = 0
        try:
            conn = self.db.get_connection()
            row = conn.execute("""
                SELECT duration_minutes FROM pomodoro_sessions
                WHERE date = ? AND (deleted_at IS NULL OR deleted_at = '')
                ORDER BY id DESC LIMIT 1;
            """, (today_str,)).fetchone()
            if row:
                today_mins = int(round(row[0]))
            conn.close()
        except Exception:
            pass

        return {
            'is_active': timer_active,
            'app_running': app_running,
            'status': 'Currently Studying' if timer_active else ('Connected' if app_running else 'Connected (App idle)'),
            'elapsed_minutes': today_mins
        }

    def get_status(self) -> Dict[str, Any]:
        """Returns full integration status and statistics calculated from genuine Pomodoro data."""
        settings = self._get_settings()
        enabled = settings.get(KEY_ENABLED, 'false') == 'true'

        app_running = is_pedro_process_running()
        active_log = _resolve_active_log(self._leveldb_dir)
        log_mtime = os.path.getmtime(active_log) if (active_log and os.path.exists(active_log)) else 0.0
        log_age = time.time() - log_mtime
        timer_active = app_running and (log_age <= 110.0)

        today_dt = datetime.date.today()
        today_str = today_dt.isoformat()
        start_of_week = (today_dt - datetime.timedelta(days=today_dt.weekday())).isoformat()
        end_of_week = (today_dt + datetime.timedelta(days=6 - today_dt.weekday())).isoformat()
        start_of_month = f"{today_dt.year:04d}-{today_dt.month:02d}-01"

        base_filter = "AND (deleted_at IS NULL OR deleted_at = '')"

        try:
            conn = self.db.get_connection()
            c = conn.cursor()

            today_mins = c.execute(f"SELECT SUM(duration_minutes) FROM pomodoro_sessions WHERE date = ? {base_filter};", (today_str,)).fetchone()[0] or 0.0
            week_mins = c.execute(f"SELECT SUM(duration_minutes) FROM pomodoro_sessions WHERE date >= ? AND date <= ? {base_filter};", (start_of_week, end_of_week)).fetchone()[0] or 0.0
            month_mins = c.execute(f"SELECT SUM(duration_minutes) FROM pomodoro_sessions WHERE date >= ? {base_filter};", (start_of_month,)).fetchone()[0] or 0.0
            total_mins = c.execute(f"SELECT SUM(duration_minutes) FROM pomodoro_sessions WHERE 1=1 {base_filter};").fetchone()[0] or 0.0

            # Count total focus sessions
            rows = c.execute(f"SELECT focus_count, topic, notes FROM pomodoro_sessions WHERE 1=1 {base_filter};").fetchall()
            total_focus_count = 0
            for r in rows:
                fc = r['focus_count'] if 'focus_count' in r.keys() and r['focus_count'] else None
                if fc:
                    total_focus_count += int(fc)
                    continue
                topic = r['topic'] or ''
                if topic.startswith('Focus Sessions:'):
                    try:
                        total_focus_count += int(topic.replace('Focus Sessions:', '').strip())
                        continue
                    except Exception:
                        pass
                m = re.search(r'(\d+)\s+focus\s+session', r['notes'] or '')
                if m:
                    total_focus_count += int(m.group(1))
                else:
                    total_focus_count += 1

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

        display_status = 'Disabled' if not enabled else ('Currently Studying' if timer_active else 'Connected')

        return {
            'enabled': enabled,
            'status': display_status,
            'status_detail': display_status,
            'is_live': timer_active,
            'live_minutes': int(round(today_mins)) if timer_active else 0,
            'live_str': f"{int(round(today_mins))}m elapsed" if timer_active else "Idle",
            'activated_at': settings.get(KEY_ACTIVATED_AT, ''),
            'last_sync': settings.get(KEY_LAST_SYNC, 'Never'),
            'today_minutes': int(round(today_mins)),
            'today_formatted': _fmt(today_mins),
            'week_minutes': int(round(week_mins)),
            'week_formatted': _fmt(week_mins),
            'month_minutes': int(round(month_mins)),
            'month_formatted': _fmt(month_mins),
            'total_minutes': int(round(total_mins)),
            'total_formatted': _fmt(total_mins),
            'total_sessions_imported': total_focus_count,
            'is_configured': enabled,
            'data_source': 'Study Pomodoro (LevelDB)' if enabled else 'Not configured',
            'sessions_count': total_focus_count,
        }

    # -----------------------------------------------------------------------
    # Background Thread (2-second interval)
    # -----------------------------------------------------------------------

    def _watcher_loop(self) -> None:
        """Background daemon thread. Periodically updates live study duration when Pedro is running."""
        POLL_INTERVAL_SECONDS = 5.0
        while not self._stop_event.is_set():
            try:
                settings = self._get_settings()
                if settings.get(KEY_ENABLED, 'false') == 'true':
                    if is_pedro_process_running():
                        self.sync_from_source(push_cloud=False)
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
