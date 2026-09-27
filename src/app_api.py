"""
AAYUSH 360 - Desktop Application Native API Bridge
Exposes Python methods directly to window.pywebview.api in JavaScript.
Supports full CRUD, smart renumbering, bulk operations, backups, and dedicated Study Analytics for Pomodoro sync.
"""

import os
import subprocess
import datetime
import calendar
from typing import Dict, Any, List, Optional
from src.database import DatabaseManager
from src.extractor import extract_all_planners
from src.backlog_manager import BacklogManager
from src.pomodoro_sync import PomodoroSyncEngine
from src.cloud_sync import CloudSyncEngine

class AppAPI:
    def __init__(self, db: DatabaseManager, base_dir: str):
        self.db = db
        self.base_dir = base_dir
        self.backlog_mgr = BacklogManager(db)
        self.pomodoro_sync = PomodoroSyncEngine(db)
        self.pomodoro_sync.start_watcher_if_enabled()
        self.cloud_sync = CloudSyncEngine(db)
        self.cloud_sync.start_background_sync()

    # ------------------ DASHBOARD & TODAY ------------------

    def get_dashboard_data(self, target_date: Optional[str] = None) -> Dict[str, Any]:
        """Returns comprehensive data for the greeting, streak, and overview dashboard."""
        return self.db.get_dashboard_summary(target_date)

    def get_today_tasks(self, target_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns all tasks for the Today Command Center."""
        summary = self.db.get_dashboard_summary(target_date)
        return summary['today_tasks']

    # ------------------ STUDY ANALYTICS & POMODORO INTEGRATION ------------------

    def get_study_analytics(self, time_filter: str = 'all_time', target_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns real study analytics calculated from synchronized study_sessions.
        Pomodoro time contributes to analytics ONLY.
        It NEVER marks lectures, DPPs, chapters, or subjects as completed.
        Lecture completion is exclusively manual.
        """
        return self.db.get_study_analytics(time_filter=time_filter, target_date=target_date)

    def get_comprehensive_analytics(self, time_filter: str = 'all') -> Dict[str, Any]:
        """Returns comprehensive JEE Command Center analytics across lectures, DPPs, targets, study time, and tests."""
        return self.db.get_comprehensive_analytics(time_filter)

    def get_pomodoro_integration_status(self) -> Dict[str, Any]:
        """Returns the full Pomodoro integration status including imported-since-activation stats."""
        return self.pomodoro_sync.get_status()

    def enable_pomodoro_integration(self) -> Dict[str, Any]:
        """
        Enables the integration with a fresh baseline.
        Records current Pomodoro totals as the starting point.
        Imports 0 minutes of historical data.
        NEVER modifies the Pomodoro app.
        """
        return self.pomodoro_sync.enable_integration()

    def disable_pomodoro_integration(self) -> Dict[str, Any]:
        """
        Disables automatic syncing.
        Keeps existing imported AAYUSH 360 records intact.
        NEVER modifies the Pomodoro app.
        """
        return self.pomodoro_sync.disable_integration()

    def reset_pomodoro_integration(self) -> Dict[str, Any]:
        """
        Resets ONLY the AAYUSH 360 integration baseline.
        Does NOT reset or modify the Pomodoro app.
        Does NOT delete existing AAYUSH 360 records.
        After reset, only activity after this moment is imported.
        """
        return self.pomodoro_sync.reset_integration()

    def sync_pomodoro_data(self) -> Dict[str, Any]:
        """
        Manual sync: computes and imports new Pomodoro activity since last sync.
        READ-ONLY: never writes to Pomodoro storage.
        NEVER marks lectures, DPPs, or chapters as completed.
        """
        return self.pomodoro_sync.sync()

    def get_live_session_status(self) -> Dict[str, Any]:
        """Returns the real-time live Pomodoro timer status."""
        return self.pomodoro_sync.get_live_status()

    def delete_study_session(self, session_id: int) -> Dict[str, Any]:
        """Deletes an individual imported study session from AAYUSH 360."""
        success = self.db.delete_study_session(session_id)
        return {'success': success}

    def set_pomodoro_source_path(self, path: str) -> Dict[str, Any]:
        """Legacy: path is now fixed to LevelDB dir. Enabling integration instead."""
        return self.enable_pomodoro_integration()

    def save_pomodoro_path(self, path: str) -> Dict[str, Any]:
        """Legacy alias for enable_pomodoro_integration."""
        result = self.enable_pomodoro_integration()
        result['message'] = result.get('message', 'Integration enabled.')
        return result

    def create_manual_backup(self, custom_name: Optional[str] = None) -> Dict[str, Any]:
        return self.db.create_manual_backup(custom_name)

    def export_full_database_json(self) -> Dict[str, Any]:
        return self.db.export_full_database_json()

    def reimport_planners_action(self, preserve: bool = True) -> Dict[str, Any]:
        try:
            data = extract_all_planners(self.base_dir)
            return self.db.import_planner_data(data, preserve_progress=preserve)
        except Exception as e:
            return {'success': False, 'error': str(e)}


    # ------------------ INDEPENDENT COMPLETION TOGGLES ------------------

    def toggle_lecture_completion(self, lecture_id: int) -> Dict[str, Any]:
        lec = self.db.get_lecture(lecture_id)
        if not lec:
            return {'success': False, 'error': 'Lecture not found'}
        new_val = 0 if lec['is_completed'] else 1
        res = self.db.update_lecture_field(lecture_id, 'is_completed', new_val)
        if new_val == 1:
            self._update_streak()
        return {'success': True, 'is_completed': new_val}

    def toggle_dpp_completion(self, lecture_id: int) -> Dict[str, Any]:
        lec = self.db.get_lecture(lecture_id)
        if not lec:
            return {'success': False, 'error': 'Lecture not found'}
        new_val = 0 if lec['is_dpp_completed'] else 1
        res = self.db.update_lecture_field(lecture_id, 'is_dpp_completed', new_val)
        return {'success': True, 'is_dpp_completed': new_val}

    def toggle_revision(self, lecture_id: int, stage: int) -> Dict[str, Any]:
        """Toggles revision checkpoint for a lecture using dedicated revisions architecture."""
        return self.db.toggle_revision(lecture_id, stage)

    def get_revisions(self, lecture_id: int) -> List[Dict[str, Any]]:
        """Returns all revision stages for a specific lecture."""
        return self.db.get_revisions(lecture_id)

    def add_revision_stage(self, lecture_id: int, scheduled_date: Optional[str] = None, notes: str = '') -> Dict[str, Any]:
        """Adds a new sequential revision stage (Revision 3, 4, etc.) for a lecture."""
        return self.db.add_revision_stage(lecture_id, scheduled_date, notes)

    # ------------------ LECTURE CRUD & EDITING ------------------

    def get_lectures(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self.db.get_lectures(filters or {})

    def get_lecture(self, lecture_id: int) -> Optional[Dict[str, Any]]:
        return self.db.get_lecture(lecture_id)

    def add_lecture(self, data: Dict[str, Any], auto_renumber_after: bool = False) -> Dict[str, Any]:
        return self.db.add_lecture(data, auto_renumber_after=auto_renumber_after)

    def add_dpp(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.db.add_dpp(data)

    def update_lecture(self, lecture_id: int, fields: Dict[str, Any], auto_renumber_shift: bool = False) -> Dict[str, Any]:
        return self.db.update_lecture(lecture_id, fields, auto_renumber_shift=auto_renumber_shift)

    def update_lecture_field(self, lecture_id: int, field: str, value: Any) -> Dict[str, Any]:
        return self.db.update_lecture_field(lecture_id, field, value)

    def delete_lecture(self, lecture_id: int, renumber_after: bool = False) -> Dict[str, Any]:
        return self.db.delete_lecture(lecture_id, renumber_after=renumber_after)

    def delete_dpp(self, lecture_id: int) -> Dict[str, Any]:
        return self.db.delete_dpp(lecture_id)

    def duplicate_lecture(self, lecture_id: int) -> Dict[str, Any]:
        return self.db.duplicate_lecture(lecture_id)

    def renumber_chapter(self, chapter_id: int, start_from: int = 1, sort_by: str = 'date') -> Dict[str, Any]:
        return self.db.renumber_chapter_lectures(chapter_id, start_from=start_from, sort_by=sort_by)

    def bulk_update_lectures(self, ids: List[int], operation: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self.db.bulk_update_lectures(ids, operation, payload)

    # ------------------ SUBJECTS & CHAPTERS ------------------

    def get_subjects_and_chapters(self) -> List[Dict[str, Any]]:
        return self.db.get_subjects_and_chapters()

    def add_chapter(self, subject_id: int, chapter_name: str, target_hours: float = 0.0) -> Dict[str, Any]:
        conn = self.db.get_connection()
        c = conn.cursor()
        try:
            c.execute("INSERT INTO chapters (subject_id, name, target_hours) VALUES (?, ?, ?);", (subject_id, chapter_name, target_hours))
            new_id = c.lastrowid
            conn.commit()
            return {'success': True, 'id': new_id}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            conn.close()

    # ------------------ WEEKLY TARGETS ------------------

    def get_weekly_targets(self, week_start: Optional[str] = None) -> Dict[str, Any]:
        """Returns weekly targets for the given week or current week."""
        return self.db.get_weekly_targets(week_start)

    def set_weekly_targets(self, week_start: str, targets: Dict[str, Any]) -> Dict[str, Any]:
        """Saves independent targets for week_start and validates non-negative values."""
        return self.db.set_weekly_targets(week_start, targets)

    # ------------------ CALENDAR DATA (PLANNED VS ACTUAL STUDY) ------------------

    def get_calendar_month(self, year: int, month: int) -> Dict[str, Any]:
        """
        Provides calendar grid days with planned lectures/dpps AND actual study time
        from synchronized external Pomodoro sessions.
        """
        num_days = calendar.monthrange(year, month)[1]
        start_date = f"{year:04d}-{month:02d}-01"
        end_date = f"{year:04d}-{month:02d}-{num_days:02d}"

        conn = self.db.get_connection()
        c = conn.cursor()
        
        # Planned lectures
        lecs = c.execute("""
        SELECT l.id, l.scheduled_date, l.rescheduled_date, l.lecture_no, l.lecture_name,
               l.is_completed, l.is_dpp_completed, l.is_backlog, s.name as subject_name, s.color as subject_color
        FROM lectures l
        JOIN subjects s ON l.subject_id = s.id
        WHERE ((l.scheduled_date >= ? AND l.scheduled_date <= ?)
            OR (l.rescheduled_date >= ? AND l.rescheduled_date <= ?))
          AND l.is_archived = 0;
        """, (start_date, end_date, start_date, end_date)).fetchall()

        # Tests
        tests = c.execute("""
        SELECT id, test_name, test_type, test_date, status, score, total_marks
        FROM tests
        WHERE test_date >= ? AND test_date <= ?;
        """, (start_date, end_date)).fetchall()

        # Actual study hours from synchronized study_sessions
        actual_sessions = c.execute("""
        SELECT date, SUM(duration_hours) as total_hours, SUM(duration_minutes) as total_minutes
        FROM study_sessions
        WHERE date >= ? AND date <= ?
        GROUP BY date;
        """, (start_date, end_date)).fetchall()
        actual_map = {r['date']: (r['total_hours'], r['total_minutes']) for r in actual_sessions}

        conn.close()

        days_map: Dict[str, Dict[str, Any]] = {}
        for d in range(1, num_days + 1):
            d_str = f"{year:04d}-{month:02d}-{d:02d}"
            act_hrs, act_mins = actual_map.get(d_str, (0.0, 0.0))
            
            # Format actual study display e.g. "7h 35m"
            hrs_part = int(act_mins // 60)
            mins_part = int(act_mins % 60)
            act_display = f"{hrs_part}h {mins_part}m" if act_mins > 0 else None

            days_map[d_str] = {
                'date': d_str,
                'day': d,
                'lectures': [],
                'tests': [],
                'planned_lectures_count': 0,
                'planned_dpps_count': 0,
                'actual_study_hours': round(act_hrs, 2),
                'actual_study_display': act_display
            }

        for l in lecs:
            d_sched = l['scheduled_date']
            d_resched = l['rescheduled_date']
            target_key = d_resched if (l['is_backlog'] and d_resched and d_resched in days_map) else d_sched
            if target_key in days_map:
                days_map[target_key]['lectures'].append(dict(l))
                days_map[target_key]['planned_lectures_count'] += 1
                days_map[target_key]['planned_dpps_count'] += 1

        for t in tests:
            t_date = t['test_date']
            if t_date in days_map:
                days_map[t_date]['tests'].append(dict(t))

        return {
            'year': year,
            'month': month,
            'days': list(days_map.values())
        }

    # ------------------ TESTS ------------------

    def get_tests(self) -> List[Dict[str, Any]]:
        return self.db.get_tests()

    def update_test(self, test_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        return self.db.update_test(test_id, data)

    def toggle_test_completion(self, test_id: int) -> Dict[str, Any]:
        """Toggles test status between completed and upcoming immediately on test day."""
        return self.db.toggle_test_completion(test_id)

    # ------------------ LOGS (STUDY HOURS & QUESTIONS) ------------------

    def log_study_hours(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self.db.log_study_hours(data)
        self._update_streak()
        return res

    def get_study_hours_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.db.get_study_hours_logs(limit)

    def log_question_practice(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self.db.log_question_practice(data)
        self._update_streak()
        return res

    def get_question_practice_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.db.get_question_practice_logs(limit)

    # ------------------ BACKLOG AUTOMATION ------------------

    def scan_and_redistribute_backlog(self, target_date: Optional[str] = None) -> Dict[str, Any]:
        today = target_date or datetime.date.today().isoformat()
        scan_res = self.backlog_mgr.scan_and_flag_backlog(today)
        redist_res = self.backlog_mgr.redistribute_backlog(today)
        return {
            'success': True,
            'total_backlog': scan_res['total_backlog'],
            'rescheduled_count': redist_res.get('rescheduled_count', 0),
            'message': redist_res.get('message', '')
        }

    # ------------------ BACKUPS & IMPORT/EXPORT ------------------

    def create_backup(self, custom_name: Optional[str] = None) -> Dict[str, Any]:
        return self.db.create_manual_backup(custom_name)

    def list_backups(self) -> List[Dict[str, Any]]:
        return self.db.list_backups()

    def restore_backup(self, backup_path: str) -> Dict[str, Any]:
        return self.db.restore_backup(backup_path)

    def reimport_planners(self, preserve_progress: bool = True) -> Dict[str, Any]:
        try:
            data = extract_all_planners(self.base_dir)
            return self.db.import_planner_data(data, preserve_progress=preserve_progress)
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def export_data(self) -> str:
        return self.db.export_full_database_json()

    # ------------------ SETTINGS ------------------

    def get_settings(self) -> Dict[str, str]:
        conn = self.db.get_connection()
        settings = dict(conn.execute("SELECT key, value FROM app_settings;").fetchall())
        conn.close()
        return settings

    def save_settings(self, settings: Dict[str, str]) -> Dict[str, Any]:
        conn = self.db.get_connection()
        c = conn.cursor()
        for k, v in settings.items():
            c.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);", (k, str(v)))
        conn.commit()
        conn.close()
        return {'success': True}

    # ------------------ SUPABASE CLOUD SYNC METHODS ------------------

    def cloud_sign_up(self, email: str, password: str) -> Dict[str, Any]:
        """Registers a new account in Supabase."""
        return self.cloud_sync.sign_up(email, password)

    def cloud_sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """Logs into Supabase account."""
        return self.cloud_sync.sign_in(email, password)

    def cloud_sign_out(self) -> Dict[str, Any]:
        """Logs out from Cloud Sync."""
        return self.cloud_sync.sign_out()

    def get_cloud_sync_status(self) -> Dict[str, Any]:
        """Returns the current Cloud Sync status."""
        return self.cloud_sync.get_status()

    def cloud_sync_now(self) -> Dict[str, Any]:
        """Triggers an immediate bidirectional sync."""
        return self.cloud_sync.sync_now()

    def get_mobile_pairing_payload(self) -> Dict[str, Any]:
        """Generates a secure pairing payload for linking the Android mobile app."""
        import base64
        token = self.cloud_sync._get_setting('cloud_access_token')
        rtoken = self.cloud_sync._get_setting('cloud_refresh_token')
        uid = self.cloud_sync._get_setting('cloud_user_id')
        email = self.cloud_sync._get_setting('cloud_user_email')
        
        if not token or not rtoken or not uid:
            return {'success': False, 'error': 'Windows app is not logged into Cloud Sync yet.'}
            
        payload = json.dumps({
            "access_token": token,
            "refresh_token": rtoken,
            "user_id": uid,
            "email": email
        })
        encoded = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
        return {
            'success': True,
            'pairing_payload': encoded,
            'email': email,
            'user_id': uid
        }

    def _update_streak(self):
        today = datetime.date.today().isoformat()
        conn = self.db.get_connection()
        c = conn.cursor()
        settings = dict(c.execute("SELECT key, value FROM app_settings;").fetchall())
        last_active = settings.get('last_active_date', today)
        current_streak = int(settings.get('current_streak', 1))
        
        last_dt = datetime.date.fromisoformat(last_active)
        today_dt = datetime.date.today()
        diff = (today_dt - last_dt).days
        
        if diff == 1:
            current_streak += 1
        elif diff > 1:
            current_streak = 1
            
        c.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_active_date', ?);", (today,))
        c.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('current_streak', ?);", (str(current_streak),))
        conn.commit()
        conn.close()

if __name__ == '__main__':
    from src.database import DatabaseManager
    db = DatabaseManager('scratch/test_db')
    api = AppAPI(db, '.')
    status = api.get_pomodoro_integration_status()
    print("Pomodoro integration status:", status)
    analytics = api.get_study_analytics()
    print("Study analytics has_data:", analytics['has_data'])
