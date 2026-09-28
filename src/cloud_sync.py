"""
AAYUSH 360 - Cloud Synchronization Engine (Supabase Local-First)

Provides secure, local-first, bidirectional synchronization with Supabase.
1. Local SQLite remains the single primary source of truth for the desktop app.
2. All network calls run in background threads to guarantee zero UI lag / zero blocking.
3. Completely offline-capable: changes made offline queue up and sync automatically on reconnect.
4. Uses public publishable key with Supabase Row Level Security (RLS) - never requires secret keys.
5. Preserves all integer IDs, existing user data, and Pomodoro independence.
"""

import os
import time
import json
import uuid
import datetime
import threading
from typing import Dict, Any, List, Optional
from supabase import create_client, Client
from src.config import get_supabase_config

# Setting Keys in SQLite app_settings
KEY_CLOUD_ENABLED = 'cloud_sync_enabled'
KEY_CLOUD_USER_ID = 'cloud_user_id'
KEY_CLOUD_USER_EMAIL = 'cloud_user_email'
KEY_CLOUD_ACCESS_TOKEN = 'cloud_access_token'
KEY_CLOUD_REFRESH_TOKEN = 'cloud_refresh_token'
KEY_CLOUD_USER_PASSWORD = 'cloud_user_password'
KEY_CLOUD_LAST_SYNC = 'cloud_last_sync_time'
KEY_CLOUD_SYNC_STATUS = 'cloud_sync_status'

