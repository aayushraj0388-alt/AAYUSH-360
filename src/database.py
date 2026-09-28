"""
AAYUSH 360 - High Performance Local Database & Data Management Engine
Handles SQLite storage, migrations, automated backups, progress-preserving re-imports,
deep individual/bulk lecture editing, and dedicated Study Sessions & Analytics for external Pomodoro sync.
"""

import os
import sqlite3
import datetime
import calendar
import json
import shutil
import uuid
from typing import List, Dict, Any, Optional

def format_duration_str(hours: float) -> str:
    total_mins = int(round(hours * 60))
    if total_mins <= 0:
        return "0h"
    h = total_mins // 60
    m = total_mins % 60
    if h > 0 and m > 0:
        return f"{h}h {m}m"
    elif h > 0:
        return f"{h}h"
    else:
        return f"{m}m"

def format_minutes_str(mins: float) -> str:
    total_mins = int(round(mins))
    if total_mins <= 0:
        return "0m"
    h = total_mins // 60
    m = total_mins % 60
    if h > 0 and m > 0:
        return f"{h}h {m}m"
    elif h > 0:
        return f"{h}h"
    else:
        return f"{m}m"

DEFAULT_APP_DATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'Aayush360')

class DatabaseManager:
    def __init__(self, db_dir: Optional[str] = None):
        self.base_dir = db_dir or DEFAULT_APP_DATA_DIR
        self.backup_dir = os.path.join(self.base_dir, 'backups')
        self.db_path = os.path.join(self.base_dir, 'aayush360.db')
        
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)
        
        self._init_db()
        self.ensure_sync_columns()
        self.create_automatic_backup()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def _init_db(self):
        """Initializes tables, indexes, and default settings."""
        conn = self.get_connection()
        c = conn.cursor()
        
        # 1. Subjects table
        c.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            color TEXT NOT NULL,
            resource_name TEXT NOT NULL,
            weekly_target_val REAL NOT NULL,
            target_type TEXT NOT NULL, -- 'lectures' or 'hours'
            sort_order INTEGER DEFAULT 0
        );
        """)

        # 2. Chapters table
        c.execute("""
        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sequence_no INTEGER DEFAULT 0,
            target_hours REAL DEFAULT 0,
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
            UNIQUE(subject_id, name)
        );
        """)

        # 3. Lectures table
        c.execute("""
        CREATE TABLE IF NOT EXISTS lectures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            chapter_id INTEGER NOT NULL,
            batch TEXT DEFAULT '',
            lecture_no INTEGER NOT NULL,
            lecture_name TEXT NOT NULL,
            topic TEXT DEFAULT '',
            dpp_no INTEGER NOT NULL,
            resource TEXT DEFAULT '',
            scheduled_date TEXT NOT NULL,
            rescheduled_date TEXT,
            faculty TEXT DEFAULT '',
            is_completed INTEGER DEFAULT 0,
            completed_at TEXT,
            is_dpp_completed INTEGER DEFAULT 0,
            dpp_completed_at TEXT,
            questions_practiced INTEGER DEFAULT 0,
            questions_correct INTEGER DEFAULT 0,
            questions_incorrect INTEGER DEFAULT 0,
            accuracy REAL DEFAULT 0,
            revision1_done INTEGER DEFAULT 0,
            revision1_date TEXT,
            revision2_done INTEGER DEFAULT 0,
            revision2_date TEXT,
            is_backlog INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            is_archived INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
        );
        """)

        # 4. Tests table
        c.execute("""
        CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_no INTEGER DEFAULT 1,
            test_name TEXT NOT NULL,
            test_type TEXT NOT NULL,
            test_date TEXT NOT NULL,
            physics_syllabus TEXT DEFAULT '',
            chemistry_syllabus TEXT DEFAULT '',
            maths_syllabus TEXT DEFAULT '',
            status TEXT DEFAULT 'upcoming', -- 'upcoming', 'completed', 'missed'
            score REAL DEFAULT 0,
            total_marks REAL DEFAULT 300,
            questions_correct INTEGER DEFAULT 0,
            questions_incorrect INTEGER DEFAULT 0,
            accuracy REAL DEFAULT 0,
            time_taken_minutes INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
        """)

        # 5. Question Practice Logs
        c.execute("""
        CREATE TABLE IF NOT EXISTS question_practice_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            subject_id INTEGER NOT NULL,
            chapter_id INTEGER,
            lecture_id INTEGER,
            questions_practiced INTEGER NOT NULL,
            correct INTEGER DEFAULT 0,
            incorrect INTEGER DEFAULT 0,
            accuracy REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE SET NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE SET NULL
        );
        """)

        # 6. Study Hour Logs (Legacy / Quick logs)
        c.execute("""
        CREATE TABLE IF NOT EXISTS study_hour_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            subject_id INTEGER NOT NULL,
            chapter_id INTEGER,
            hours REAL NOT NULL,
            activity_type TEXT DEFAULT 'Study',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE SET NULL
        );
        """)

        # 7. Dedicated Study Sessions Table for External Pomodoro Integration
        # Uses composite UNIQUE(source, external_session_id) so identical IDs from different sources cannot conflict
        c.execute("""
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT DEFAULT 'Pomodoro', -- 'Pomodoro', 'External', etc.
            external_session_id TEXT,
            date TEXT NOT NULL,            -- YYYY-MM-DD
            start_time TEXT,               -- HH:MM:SS or ISO
            end_time TEXT,                 -- HH:MM:SS or ISO
            duration_minutes REAL NOT NULL,
            duration_hours REAL NOT NULL,
            subject TEXT DEFAULT '',
            chapter TEXT DEFAULT '',
            topic TEXT DEFAULT '',
            activity TEXT DEFAULT 'Other', -- 'Lecture', 'DPP', 'Questions', 'Revision', 'Tests', 'Other'
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            UNIQUE(source, external_session_id)
        );
        """)

        # Migration: Ensure existing study_sessions table has composite unique constraint
        c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='study_sessions';")
        study_table_info = c.fetchone()
        if study_table_info and 'external_session_id TEXT UNIQUE' in study_table_info[0]:
            c.execute("""
            CREATE TABLE IF NOT EXISTS study_sessions_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT DEFAULT 'Pomodoro',
                external_session_id TEXT,
                date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                duration_minutes REAL NOT NULL,
                duration_hours REAL NOT NULL,
                subject TEXT DEFAULT '',
                chapter TEXT DEFAULT '',
                topic TEXT DEFAULT '',
                activity TEXT DEFAULT 'Other',
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime')),
                UNIQUE(source, external_session_id)
            );
            """)
            c.execute("""
            INSERT OR IGNORE INTO study_sessions_v2 (
                id, source, external_session_id, date, start_time, end_time,
                duration_minutes, duration_hours, subject, chapter, topic, activity, notes, created_at, updated_at
            )
            SELECT id, source, external_session_id, date, start_time, end_time,
                   duration_minutes, duration_hours, subject, chapter, topic, activity, notes, created_at, updated_at
            FROM study_sessions;
            """)
            c.execute("DROP TABLE study_sessions;")
            c.execute("ALTER TABLE study_sessions_v2 RENAME TO study_sessions;")

        # 8. Revisions Table (Dedicated architecture for unlimited revision stages)
        c.execute("""
        CREATE TABLE IF NOT EXISTS revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lecture_id INTEGER NOT NULL,
            stage_no INTEGER NOT NULL, -- 1, 2, 3, 4, ...
            is_completed INTEGER DEFAULT 0,
            completed_at TEXT,
            scheduled_date TEXT,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (lecture_id) REFERENCES lectures (id) ON DELETE CASCADE,
            UNIQUE(lecture_id, stage_no)
        );
        """)

        # 9. App Settings
        c.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)

        # 10. Backup History
        c.execute("""
        CREATE TABLE IF NOT EXISTS backup_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            file_path TEXT NOT NULL,
            backup_type TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            status TEXT DEFAULT 'success'
        );
        """)

        # 11. Weekly Targets Table (Per-week, per-subject independent targets)
        c.execute("""
        CREATE TABLE IF NOT EXISTS weekly_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_start TEXT NOT NULL, -- Monday of week: YYYY-MM-DD
            subject_id INTEGER NOT NULL,
            target_value REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
            UNIQUE(week_start, subject_id)
        );
        """)

        # Indexes for ultra-fast queries
        c.execute("CREATE INDEX IF NOT EXISTS idx_lectures_date ON lectures(scheduled_date);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_lectures_subject_chapter ON lectures(subject_id, chapter_id);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_lectures_completed ON lectures(is_completed);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_lectures_dpp_completed ON lectures(is_dpp_completed);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_tests_date ON tests(test_date);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_subject ON study_sessions(subject);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_activity ON study_sessions(activity);")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_study_sessions_source_ext ON study_sessions(source, external_session_id);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_revisions_lecture ON revisions(lecture_id);")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_targets_week_subject ON weekly_targets(week_start, subject_id);")

        # Migration: Ensure test_no column exists in tests table
        c.execute("PRAGMA table_info(tests);")
        test_cols = [r[1] for r in c.fetchall()]
        if 'test_no' not in test_cols:
            c.execute("ALTER TABLE tests ADD COLUMN test_no INTEGER DEFAULT 1;")

        # Seed default subjects if empty
        c.execute("SELECT COUNT(*) FROM subjects;")
        if c.fetchone()[0] == 0:
            default_subjects = [
                ('Physics', 'Physics', '#3B82F6', 'PW 1.0', 16, 'lectures', 1),
                ('Mathematics', 'Mathematics', '#10B981', 'Mission 100', 5, 'lectures', 2),
                ('Physical Chemistry', 'Physical Chemistry', '#F59E0B', 'One Shot lectures', 7, 'hours', 3),
                ('Inorganic Chemistry', 'Inorganic Chemistry', '#8B5CF6', 'Prayas 2.0', 4, 'lectures', 4),
                ('Organic Chemistry', 'Organic Chemistry', '#F43F5E', 'Prayas 2.0', 6, 'lectures', 5),
            ]
            c.executemany("""
            INSERT INTO subjects (name, display_name, color, resource_name, weekly_target_val, target_type, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """, default_subjects)

        # Seed default settings
        defaults = {
            'user_name': 'Aayush',
            'theme': 'dark',
            'pomodoro_source_path': '',
            'pomodoro_sync_status': 'Not configured',
            'pomodoro_last_sync': 'Never',
            'last_active_date': datetime.date.today().isoformat(),
            'current_streak': '1',
            'auto_backups_enabled': 'true',
            'max_backups_keep': '10'
        }
        for k, v in defaults.items():
            c.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?);", (k, v))

        conn.commit()
        conn.close()

    def set_setting(self, key: str, value: Any) -> None:
        conn = self.get_connection()
        conn.execute("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", (key, str(value)))
        conn.commit()
        conn.close()

    def get_settings(self) -> Dict[str, str]:
        conn = self.get_connection()
        rows = conn.execute("SELECT key, value FROM app_settings;").fetchall()
        conn.close()
        return {r['key']: r['value'] for r in rows}

    # ------------------ STUDY SESSIONS & ANALYTICS (EXTERNAL POMODORO READY) ------------------

    def insert_study_session(self, session: Dict[str, Any]) -> bool:
        """
        Inserts or ignores a study session based on external_session_id.
        Guarantees that repeated synchronizations never duplicate sessions.
        """
        ext_id = session.get('external_session_id')
        dur_mins = float(session.get('duration_minutes', 0))
        if dur_mins <= 0 and 'duration_seconds' in session:
            dur_mins = round(float(session['duration_seconds']) / 60.0, 2)
        dur_hrs = round(dur_mins / 60.0, 2)

        source = session.get('source', 'Pomodoro')
        conn = self.get_connection()
        c = conn.cursor()
        try:
            c.execute("""
            INSERT INTO study_sessions (
                client_id, source, external_session_id, date, start_time, end_time,
                duration_minutes, duration_hours, subject, chapter, topic, activity, notes, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(source, external_session_id) DO UPDATE SET
                date = excluded.date,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                duration_minutes = excluded.duration_minutes,
                duration_hours = excluded.duration_hours,
                subject = excluded.subject,
                chapter = excluded.chapter,
                topic = excluded.topic,
                activity = excluded.activity,
                notes = excluded.notes,
                sync_status = 'pending',
                updated_at = datetime('now', 'localtime');
            """, (
                str(uuid.uuid4()),
                source,
                ext_id,
                session.get('date', datetime.date.today().isoformat()),
                session.get('start_time', ''),
                session.get('end_time', ''),
                dur_mins,
                dur_hrs,
                session.get('subject', ''),
                session.get('chapter', ''),
                session.get('topic', ''),
                session.get('activity', 'Other'),
                session.get('notes', '')
            ))
            conn.commit()
            return True
        except Exception as e:
            print("Error inserting study session:", e)
            return False
        finally:
            conn.close()

    def delete_study_session(self, session_id: int) -> bool:
        """Deletes an individual study session from AAYUSH 360."""
        try:
            conn = self.get_connection()
            conn.execute("DELETE FROM study_sessions WHERE id = ?;", (session_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print("Error deleting study session:", e)
            return False

    def get_study_analytics(self, time_filter: str = 'all_time', target_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculates study analytics exclusively from actual study_sessions.
        If no sessions exist, returns clean zeros and empty structures (NO fake data).
        """
        today_str = target_date or datetime.date.today().isoformat()
        today = datetime.date.fromisoformat(today_str)

        # Date boundaries
        start_of_week = (today - datetime.timedelta(days=today.weekday())).isoformat()
        end_of_week = (today + datetime.timedelta(days=6 - today.weekday())).isoformat()
        start_of_last_week = (today - datetime.timedelta(days=today.weekday() + 7)).isoformat()
        end_of_last_week = (today - datetime.timedelta(days=today.weekday() + 1)).isoformat()

        last_day_this_month = calendar.monthrange(today.year, today.month)[1]
        start_of_month = f"{today.year:04d}-{today.month:02d}-01"
        end_of_month = f"{today.year:04d}-{today.month:02d}-{last_day_this_month:02d}"

        prev_month_year = today.year if today.month > 1 else today.year - 1
        prev_month_num = today.month - 1 if today.month > 1 else 12
        last_day_prev_month = calendar.monthrange(prev_month_year, prev_month_num)[1]
        start_of_last_month = f"{prev_month_year:04d}-{prev_month_num:02d}-01"
        end_of_last_month = f"{prev_month_year:04d}-{prev_month_num:02d}-{last_day_prev_month:02d}"

        conn = self.get_connection()
        c = conn.cursor()

        # Check total sessions count
        total_sessions = c.execute("SELECT COUNT(*) FROM study_sessions;").fetchone()[0] or 0

        settings = dict(c.execute("SELECT key, value FROM app_settings;").fetchall())
        is_enabled = settings.get('pomo_integration_enabled') == 'true'
        pomo_path = settings.get('pomodoro_source_path', '').strip()
        is_configured = is_enabled or bool(pomo_path and pomo_path != 'Not configured')
        pomo_src = 'Study Pomodoro (LevelDB)' if is_configured else 'Not configured'
        pomo_status = settings.get('pomo_sync_status', settings.get('pomodoro_sync_status', 'Connected' if is_configured else 'Not configured'))
        if not is_configured:
            pomo_status = 'Not configured'
        pomo_last_sync = settings.get('pomo_last_sync', settings.get('pomodoro_last_sync', 'Never'))

        # Check if there is an active live Pomodoro session
        live_active = settings.get('pomo_live_active') == 'true'
        live_mins = int(settings.get('pomo_live_minutes', '0')) if live_active else 0
        live_hrs = round(live_mins / 60.0, 2)

        # Clean empty state when no sessions recorded yet and no live session active
        if total_sessions == 0 and live_mins == 0:
            conn.close()
            return {
                'has_data': False,
                'is_configured': is_configured,
                'pomodoro_status': pomo_status,
                'pomodoro_data_source': pomo_src,
                'pomodoro_last_sync': pomo_last_sync,
                'live_session': {
                    'is_active': False,
                    'elapsed_minutes': 0,
                    'elapsed_str': '0m',
                    'status': 'Idle'
                },
                'today_summary': {
                    'hours': 0.0,
                    'total_hours': 0.0,
                    'formatted': '0h',
                    'duration_str': '0h',
                    'sessions': 0,
                    'studied_status': 'Not studied yet today',
                    'avg_duration': '0m'
                },
                'week_summary': {
                    'hours': 0.0,
                    'total_hours': 0.0,
                    'formatted': '0h',
                    'duration_str': '0h',
                    'days_studied': 0,
                    'avg_per_studied_day': '0h',
                    'sessions': 0
                },
                'month_summary': {
                    'hours': 0.0,
                    'total_hours': 0.0,
                    'formatted': '0h',
                    'duration_str': '0h',
                    'days_studied': 0,
                    'avg_per_studied_day': '0h',
                    'sessions': 0
                },
                'total_summary': {
                    'hours': 0.0,
                    'total_hours': 0.0,
                    'formatted': '0h',
                    'duration_str': '0h',
                    'sessions': 0,
                    'days_studied': 0,
                    'avg_per_studied_day': '0h'
                },
                'today_hours': 0.0,
                'today_formatted': '0h',
                'today_sessions': 0,
                'week_hours': 0.0,
                'week_formatted': '0h',
                'week_sessions': 0,
                'month_hours': 0.0,
                'month_formatted': '0h',
                'month_sessions': 0,
                'total_hours': 0.0,
                'total_formatted': '0h',
                'average_daily_hours': 0.0,
                'current_streak': 0,
                'longest_streak': 0,
                'days_studied': 0,
                'days_without_study': 0,
                'weekly_consistency_pct': 0.0,
                'monthly_consistency_pct': 0.0,
                'subject_hours': {},
                'subject_breakdown': [],
                'has_subject_data': False,
                'activity_hours': {},
                'activity_breakdown': [],
                'consistency': {
                    'days_studied': 0,
                    'days_without_study': 0,
                    'current_streak': 0,
                    'longest_streak': 0,
                    'weekly_consistency_pct': 0.0,
                    'monthly_consistency_pct': 0.0,
                    'heatmap_matrix': [],
                    'matrix_28_days': []
                },
                'today_breakdown': {'hours': 0.0, 'formatted': '0h', 'sessions': 0, 'avg_duration': '0m', 'subjects': [], 'activities': []},
                'week_breakdown': {'hours': 0.0, 'formatted': '0h', 'days_studied': 0, 'avg_hours_per_day': '0h', 'sessions': 0, 'daily_breakdown': []},
                'month_breakdown': {'hours': 0.0, 'formatted': '0h', 'days_studied': 0, 'sessions': 0, 'avg_per_studied_day': '0h', 'chart_points': []},
                'filter_data': {'hours': 0.0, 'formatted': '0h', 'sessions': 0, 'days_studied': 0, 'avg_per_studied_day': '0h', 'chart_type': 'bar', 'chart_labels': [], 'chart_values': []},
                'filtered_data': {
                    'filter': time_filter,
                    'hours': 0.0,
                    'formatted': '0h',
                    'sessions': 0,
                    'days_studied': 0,
                    'avg_per_studied_day': '0h',
                    'subject_breakdown': [],
                    'has_subject_data': False,
                    'activity_breakdown': [],
                    'has_activity_data': False,
                    'chart_type': 'bar',
                    'chart_labels': [],
                    'chart_values': []
                },
                'daily_study_trend': [],
                'weekly_study_trend': [],
                'monthly_study_trend': [],
                'heatmap_matrix': [],
                'recent_sessions': []
            }

        # Calculations from REAL session data
        # 1. Today
        today_hrs_raw = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (today_str,)).fetchone()[0] or 0.0
        today_mins_raw = c.execute("SELECT SUM(duration_minutes) FROM study_sessions WHERE date = ?;", (today_str,)).fetchone()[0] or 0.0
        today_sessions = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date = ?;", (today_str,)).fetchone()[0] or 0

        today_hrs = round(today_hrs_raw + live_hrs, 2)
        today_mins = round(today_mins_raw + live_mins, 2)
        today_avg_dur = round(today_mins / (today_sessions + (1 if live_active else 0))) if (today_sessions > 0 or live_active) else 0
        today_status = "Currently studying" if live_active else ("Studied today" if today_sessions > 0 else "Not studied yet today")

        # 2. Week
        week_hrs_raw = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_week, end_of_week)).fetchone()[0] or 0.0
        week_hrs = round(week_hrs_raw + live_hrs, 2)
        week_sessions = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_week, end_of_week)).fetchone()[0] or 0
        week_dates_studied = [r[0] for r in c.execute("SELECT DISTINCT date FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_week, end_of_week)).fetchall()]
        if live_active and today_str not in week_dates_studied:
            week_dates_studied.append(today_str)
        week_days_studied = len(week_dates_studied)
        week_avg_per_day = round(week_hrs / week_days_studied, 2) if week_days_studied > 0 else 0.0

        # 3. Month
        month_hrs_raw = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_month, end_of_month)).fetchone()[0] or 0.0
        month_hrs = round(month_hrs_raw + live_hrs, 2)
        month_sessions = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_month, end_of_month)).fetchone()[0] or 0
        month_dates_studied = [r[0] for r in c.execute("SELECT DISTINCT date FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_month, end_of_month)).fetchall()]
        if live_active and today_str not in month_dates_studied:
            month_dates_studied.append(today_str)
        month_days_studied = len(month_dates_studied)
        month_avg_per_day = round(month_hrs / month_days_studied, 2) if month_days_studied > 0 else 0.0

        # 4. Total
        total_hrs_raw = c.execute("SELECT SUM(duration_hours) FROM study_sessions;").fetchone()[0] or 0.0
        total_hrs = round(total_hrs_raw + live_hrs, 2)
        studied_dates = [r[0] for r in c.execute("SELECT DISTINCT date FROM study_sessions ORDER BY date ASC;").fetchall()]
        if live_active and today_str not in studied_dates:
            studied_dates.append(today_str)
        days_studied = len(studied_dates)
        avg_daily = round(total_hrs / days_studied, 2) if days_studied > 0 else 0.0

        # 5. Streak and consistency
        current_streak = 0
        longest_streak = 0
        days_without_study = 0
        if studied_dates:
            date_set = set(studied_dates)
            first_date = datetime.date.fromisoformat(studied_dates[0])
            total_days_span = (today - first_date).days + 1
            days_without_study = max(0, total_days_span - days_studied)

            # Current streak (today or yesterday)
            check_date = today
            while check_date.isoformat() in date_set:
                current_streak += 1
                check_date -= datetime.timedelta(days=1)
            if current_streak == 0:
                check_date = today - datetime.timedelta(days=1)
                while check_date.isoformat() in date_set:
                    current_streak += 1
                    check_date -= datetime.timedelta(days=1)

            # Longest streak
            curr_run = 0
            sorted_dates = sorted([datetime.date.fromisoformat(d) for d in studied_dates])
            for i in range(len(sorted_dates)):
                if i == 0 or (sorted_dates[i] - sorted_dates[i-1]).days == 1:
                    curr_run += 1
                else:
                    curr_run = 1
                if curr_run > longest_streak:
                    longest_streak = curr_run

        week_days_elapsed = today.weekday() + 1
        weekly_consistency_pct = round((week_days_studied / week_days_elapsed) * 100, 1) if week_days_elapsed > 0 else 0.0
        month_days_elapsed = today.day
        monthly_consistency_pct = round((month_days_studied / month_days_elapsed) * 100, 1) if month_days_elapsed > 0 else 0.0

        # 6. Heatmap Matrix (last 28 days ending today)
        heatmap_matrix = []
        for d in range(27, -1, -1):
            dt_obj = today - datetime.timedelta(days=d)
            dt = dt_obj.isoformat()
            h = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (dt,)).fetchone()[0] or 0.0
            sess_cnt = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date = ?;", (dt,)).fetchone()[0] or 0
            lvl = 0
            if h > 0:
                if h < 2.0: lvl = 1
                elif h < 4.0: lvl = 2
                elif h < 6.0: lvl = 3
                else: lvl = 4
            heatmap_matrix.append({
                'date': dt,
                'day_name': dt_obj.strftime('%a').upper(),
                'hours': round(h, 2),
                'formatted': format_duration_str(h),
                'sessions': sess_cnt,
                'level': lvl
            })

        # 7. Today Breakdown
        today_subjs_raw = c.execute("""
        SELECT subject, SUM(duration_hours) as h, COUNT(*) as c
        FROM study_sessions WHERE date = ? AND subject != ''
        GROUP BY subject ORDER BY h DESC;
        """, (today_str,)).fetchall()
        today_subjects = [{
            'subject': r['subject'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / today_hrs) * 100, 1) if today_hrs > 0 else 0.0
        } for r in today_subjs_raw]

        today_acts_raw = c.execute("""
        SELECT activity, SUM(duration_hours) as h, COUNT(*) as c
        FROM study_sessions WHERE date = ? AND activity != ''
        GROUP BY activity ORDER BY h DESC;
        """, (today_str,)).fetchall()
        today_activities = [{
            'activity': r['activity'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / today_hrs) * 100, 1) if today_hrs > 0 else 0.0
        } for r in today_acts_raw]

        # 8. Week Breakdown (Mon to Sun)
        mon_dt = datetime.date.fromisoformat(start_of_week)
        day_abbrs = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
        week_daily_breakdown = []
        for i in range(7):
            d_dt = mon_dt + datetime.timedelta(days=i)
            d_str = d_dt.isoformat()
            dh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (d_str,)).fetchone()[0] or 0.0
            ds = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date = ?;", (d_str,)).fetchone()[0] or 0
            week_daily_breakdown.append({
                'day_name': day_abbrs[i],
                'date': d_str,
                'hours': round(dh, 2),
                'formatted': format_duration_str(dh),
                'sessions': ds,
                'is_today': d_str == today_str
            })

        week_subjs_raw = c.execute("""
        SELECT subject, SUM(duration_hours) as h, COUNT(*) as c
        FROM study_sessions WHERE date >= ? AND date <= ? AND subject != ''
        GROUP BY subject ORDER BY h DESC;
        """, (start_of_week, end_of_week)).fetchall()
        week_subjects = [{
            'subject': r['subject'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / week_hrs) * 100, 1) if week_hrs > 0 else 0.0
        } for r in week_subjs_raw]

        # 9. Month Breakdown
        month_daily_points = []
        for d in range(1, last_day_this_month + 1):
            d_str = f"{today.year:04d}-{today.month:02d}-{d:02d}"
            dh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (d_str,)).fetchone()[0] or 0.0
            ds = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date = ?;", (d_str,)).fetchone()[0] or 0
            month_daily_points.append({
                'date': d_str,
                'day': d,
                'hours': round(dh, 2),
                'formatted': format_duration_str(dh),
                'sessions': ds
            })

        month_subjs_raw = c.execute("""
        SELECT subject, SUM(duration_hours) as h, COUNT(*) as c
        FROM study_sessions WHERE date >= ? AND date <= ? AND subject != ''
        GROUP BY subject ORDER BY h DESC;
        """, (start_of_month, end_of_month)).fetchall()
        month_subjects = [{
            'subject': r['subject'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / month_hrs) * 100, 1) if month_hrs > 0 else 0.0
        } for r in month_subjs_raw]

        # 10. Filtered Data calculation
        tf = time_filter.lower().replace('-', '_').strip()
        f_start = None
        f_end = None
        chart_type = 'bar'

        if tf in ('today',):
            f_start = today_str
            f_end = today_str
            chart_type = 'bar'
        elif tf in ('this_week', 'week'):
            f_start = start_of_week
            f_end = end_of_week
            chart_type = 'bar'
        elif tf in ('last_week',):
            f_start = start_of_last_week
            f_end = end_of_last_week
            chart_type = 'bar'
        elif tf in ('this_month', 'month'):
            f_start = start_of_month
            f_end = end_of_month
            chart_type = 'bar'
        elif tf in ('last_month',):
            f_start = start_of_last_month
            f_end = end_of_last_month
            chart_type = 'bar'
        elif tf in ('last_4_weeks', '4_weeks'):
            f_start = (today - datetime.timedelta(days=27)).isoformat()
            f_end = today_str
            chart_type = 'line'
        elif tf in ('last_8_weeks', '8_weeks'):
            f_start = (today - datetime.timedelta(days=55)).isoformat()
            f_end = today_str
            chart_type = 'line'
        elif tf in ('last_12_weeks', '12_weeks'):
            f_start = (today - datetime.timedelta(days=83)).isoformat()
            f_end = today_str
            chart_type = 'line'
        else:
            tf = 'all_time'
            f_start = None
            f_end = None
            chart_type = 'line'

        if f_start and f_end:
            f_hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (f_start, f_end)).fetchone()[0] or 0.0
            f_sessions = c.execute("SELECT COUNT(*) FROM study_sessions WHERE date >= ? AND date <= ?;", (f_start, f_end)).fetchone()[0] or 0
            f_dates = [r[0] for r in c.execute("SELECT DISTINCT date FROM study_sessions WHERE date >= ? AND date <= ?;", (f_start, f_end)).fetchall()]
            f_subjs_raw = c.execute("SELECT subject, SUM(duration_hours) as h, COUNT(*) as c FROM study_sessions WHERE date >= ? AND date <= ? AND subject != '' GROUP BY subject ORDER BY h DESC;", (f_start, f_end)).fetchall()
            f_acts_raw = c.execute("SELECT activity, SUM(duration_hours) as h, COUNT(*) as c FROM study_sessions WHERE date >= ? AND date <= ? AND activity != '' GROUP BY activity ORDER BY h DESC;", (f_start, f_end)).fetchall()
        else:
            f_hrs = total_hrs
            f_sessions = total_sessions
            f_dates = studied_dates
            f_subjs_raw = c.execute("SELECT subject, SUM(duration_hours) as h, COUNT(*) as c FROM study_sessions WHERE subject != '' GROUP BY subject ORDER BY h DESC;").fetchall()
            f_acts_raw = c.execute("SELECT activity, SUM(duration_hours) as h, COUNT(*) as c FROM study_sessions WHERE activity != '' GROUP BY activity ORDER BY h DESC;").fetchall()

        f_days_studied = len(f_dates)
        f_avg_per_day = round(f_hrs / f_days_studied, 2) if f_days_studied > 0 else 0.0

        f_subjects = [{
            'subject': r['subject'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / f_hrs) * 100, 1) if f_hrs > 0 else 0.0
        } for r in f_subjs_raw]

        f_activities = [{
            'activity': r['activity'],
            'hours': round(r['h'], 2),
            'formatted': format_duration_str(r['h']),
            'sessions': r['c'],
            'percentage': round((r['h'] / f_hrs) * 100, 1) if f_hrs > 0 else 0.0
        } for r in f_acts_raw]

        chart_labels = []
        chart_values = []
        if tf in ('today',):
            sess_list = c.execute("SELECT start_time, duration_hours, subject FROM study_sessions WHERE date = ? ORDER BY start_time ASC;", (today_str,)).fetchall()
            if sess_list:
                chart_labels = [f"#{i+1} {r['start_time'] or ''} ({r['subject'] or 'Study'})".strip() for i, r in enumerate(sess_list)]
                chart_values = [round(r['duration_hours'], 2) for r in sess_list]
            else:
                chart_labels = ['No sessions today']
                chart_values = [0.0]
        elif tf in ('this_week', 'week'):
            chart_labels = [d['day_name'] for d in week_daily_breakdown]
            chart_values = [d['hours'] for d in week_daily_breakdown]
        elif tf in ('last_week',):
            lw_mon = datetime.date.fromisoformat(start_of_last_week)
            for i in range(7):
                ld = (lw_mon + datetime.timedelta(days=i)).isoformat()
                lh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (ld,)).fetchone()[0] or 0.0
                chart_labels.append(day_abbrs[i])
                chart_values.append(round(lh, 2))
        elif tf in ('this_month', 'month'):
            chart_labels = [str(d['day']) for d in month_daily_points]
            chart_values = [d['hours'] for d in month_daily_points]
        elif tf in ('last_month',):
            for d in range(1, last_day_prev_month + 1):
                d_str = f"{prev_month_year:04d}-{prev_month_num:02d}-{d:02d}"
                dh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (d_str,)).fetchone()[0] or 0.0
                chart_labels.append(str(d))
                chart_values.append(round(dh, 2))
        elif tf in ('last_4_weeks', '4_weeks'):
            for d in range(27, -1, -1):
                cur_dt = (today - datetime.timedelta(days=d)).isoformat()
                cur_h = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (cur_dt,)).fetchone()[0] or 0.0
                chart_labels.append(cur_dt[5:])
                chart_values.append(round(cur_h, 2))
        elif tf in ('last_8_weeks', '8_weeks'):
            for w in range(7, -1, -1):
                w_s = (today - datetime.timedelta(days=today.weekday() + w * 7)).isoformat()
                w_e = (today - datetime.timedelta(days=today.weekday() + w * 7 - 6)).isoformat()
                wh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (w_s, w_e)).fetchone()[0] or 0.0
                chart_labels.append(f"W-{w}" if w > 0 else "This Wk")
                chart_values.append(round(wh, 2))
        elif tf in ('last_12_weeks', '12_weeks'):
            for w in range(11, -1, -1):
                w_s = (today - datetime.timedelta(days=today.weekday() + w * 7)).isoformat()
                w_e = (today - datetime.timedelta(days=today.weekday() + w * 7 - 6)).isoformat()
                wh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (w_s, w_e)).fetchone()[0] or 0.0
                chart_labels.append(f"W-{w}" if w > 0 else "This Wk")
                chart_values.append(round(wh, 2))
        else:
            if studied_dates:
                all_months = [r[0] for r in c.execute("SELECT DISTINCT substr(date, 1, 7) as m FROM study_sessions ORDER BY m ASC;").fetchall()]
                for m_str in all_months:
                    mh = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date LIKE ?;", (f"{m_str}%",)).fetchone()[0] or 0.0
                    chart_labels.append(m_str)
                    chart_values.append(round(mh, 2))
            else:
                chart_labels = ['Total']
                chart_values = [round(total_hrs, 2)]

        # 11. Recent Sessions (last 30)
        recent_raw = c.execute("""
        SELECT id, date, start_time, end_time, duration_minutes, duration_hours, subject, chapter, activity, notes
        FROM study_sessions
        ORDER BY date DESC, start_time DESC, id DESC
        LIMIT 30;
        """).fetchall()

        recent_sessions = []
        for r in recent_raw:
            recent_sessions.append({
                'id': r['id'],
                'date': r['date'],
                'start_time': r['start_time'] or '--:--',
                'end_time': r['end_time'] or '--:--',
                'duration_minutes': r['duration_minutes'],
                'duration_hours': r['duration_hours'],
                'formatted_duration': format_duration_str(r['duration_hours']),
                'subject': r['subject'] or 'Unassigned',
                'chapter': r['chapter'] or '',
                'activity': r['activity'] or 'Study',
                'notes': r['notes'] or ''
            })

        # 12. Dictionaries for backward compatibility
        subj_dict = {r['subject']: round(r['h'], 2) for r in f_subjs_raw}
        act_dict = {r['activity']: round(r['h'], 2) for r in f_acts_raw}
        chap_raw = c.execute("SELECT chapter, SUM(duration_hours) as h FROM study_sessions WHERE chapter != '' GROUP BY chapter ORDER BY h DESC LIMIT 15;").fetchall()
        chap_dict = {r['chapter']: round(r['h'], 2) for r in chap_raw}

        # Daily trend (last 14 days)
        daily_trend = []
        for d in range(13, -1, -1):
            cur = (today - datetime.timedelta(days=d)).isoformat()
            h = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (cur,)).fetchone()[0] or 0.0
            daily_trend.append({'date': cur, 'hours': round(h, 2)})

        # Weekly trend (last 8 weeks)
        weekly_trend = []
        for w in range(7, -1, -1):
            w_start = (today - datetime.timedelta(days=today.weekday() + w * 7)).isoformat()
            w_end = (today - datetime.timedelta(days=today.weekday() + w * 7 - 6)).isoformat()
            h = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (w_start, w_end)).fetchone()[0] or 0.0
            weekly_trend.append({'week_start': w_start, 'week_end': w_end, 'hours': round(h, 2)})

        # Monthly trend (last 6 months)
        monthly_trend = []
        for m in range(5, -1, -1):
            m_dt = today.replace(day=1) - datetime.timedelta(days=m * 30)
            m_str = f"{m_dt.year:04d}-{m_dt.month:02d}"
            h = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date LIKE ?;", (f"{m_str}%",)).fetchone()[0] or 0.0
            monthly_trend.append({'month': m_str, 'hours': round(h, 2)})

        conn.close()

        has_subjs = bool(any(r['subject'] for r in f_subjs_raw))
        has_acts = bool(any(r['activity'] and r['activity'] != 'Other' for r in f_acts_raw))

        return {
            'has_data': True,
            'is_configured': is_configured,
            'pomodoro_status': pomo_status,
            'pomodoro_data_source': pomo_src,
            'pomodoro_last_sync': pomo_last_sync,
            'live_session': {
                'is_active': live_active,
                'elapsed_minutes': live_mins,
                'elapsed_str': f"{live_mins}m elapsed" if live_mins > 0 else "Active",
                'status': 'Currently Studying' if live_active else 'Idle'
            },

            # TOP SUMMARY
            'today_summary': {
                'hours': round(today_hrs, 2),
                'total_hours': round(today_hrs, 2),
                'formatted': format_duration_str(today_hrs),
                'duration_str': format_duration_str(today_hrs),
                'sessions': today_sessions,
                'studied_status': today_status,
                'avg_duration': format_minutes_str(today_avg_dur)
            },
            'week_summary': {
                'hours': round(week_hrs, 2),
                'total_hours': round(week_hrs, 2),
                'formatted': format_duration_str(week_hrs),
                'duration_str': format_duration_str(week_hrs),
                'days_studied': week_days_studied,
                'avg_per_studied_day': format_duration_str(week_avg_per_day),
                'sessions': week_sessions
            },
            'month_summary': {
                'hours': round(month_hrs, 2),
                'total_hours': round(month_hrs, 2),
                'formatted': format_duration_str(month_hrs),
                'duration_str': format_duration_str(month_hrs),
                'days_studied': month_days_studied,
                'avg_per_studied_day': format_duration_str(month_avg_per_day),
                'sessions': month_sessions
            },
            'total_summary': {
                'hours': round(total_hrs, 2),
                'total_hours': round(total_hrs, 2),
                'formatted': format_duration_str(total_hrs),
                'duration_str': format_duration_str(total_hrs),
                'sessions': total_sessions,
                'days_studied': days_studied,
                'avg_per_studied_day': format_duration_str(avg_daily)
            },

            # BACKWARD COMPATIBILITY
            'today_hours': round(today_hrs, 2),
            'today_formatted': format_duration_str(today_hrs),
            'today_sessions': today_sessions,
            'week_hours': round(week_hrs, 2),
            'week_formatted': format_duration_str(week_hrs),
            'week_sessions': week_sessions,
            'month_hours': round(month_hrs, 2),
            'month_formatted': format_duration_str(month_hrs),
            'month_sessions': month_sessions,
            'total_hours': round(total_hrs, 2),
            'total_formatted': format_duration_str(total_hrs),
            'average_daily_hours': avg_daily,
            'current_streak': current_streak,
            'longest_streak': longest_streak,
            'days_studied': days_studied,
            'days_without_study': days_without_study,
            'weekly_consistency_pct': weekly_consistency_pct,
            'monthly_consistency_pct': monthly_consistency_pct,
            'subject_hours': subj_dict,
            'chapter_hours': chap_dict,
            'activity_hours': act_dict,

            # VIEWS
            'today_view': {
                'hours': round(today_hrs, 2),
                'formatted': format_duration_str(today_hrs),
                'sessions': today_sessions,
                'avg_session_duration': format_minutes_str(today_avg_dur),
                'subject_breakdown': today_subjects,
                'activity_breakdown': today_activities
            },
            'week_view': {
                'hours': round(week_hrs, 2),
                'formatted': format_duration_str(week_hrs),
                'days_studied': week_days_studied,
                'avg_hours_per_day': format_duration_str(week_avg_per_day),
                'sessions': week_sessions,
                'daily_breakdown': week_daily_breakdown,
                'subject_breakdown': week_subjects
            },
            'month_view': {
                'hours': round(month_hrs, 2),
                'formatted': format_duration_str(month_hrs),
                'days_studied': month_days_studied,
                'total_sessions': month_sessions,
                'avg_per_studied_day': format_duration_str(month_avg_per_day),
                'subject_breakdown': month_subjects,
                'daily_chart_points': month_daily_points
            },
            'consistency': {
                'days_studied': days_studied,
                'days_without_study': days_without_study,
                'current_streak': current_streak,
                'longest_streak': longest_streak,
                'weekly_consistency_pct': weekly_consistency_pct,
                'monthly_consistency_pct': monthly_consistency_pct,
                'heatmap_matrix': heatmap_matrix,
                'matrix_28_days': heatmap_matrix
            },
            'filtered_data': {
                'filter': tf,
                'hours': round(f_hrs, 2),
                'formatted': format_duration_str(f_hrs),
                'sessions': f_sessions,
                'days_studied': f_days_studied,
                'avg_per_studied_day': format_duration_str(f_avg_per_day),
                'subject_breakdown': f_subjects,
                'has_subject_data': has_subjs,
                'activity_breakdown': f_activities,
                'has_activity_data': has_acts,
                'chart_type': chart_type,
                'chart_labels': chart_labels,
                'chart_values': chart_values
            },
            'recent_sessions': recent_sessions,
            'heatmap_matrix': heatmap_matrix,
            'daily_study_trend': daily_trend,
            'weekly_study_trend': weekly_trend,
            'monthly_study_trend': monthly_trend
        }

    # ------------------ BACKUP & RESTORE ------------------

    def create_automatic_backup(self) -> Optional[str]:
        """Creates an automated timestamped backup in AppData/Aayush360/backups/."""
        try:
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_filename = f"aayush360_auto_{timestamp}.db"
            backup_path = os.path.join(self.backup_dir, backup_filename)
            
            src_conn = self.get_connection()
            dest_conn = sqlite3.connect(backup_path)
            with dest_conn:
                src_conn.backup(dest_conn)
            dest_conn.close()
            src_conn.close()
            
            size = os.path.getsize(backup_path)
            
            conn = self.get_connection()
            conn.execute("""
            INSERT INTO backup_history (timestamp, file_path, backup_type, file_size, status)
            VALUES (?, ?, 'auto', ?, 'success');
            """, (datetime.datetime.now().isoformat(), backup_path, size))
            conn.commit()
            
            self._prune_old_backups(keep=10)
            conn.close()
            return backup_path
        except Exception as e:
            print("Auto backup error:", e)
            return None

    def create_manual_backup(self, custom_name: Optional[str] = None) -> Dict[str, Any]:
        """Creates a manual backup requested from the UI."""
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        name = custom_name or f"aayush360_manual_{timestamp}.db"
        if not name.endswith('.db'):
            name += '.db'
        backup_path = os.path.join(self.backup_dir, name)
        
        src_conn = self.get_connection()
        dest_conn = sqlite3.connect(backup_path)
        with dest_conn:
            src_conn.backup(dest_conn)
        dest_conn.close()
        src_conn.close()
        
        size = os.path.getsize(backup_path)
        conn = self.get_connection()
        conn.execute("""
        INSERT INTO backup_history (timestamp, file_path, backup_type, file_size, status)
        VALUES (?, ?, 'manual', ?, 'success');
        """, (datetime.datetime.now().isoformat(), backup_path, size))
        conn.commit()
        conn.close()
        return {'success': True, 'path': backup_path, 'name': name, 'size': size}

    def _prune_old_backups(self, keep: int = 10):
        try:
            files = [os.path.join(self.backup_dir, f) for f in os.listdir(self.backup_dir) if f.startswith('aayush360_auto_') and f.endswith('.db')]
            files.sort(key=os.path.getmtime, reverse=True)
            for f in files[keep:]:
                try:
                    os.remove(f)
                except Exception:
                    pass
        except Exception:
            pass

    def list_backups(self) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("SELECT * FROM backup_history ORDER BY id DESC LIMIT 50;").fetchall()
        result = [dict(r) for r in rows]
        conn.close()
        return result

    def restore_backup(self, backup_path: str) -> Dict[str, Any]:
        """Safely restores database from a backup file."""
        if not os.path.exists(backup_path):
            return {'success': False, 'error': 'Backup file does not exist'}
        try:
            self.create_automatic_backup()
            temp_restore = self.db_path + '.restoring'
            shutil.copy2(backup_path, temp_restore)
            
            if os.path.exists(self.db_path):
                os.remove(self.db_path)
            shutil.move(temp_restore, self.db_path)
            
            conn = self.get_connection()
            check = conn.execute("PRAGMA integrity_check;").fetchone()[0]
            conn.close()
            if check == 'ok':
                return {'success': True}
            else:
                return {'success': False, 'error': f'Integrity check failed: {check}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ------------------ PLANNER IMPORT & PROGRESS PRESERVATION ------------------

    def import_planner_data(self, extracted_data: Dict[str, Any], preserve_progress: bool = True) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        
        subjects = {r['name']: r['id'] for r in c.execute("SELECT id, name FROM subjects;").fetchall()}
        
        # 1. Import Physical Chemistry Chapters with hours
        phys_chem_id = subjects.get('Physical Chemistry')
        if phys_chem_id and 'physical_chemistry_chapters' in extracted_data:
            for seq, (chap_name, target_hrs) in enumerate(extracted_data['physical_chemistry_chapters'], start=1):
                c.execute("""
                INSERT INTO chapters (subject_id, name, sequence_no, target_hours)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(subject_id, name) DO UPDATE SET
                    sequence_no = excluded.sequence_no,
                    target_hours = excluded.target_hours;
                """, (phys_chem_id, chap_name, seq, target_hrs))

        # 2. Import Lectures
        lectures_imported = 0
        lectures_updated = 0
        for l in extracted_data.get('lectures', []):
            subj_name = l['subject']
            subj_id = subjects.get(subj_name)
            if not subj_id:
                continue
                
            chap_name = l['chapter']
            c.execute("SELECT id FROM chapters WHERE subject_id = ? AND name = ?;", (subj_id, chap_name))
            row = c.fetchone()
            if row:
                chap_id = row['id']
            else:
                c.execute("INSERT INTO chapters (subject_id, name) VALUES (?, ?);", (subj_id, chap_name))
                chap_id = c.lastrowid
                
            c.execute("""
            SELECT id, is_completed, completed_at, is_dpp_completed, dpp_completed_at,
                   notes, revision1_done, revision2_done, questions_practiced, scheduled_date
            FROM lectures
            WHERE subject_id = ? AND chapter_id = ? AND lecture_no = ? AND is_archived = 0;
            """, (subj_id, chap_id, l['lecture_no']))
            existing = c.fetchone()
            
            if existing and preserve_progress:
                c.execute("""
                UPDATE lectures SET
                    batch = ?,
                    lecture_name = ?,
                    topic = ?,
                    dpp_no = ?,
                    resource = ?,
                    faculty = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?;
                """, (
                    l.get('batch', ''),
                    l.get('lecture_name', ''),
                    l.get('topic', ''),
                    l.get('dpp_no', l['lecture_no']),
                    l.get('resource', ''),
                    l.get('faculty', ''),
                    existing['id']
                ))
                lectures_updated += 1
            elif existing and not preserve_progress:
                c.execute("""
                UPDATE lectures SET
                    batch = ?,
                    lecture_name = ?,
                    topic = ?,
                    dpp_no = ?,
                    resource = ?,
                    scheduled_date = ?,
                    faculty = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?;
                """, (
                    l.get('batch', ''),
                    l.get('lecture_name', ''),
                    l.get('topic', ''),
                    l.get('dpp_no', l['lecture_no']),
                    l.get('resource', ''),
                    l.get('scheduled_date', ''),
                    l.get('faculty', ''),
                    existing['id']
                ))
                lectures_updated += 1
            else:
                c.execute("""
                INSERT INTO lectures (
                    subject_id, chapter_id, batch, lecture_no, lecture_name, topic,
                    dpp_no, resource, scheduled_date, faculty
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    subj_id,
                    chap_id,
                    l.get('batch', ''),
                    l['lecture_no'],
                    l.get('lecture_name', f"Lecture {l['lecture_no']}"),
                    l.get('topic', ''),
                    l.get('dpp_no', l['lecture_no']),
                    l.get('resource', ''),
                    l.get('scheduled_date', ''),
                    l.get('faculty', '')
                ))
                lectures_imported += 1

        # 3. Import Tests
        tests_imported = 0
        for idx, t in enumerate(extracted_data.get('tests', []), start=1):
            test_num = int(t.get('test_no', idx))
            c.execute("SELECT id FROM tests WHERE test_name = ?;", (t['test_name'],))
            existing_t = c.fetchone()
            if existing_t and preserve_progress:
                c.execute("""
                UPDATE tests SET
                    test_no = COALESCE(test_no, ?),
                    test_type = ?,
                    test_date = ?,
                    physics_syllabus = ?,
                    chemistry_syllabus = ?,
                    maths_syllabus = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?;
                """, (
                    test_num,
                    t['test_type'],
                    t['test_date'],
                    t.get('physics_syllabus', ''),
                    t.get('chemistry_syllabus', ''),
                    t.get('maths_syllabus', ''),
                    existing_t['id']
                ))
            else:
                c.execute("""
                INSERT INTO tests (
                    test_no, test_name, test_type, test_date, physics_syllabus, chemistry_syllabus, maths_syllabus
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    test_num,
                    t['test_name'],
                    t['test_type'],
                    t['test_date'],
                    t.get('physics_syllabus', ''),
                    t.get('chemistry_syllabus', ''),
                    t.get('maths_syllabus', '')
                ))
                tests_imported += 1

        conn.commit()
        conn.close()
        return {
            'success': True,
            'lectures_imported': lectures_imported,
            'lectures_updated': lectures_updated,
            'tests_imported': tests_imported
        }

    # ------------------ INDIVIDUAL LECTURE OPERATIONS ------------------

    def get_lecture(self, lecture_id: int) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        row = conn.execute("""
        SELECT l.*, s.name as subject_name, s.display_name as subject_display, s.color as subject_color,
               c.name as chapter_name
        FROM lectures l
        JOIN subjects s ON l.subject_id = s.id
        JOIN chapters c ON l.chapter_id = c.id
        WHERE l.id = ?;
        """, (lecture_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def add_lecture(self, data: Dict[str, Any], auto_renumber_after: bool = False) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        
        subj_id = data['subject_id']
        chap_id = data.get('chapter_id')
        if not chap_id:
            chap_name = data.get('chapter_name', 'General')
            c.execute("SELECT id FROM chapters WHERE subject_id = ? AND name = ?;", (subj_id, chap_name))
            r = c.fetchone()
            if r:
                chap_id = r['id']
            else:
                c.execute("INSERT INTO chapters (subject_id, name) VALUES (?, ?);", (subj_id, chap_name))
                chap_id = c.lastrowid

        lec_no = int(data.get('lecture_no', 1))
        
        if auto_renumber_after:
            c.execute("""
            UPDATE lectures
            SET lecture_no = lecture_no + 1,
                dpp_no = dpp_no + 1,
                updated_at = datetime('now', 'localtime')
            WHERE chapter_id = ? AND lecture_no >= ? AND is_archived = 0;
            """, (chap_id, lec_no))

        lec_name = data.get('lecture_name') or f"Lecture {lec_no}"
        topic = data.get('topic', '')
        dpp_no = int(data.get('dpp_no', lec_no))
        resource = data.get('resource', '')
        batch = data.get('batch', '')
        sched_date = data.get('scheduled_date', datetime.date.today().isoformat())
        notes = data.get('notes', '')
        is_comp = 1 if data.get('is_completed') else 0
        comp_at = data.get('completed_at') if is_comp else None
        
        c.execute("""
        INSERT INTO lectures (
            subject_id, chapter_id, batch, lecture_no, lecture_name, topic,
            dpp_no, resource, scheduled_date, notes, is_completed, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (subj_id, chap_id, batch, lec_no, lec_name, topic, dpp_no, resource, sched_date, notes, is_comp, comp_at))
        
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        return {'success': True, 'id': new_id}

    def add_dpp(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        try:
            subj_id = int(data['subject_id'])
            chap_id = int(data['chapter_id'])
            dpp_no = int(data.get('dpp_no', 1))
            dpp_title = data.get('dpp_title') or f"DPP {dpp_no}"
            sched_date = data.get('scheduled_date', datetime.date.today().isoformat())
            notes = data.get('notes', '')

            # Check if there is already a lecture row with this chapter_id and dpp_no
            c.execute("SELECT id, topic, notes, lecture_name FROM lectures WHERE chapter_id = ? AND dpp_no = ? AND is_archived = 0;", (chap_id, dpp_no))
            row = c.fetchone()
            if row:
                c.execute("""
                UPDATE lectures
                SET topic = CASE WHEN topic = '' OR topic IS NULL THEN ? ELSE topic END,
                    notes = CASE WHEN ? != '' THEN ? ELSE notes END,
                    scheduled_date = CASE WHEN scheduled_date = '' OR scheduled_date IS NULL THEN ? ELSE scheduled_date END,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?;
                """, (dpp_title, notes, notes, sched_date, row['id']))
                new_id = row['id']
            else:
                c.execute("SELECT COALESCE(MAX(lecture_no), 0) + 1 FROM lectures WHERE chapter_id = ? AND is_archived = 0;", (chap_id,))
                next_lec_no = c.fetchone()[0]
                c.execute("""
                INSERT INTO lectures (
                    subject_id, chapter_id, lecture_no, lecture_name, topic,
                    dpp_no, scheduled_date, notes, is_completed, is_dpp_completed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0);
                """, (subj_id, chap_id, next_lec_no, dpp_title, dpp_title, dpp_no, sched_date, notes))
                new_id = c.lastrowid

            conn.commit()
            return {'success': True, 'id': new_id}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            conn.close()

    def update_lecture(self, lecture_id: int, fields: Dict[str, Any], auto_renumber_shift: bool = False) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        
        c.execute("SELECT * FROM lectures WHERE id = ?;", (lecture_id,))
        current = c.fetchone()
        if not current:
            conn.close()
            return {'success': False, 'error': 'Lecture not found'}

        chap_id = fields.get('chapter_id', current['chapter_id'])
        subj_id = fields.get('subject_id', current['subject_id'])
        if 'chapter_name' in fields and fields['chapter_name']:
            c.execute("SELECT id FROM chapters WHERE subject_id = ? AND name = ?;", (subj_id, fields['chapter_name']))
            r = c.fetchone()
            if r:
                chap_id = r['id']
            else:
                c.execute("INSERT INTO chapters (subject_id, name) VALUES (?, ?);", (subj_id, fields['chapter_name']))
                chap_id = c.lastrowid

        new_lec_no = int(fields.get('lecture_no', current['lecture_no']))
        
        if auto_renumber_shift and new_lec_no != current['lecture_no']:
            c.execute("""
            UPDATE lectures
            SET lecture_no = lecture_no + 1,
                dpp_no = dpp_no + 1,
                updated_at = datetime('now', 'localtime')
            WHERE chapter_id = ? AND id != ? AND lecture_no >= ? AND is_archived = 0;
            """, (chap_id, lecture_id, new_lec_no))

        is_completed = 1 if fields.get('is_completed', current['is_completed']) else 0
        completed_at = fields.get('completed_at')
        if is_completed and not completed_at:
            completed_at = current['completed_at'] or datetime.datetime.now().isoformat()
        elif not is_completed:
            completed_at = None

        is_dpp_completed = 1 if fields.get('is_dpp_completed', current['is_dpp_completed']) else 0
        dpp_completed_at = fields.get('dpp_completed_at')
        if is_dpp_completed and not dpp_completed_at:
            dpp_completed_at = current['dpp_completed_at'] or datetime.datetime.now().isoformat()
        elif not is_dpp_completed:
            dpp_completed_at = None

        q_prac = int(fields.get('questions_practiced', current['questions_practiced']))
        q_corr = int(fields.get('questions_correct', current['questions_correct']))
        q_inc = int(fields.get('questions_incorrect', current['questions_incorrect']))
        accuracy = round((q_corr / q_prac) * 100, 1) if q_prac > 0 else 0.0

        c.execute("""
        UPDATE lectures SET
            subject_id = ?,
            chapter_id = ?,
            batch = ?,
            lecture_no = ?,
            lecture_name = ?,
            topic = ?,
            dpp_no = ?,
            resource = ?,
            scheduled_date = ?,
            rescheduled_date = ?,
            is_completed = ?,
            completed_at = ?,
            is_dpp_completed = ?,
            dpp_completed_at = ?,
            questions_practiced = ?,
            questions_correct = ?,
            questions_incorrect = ?,
            accuracy = ?,
            notes = ?,
            sync_status = 'pending',
            updated_at = datetime('now', 'localtime')
        WHERE id = ?;
        """, (
            subj_id,
            chap_id,
            fields.get('batch', current['batch']),
            new_lec_no,
            fields.get('lecture_name', current['lecture_name']),
            fields.get('topic', current['topic']),
            int(fields.get('dpp_no', current['dpp_no'])),
            fields.get('resource', current['resource']),
            fields.get('scheduled_date', current['scheduled_date']),
            fields.get('rescheduled_date', current['rescheduled_date']),
            is_completed,
            completed_at,
            is_dpp_completed,
            dpp_completed_at,
            q_prac,
            q_corr,
            q_inc,
            accuracy,
            fields.get('notes', current['notes']),
            lecture_id
        ))

        conn.commit()
        conn.close()
        return {'success': True}

    def update_lecture_field(self, lecture_id: int, field: str, value: Any) -> Dict[str, Any]:
        allowed = {
            'lecture_no': int,
            'lecture_name': str,
            'scheduled_date': str,
            'rescheduled_date': str,
            'topic': str,
            'dpp_no': int,
            'resource': str,
            'batch': str,
            'notes': str,
            'is_completed': lambda v: 1 if v else 0,
            'is_dpp_completed': lambda v: 1 if v else 0,
            'questions_practiced': int,
            'questions_correct': int,
            'questions_incorrect': int,
            'revision1_done': lambda v: 1 if v else 0,
            'revision2_done': lambda v: 1 if v else 0,
        }
        if field not in allowed:
            return {'success': False, 'error': f'Field {field} is not editable'}

        try:
            val = allowed[field](value) if value is not None else None
        except Exception as e:
            return {'success': False, 'error': f'Invalid value for {field}: {e}'}

        conn = self.get_connection()
        c = conn.cursor()
        
        extra_sql = ""
        extra_vals = []
        if field == 'is_completed':
            extra_sql = ", completed_at = ?"
            extra_vals.append(datetime.datetime.now().isoformat() if val else None)
        elif field == 'is_dpp_completed':
            extra_sql = ", dpp_completed_at = ?"
            extra_vals.append(datetime.datetime.now().isoformat() if val else None)
        elif field == 'revision1_done':
            extra_sql = ", revision1_date = ?"
            extra_vals.append(datetime.date.today().isoformat() if val else None)
        elif field == 'revision2_done':
            extra_sql = ", revision2_date = ?"
            extra_vals.append(datetime.date.today().isoformat() if val else None)

        sql = f"UPDATE lectures SET {field} = ?{extra_sql}, sync_status = 'pending', updated_at = datetime('now', 'localtime') WHERE id = ?;"
        c.execute(sql, [val] + extra_vals + [lecture_id])
        conn.commit()
        conn.close()
        return {'success': True}

    def delete_lecture(self, lecture_id: int, renumber_after: bool = False) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT chapter_id, lecture_no FROM lectures WHERE id = ?;", (lecture_id,))
        lec = c.fetchone()
        if not lec:
            conn.close()
            return {'success': False, 'error': 'Lecture not found'}

        chap_id = lec['chapter_id']
        lec_no = lec['lecture_no']
        
        # Soft delete for sync propagation
        c.execute("UPDATE lectures SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?;", (lecture_id,))
        
        if renumber_after:
            c.execute("""
            UPDATE lectures
            SET lecture_no = lecture_no - 1,
                dpp_no = dpp_no - 1,
                updated_at = datetime('now', 'localtime')
            WHERE chapter_id = ? AND lecture_no > ? AND is_archived = 0;
            """, (chap_id, lec_no))

        conn.commit()
        conn.close()
        return {'success': True}

    def delete_dpp(self, lecture_id: int) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        try:
            c.execute("SELECT * FROM lectures WHERE id = ?;", (lecture_id,))
            orig = c.fetchone()
            if not orig:
                return {'success': False, 'error': 'Lecture not found'}
            lec_name = (orig['lecture_name'] or '').strip()
            if 'DPP' in lec_name or lec_name.startswith('DPP'):
                conn.close()
                return self.delete_lecture(lecture_id, False)
            else:
                c.execute("""
                UPDATE lectures
                SET dpp_no = 0, is_dpp_completed = 0, dpp_completed_at = NULL,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?;
                """, (lecture_id,))
                conn.commit()
                return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def duplicate_lecture(self, lecture_id: int) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM lectures WHERE id = ?;", (lecture_id,))
        orig = c.fetchone()
        if not orig:
            conn.close()
            return {'success': False, 'error': 'Lecture not found'}

        new_lec_no = orig['lecture_no'] + 1
        c.execute("""
        UPDATE lectures
        SET lecture_no = lecture_no + 1,
            dpp_no = dpp_no + 1,
            updated_at = datetime('now', 'localtime')
        WHERE chapter_id = ? AND lecture_no >= ? AND is_archived = 0;
        """, (orig['chapter_id'], new_lec_no))

        c.execute("""
        INSERT INTO lectures (
            subject_id, chapter_id, batch, lecture_no, lecture_name, topic,
            dpp_no, resource, scheduled_date, faculty, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            orig['subject_id'],
            orig['chapter_id'],
            orig['batch'],
            new_lec_no,
            f"{orig['lecture_name']} (Copy)",
            orig['topic'],
            new_lec_no,
            orig['resource'],
            orig['scheduled_date'],
            orig['faculty'],
            orig['notes']
        ))
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        return {'success': True, 'id': new_id}

    def renumber_chapter_lectures(self, chapter_id: int, start_from: int = 1, sort_by: str = 'date') -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        
        order_clause = "ORDER BY scheduled_date ASC, lecture_no ASC" if sort_by == 'date' else "ORDER BY lecture_no ASC, scheduled_date ASC"
        rows = c.execute(f"SELECT id FROM lectures WHERE chapter_id = ? AND is_archived = 0 {order_clause};", (chapter_id,)).fetchall()
        
        current_no = start_from
        for r in rows:
            c.execute("""
            UPDATE lectures
            SET lecture_no = ?,
                dpp_no = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?;
            """, (current_no, current_no, r['id']))
            current_no += 1
            
        conn.commit()
        conn.close()
        return {'success': True, 'count': len(rows)}

    # ------------------ REVISIONS MANAGEMENT (UNLIMITED STAGES) ------------------

    def get_revisions(self, lecture_id: int) -> List[Dict[str, Any]]:
        """Returns all revision checkpoints for a specific lecture."""
        conn = self.get_connection()
        rows = conn.execute("""
        SELECT * FROM revisions
        WHERE lecture_id = ?
        ORDER BY stage_no ASC;
        """, (lecture_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def toggle_revision(self, lecture_id: int, stage_no: int, completed: Optional[bool] = None, notes: str = '') -> Dict[str, Any]:
        """
        Toggles or sets the completion state of a revision stage.
        Supports unlimited revision stages (Revision 1, 2, 3, 4, ...).
        Also keeps lectures.revision1_done / revision2_done in sync for stages 1 & 2.
        """
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM revisions WHERE lecture_id = ? AND stage_no = ?;", (lecture_id, stage_no))
        existing = c.fetchone()

        now_str = datetime.datetime.now().isoformat()
        today_str = datetime.date.today().isoformat()

        if existing:
            new_is_comp = 1 if (completed if completed is not None else not existing['is_completed']) else 0
            comp_at = now_str if new_is_comp else None
            c.execute("""
            UPDATE revisions
            SET is_completed = ?, completed_at = ?, notes = COALESCE(NULLIF(?, ''), notes),
                updated_at = datetime('now', 'localtime')
            WHERE lecture_id = ? AND stage_no = ?;
            """, (new_is_comp, comp_at, notes, lecture_id, stage_no))
        else:
            new_is_comp = 1 if (completed if completed is not None else True) else 0
            comp_at = now_str if new_is_comp else None
            c.execute("""
            INSERT INTO revisions (lecture_id, stage_no, is_completed, completed_at, notes)
            VALUES (?, ?, ?, ?, ?);
            """, (lecture_id, stage_no, new_is_comp, comp_at, notes))

        # Backward compatibility sync for stages 1 & 2
        if stage_no == 1:
            rev_date = today_str if new_is_comp else None
            c.execute("UPDATE lectures SET revision1_done = ?, revision1_date = ?, updated_at = datetime('now', 'localtime') WHERE id = ?;", (new_is_comp, rev_date, lecture_id))
        elif stage_no == 2:
            rev_date = today_str if new_is_comp else None
            c.execute("UPDATE lectures SET revision2_done = ?, revision2_date = ?, updated_at = datetime('now', 'localtime') WHERE id = ?;", (new_is_comp, rev_date, lecture_id))

        conn.commit()
        conn.close()
        return {'success': True, 'lecture_id': lecture_id, 'stage_no': stage_no, 'is_completed': new_is_comp}

    def add_revision_stage(self, lecture_id: int, scheduled_date: Optional[str] = None, notes: str = '') -> Dict[str, Any]:
        """Adds a next revision stage (e.g. stage 3, 4, etc.) for a lecture."""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT COALESCE(MAX(stage_no), 0) FROM revisions WHERE lecture_id = ?;", (lecture_id,))
        max_stage = c.fetchone()[0]
        next_stage = max_stage + 1
        c.execute("""
        INSERT INTO revisions (lecture_id, stage_no, scheduled_date, notes)
        VALUES (?, ?, ?, ?);
        """, (lecture_id, next_stage, scheduled_date, notes))
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        return {'success': True, 'id': new_id, 'stage_no': next_stage}

    # ------------------ BULK OPERATIONS ------------------

    def bulk_update_lectures(self, lecture_ids: List[int], operation: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not lecture_ids:
            return {'success': False, 'error': 'No lectures selected'}

        conn = self.get_connection()
        c = conn.cursor()
        placeholders = ','.join('?' for _ in lecture_ids)

        if operation == 'shift_dates':
            days = int(payload.get('days', 0))
            rows = c.execute(f"SELECT id, scheduled_date FROM lectures WHERE id IN ({placeholders});", lecture_ids).fetchall()
            for r in rows:
                try:
                    d = datetime.date.fromisoformat(r['scheduled_date'])
                    new_d = (d + datetime.timedelta(days=days)).isoformat()
                    c.execute("UPDATE lectures SET scheduled_date = ?, updated_at = datetime('now', 'localtime') WHERE id = ?;", (new_d, r['id']))
                except Exception:
                    pass

        elif operation == 'set_date':
            new_date = payload['date']
            c.execute(f"UPDATE lectures SET scheduled_date = ?, updated_at = datetime('now', 'localtime') WHERE id IN ({placeholders});", [new_date] + lecture_ids)

        elif operation == 'change_chapter':
            chap_id = payload['chapter_id']
            c.execute(f"UPDATE lectures SET chapter_id = ?, updated_at = datetime('now', 'localtime') WHERE id IN ({placeholders});", [chap_id] + lecture_ids)

        elif operation == 'change_resource':
            res = payload['resource']
            c.execute(f"UPDATE lectures SET resource = ?, updated_at = datetime('now', 'localtime') WHERE id IN ({placeholders});", [res] + lecture_ids)

        elif operation == 'renumber_sequentially':
            start_num = int(payload.get('start_from', 1))
            rows = c.execute(f"SELECT id FROM lectures WHERE id IN ({placeholders}) ORDER BY scheduled_date ASC, lecture_no ASC;", lecture_ids).fetchall()
            num = start_num
            for r in rows:
                c.execute("UPDATE lectures SET lecture_no = ?, dpp_no = ?, updated_at = datetime('now', 'localtime') WHERE id = ?;", (num, num, r['id']))
                num += 1

        elif operation == 'mark_lectures_complete':
            val = 1 if payload.get('completed', True) else 0
            ts = datetime.datetime.now().isoformat() if val else None
            c.execute(f"UPDATE lectures SET is_completed = ?, completed_at = ?, updated_at = datetime('now', 'localtime') WHERE id IN ({placeholders});", [val, ts] + lecture_ids)

        elif operation == 'mark_dpps_complete':
            val = 1 if payload.get('completed', True) else 0
            ts = datetime.datetime.now().isoformat() if val else None
            c.execute(f"UPDATE lectures SET is_dpp_completed = ?, dpp_completed_at = ?, updated_at = datetime('now', 'localtime') WHERE id IN ({placeholders});", [val, ts] + lecture_ids)

        elif operation == 'delete_selected':
            c.execute(f"DELETE FROM lectures WHERE id IN ({placeholders});", lecture_ids)

        else:
            conn.close()
            return {'success': False, 'error': f'Unknown operation: {operation}'}

        conn.commit()
        conn.close()
        return {'success': True, 'affected': len(lecture_ids)}

    # ------------------ QUERIES FOR UI VIEWS ------------------

    def get_dashboard_summary(self, target_date: Optional[str] = None) -> Dict[str, Any]:
        today = target_date or datetime.date.today().isoformat()
        conn = self.get_connection()
        c = conn.cursor()
        
        settings = dict(c.execute("SELECT key, value FROM app_settings;").fetchall())
        user_name = settings.get('user_name', 'Aayush')

        # Today's tasks
        today_lectures = c.execute("""
        SELECT l.*, s.name as subject_name, s.color as subject_color, c.name as chapter_name
        FROM lectures l
        JOIN subjects s ON l.subject_id = s.id
        JOIN chapters c ON l.chapter_id = c.id
        WHERE (l.scheduled_date = ? OR l.rescheduled_date = ?) AND l.is_archived = 0
        ORDER BY s.sort_order, l.lecture_no;
        """, (today, today)).fetchall()
        
        total_today_lectures = len(today_lectures)
        completed_today_lectures = sum(1 for l in today_lectures if l['is_completed'])
        completed_today_dpps = sum(1 for l in today_lectures if l['is_dpp_completed'])

        # Check if there is an active live Pomodoro session
        live_active = settings.get('pomo_live_active') == 'true'
        live_mins = int(settings.get('pomo_live_minutes', '0')) if live_active else 0
        live_hrs = round(live_mins / 60.0, 2)

        # Study sessions hours (Actual study time from Pomodoro if synced)
        pomodoro_today = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (today,)).fetchone()[0]
        today_pomodoro_hours = round((pomodoro_today or 0.0) + live_hrs, 2)

        current_dt = datetime.date.fromisoformat(today)
        start_of_week = (current_dt - datetime.timedelta(days=current_dt.weekday())).isoformat()
        end_of_week = (current_dt + datetime.timedelta(days=6 - current_dt.weekday())).isoformat()
        pomodoro_week = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_week, end_of_week)).fetchone()[0]
        week_pomodoro_hours = round((pomodoro_week or 0.0) + live_hrs, 2)

        start_of_month = f"{current_dt.year:04d}-{current_dt.month:02d}-01"
        pomodoro_month = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ?;", (start_of_month,)).fetchone()[0]
        month_pomodoro_hours = round((pomodoro_month or 0.0) + live_hrs, 2)

        # Physical Chem study hours: actual hours from external Pomodoro study_sessions ONLY!
        p_today = c.execute("""
        SELECT SUM(duration_hours) FROM study_sessions
        WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry') AND date = ?;
        """, (today,)).fetchone()[0]
        today_pc_hours = round(p_today, 2) if p_today else 0.0

        # Check weekly_targets for start_of_week
        wt_rows = c.execute("SELECT subject_id, target_value FROM weekly_targets WHERE week_start = ?;", (start_of_week,)).fetchall()
        custom_targets = {r['subject_id']: r['target_value'] for r in wt_rows}

        # Weekly target progress (5 subjects)
        subjects_list = []
        for s in c.execute("SELECT * FROM subjects ORDER BY sort_order;").fetchall():
            s_dict = dict(s)
            target_val = custom_targets.get(s['id'], s['weekly_target_val'])
            is_custom = s['id'] in custom_targets

            if s['target_type'] == 'lectures':
                done = c.execute("""
                SELECT COUNT(*) FROM lectures
                WHERE subject_id = ? AND is_completed = 1 AND is_archived = 0
                  AND ((completed_at >= ? AND completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
                """, (s['id'], start_of_week, end_of_week, start_of_week, end_of_week)).fetchone()[0]
                current_val = done
            else:
                # Study hours come EXCLUSIVELY from external Pomodoro study_sessions
                p_hrs = c.execute("""
                SELECT SUM(duration_hours) FROM study_sessions
                WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry')
                  AND date >= ? AND date <= ?;
                """, (start_of_week, end_of_week)).fetchone()[0]
                current_val = round(p_hrs, 1) if p_hrs else 0.0

            remaining = max(0.0, round(target_val - current_val, 1))
            percentage = min(100.0, round((current_val / target_val) * 100, 1)) if target_val > 0 else 0.0

            s_dict['current_val'] = current_val
            s_dict['target_val'] = target_val
            s_dict['remaining'] = remaining
            s_dict['percentage'] = percentage
            s_dict['is_custom_target'] = is_custom
            subjects_list.append(s_dict)

        # Upcoming Test
        upcoming_test = c.execute("""
        SELECT *, julianday(test_date) - julianday(?) as days_left
        FROM tests
        WHERE test_date >= ?
        ORDER BY test_date ASC LIMIT 1;
        """, (today, today)).fetchone()

        total_all_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE is_archived = 0;").fetchone()[0]
        completed_all_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE is_completed = 1 AND is_archived = 0;").fetchone()[0]
        completed_all_dpps = c.execute("SELECT COUNT(*) FROM lectures WHERE is_dpp_completed = 1 AND is_archived = 0;").fetchone()[0]
        backlog_count = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE scheduled_date < ? AND is_completed = 0 AND is_archived = 0;
        """, (today,)).fetchone()[0]

        has_pomodoro = c.execute("SELECT COUNT(*) FROM study_sessions;").fetchone()[0] > 0

        conn.close()
        return {
            'user_name': user_name,
            'current_date': today,
            'week_start': start_of_week,
            'week_end': end_of_week,
            'streak': int(settings.get('current_streak', 1)),
            'study_time_card': {
                'has_data': has_pomodoro or (today_pomodoro_hours > 0),
                'today_hours': today_pomodoro_hours,
                'week_hours': week_pomodoro_hours,
                'month_hours': month_pomodoro_hours,
                'today_str': format_duration_str(today_pomodoro_hours),
                'week_str': format_duration_str(week_pomodoro_hours),
                'month_str': format_duration_str(month_pomodoro_hours),
                'sync_status': 'Currently Studying' if live_active else settings.get('pomo_sync_status', 'Connected'),
                'is_live': live_active,
                'live_minutes': live_mins,
                'live_str': f"{live_mins}m elapsed" if live_mins > 0 else "Live Session"
            },
            'today_stats': {
                'total_lectures': total_today_lectures,
                'completed_lectures': completed_today_lectures,
                'completed_dpps': completed_today_dpps,
                'phys_chem_hours': today_pc_hours,
            },
            'overall_stats': {
                'total_lectures': total_all_lecs,
                'completed_lectures': completed_all_lecs,
                'completed_dpps': completed_all_dpps,
                'completion_percentage': round((completed_all_lecs / total_all_lecs) * 100, 1) if total_all_lecs > 0 else 0,
                'backlog_count': backlog_count
            },
            'subjects': subjects_list,
            'upcoming_test': dict(upcoming_test) if upcoming_test else None,
            'today_tasks': [dict(r) for r in today_lectures]
        }

    def get_lectures(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        query = """
        SELECT l.*, s.name as subject_name, s.display_name as subject_display, s.color as subject_color,
               c.name as chapter_name
        FROM lectures l
        JOIN subjects s ON l.subject_id = s.id
        JOIN chapters c ON l.chapter_id = c.id
        WHERE l.is_archived = 0
        """
        params = []
        
        if filters.get('subject_id'):
            query += " AND l.subject_id = ?"
            params.append(filters['subject_id'])
            
        if filters.get('chapter_id'):
            query += " AND l.chapter_id = ?"
            params.append(filters['chapter_id'])
            
        if filters.get('date'):
            query += " AND (l.scheduled_date = ? OR l.rescheduled_date = ?)"
            params.extend([filters['date'], filters['date']])
            
        if filters.get('start_date') and filters.get('end_date'):
            query += " AND l.scheduled_date >= ? AND l.scheduled_date <= ?"
            params.extend([filters['start_date'], filters['end_date']])
            
        if filters.get('status') == 'completed':
            query += " AND l.is_completed = 1"
        elif filters.get('status') == 'pending':
            query += " AND l.is_completed = 0"
        elif filters.get('status') in ('backlog', 'overdue'):
            today = datetime.date.today().isoformat()
            query += f" AND l.scheduled_date < '{today}' AND l.is_completed = 0"

        if filters.get('dpp_status') == 'completed':
            query += " AND l.is_dpp_completed = 1"
        elif filters.get('dpp_status') == 'pending':
            query += " AND l.is_dpp_completed = 0"

        if filters.get('search'):
            term = f"%{filters['search']}%"
            query += " AND (l.lecture_name LIKE ? OR l.topic LIKE ? OR c.name LIKE ? OR l.notes LIKE ?)"
            params.extend([term, term, term, term])

        sort_by = filters.get('sort_by', 'date')
        if sort_by == 'number':
            query += " ORDER BY l.lecture_no ASC"
        elif sort_by == 'chapter':
            query += " ORDER BY c.sequence_no ASC, l.lecture_no ASC"
        else:
            query += " ORDER BY l.scheduled_date ASC, s.sort_order ASC, l.lecture_no ASC"

        rows = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_subjects_and_chapters(self) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        c = conn.cursor()
        
        subjects = [dict(s) for s in c.execute("SELECT * FROM subjects ORDER BY sort_order;").fetchall()]
        for s in subjects:
            if s.get('target_type') == 'hours':
                # Physical Chemistry is hours-based
                chaps = c.execute("""
                SELECT c.*,
                       COALESCE(c.target_hours, 0) as total_hours
                FROM chapters c
                WHERE c.subject_id = ?
                ORDER BY c.sequence_no ASC, c.id ASC;
                """, (s['id'],)).fetchall()

                s['chapters'] = []
                for ch in chaps:
                    ch_dict = dict(ch)
                    tot = int(ch_dict.get('target_hours') or 0)
                    comp = c.execute("""
                        SELECT COUNT(*) FROM study_sessions
                        WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry')
                          AND chapter = ?
                          AND (deleted_at IS NULL OR deleted_at = '')
                    """, (ch_dict['name'],)).fetchone()[0] or 0
                    ch_dict['total_lectures'] = tot
                    ch_dict['completed_lectures'] = comp
                    ch_dict['dpp_completed'] = 0
                    ch_dict['progress_pct'] = round((comp / tot) * 100, 1) if tot > 0 else 0
                    ch_dict['dpp_pct'] = 0
                    s['chapters'].append(ch_dict)
            else:
                chaps = c.execute("""
                SELECT c.*,
                       COUNT(l.id) as total_lectures,
                       SUM(CASE WHEN l.is_completed = 1 THEN 1 ELSE 0 END) as completed_lectures,
                       SUM(CASE WHEN l.is_dpp_completed = 1 THEN 1 ELSE 0 END) as dpp_completed,
                       SUM(l.questions_practiced) as total_questions,
                       SUM(l.questions_correct) as correct_questions,
                       SUM(CASE WHEN l.revision1_done = 1 THEN 1 ELSE 0 END) as rev1_count,
                       SUM(CASE WHEN l.revision2_done = 1 THEN 1 ELSE 0 END) as rev2_count
                FROM chapters c
                LEFT JOIN lectures l ON c.id = l.chapter_id AND l.is_archived = 0
                WHERE c.subject_id = ?
                GROUP BY c.id
                ORDER BY c.sequence_no ASC, c.id ASC;
                """, (s['id'],)).fetchall()
                
                s['chapters'] = []
                for ch in chaps:
                    ch_dict = dict(ch)
                    tot = ch_dict['total_lectures'] or 0
                    comp = ch_dict['completed_lectures'] or 0
                    dpp = ch_dict['dpp_completed'] or 0
                    ch_dict['progress_pct'] = round((comp / tot) * 100, 1) if tot > 0 else 0
                    ch_dict['dpp_pct'] = round((dpp / tot) * 100, 1) if tot > 0 else 0
                    s['chapters'].append(ch_dict)

        conn.close()
        return subjects

    def get_chapter_hours(self, chapter_id: int) -> Dict[str, Any]:
        """Returns completed hour indices and target hours for a Physical Chemistry chapter."""
        conn = self.get_connection()
        c = conn.cursor()
        ch = c.execute("SELECT id, name, target_hours, client_id, subject_id FROM chapters WHERE id = ?;", (chapter_id,)).fetchone()
        if not ch:
            conn.close()
            return {'success': False, 'error': 'Chapter not found'}

        rows = c.execute("""
            SELECT topic FROM study_sessions
            WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry')
              AND chapter = ?
              AND (deleted_at IS NULL OR deleted_at = '')
        """, (ch['name'],)).fetchall()

        completed_set = set()
        for r in rows:
            topic = r['topic'] or ''
            if topic.startswith('Hour '):
                try:
                    h_num = int(topic.replace('Hour ', '').strip())
                    completed_set.add(h_num)
                except ValueError:
                    pass

        target = int(ch['target_hours'] or 0)
        conn.close()
        return {
            'success': True,
            'chapter_id': ch['id'],
            'chapter_name': ch['name'],
            'target_hours': target,
            'completed_hours': sorted(list(completed_set)),
            'total_completed': len(completed_set)
        }

    def toggle_chapter_hour(self, chapter_id: int, hour_no: int) -> Dict[str, Any]:
        """Toggles an individual hour completion checkbox for a Physical Chemistry chapter."""
        conn = self.get_connection()
        c = conn.cursor()
        ch = c.execute("SELECT id, name, target_hours, client_id, subject_client_id FROM chapters WHERE id = ?;", (chapter_id,)).fetchone()
        if not ch:
            conn.close()
            return {'success': False, 'error': 'Chapter not found'}

        session_id = f"pch_{ch['client_id']}_h{hour_no}"
        existing = c.execute("SELECT id, deleted_at FROM study_sessions WHERE external_session_id = ?;", (session_id,)).fetchone()

        is_completed = False
        if existing:
            if existing['deleted_at']:
                c.execute("""
                    UPDATE study_sessions
                    SET deleted_at = NULL, sync_status = 'pending', updated_at = datetime('now', 'localtime')
                    WHERE id = ?;
                """, (existing['id'],))
                is_completed = True
            else:
                c.execute("""
                    UPDATE study_sessions
                    SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending', updated_at = datetime('now', 'localtime')
                    WHERE id = ?;
                """, (existing['id'],))
                is_completed = False
        else:
            today_str = datetime.date.today().isoformat()
            c.execute("""
                INSERT INTO study_sessions (
                    client_id, source, external_session_id, date, start_time, end_time,
                    duration_minutes, duration_hours, subject, chapter, topic, activity, notes,
                    sync_status, created_at, updated_at
                ) VALUES (?, 'Physical Chemistry', ?, ?, '00:00:00', '01:00:00', 60.0, 1.0, 'Physical Chemistry', ?, ?, 'Hours', '', 'pending', datetime('now', 'localtime'), datetime('now', 'localtime'));
            """, (session_id, session_id, today_str, ch['name'], f"Hour {hour_no}"))
            is_completed = True

        conn.commit()

        rows = c.execute("""
            SELECT topic FROM study_sessions
            WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry')
              AND chapter = ?
              AND (deleted_at IS NULL OR deleted_at = '')
        """, (ch['name'],)).fetchall()
        completed_set = set()
        for r in rows:
            topic = r['topic'] or ''
            if topic.startswith('Hour '):
                try:
                    h_num = int(topic.replace('Hour ', '').strip())
                    completed_set.add(h_num)
                except ValueError:
                    pass

        conn.close()
        return {
            'success': True,
            'is_completed': is_completed,
            'hour_no': hour_no,
            'completed_hours': sorted(list(completed_set)),
            'total_completed': len(completed_set),
            'target_hours': int(ch['target_hours'] or 0)
        }

    # ------------------ WEEKLY TARGETS (PER-WEEK, PER-SUBJECT EDITABLE) ------------------

    def get_weekly_targets(self, week_start: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns weekly targets for the specified week (or current week).
        Format: week_start + subject_id + target_value.
        Guarantees that historical weeks and future weeks are independent.
        """
        if not week_start:
            today = datetime.date.today()
            week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

        w_dt = datetime.date.fromisoformat(week_start)
        week_end = (w_dt + datetime.timedelta(days=6)).isoformat()

        conn = self.get_connection()
        c = conn.cursor()

        subjects = c.execute("SELECT * FROM subjects ORDER BY sort_order;").fetchall()
        wt_rows = c.execute("SELECT subject_id, target_value FROM weekly_targets WHERE week_start = ?;", (week_start,)).fetchall()
        custom_map = {r['subject_id']: r['target_value'] for r in wt_rows}

        targets = []
        for s in subjects:
            is_custom = s['id'] in custom_map
            val = custom_map[s['id']] if is_custom else s['weekly_target_val']
            targets.append({
                'subject_id': s['id'],
                'subject_name': s['name'],
                'display_name': s['display_name'],
                'color': s['color'],
                'resource_name': s['resource_name'],
                'target_type': s['target_type'],
                'target_value': val,
                'default_target_value': s['weekly_target_val'],
                'is_custom': is_custom
            })

        conn.close()
        return {
            'week_start': week_start,
            'week_end': week_end,
            'targets': targets
        }

    def set_weekly_targets(self, week_start: str, targets: Dict[str, Any]) -> Dict[str, Any]:
        """
        Saves per-week, per-subject independent targets for week_start.
        Validates non-negative targets.
        Format of targets: {subject_id: target_value, ...}
        """
        conn = self.get_connection()
        c = conn.cursor()
        try:
            for subj_id_str, val in targets.items():
                subj_id = int(subj_id_str)
                target_val = float(val)
                if target_val < 0:
                    conn.close()
                    return {'success': False, 'error': f'Target value cannot be negative (got {target_val})'}

                # Get subject_client_id
                srow = c.execute("SELECT client_id FROM subjects WHERE id = ?", (subj_id,)).fetchone()
                scid = srow['client_id'] if srow else f"subj_{subj_id}"
                c.execute("""
                INSERT INTO weekly_targets (client_id, week_start, subject_id, subject_client_id, target_value, sync_status, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', datetime('now', 'localtime'))
                ON CONFLICT(week_start, subject_id) DO UPDATE SET
                    target_value = excluded.target_value,
                    sync_status = 'pending',
                    updated_at = datetime('now', 'localtime');
                """, (str(uuid.uuid4()), week_start, subj_id, scid, target_val))

            conn.commit()
            return {'success': True, 'week_start': week_start}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            conn.close()

    def get_tests(self) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("SELECT * FROM tests ORDER BY test_date ASC;").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def update_test(self, test_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        test_num = int(data['test_no']) if 'test_no' in data and data['test_no'] is not None else None
        c.execute("""
        UPDATE tests SET
            test_no = COALESCE(?, test_no),
            test_name = COALESCE(?, test_name),
            test_type = COALESCE(?, test_type),
            test_date = COALESCE(?, test_date),
            physics_syllabus = COALESCE(?, physics_syllabus),
            chemistry_syllabus = COALESCE(?, chemistry_syllabus),
            maths_syllabus = COALESCE(?, maths_syllabus),
            status = COALESCE(?, status),
            score = COALESCE(?, score),
            total_marks = COALESCE(?, total_marks),
            questions_correct = COALESCE(?, questions_correct),
            questions_incorrect = COALESCE(?, questions_incorrect),
            accuracy = COALESCE(?, accuracy),
            time_taken_minutes = COALESCE(?, time_taken_minutes),
            notes = COALESCE(?, notes),
            sync_status = 'pending',
            updated_at = datetime('now', 'localtime')
        WHERE id = ?;
        """, (
            test_num,
            data.get('test_name'),
            data.get('test_type'),
            data.get('test_date'),
            data.get('physics_syllabus'),
            data.get('chemistry_syllabus'),
            data.get('maths_syllabus'),
            data.get('status'),
            float(data['score']) if 'score' in data and data['score'] is not None else None,
            float(data['total_marks']) if 'total_marks' in data and data['total_marks'] is not None else None,
            int(data['questions_correct']) if 'questions_correct' in data and data['questions_correct'] is not None else None,
            int(data['questions_incorrect']) if 'questions_incorrect' in data and data['questions_incorrect'] is not None else None,
            float(data['accuracy']) if 'accuracy' in data and data['accuracy'] is not None else None,
            int(data['time_taken_minutes']) if 'time_taken_minutes' in data and data['time_taken_minutes'] is not None else None,
            data.get('notes'),
            test_id
        ))
        conn.commit()
        conn.close()
        return {'success': True}

    def toggle_test_completion(self, test_id: int) -> Dict[str, Any]:
        """
        Toggles test completion status between 'completed' and 'upcoming'
        WITHOUT requiring scores or question counts to be entered immediately.
        Allows marking completion on test day and entering scores later.
        """
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT status FROM tests WHERE id = ?;", (test_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return {'success': False, 'error': 'Test not found'}

        current_status = row['status']
        new_status = 'upcoming' if current_status == 'completed' else 'completed'
        c.execute("""
        UPDATE tests
        SET status = ?, sync_status = 'pending', updated_at = datetime('now', 'localtime')
        WHERE id = ?;
        """, (new_status, test_id))
        conn.commit()
        conn.close()
        return {'success': True, 'status': new_status, 'is_completed': new_status == 'completed'}

    def log_study_hours(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("""
        INSERT INTO study_hour_logs (date, subject_id, chapter_id, hours, activity_type, notes)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (
            data.get('date', datetime.date.today().isoformat()),
            data['subject_id'],
            data.get('chapter_id'),
            float(data['hours']),
            data.get('activity_type', 'Study'),
            data.get('notes', '')
        ))
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        return {'success': True, 'id': new_id}

    def get_study_hours_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("""
        SELECT h.*, s.name as subject_name, s.color as subject_color, c.name as chapter_name
        FROM study_hour_logs h
        JOIN subjects s ON h.subject_id = s.id
        LEFT JOIN chapters c ON h.chapter_id = c.id
        ORDER BY h.date DESC, h.id DESC LIMIT ?;
        """, (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def log_question_practice(self, data: Dict[str, Any]) -> Dict[str, Any]:
        practiced = int(data.get('questions_practiced', 0))
        correct = int(data.get('correct', 0))
        incorrect = int(data.get('incorrect', 0))
        accuracy = round((correct / practiced) * 100, 1) if practiced > 0 else 0.0

        conn = self.get_connection()
        c = conn.cursor()
        c.execute("""
        INSERT INTO question_practice_logs (date, subject_id, chapter_id, lecture_id, questions_practiced, correct, incorrect, accuracy, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            data.get('date', datetime.date.today().isoformat()),
            data['subject_id'],
            data.get('chapter_id'),
            data.get('lecture_id'),
            practiced,
            correct,
            incorrect,
            accuracy,
            data.get('notes', '')
        ))
        new_id = c.lastrowid
        conn.commit()
        conn.close()
        return {'success': True, 'id': new_id}

    def get_question_practice_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("""
        SELECT q.*, s.name as subject_name, s.color as subject_color, c.name as chapter_name
        FROM question_practice_logs q
        JOIN subjects s ON q.subject_id = s.id
        LEFT JOIN chapters c ON q.chapter_id = c.id
        ORDER BY q.date DESC, q.id DESC LIMIT ?;
        """, (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_comprehensive_analytics(self, time_filter: str = 'all') -> Dict[str, Any]:
        """
        Computes 100% genuine analytics from SQLite data across Lectures, DPPs,
        Weekly Targets, Backlog, Study Sessions (Pomodoro only), Tests, and Smart Recommendations.
        """
        conn = self.get_connection()
        c = conn.cursor()
        today = datetime.date.today()
        today_str = today.isoformat()

        # Date calculations
        start_of_week = (today - datetime.timedelta(days=today.weekday())).isoformat()
        end_of_week = (today + datetime.timedelta(days=6 - today.weekday())).isoformat()
        start_of_month = f"{today.year:04d}-{today.month:02d}-01"
        end_of_month = f"{today.year:04d}-{today.month:02d}-31"

        # 1. LECTURE ANALYTICS
        total_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE is_archived = 0;").fetchone()[0] or 0
        comp_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE is_completed = 1 AND is_archived = 0;").fetchone()[0] or 0
        pending_lecs = total_lecs - comp_lecs
        lec_pct = round((comp_lecs / total_lecs) * 100, 1) if total_lecs > 0 else 0.0

        comp_today = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_completed = 1 AND is_archived = 0
          AND (date(completed_at) = ? OR scheduled_date = ?);
        """, (today_str, today_str)).fetchone()[0] or 0

        comp_this_week = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_completed = 1 AND is_archived = 0
          AND ((completed_at >= ? AND completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
        """, (start_of_week, end_of_week, start_of_week, end_of_week)).fetchone()[0] or 0

        comp_this_month = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_completed = 1 AND is_archived = 0
          AND ((completed_at >= ? AND completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
        """, (start_of_month, end_of_month, start_of_month, end_of_month)).fetchone()[0] or 0

        overdue_lecs = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE scheduled_date < ? AND is_completed = 0 AND is_archived = 0;
        """, (today_str,)).fetchone()[0] or 0

        # Daily completion trend for last 14 days
        daily_completion_trend = []
        for d_offset in range(13, -1, -1):
            dt = (today - datetime.timedelta(days=d_offset)).isoformat()
            day_comp = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE is_completed = 1 AND is_archived = 0
              AND (date(completed_at) = ? OR scheduled_date = ?);
            """, (dt, dt)).fetchone()[0] or 0
            daily_completion_trend.append({'date': dt, 'completed': day_comp})

        # 2. DPP ANALYTICS
        total_dpps = total_lecs
        comp_dpps = c.execute("SELECT COUNT(*) FROM lectures WHERE is_dpp_completed = 1 AND is_archived = 0;").fetchone()[0] or 0
        pending_dpps = total_dpps - comp_dpps
        dpp_pct = round((comp_dpps / total_dpps) * 100, 1) if total_dpps > 0 else 0.0

        dpp_comp_today = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_dpp_completed = 1 AND is_archived = 0
          AND (date(dpp_completed_at) = ? OR scheduled_date = ?);
        """, (today_str, today_str)).fetchone()[0] or 0

        dpp_comp_this_week = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_dpp_completed = 1 AND is_archived = 0
          AND ((dpp_completed_at >= ? AND dpp_completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
        """, (start_of_week, end_of_week, start_of_week, end_of_week)).fetchone()[0] or 0

        dpp_comp_this_month = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE is_dpp_completed = 1 AND is_archived = 0
          AND ((dpp_completed_at >= ? AND dpp_completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
        """, (start_of_month, end_of_month, start_of_month, end_of_month)).fetchone()[0] or 0

        dpp_backlog = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE scheduled_date < ? AND is_dpp_completed = 0 AND is_archived = 0;
        """, (today_str,)).fetchone()[0] or 0

        # Lecture vs DPP gap
        dpp_gap = round(lec_pct - dpp_pct, 1)

        # 3. WEEKLY TARGETS (CURRENT WEEK & HISTORICAL)
        subjects = c.execute("SELECT * FROM subjects ORDER BY sort_order;").fetchall()
        wt_rows = c.execute("SELECT subject_id, target_value FROM weekly_targets WHERE week_start = ?;", (start_of_week,)).fetchall()
        custom_targets = {r['subject_id']: r['target_value'] for r in wt_rows}

        subject_cards = []
        lecture_target_total = 0.0
        lecture_achieved_total = 0.0
        hours_target_total = 0.0
        hours_achieved_total = 0.0

        day_of_week = today.weekday() + 1  # 1 to 7

        for s in subjects:
            s_id = s['id']
            is_custom = s_id in custom_targets
            target_val = custom_targets[s_id] if is_custom else s['weekly_target_val']
            t_type = s['target_type']

            if t_type == 'lectures':
                achieved = c.execute("""
                SELECT COUNT(*) FROM lectures
                WHERE subject_id = ? AND is_completed = 1 AND is_archived = 0
                  AND ((completed_at >= ? AND completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
                """, (s_id, start_of_week, end_of_week, start_of_week, end_of_week)).fetchone()[0] or 0
                lecture_target_total += target_val
                lecture_achieved_total += achieved
            else:
                p_hrs = c.execute("""
                SELECT SUM(duration_hours) FROM study_sessions
                WHERE (subject LIKE '%Physical%' OR subject = 'Physical Chemistry')
                  AND date >= ? AND date <= ?;
                """, (start_of_week, end_of_week)).fetchone()[0] or 0.0
                achieved = round(p_hrs, 1)
                hours_target_total += target_val
                hours_achieved_total += achieved

            rem = max(0.0, round(target_val - achieved, 1))
            pct = round((achieved / target_val) * 100, 1) if target_val > 0 else 0.0

            # Status classification
            if pct >= 100.0:
                status_label = "Target Achieved" if pct == 100.0 else "Target Exceeded"
                status_color = "emerald"
            else:
                expected_pct = (day_of_week / 7.0) * 100.0
                if pct >= expected_pct:
                    status_label = "On Track"
                    status_color = "emerald"
                elif pct >= expected_pct - 20.0:
                    status_label = "Slightly Behind"
                    status_color = "amber"
                else:
                    diff = int(round(rem)) if t_type == 'lectures' else rem
                    status_label = f"{diff} {s['target_type']} behind"
                    status_color = "rose"

            total_subj_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE subject_id = ? AND is_archived = 0;", (s_id,)).fetchone()[0] or 0
            comp_subj_lecs = c.execute("SELECT COUNT(*) FROM lectures WHERE subject_id = ? AND is_completed = 1 AND is_archived = 0;", (s_id,)).fetchone()[0] or 0
            comp_subj_dpps = c.execute("SELECT COUNT(*) FROM lectures WHERE subject_id = ? AND is_dpp_completed = 1 AND is_archived = 0;", (s_id,)).fetchone()[0] or 0
            subj_backlog = c.execute("SELECT COUNT(*) FROM lectures WHERE subject_id = ? AND scheduled_date < ? AND is_completed = 0 AND is_archived = 0;", (s_id, today_str)).fetchone()[0] or 0

            subject_cards.append({
                'id': s_id,
                'name': s['name'],
                'display_name': s['display_name'],
                'color': s['color'],
                'target_type': t_type,
                'target_val': target_val,
                'achieved_val': achieved,
                'remaining_val': rem,
                'percentage': pct,
                'status_label': status_label,
                'status_color': status_color,
                'total_lectures': total_subj_lecs,
                'completed_lectures': comp_subj_lecs,
                'lecture_pct': round((comp_subj_lecs / total_subj_lecs) * 100, 1) if total_subj_lecs > 0 else 0,
                'completed_dpps': comp_subj_dpps,
                'dpp_pct': round((comp_subj_dpps / total_subj_lecs) * 100, 1) if total_subj_lecs > 0 else 0,
                'backlog': subj_backlog
            })

        lecture_remaining = max(0.0, round(lecture_target_total - lecture_achieved_total, 1))
        hours_remaining = max(0.0, round(hours_target_total - hours_achieved_total, 1))
        overall_lec_pct = round((lecture_achieved_total / lecture_target_total) * 100, 1) if lecture_target_total > 0 else 0.0
        overall_hours_pct = round((hours_achieved_total / hours_target_total) * 100, 1) if hours_target_total > 0 else 0.0

        # Daily Breakdown for current week (Mon to Sun)
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        daily_breakdown = []
        monday_dt = datetime.date.fromisoformat(start_of_week)
        for i in range(7):
            d_date = (monday_dt + datetime.timedelta(days=i)).isoformat()
            planned_count = c.execute("SELECT COUNT(*) FROM lectures WHERE scheduled_date = ? AND is_archived = 0;", (d_date,)).fetchone()[0] or 0
            done_count = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE scheduled_date = ? AND is_completed = 1 AND is_archived = 0;
            """, (d_date,)).fetchone()[0] or 0
            dpp_planned = planned_count
            dpp_done = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE scheduled_date = ? AND is_dpp_completed = 1 AND is_archived = 0;
            """, (d_date,)).fetchone()[0] or 0
            hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (d_date,)).fetchone()[0] or 0.0

            daily_breakdown.append({
                'day_name': day_names[i],
                'date': d_date,
                'planned': planned_count,
                'achieved': done_count,
                'dpp_planned': dpp_planned,
                'dpp_achieved': dpp_done,
                'hours': round(hrs, 1),
                'is_today': d_date == today_str
            })

        # Week-over-Week Progress (Last 12 weeks)
        week_over_week = []
        for w_offset in range(11, -1, -1):
            w_start = (monday_dt - datetime.timedelta(weeks=w_offset)).isoformat()
            w_end = (monday_dt - datetime.timedelta(weeks=w_offset) + datetime.timedelta(days=6)).isoformat()
            w_label = f"W-{w_offset}" if w_offset > 0 else "This Wk"
            
            w_targets = c.execute("SELECT subject_id, target_value FROM weekly_targets WHERE week_start = ?;", (w_start,)).fetchall()
            w_custom = {r['subject_id']: r['target_value'] for r in w_targets}
            w_tgt_sum = sum(w_custom.get(s['id'], s['weekly_target_val']) for s in subjects if s['target_type'] == 'lectures')
            w_done = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE is_completed = 1 AND is_archived = 0
              AND ((completed_at >= ? AND completed_at <= ?) OR (scheduled_date >= ? AND scheduled_date <= ?));
            """, (w_start, w_end, w_start, w_end)).fetchone()[0] or 0

            w_pct = round((w_done / w_tgt_sum) * 100, 1) if w_tgt_sum > 0 else 0.0
            week_over_week.append({
                'week_label': w_label,
                'week_start': w_start,
                'week_end': w_end,
                'target': w_tgt_sum,
                'achieved': w_done,
                'percentage': w_pct
            })

        # 4. BACKLOG ANALYTICS
        backlog_by_subj = {}
        for s in subjects:
            count = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE subject_id = ? AND scheduled_date < ? AND is_completed = 0 AND is_archived = 0;
            """, (s['id'], today_str)).fetchone()[0] or 0
            backlog_by_subj[s['display_name']] = count

        oldest_overdue = c.execute("""
        SELECT scheduled_date FROM lectures
        WHERE scheduled_date < ? AND is_completed = 0 AND is_archived = 0
        ORDER BY scheduled_date ASC LIMIT 1;
        """, (today_str,)).fetchone()
        oldest_overdue_date = oldest_overdue[0] if oldest_overdue else None

        backlog_trend = []
        for w_offset in range(4, -1, -1):
            ref_date = (today - datetime.timedelta(weeks=w_offset)).isoformat()
            b_cnt = c.execute("""
            SELECT COUNT(*) FROM lectures
            WHERE scheduled_date < ? AND (is_completed = 0 OR completed_at > ?) AND is_archived = 0;
            """, (ref_date, ref_date)).fetchone()[0] or 0
            w_lbl = f"Week -{w_offset}" if w_offset > 0 else "Current"
            backlog_trend.append({'label': w_lbl, 'date': ref_date, 'count': b_cnt})

        # 5. STUDY HOURS & CONSISTENCY (100% Pomodoro only)
        total_sessions = c.execute("SELECT COUNT(*) FROM study_sessions;").fetchone()[0] or 0
        has_pomodoro = total_sessions > 0
        pomo_study_hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions;").fetchone()[0] or 0.0
        pomo_today_hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (today_str,)).fetchone()[0] or 0.0
        pomo_week_hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_week, end_of_week)).fetchone()[0] or 0.0
        pomo_month_hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date >= ? AND date <= ?;", (start_of_month, end_of_month)).fetchone()[0] or 0.0

        studied_dates = [r[0] for r in c.execute("SELECT DISTINCT date FROM study_sessions ORDER BY date ASC;").fetchall()]
        days_studied = len(studied_dates)
        avg_studied_day = round(pomo_study_hrs / days_studied, 1) if days_studied > 0 else 0.0

        heatmap_matrix = []
        for d_offset in range(27, -1, -1):
            h_date = (today - datetime.timedelta(days=d_offset)).isoformat()
            hrs = c.execute("SELECT SUM(duration_hours) FROM study_sessions WHERE date = ?;", (h_date,)).fetchone()[0] or 0.0
            hrs = round(hrs, 1)
            level = 0
            if hrs > 6.0: level = 4
            elif hrs > 4.0: level = 3
            elif hrs > 2.0: level = 2
            elif hrs > 0.0: level = 1

            heatmap_matrix.append({
                'date': h_date,
                'hours': hrs,
                'level': level,
                'day_name': (today - datetime.timedelta(days=d_offset)).strftime('%a')
            })

        # 6. TESTS ANALYTICS
        tests = [dict(r) for r in c.execute("SELECT * FROM tests ORDER BY test_date ASC;").fetchall()]
        total_tests = len(tests)
        comp_tests = sum(1 for t in tests if t.get('status') == 'completed')
        upcoming_tests = [t for t in tests if t.get('status') == 'upcoming' and t.get('test_date', '') >= today_str]

        # 7. SMART DATA-DRIVEN RECOMMENDATIONS
        recommendations = []
        for s in subject_cards:
            if s['status_color'] == 'rose':
                recommendations.append({
                    'type': 'warning',
                    'icon': 'alert-circle',
                    'subject': s['display_name'],
                    'message': f"{s['display_name']} is {s['remaining_val']} {s['target_type']} behind this week's quota."
                })
            elif s['status_label'] in ('Target Achieved', 'Target Exceeded'):
                recommendations.append({
                    'type': 'success',
                    'icon': 'check-circle-2',
                    'subject': s['display_name'],
                    'message': f"{s['display_name']} weekly target has been achieved!"
                })

        if dpp_gap > 15.0:
            recommendations.append({
                'type': 'info',
                'icon': 'clipboard-check',
                'subject': 'DPP Practice',
                'message': f"Lectures ({lec_pct}%) lead DPPs ({dpp_pct}%) by {dpp_gap}%. Schedule practice."
            })

        if overdue_lecs > 0:
            recommendations.append({
                'type': 'warning',
                'icon': 'refresh-cw',
                'subject': 'Backlog',
                'message': f"{overdue_lecs} lectures are overdue. Use Smart Redistribution to catch up."
            })

        if upcoming_tests:
            next_test = upcoming_tests[0]
            try:
                days_left = (datetime.date.fromisoformat(next_test['test_date']) - today).days
                if days_left <= 14:
                    recommendations.append({
                        'type': 'info',
                        'icon': 'award',
                        'subject': 'Official Test',
                        'message': f"Test #{next_test.get('test_no', 1)} ({next_test['test_name'].split('(')[0].strip()}) is in {days_left} days."
                    })
            except Exception:
                pass

        conn.close()

        res = {
            'time_filter': time_filter,
            'today': today_str,
            'week_start': start_of_week,
            'week_end': end_of_week,
            'lectures': {
                'total': total_lecs,
                'total_lecs': total_lecs,
                'completed': comp_lecs,
                'comp_lecs': comp_lecs,
                'pending': pending_lecs,
                'pending_lecs': pending_lecs,
                'percentage': lec_pct,
                'lec_pct': lec_pct,
                'completed_today': comp_today,
                'comp_today': comp_today,
                'completed_this_week': comp_this_week,
                'comp_this_week': comp_this_week,
                'completed_this_month': comp_this_month,
                'comp_this_month': comp_this_month,
                'overdue': overdue_lecs,
                'overdue_lecs': overdue_lecs,
                'daily_trend': daily_completion_trend,
                'daily_completion_trend': daily_completion_trend
            },
            'dpps': {
                'total': total_dpps,
                'total_dpps': total_dpps,
                'completed': comp_dpps,
                'comp_dpps': comp_dpps,
                'pending': pending_dpps,
                'pending_dpps': pending_dpps,
                'percentage': dpp_pct,
                'dpp_pct': dpp_pct,
                'completed_today': dpp_comp_today,
                'dpp_comp_today': dpp_comp_today,
                'completed_this_week': dpp_comp_this_week,
                'dpp_comp_this_week': dpp_comp_this_week,
                'completed_this_month': dpp_comp_this_month,
                'dpp_comp_this_month': dpp_comp_this_month,
                'backlog': dpp_backlog,
                'dpp_backlog': dpp_backlog,
                'lecture_gap': dpp_gap,
                'dpp_gap': dpp_gap
            },
            'weekly_targets': {
                'lecture_target_total': lecture_target_total,
                'lecture_achieved_total': lecture_achieved_total,
                'lecture_remaining': lecture_remaining,
                'lecture_percentage': overall_lec_pct,
                'overall_lec_pct': overall_lec_pct,
                'hours_target_total': hours_target_total,
                'hours_achieved_total': hours_achieved_total,
                'hours_remaining': hours_remaining,
                'hours_percentage': overall_hours_pct,
                'overall_hours_pct': overall_hours_pct,
                'subjects': subject_cards,
                'subject_cards': subject_cards,
                'daily_breakdown': daily_breakdown,
                'week_over_week': week_over_week
            },
            'backlog': {
                'total': overdue_lecs,
                'by_subject': backlog_by_subj,
                'oldest_overdue_date': oldest_overdue_date,
                'trend': backlog_trend
            },
            'study_hours': {
                'has_data': has_pomodoro,
                'total_hours': round(pomo_study_hrs, 1),
                'today_hours': round(pomo_today_hrs, 1),
                'week_hours': round(pomo_week_hrs, 1),
                'month_hours': round(pomo_month_hrs, 1),
                'days_studied': days_studied,
                'average_daily': avg_studied_day,
                'heatmap': heatmap_matrix,
                'heatmap_matrix': heatmap_matrix
            },
            'tests': {
                'total': total_tests,
                'total_tests': total_tests,
                'completed': comp_tests,
                'completed_tests': comp_tests,
                'upcoming_count': len(upcoming_tests),
                'upcoming_tests': upcoming_tests,
                'list': tests,
                'all_tests': tests
            },
            'recommendations': recommendations
        }
        res['lecture_analytics'] = res['lectures']
        res['dpp_analytics'] = res['dpps']
        res['backlog_analytics'] = res['backlog']
        res['study_analytics'] = res['study_hours']
        res['tests_analytics'] = res['tests']
        return res

    def export_full_database_json(self) -> str:
        conn = self.get_connection()
        data = {
            'subjects': [dict(r) for r in conn.execute("SELECT * FROM subjects;").fetchall()],
            'chapters': [dict(r) for r in conn.execute("SELECT * FROM chapters;").fetchall()],
            'lectures': [dict(r) for r in conn.execute("SELECT * FROM lectures;").fetchall()],
            'tests': [dict(r) for r in conn.execute("SELECT * FROM tests;").fetchall()],
            'study_sessions': [dict(r) for r in conn.execute("SELECT * FROM study_sessions;").fetchall()],
            'revisions': [dict(r) for r in conn.execute("SELECT * FROM revisions;").fetchall()],
            'weekly_targets': [dict(r) for r in conn.execute("SELECT * FROM weekly_targets;").fetchall()],
            'question_practice_logs': [dict(r) for r in conn.execute("SELECT * FROM question_practice_logs;").fetchall()],
            'study_hour_logs': [dict(r) for r in conn.execute("SELECT * FROM study_hour_logs;").fetchall()],
            'app_settings': [dict(r) for r in conn.execute("SELECT * FROM app_settings;").fetchall()],
        }
        conn.close()
        return json.dumps(data, indent=2)

    # ------------------ SUPABASE CLOUD SYNC HELPERS ------------------

    def ensure_sync_columns(self):
        """Ensures all SQLite tables have client_id, sync_status, deleted_at, and foreign client_ids."""
        conn = self.get_connection()
        c = conn.cursor()

        tables = {
            'subjects': ['client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'chapters': ['client_id TEXT', 'subject_client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'lectures': ['client_id TEXT', 'subject_client_id TEXT', 'chapter_client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'tests': ['client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'weekly_targets': ['client_id TEXT', 'subject_client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'study_sessions': ['client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'revisions': ['client_id TEXT', 'lecture_client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT'],
            'question_practice_logs': ['client_id TEXT', 'subject_client_id TEXT', 'chapter_client_id TEXT', 'lecture_client_id TEXT', 'sync_status TEXT DEFAULT "synced"', 'deleted_at TEXT']
        }

        for table, col_defs in tables.items():
            c.execute(f"PRAGMA table_info({table});")
            existing_cols = [r['name'] for r in c.fetchall()]
            for col_def in col_defs:
                col_name = col_def.split()[0]
                if col_name not in existing_cols:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {col_def};")

        # 1. Backfill subjects client_id
        rows = c.execute("SELECT id, name, client_id FROM subjects").fetchall()
        subj_map = {}
        for r in rows:
            cid = r['client_id']
            if not cid:
                clean_name = r['name'].lower().replace(' ', '_')
                cid = f"subj_{clean_name}"
                c.execute("UPDATE subjects SET client_id = ? WHERE id = ?", (cid, r['id']))
            subj_map[r['id']] = cid

        # 2. Backfill chapters client_id & subject_client_id
        rows = c.execute("SELECT id, subject_id, name, sequence_no, client_id FROM chapters").fetchall()
        chap_map = {}
        for r in rows:
            cid = r['client_id']
            subj_cid = subj_map.get(r['subject_id'], '')
            if not cid:
                cid = str(uuid.uuid4())
                c.execute("UPDATE chapters SET client_id = ?, subject_client_id = ? WHERE id = ?", (cid, subj_cid, r['id']))
            else:
                c.execute("UPDATE chapters SET subject_client_id = ? WHERE id = ?", (subj_cid, r['id']))
            chap_map[r['id']] = cid

        # 3. Backfill lectures client_id & foreign client_ids
        rows = c.execute("SELECT id, subject_id, chapter_id, client_id FROM lectures").fetchall()
        lec_map = {}
        for r in rows:
            cid = r['client_id']
            subj_cid = subj_map.get(r['subject_id'], '')
            chap_cid = chap_map.get(r['chapter_id'], '')
            if not cid:
                cid = str(uuid.uuid4())
                c.execute("UPDATE lectures SET client_id = ?, subject_client_id = ?, chapter_client_id = ? WHERE id = ?", (cid, subj_cid, chap_cid, r['id']))
            else:
                c.execute("UPDATE lectures SET subject_client_id = ?, chapter_client_id = ? WHERE id = ?", (subj_cid, chap_cid, r['id']))
            lec_map[r['id']] = cid

        # 4. Backfill tests client_id
        rows = c.execute("SELECT id, client_id FROM tests").fetchall()
        for r in rows:
            if not r['client_id']:
                cid = str(uuid.uuid4())
                c.execute("UPDATE tests SET client_id = ? WHERE id = ?", (cid, r['id']))

        # 5. Backfill weekly_targets client_id & subject_client_id
        rows = c.execute("SELECT id, subject_id, client_id FROM weekly_targets").fetchall()
        for r in rows:
            subj_cid = subj_map.get(r['subject_id'], '')
            if not r['client_id']:
                cid = str(uuid.uuid4())
                c.execute("UPDATE weekly_targets SET client_id = ?, subject_client_id = ? WHERE id = ?", (cid, subj_cid, r['id']))
            else:
                c.execute("UPDATE weekly_targets SET subject_client_id = ? WHERE id = ?", (subj_cid, r['id']))

        # 6. Backfill study_sessions client_id
        rows = c.execute("SELECT id, external_session_id, client_id FROM study_sessions").fetchall()
        for r in rows:
            if not r['client_id']:
                cid = str(uuid.uuid4())
                c.execute("UPDATE study_sessions SET client_id = ? WHERE id = ?", (cid, r['id']))

        # 7. Backfill revisions client_id & lecture_client_id
        rows = c.execute("SELECT id, lecture_id, client_id FROM revisions").fetchall()
        for r in rows:
            lec_cid = lec_map.get(r['lecture_id'], '')
            if not r['client_id']:
                cid = str(uuid.uuid4())
                c.execute("UPDATE revisions SET client_id = ?, lecture_client_id = ? WHERE id = ?", (cid, lec_cid, r['id']))
            else:
                c.execute("UPDATE revisions SET lecture_client_id = ? WHERE id = ?", (lec_cid, r['id']))

        # Create indexes on client_id for fast lookups
        for table in tables.keys():
            c.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_client_id ON {table}(client_id);")

        conn.commit()
        conn.close()

    def mark_all_pending_for_sync(self):
        """Marks all local rows as pending so initial sync uploads full data to Supabase."""
        conn = self.get_connection()
        for table in ['subjects', 'chapters', 'lectures', 'tests', 'weekly_targets', 'study_sessions', 'revisions']:
            conn.execute(f"UPDATE {table} SET sync_status = 'pending'")
        conn.commit()
        conn.close()

    def get_pending_sync_count(self) -> int:
        """Returns total count of pending sync records across all tables."""
        conn = self.get_connection()
        total = 0
        for table in ['subjects', 'chapters', 'lectures', 'tests', 'weekly_targets', 'study_sessions', 'revisions']:
            cnt = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE sync_status = 'pending'").fetchone()[0]
            total += cnt
        conn.close()
        return total

    # ------------------ MERGE CLOUD PULLS INTO SQLITE ------------------

    def merge_cloud_subjects(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            existing = c.execute("SELECT id FROM subjects WHERE client_id = ?", (client_id,)).fetchone()
            if existing:
                if deleted_at:
                    c.execute("UPDATE subjects SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE subjects SET
                            display_name = ?, color = ?, resource_name = ?,
                            weekly_target_val = ?, target_type = ?, sort_order = ?,
                            sync_status = 'synced'
                        WHERE client_id = ?
                    """, (r.get('display_name'), r.get('color'), r.get('resource_name'),
                          r.get('weekly_target_val'), r.get('target_type'), r.get('sort_order', 0), client_id))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT OR IGNORE INTO subjects (client_id, name, display_name, color, resource_name, weekly_target_val, target_type, sort_order, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (client_id, r.get('name'), r.get('display_name'), r.get('color'), r.get('resource_name'),
                          r.get('weekly_target_val'), r.get('target_type'), r.get('sort_order', 0)))
        conn.commit()
        conn.close()

    def merge_cloud_chapters(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            # Resolve subject_id from subject_client_id
            subj_cid = r.get('subject_client_id', '')
            subj_row = c.execute("SELECT id FROM subjects WHERE client_id = ?", (subj_cid,)).fetchone()
            subj_id = subj_row['id'] if subj_row else 1

            existing = c.execute("SELECT id FROM chapters WHERE client_id = ?", (client_id,)).fetchone()
            if existing:
                if deleted_at:
                    c.execute("UPDATE chapters SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE chapters SET
                            subject_id = ?, subject_client_id = ?, name = ?,
                            sequence_no = ?, target_hours = ?, sync_status = 'synced'
                        WHERE client_id = ?
                    """, (subj_id, subj_cid, r.get('name'), r.get('sequence_no', 0), r.get('target_hours', 0), client_id))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT OR IGNORE INTO chapters (client_id, subject_id, subject_client_id, name, sequence_no, target_hours, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, 'synced')
                    """, (client_id, subj_id, subj_cid, r.get('name'), r.get('sequence_no', 0), r.get('target_hours', 0)))
        conn.commit()
        conn.close()

    def merge_cloud_lectures(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue

            subj_cid = r.get('subject_client_id', '')
            chap_cid = r.get('chapter_client_id', '')
            subj_row = c.execute("SELECT id FROM subjects WHERE client_id = ?", (subj_cid,)).fetchone()
            chap_row = c.execute("SELECT id FROM chapters WHERE client_id = ?", (chap_cid,)).fetchone()
            subj_id = subj_row['id'] if subj_row else 1
            chap_id = chap_row['id'] if chap_row else 1

            existing = c.execute("SELECT id, is_completed, is_dpp_completed, sync_status FROM lectures WHERE client_id = ?", (client_id,)).fetchone()
            is_comp = 1 if r.get('is_completed') else 0
            is_dpp_comp = 1 if r.get('is_dpp_completed') else 0

            if existing:
                if deleted_at:
                    c.execute("UPDATE lectures SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    # CONFLICT RESOLUTION: If local has pending changes, keep local data
                    # (the pending data will be pushed to cloud in the next push cycle)
                    local_sync_status = existing['sync_status'] or 'synced'
                    if local_sync_status == 'pending':
                        print(f"[CloudSync] SKIP merge for lecture {client_id}: local has pending changes (local completed={existing['is_completed']}, cloud completed={is_comp})")
                        continue
                    
                    print(f"[CloudSync] MERGE lecture {client_id}: completed {existing['is_completed']} → {is_comp}, dpp {existing['is_dpp_completed']} → {is_dpp_comp}")
                    c.execute("""
                        UPDATE lectures SET
                            subject_id = ?, chapter_id = ?, subject_client_id = ?, chapter_client_id = ?,
                            batch = ?, lecture_no = ?, lecture_name = ?, topic = ?, dpp_no = ?,
                            resource = ?, scheduled_date = ?, rescheduled_date = ?, faculty = ?,
                            is_completed = ?, completed_at = ?, is_dpp_completed = ?, dpp_completed_at = ?,
                            questions_practiced = ?, questions_correct = ?, questions_incorrect = ?,
                            accuracy = ?, revision1_done = ?, revision1_date = ?, revision2_done = ?,
                            revision2_date = ?, is_backlog = ?, notes = ?, is_archived = ?,
                            sync_status = 'synced'
                        WHERE client_id = ?
                    """, (
                        subj_id, chap_id, subj_cid, chap_cid,
                        r.get('batch', ''), r.get('lecture_no', 1), r.get('lecture_name', ''), r.get('topic', ''),
                        r.get('dpp_no', 0), r.get('resource', ''), r.get('scheduled_date'), r.get('rescheduled_date'),
                        r.get('faculty', ''), is_comp, r.get('completed_at'), is_dpp_comp, r.get('dpp_completed_at'),
                        r.get('questions_practiced', 0), r.get('questions_correct', 0), r.get('questions_incorrect', 0),
                        r.get('accuracy', 0.0), 1 if r.get('revision1_done') else 0, r.get('revision1_date'),
                        1 if r.get('revision2_done') else 0, r.get('revision2_date'),
                        1 if r.get('is_backlog') else 0, r.get('notes', ''), 1 if r.get('is_archived') else 0,
                        client_id
                    ))
            else:
                if not deleted_at:
                    print(f"[CloudSync] INSERT new lecture from cloud: {client_id} completed={is_comp}")
                    c.execute("""
                        INSERT INTO lectures (
                            client_id, subject_id, chapter_id, subject_client_id, chapter_client_id,
                            batch, lecture_no, lecture_name, topic, dpp_no, resource, scheduled_date,
                            rescheduled_date, faculty, is_completed, completed_at, is_dpp_completed,
                            dpp_completed_at, questions_practiced, questions_correct, questions_incorrect,
                            accuracy, revision1_done, revision1_date, revision2_done, revision2_date,
                            is_backlog, notes, is_archived, sync_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (
                        client_id, subj_id, chap_id, subj_cid, chap_cid,
                        r.get('batch', ''), r.get('lecture_no', 1), r.get('lecture_name', ''), r.get('topic', ''),
                        r.get('dpp_no', 0), r.get('resource', ''), r.get('scheduled_date'), r.get('rescheduled_date'),
                        r.get('faculty', ''), is_comp, r.get('completed_at'), is_dpp_comp,
                        r.get('dpp_completed_at'), r.get('questions_practiced', 0), r.get('questions_correct', 0),
                        r.get('questions_incorrect', 0), r.get('accuracy', 0.0),
                        1 if r.get('revision1_done') else 0, r.get('revision1_date'),
                        1 if r.get('revision2_done') else 0, r.get('revision2_date'),
                        1 if r.get('is_backlog') else 0, r.get('notes', ''), 1 if r.get('is_archived') else 0
                    ))
        conn.commit()
        conn.close()

    def merge_cloud_tests(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            existing = c.execute("SELECT id FROM tests WHERE client_id = ?", (client_id,)).fetchone()
            if existing:
                if deleted_at:
                    c.execute("UPDATE tests SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE tests SET
                            test_no = ?, test_name = ?, test_type = ?, test_date = ?,
                            physics_syllabus = ?, chemistry_syllabus = ?, maths_syllabus = ?,
                            status = ?, score = ?, total_marks = ?, questions_correct = ?,
                            questions_incorrect = ?, accuracy = ?, time_taken_minutes = ?,
                            notes = ?, sync_status = 'synced'
                        WHERE client_id = ?
                    """, (
                        r.get('test_no', 1), r.get('test_name'), r.get('test_type'), r.get('test_date'),
                        r.get('physics_syllabus', ''), r.get('chemistry_syllabus', ''), r.get('maths_syllabus', ''),
                        r.get('status', 'upcoming'), r.get('score', 0), r.get('total_marks', 300),
                        r.get('questions_correct', 0), r.get('questions_incorrect', 0), r.get('accuracy', 0),
                        r.get('time_taken_minutes', 0), r.get('notes', ''), client_id
                    ))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT INTO tests (
                            client_id, test_no, test_name, test_type, test_date, physics_syllabus,
                            chemistry_syllabus, maths_syllabus, status, score, total_marks,
                            questions_correct, questions_incorrect, accuracy, time_taken_minutes, notes, sync_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (
                        client_id, r.get('test_no', 1), r.get('test_name'), r.get('test_type'), r.get('test_date'),
                        r.get('physics_syllabus', ''), r.get('chemistry_syllabus', ''), r.get('maths_syllabus', ''),
                        r.get('status', 'upcoming'), r.get('score', 0), r.get('total_marks', 300),
                        r.get('questions_correct', 0), r.get('questions_incorrect', 0), r.get('accuracy', 0),
                        r.get('time_taken_minutes', 0), r.get('notes', '')
                    ))
        conn.commit()
        conn.close()

    def merge_cloud_weekly_targets(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            subj_cid = r.get('subject_client_id', '')
            subj_row = c.execute("SELECT id FROM subjects WHERE client_id = ?", (subj_cid,)).fetchone()
            subj_id = subj_row['id'] if subj_row else 1

            existing = c.execute("SELECT id FROM weekly_targets WHERE client_id = ?", (client_id,)).fetchone()
            if existing:
                if deleted_at:
                    c.execute("UPDATE weekly_targets SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE weekly_targets SET
                            week_start = ?, subject_id = ?, subject_client_id = ?, target_value = ?, sync_status = 'synced'
                        WHERE client_id = ?
                    """, (r.get('week_start'), subj_id, subj_cid, r.get('target_value'), client_id))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT OR IGNORE INTO weekly_targets (client_id, week_start, subject_id, subject_client_id, target_value, sync_status)
                        VALUES (?, ?, ?, ?, ?, 'synced')
                    """, (client_id, r.get('week_start'), subj_id, subj_cid, r.get('target_value')))
        conn.commit()
        conn.close()

    def merge_cloud_study_sessions(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            existing = c.execute("SELECT id FROM study_sessions WHERE client_id = ?", (client_id,)).fetchone()
            if existing:
                if deleted_at:
                    c.execute("UPDATE study_sessions SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE study_sessions SET
                            source = ?, external_session_id = ?, date = ?, start_time = ?, end_time = ?,
                            duration_minutes = ?, duration_hours = ?, subject = ?, chapter = ?, topic = ?,
                            activity = ?, notes = ?, sync_status = 'synced'
                        WHERE client_id = ?
                    """, (
                        r.get('source', 'Pomodoro'), r.get('external_session_id'), r.get('date'),
                        r.get('start_time'), r.get('end_time'), r.get('duration_minutes', 0),
                        r.get('duration_hours', 0), r.get('subject', ''), r.get('chapter', ''),
                        r.get('topic', ''), r.get('activity', 'Other'), r.get('notes', ''), client_id
                    ))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT INTO study_sessions (
                            client_id, source, external_session_id, date, start_time, end_time,
                            duration_minutes, duration_hours, subject, chapter, topic, activity, notes, sync_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (
                        client_id, r.get('source', 'Pomodoro'), r.get('external_session_id'), r.get('date'),
                        r.get('start_time'), r.get('end_time'), r.get('duration_minutes', 0),
                        r.get('duration_hours', 0), r.get('subject', ''), r.get('chapter', ''),
                        r.get('topic', ''), r.get('activity', 'Other'), r.get('notes', '')
                    ))
        conn.commit()
        conn.close()

    def merge_cloud_revisions(self, cloud_rows: List[Dict[str, Any]]):
        conn = self.get_connection()
        c = conn.cursor()
        for r in cloud_rows:
            client_id = r.get('client_id')
            deleted_at = r.get('deleted_at')
            if not client_id:
                continue
            lec_cid = r.get('lecture_client_id', '')
            lec_row = c.execute("SELECT id FROM lectures WHERE client_id = ?", (lec_cid,)).fetchone()
            lec_id = lec_row['id'] if lec_row else 1

            existing = c.execute("SELECT id FROM revisions WHERE client_id = ?", (client_id,)).fetchone()
            is_comp = 1 if r.get('is_completed') else 0
            if existing:
                if deleted_at:
                    c.execute("UPDATE revisions SET deleted_at = ?, sync_status = 'synced' WHERE client_id = ?", (deleted_at, client_id))
                else:
                    c.execute("""
                        UPDATE revisions SET
                            lecture_id = ?, lecture_client_id = ?, stage_no = ?, is_completed = ?,
                            completed_at = ?, scheduled_date = ?, notes = ?, sync_status = 'synced'
                        WHERE client_id = ?
                    """, (lec_id, lec_cid, r.get('stage_no', 1), is_comp, r.get('completed_at'), r.get('scheduled_date'), r.get('notes', ''), client_id))
            else:
                if not deleted_at:
                    c.execute("""
                        INSERT OR IGNORE INTO revisions (client_id, lecture_id, lecture_client_id, stage_no, is_completed, completed_at, scheduled_date, notes, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (client_id, lec_id, lec_cid, r.get('stage_no', 1), is_comp, r.get('completed_at'), r.get('scheduled_date'), r.get('notes', '')))
        conn.commit()
        conn.close()

if __name__ == '__main__':
    db = DatabaseManager('scratch/test_db')
    print("DatabaseManager with StudySessions initialized.")