class CloudSyncEngine:
    def __init__(self, db_manager, pomodoro_sync=None):
        self.db = db_manager
        self.pomodoro_sync = pomodoro_sync
        self._lock = threading.Lock()
        self._sync_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.config = get_supabase_config()
        self._client: Optional[Client] = None
        
        # Ensure SQLite has sync metadata columns
        self.db.ensure_sync_columns()
        
        # Initialize Supabase client
        self._init_client()

    def flush_pomodoro(self):
        """Flushes any active Pomodoro session before sync so uncommitted study time is uploaded."""
        if self.pomodoro_sync and hasattr(self.pomodoro_sync, 'flush_live_session'):
            try:
                res = self.pomodoro_sync.flush_live_session()
                if res.get('flushed'):
                    print(f"[CloudSync] Pomodoro live session flushed ({res.get('minutes')} min) into SQLite before cloud sync.")
            except Exception as e:
                print(f"[CloudSync] Error flushing Pomodoro session: {e}")

    def _init_client(self):
        try:
            self._client = create_client(self.config['url'], self.config['key'])
            self._restore_session()
        except Exception as e:
            print(f"[CloudSync] Client initialization error: {e}")

    def _get_setting(self, key: str, default: str = "") -> str:
        try:
            conn = self.db.get_connection()
            row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
            conn.close()
            return row['value'] if row else default
        except Exception:
            return default

    def _set_setting(self, key: str, value: str):
        try:
            conn = self.db.get_connection()
            conn.execute("""
                INSERT INTO app_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            """, (key, str(value)))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[CloudSync] Error setting {key}: {e}")

    def _save_session(self, session):
        """Persists Supabase auth session tokens to SQLite app_settings."""
        if not session:
            return
        if hasattr(session, 'access_token') and session.access_token:
            self._set_setting(KEY_CLOUD_ACCESS_TOKEN, session.access_token)
        if hasattr(session, 'refresh_token') and session.refresh_token:
            self._set_setting(KEY_CLOUD_REFRESH_TOKEN, session.refresh_token)
        user = getattr(session, 'user', None)
        if user:
            if hasattr(user, 'id') and user.id:
                self._set_setting(KEY_CLOUD_USER_ID, user.id)
            if hasattr(user, 'email') and user.email:
                self._set_setting(KEY_CLOUD_USER_EMAIL, user.email)

    def _restore_session(self):
        """Restores stored auth session from SQLite app_settings, refreshing or re-logging in if necessary."""
        if not self._client:
            return None
        access_token = self._get_setting(KEY_CLOUD_ACCESS_TOKEN)
        refresh_token = self._get_setting(KEY_CLOUD_REFRESH_TOKEN)
        if access_token and refresh_token:
            try:
                res = self._client.auth.set_session(access_token, refresh_token)
                if res and res.session:
                    self._save_session(res.session)
                    return res.session
            except Exception as e:
                print(f"[CloudSync] Session restore failed with tokens: {e}")

        # Fallback to stored credentials if refresh token was rotated or invalidated
        email = self._get_setting(KEY_CLOUD_USER_EMAIL)
        password = self._get_setting(KEY_CLOUD_USER_PASSWORD)
        if email and password:
            try:
                print(f"[CloudSync] Auto-reauthenticating user {email}...")
                res = self._client.auth.sign_in_with_password({"email": email, "password": password})
                if res and res.session:
                    self._save_session(res.session)
                    print(f"[CloudSync] Auto-reauthentication successful!")
                    return res.session
            except Exception as ex:
                print(f"[CloudSync] Auto-reauthentication failed: {ex}")
        return None

    # ------------------ AUTHENTICATION ------------------

    def sign_up(self, email: str, password: str) -> Dict[str, Any]:
        """Registers a new account in Supabase."""
        try:
            if not self._client:
                self._init_client()
            res = self._client.auth.sign_up({"email": email, "password": password})
            if res.user:
                self._set_setting(KEY_CLOUD_USER_PASSWORD, password)
                if res.session:
                    self._save_session(res.session)
                    self._set_setting(KEY_CLOUD_ENABLED, "true")
                    self._set_setting(KEY_CLOUD_SYNC_STATUS, "Connected")
                    # Trigger initial sync
                    threading.Thread(target=self.sync_now, daemon=True).start()
                    return {"success": True, "message": "Account created and logged in successfully!", "user_id": res.user.id}
                return {"success": True, "message": "Registration successful! Please check your email to confirm your account."}
            return {"success": False, "error": "Unable to create account"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """Logs into Supabase with email and password."""
        try:
            if not self._client:
                self._init_client()
            res = self._client.auth.sign_in_with_password({"email": email, "password": password})
            if res.user and res.session:
                self._save_session(res.session)
                self._set_setting(KEY_CLOUD_USER_PASSWORD, password)
                self._set_setting(KEY_CLOUD_ENABLED, "true")
                self._set_setting(KEY_CLOUD_SYNC_STATUS, "Connected")
                
                # Mark all existing local rows as pending so they seed to cloud if empty
                self.db.mark_all_pending_for_sync()
                
                # Trigger initial sync in background
                threading.Thread(target=self.sync_now, daemon=True).start()
                return {"success": True, "message": f"Logged in as {res.user.email}", "email": res.user.email}
            return {"success": False, "error": "Invalid login credentials"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sign_out(self) -> Dict[str, Any]:
        """Logs out and disables cloud sync while preserving local data."""
        try:
            if self._client:
                try:
                    self._client.auth.sign_out()
                except Exception:
                    pass
            self._set_setting(KEY_CLOUD_ACCESS_TOKEN, "")
            self._set_setting(KEY_CLOUD_REFRESH_TOKEN, "")
            self._set_setting(KEY_CLOUD_USER_ID, "")
            self._set_setting(KEY_CLOUD_USER_EMAIL, "")
            self._set_setting(KEY_CLOUD_USER_PASSWORD, "")
            self._set_setting(KEY_CLOUD_ENABLED, "false")
            self._set_setting(KEY_CLOUD_SYNC_STATUS, "Not connected")
            return {"success": True, "message": "Logged out from Cloud Sync. Local data is intact."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_status(self) -> Dict[str, Any]:
        """Returns the current Cloud Sync status."""
        is_enabled = self._get_setting(KEY_CLOUD_ENABLED, "false").lower() == "true"
        user_email = self._get_setting(KEY_CLOUD_USER_EMAIL, "")
        user_id = self._get_setting(KEY_CLOUD_USER_ID, "")
        last_sync = self._get_setting(KEY_CLOUD_LAST_SYNC, "Never")
        status = self._get_setting(KEY_CLOUD_SYNC_STATUS, "Not connected")
        pending_count = self.db.get_pending_sync_count()
        
        return {
            "enabled": is_enabled and bool(user_id),
            "email": user_email,
            "user_id": user_id,
            "last_sync": last_sync,
            "status": status,
            "pending_changes": pending_count,
            "project_url": self.config['url']
        }

    # ------------------ BIDIRECTIONAL SYNC ENGINE ------------------

    def sync_now(self, timeout: float = 30.0) -> Dict[str, Any]:
        """Runs a complete bidirectional sync (Local Push & Cloud Pull). Thread-safe."""
        if not self._lock.acquire(timeout=timeout):
            print("[CloudSync] Sync already in progress, skipping concurrent trigger.")
            return {"success": True, "message": "Sync already in progress."}

        try:
            is_enabled = self._get_setting(KEY_CLOUD_ENABLED, "false").lower() == "true"
            user_id = self._get_setting(KEY_CLOUD_USER_ID, "")
            
            print(f"\n==================== CLOUD SYNC START ====================")
            print(f"[CloudSync] Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"[CloudSync] Enabled: {is_enabled}, User ID: {user_id or '(not set)'}")
            
            if not is_enabled or not user_id:
                print("SYNC ERROR\nSTAGE: AUTHENTICATION\nERROR: Cloud Sync is not logged in or disabled.")
                self._set_setting(KEY_CLOUD_SYNC_STATUS, "Not connected")
                return {"success": False, "error": "Cloud Sync is not logged in or disabled."}

            self._set_setting(KEY_CLOUD_SYNC_STATUS, "Syncing...")

            if not self._client:
                self._init_client()

            # Ensure valid authenticated session
            session = self._restore_session()
            valid_auth = False
            if self._client:
                try:
                    u_resp = self._client.auth.get_user()
                    if u_resp and u_resp.user:
                        valid_auth = True
                except Exception:
                    valid_auth = False

            if not valid_auth:
                email = self._get_setting(KEY_CLOUD_USER_EMAIL)
                password = self._get_setting(KEY_CLOUD_USER_PASSWORD)
                if email and password and self._client:
                    try:
                        print(f"[CloudSync] Re-authenticating {email} with Supabase...")
                        res = self._client.auth.sign_in_with_password({"email": email, "password": password})
                        if res and res.session:
                            self._save_session(res.session)
                            valid_auth = True
                            print("[CloudSync] Re-authentication successful!")
                    except Exception as reauth_err:
                        print(f"[CloudSync] Re-authentication failed: {reauth_err}")

            if not valid_auth:
                error_msg = "Not authenticated with Supabase. Session restore failed."
                print(f"SYNC ERROR\nSTAGE: AUTHENTICATION\nERROR: {error_msg}")
                self._set_setting(KEY_CLOUD_SYNC_STATUS, f"Sync error: {error_msg}")
                return {"success": False, "error": error_msg}

            # 0. Flush any live/uncommitted Pomodoro minutes into SQLite study_sessions before pushing
            self.flush_pomodoro()

            # 1. PUSH LOCAL PENDING CHANGES
            try:
                print("[CloudSync] --- STAGE 1: UPLOADING LOCAL CHANGES ---")
                pushed_count = self._push_local_changes(user_id)
                print(f"UPLOAD RESULT: Pushed {pushed_count} items")
            except Exception as push_err:
                print(f"SYNC ERROR\nSTAGE: UPLOAD\nERROR: {push_err}")
                raise push_err

            # 2. PULL CLOUD CHANGES
            last_sync = self._get_setting(KEY_CLOUD_LAST_SYNC, "")
            try:
                print(f"[CloudSync] --- STAGE 2: DOWNLOADING CLOUD CHANGES (since {last_sync or 'start'}) ---")
                pulled_count = self._pull_cloud_changes(user_id, last_sync)
                print(f"DOWNLOAD RESULT: Pulled {pulled_count} items")
            except Exception as pull_err:
                print(f"SYNC ERROR\nSTAGE: DOWNLOAD\nERROR: {pull_err}")
                raise pull_err

            # 3. MERGE CONFIRMATION
            print("[CloudSync] --- STAGE 3: MERGE CONFIRMATION ---")
            print("MERGE RESULT: Successfully merged into local SQLite")

            # Record timestamp of successful sync
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self._set_setting(KEY_CLOUD_LAST_SYNC, now_iso)
            self._set_setting(KEY_CLOUD_SYNC_STATUS, "Synced")
            
            print(f"SYNC SUCCESS: Pushed: {pushed_count}, Pulled: {pulled_count}")
            print(f"==================== CLOUD SYNC END ====================\n")

            return {
                "success": True,
                "message": f"Sync completed successfully. Pushed: {pushed_count}, Pulled: {pulled_count}",
                "pushed": pushed_count,
                "pulled": pulled_count,
                "timestamp": now_iso
            }

        except Exception as e:
            error_msg = str(e)
            print(f"SYNC ERROR\nSTAGE: GENERAL\nERROR: {error_msg}")
            print(f"==================== CLOUD SYNC FAILED ====================\n")
            self._set_setting(KEY_CLOUD_SYNC_STATUS, f"Sync error: {error_msg[:80]}")
            return {"success": False, "error": error_msg}
        finally:
            self._lock.release()

    def _push_local_changes(self, user_id: str) -> int:
        """Pushes pending SQLite rows to Supabase via batch upserts."""
        conn = self.db.get_connection()
        total_pushed = 0
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        try:
            # 1. SUBJECTS
            cur = conn.execute("SELECT * FROM subjects WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "name": r["name"],
                    "display_name": r["display_name"],
                    "color": r["color"],
                    "resource_name": r["resource_name"],
                    "weekly_target_val": r["weekly_target_val"],
                    "target_type": r["target_type"],
                    "sort_order": r["sort_order"],
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                self._client.table("subjects").upsert(payload, on_conflict="user_id,client_id").execute()
                conn.execute("UPDATE subjects SET sync_status = 'synced' WHERE sync_status = 'pending'")
                total_pushed += len(payload)

            # 2. CHAPTERS
            cur = conn.execute("SELECT * FROM chapters WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "subject_client_id": r.get("subject_client_id", ""),
                    "name": r["name"],
                    "sequence_no": r["sequence_no"],
                    "target_hours": r["target_hours"],
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                self._client.table("chapters").upsert(payload, on_conflict="user_id,client_id").execute()
                conn.execute("UPDATE chapters SET sync_status = 'synced' WHERE sync_status = 'pending'")
                total_pushed += len(payload)

            # 3. LECTURES (Physical Chemistry is hour-based and has NO lectures)
            conn.execute("UPDATE lectures SET sync_status = 'synced' WHERE sync_status = 'pending' AND (subject_client_id = 'subj_physical_chemistry' OR subject_id = 3)")
            cur = conn.execute("SELECT * FROM lectures WHERE sync_status = 'pending' AND subject_client_id != 'subj_physical_chemistry' AND (subject_id IS NULL OR subject_id != 3)")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                print(f"[CloudSync] Pushing {len(rows)} lectures...")
                # Batch upsert in chunks of 100
                for i in range(0, len(rows), 100):
                    chunk = rows[i:i+100]
                    payload = [{
                        "user_id": user_id,
                        "client_id": r["client_id"],
                        "subject_client_id": r.get("subject_client_id", ""),
                        "chapter_client_id": r.get("chapter_client_id", ""),
                        "batch": r.get("batch", ""),
                        "lecture_no": r["lecture_no"],
                        "lecture_name": r["lecture_name"],
                        "topic": r.get("topic", ""),
                        "dpp_no": r.get("dpp_no", 0),
                        "resource": r.get("resource", ""),
                        "scheduled_date": r["scheduled_date"],
                        "rescheduled_date": r.get("rescheduled_date"),
                        "faculty": r.get("faculty", ""),
                        "is_completed": bool(r.get("is_completed", 0)),
                        "completed_at": r.get("completed_at"),
                        "is_dpp_completed": bool(r.get("is_dpp_completed", 0)),
                        "dpp_completed_at": r.get("dpp_completed_at"),
                        "questions_practiced": r.get("questions_practiced", 0),
                        "questions_correct": r.get("questions_correct", 0),
                        "questions_incorrect": r.get("questions_incorrect", 0),
                        "accuracy": r.get("accuracy", 0.0),
                        "revision1_done": bool(r.get("revision1_done", 0)),
                        "revision1_date": r.get("revision1_date"),
                        "revision2_done": bool(r.get("revision2_done", 0)),
                        "revision2_date": r.get("revision2_date"),
                        "is_backlog": bool(r.get("is_backlog", 0)),
                        "notes": r.get("notes", ""),
                        "is_archived": bool(r.get("is_archived", 0)),
                        "updated_at": now_iso,
                        "deleted_at": r.get("deleted_at")
                    } for r in chunk]
                    for lec_payload in payload:
                        print(f"[CloudSync]  -> Lecture {lec_payload['lecture_no']} ({lec_payload['client_id']}): completed={lec_payload['is_completed']}, dpp={lec_payload['is_dpp_completed']}")
                    try:
                        self._client.table("lectures").upsert(payload, on_conflict="user_id,client_id").execute()
                        print(f"[CloudSync] [OK] Upserted chunk of {len(payload)} lectures")
                    except Exception as lec_err:
                        print(f"[CloudSync] [FAIL] Lecture upsert FAILED: {lec_err}")
                        raise lec_err
                conn.execute("UPDATE lectures SET sync_status = 'synced' WHERE sync_status = 'pending'")
                total_pushed += len(rows)

            # 4. TESTS
            cur = conn.execute("SELECT * FROM tests WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "test_no": r.get("test_no", 1),
                    "test_name": r["test_name"],
                    "test_type": r["test_type"],
                    "test_date": r["test_date"],
                    "physics_syllabus": r.get("physics_syllabus", ""),
                    "chemistry_syllabus": r.get("chemistry_syllabus", ""),
                    "maths_syllabus": r.get("maths_syllabus", ""),
                    "status": r.get("status", "upcoming"),
                    "score": r.get("score", 0),
                    "total_marks": r.get("total_marks", 300),
                    "questions_correct": r.get("questions_correct", 0),
                    "questions_incorrect": r.get("questions_incorrect", 0),
                    "accuracy": r.get("accuracy", 0),
                    "time_taken_minutes": r.get("time_taken_minutes", 0),
                    "notes": r.get("notes", ""),
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                pushed_cids = [r["client_id"] for r in rows]
                self._client.table("tests").upsert(payload, on_conflict="user_id,client_id").execute()
                placeholders = ','.join('?' * len(pushed_cids))
                conn.execute(f"UPDATE tests SET sync_status = 'synced' WHERE client_id IN ({placeholders})", pushed_cids)
                total_pushed += len(payload)

            # 5. WEEKLY TARGETS
            cur = conn.execute("SELECT * FROM weekly_targets WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                pushed_cids = [r["client_id"] for r in rows]
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "week_start": r["week_start"],
                    "subject_client_id": r.get("subject_client_id", ""),
                    "target_value": r["target_value"],
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                self._client.table("weekly_targets").upsert(payload, on_conflict="user_id,client_id").execute()
                placeholders = ','.join('?' * len(pushed_cids))
                conn.execute(f"UPDATE weekly_targets SET sync_status = 'synced' WHERE client_id IN ({placeholders})", pushed_cids)
                total_pushed += len(payload)

            # 6. STUDY SESSIONS (Pomodoro Study Time & Manual Sessions)
            cur = conn.execute("SELECT * FROM study_sessions WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                pushed_cids = [r["client_id"] for r in rows]
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "source": r.get("source", "Pomodoro"),
                    "external_session_id": r.get("external_session_id"),
                    "date": r["date"],
                    "start_time": r.get("start_time"),
                    "end_time": r.get("end_time"),
                    "duration_minutes": float(r["duration_minutes"] or 0),
                    "duration_hours": float(r["duration_hours"] or 0),
                    "subject": r.get("subject", ""),
                    "chapter": r.get("chapter", ""),
                    "topic": r.get("topic", ""),
                    "activity": r.get("activity", "Other"),
                    "notes": r.get("notes", ""),
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                print(f"[CloudSync] Pushing {len(payload)} study sessions to Supabase:")
                for p in payload:
                    print(f"  -> {p['date']} | {p['duration_minutes']}m ({p['source']}) ext_id={p['external_session_id']}")
                self._client.table("study_sessions").upsert(payload, on_conflict="user_id,client_id").execute()
                placeholders = ','.join('?' * len(pushed_cids))
                conn.execute(f"UPDATE study_sessions SET sync_status = 'synced' WHERE client_id IN ({placeholders})", pushed_cids)
                total_pushed += len(payload)
                print(f"[CloudSync] [OK] Successfully uploaded {len(payload)} study sessions")

            # 7. REVISIONS
            cur = conn.execute("SELECT * FROM revisions WHERE sync_status = 'pending'")
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                pushed_cids = [r["client_id"] for r in rows]
                payload = [{
                    "user_id": user_id,
                    "client_id": r["client_id"],
                    "lecture_client_id": r.get("lecture_client_id", ""),
                    "stage_no": r["stage_no"],
                    "is_completed": bool(r.get("is_completed", 0)),
                    "completed_at": r.get("completed_at"),
                    "scheduled_date": r.get("scheduled_date"),
                    "notes": r.get("notes", ""),
                    "updated_at": now_iso,
                    "deleted_at": r.get("deleted_at")
                } for r in rows]
                self._client.table("revisions").upsert(payload, on_conflict="user_id,client_id").execute()
                placeholders = ','.join('?' * len(pushed_cids))
                conn.execute(f"UPDATE revisions SET sync_status = 'synced' WHERE client_id IN ({placeholders})", pushed_cids)
                total_pushed += len(payload)

            conn.commit()
            return total_pushed

        finally:
            conn.close()

    def _pull_cloud_changes(self, user_id: str, last_sync: str) -> int:
        """Pulls changes from Supabase updated since last_sync and applies them to SQLite."""
        total_pulled = 0
        filter_time = None
        if last_sync:
            try:
                # 1-minute safety buffer against clock skew
                dt = datetime.datetime.fromisoformat(last_sync) - datetime.timedelta(minutes=1)
                filter_time = dt.isoformat()
            except Exception:
                filter_time = last_sync

        try:
            # 1. PULL SUBJECTS
            query = self._client.table("subjects").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_subjects(res.data)
                total_pulled += len(res.data)

            # 2. PULL CHAPTERS
            query = self._client.table("chapters").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_chapters(res.data)
                total_pulled += len(res.data)

            # 3. PULL LECTURES
            query = self._client.table("lectures").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_lectures(res.data)
                total_pulled += len(res.data)

            # 4. PULL TESTS
            query = self._client.table("tests").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_tests(res.data)
                total_pulled += len(res.data)

            # 5. PULL WEEKLY TARGETS
            query = self._client.table("weekly_targets").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_weekly_targets(res.data)
                total_pulled += len(res.data)

            # 6. PULL STUDY SESSIONS (always pull all user sessions to prevent clock skew from dropping sessions)
            print("[CloudSync] Pulling study sessions from Supabase...")
            query = self._client.table("study_sessions").select("*").eq("user_id", user_id)
            res = query.execute()
            if res.data:
                stats = self.db.merge_cloud_study_sessions(res.data)
                pulled_study = stats.get('inserted', 0) + stats.get('updated', 0)
                total_pulled += pulled_study
                print(f"[CloudSync] Study sessions pulled: {len(res.data)} total from cloud (Inserted: {stats.get('inserted', 0)}, Updated: {stats.get('updated', 0)}, Skipped: {stats.get('skipped', 0)})")

            # 7. PULL REVISIONS
            query = self._client.table("revisions").select("*").eq("user_id", user_id)
            if filter_time:
                query = query.gt("updated_at", filter_time)
            res = query.execute()
            if res.data:
                self.db.merge_cloud_revisions(res.data)
                total_pulled += len(res.data)

            return total_pulled

        except Exception as e:
            print(f"[CloudSync] Pull Error: {e}")
            raise e

    # ------------------ BACKGROUND WATCHER ------------------

    def start_background_sync(self, interval_seconds: int = 300):
        """Starts a background daemon thread that automatically syncs periodically."""
        if self._sync_thread and self._sync_thread.is_alive():
            return

        def _worker():
            while not self._stop_event.is_set():
                is_enabled = self._get_setting(KEY_CLOUD_ENABLED, "false").lower() == "true"
                user_id = self._get_setting(KEY_CLOUD_USER_ID, "")
                if is_enabled and user_id:
                    try:
                        self.sync_now()
                    except Exception as ex:
                        print(f"[CloudSync] Periodic worker exception: {ex}")
                self._stop_event.wait(interval_seconds)

        self._sync_thread = threading.Thread(target=_worker, daemon=True, name="Aayush360CloudSyncWorker")
        self._sync_thread.start()

    def stop_background_sync(self):
        self._stop_event.set()
