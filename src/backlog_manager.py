"""
AAYUSH 360 - Intelligent Backlog Redistribution Engine
Automatically identifies missed lectures and creates an achievable,
balanced redistribution schedule across upcoming study days based on
weekly targets, existing workloads, and subject quotas.
"""

import datetime
from typing import Dict, Any, List, Optional
from src.database import DatabaseManager

class BacklogManager:
    def __init__(self, db: DatabaseManager):
        self.db = db

    def scan_and_flag_backlog(self, current_date_str: Optional[str] = None) -> Dict[str, Any]:
        """
        Scans all lectures where scheduled_date < current_date and is_completed == 0.
        Sets is_backlog = 1.
        """
        today = current_date_str or datetime.date.today().isoformat()
        conn = self.db.get_connection()
        c = conn.cursor()
        
        # Identify newly missed lectures
        c.execute("""
        UPDATE lectures
        SET is_backlog = 1,
            updated_at = datetime('now', 'localtime')
        WHERE scheduled_date < ? AND is_completed = 0 AND is_archived = 0 AND is_backlog = 0;
        """, (today,))
        newly_flagged = c.rowcount
        
        # Clear backlog flag if completed
        c.execute("""
        UPDATE lectures
        SET is_backlog = 0,
            updated_at = datetime('now', 'localtime')
        WHERE is_completed = 1 AND is_backlog = 1;
        """)
        
        # Total backlog count
        total_backlog = c.execute("""
        SELECT COUNT(*) FROM lectures
        WHERE scheduled_date < ? AND is_completed = 0 AND is_archived = 0;
        """, (today,)).fetchone()[0]

        conn.commit()
        conn.close()
        return {'newly_flagged': newly_flagged, 'total_backlog': total_backlog}

    def redistribute_backlog(self, current_date_str: Optional[str] = None, max_extra_per_day: int = 1) -> Dict[str, Any]:
        """
        Intelligently redistributes pending backlog items across the next 21 days:
        - Maintains original scheduled_date.
        - Calculates already scheduled lectures per day.
        - Caps daily additions (e.g. maximum 1-2 extra backlog lectures per subject/day).
        - Respects weekly subject targets (Physics: ~2.5/day, Maths: ~1/day, Chem: ~1/day).
        - Sets rescheduled_date on the backlog lectures.
        """
        today_str = current_date_str or datetime.date.today().isoformat()
        today = datetime.date.fromisoformat(today_str)
        
        conn = self.db.get_connection()
        c = conn.cursor()
        
        # 1. Fetch pending backlog lectures grouped by subject
        backlog_lecs = c.execute("""
        SELECT l.*, s.name as subject_name, s.weekly_target_val
        FROM lectures l
        JOIN subjects s ON l.subject_id = s.id
        WHERE l.scheduled_date < ? AND l.is_completed = 0 AND l.is_archived = 0
        ORDER BY s.sort_order, l.scheduled_date ASC, l.lecture_no ASC;
        """, (today_str,)).fetchall()
        
        if not backlog_lecs:
            conn.close()
            return {'success': True, 'rescheduled_count': 0, 'message': 'No backlog to redistribute'}

        # 2. Upcoming test blackout dates (day of test and pre-test revision buffer day)
        test_blackout_dates = set()
        tests = c.execute("SELECT test_date FROM tests WHERE test_date IS NOT NULL AND test_date != ''").fetchall()
        for t in tests:
            t_date_str = t['test_date']
            try:
                t_date = datetime.date.fromisoformat(t_date_str)
                test_blackout_dates.add(t_date_str)
                test_blackout_dates.add((t_date - datetime.timedelta(days=1)).isoformat())
            except Exception:
                pass

        # 3. Map existing scheduled lectures count across the next 35 days
        HORIZON_DAYS = 35
        daily_counts: Dict[str, Dict[int, int]] = {}
        for d in range(HORIZON_DAYS):
            target_date = (today + datetime.timedelta(days=d)).isoformat()
            daily_counts[target_date] = {}

        existing_sched = c.execute("""
        SELECT scheduled_date, subject_id, COUNT(*) as cnt
        FROM lectures
        WHERE scheduled_date >= ? AND is_archived = 0 AND is_completed = 0
        GROUP BY scheduled_date, subject_id;
        """, (today_str,)).fetchall()
        
        for row in existing_sched:
            s_date = row['scheduled_date']
            if s_date in daily_counts:
                daily_counts[s_date][row['subject_id']] = row['cnt']

        # Also account for any previously rescheduled lectures within horizon
        existing_resched = c.execute("""
        SELECT rescheduled_date, subject_id, COUNT(*) as cnt
        FROM lectures
        WHERE rescheduled_date IS NOT NULL AND rescheduled_date >= ? AND is_archived = 0 AND is_completed = 0
        GROUP BY rescheduled_date, subject_id;
        """, (today_str,)).fetchall()
        for row in existing_resched:
            r_date = row['rescheduled_date']
            if r_date in daily_counts:
                daily_counts[r_date][row['subject_id']] = daily_counts[r_date].get(row['subject_id'], 0) + row['cnt']

        # 4. Weekly target cache and weekly load tracker
        weekly_target_cache: Dict[str, Dict[int, float]] = {}
        weekly_counts: Dict[str, Dict[int, int]] = {}
        
        def get_week_monday_str(d: datetime.date) -> str:
            return (d - datetime.timedelta(days=d.weekday())).isoformat()

        # Pre-seed weekly counts
        for d in range(HORIZON_DAYS):
            cur_d = today + datetime.timedelta(days=d)
            cur_d_str = cur_d.isoformat()
            w_monday = get_week_monday_str(cur_d)
            if w_monday not in weekly_counts:
                weekly_counts[w_monday] = {}
            for s_id, cnt in daily_counts[cur_d_str].items():
                weekly_counts[w_monday][s_id] = weekly_counts[w_monday].get(s_id, 0) + cnt

        # 5. Subject safety caps and total daily safety cap
        subject_caps = {
            'Physics': 3,
            'Mathematics': 2,
            'Organic Chemistry': 2,
            'Inorganic Chemistry': 2,
            'Physical Chemistry': 1
        }
        MAX_DAILY_TOTAL = 5

        # 6. Smooth, workload-aware allocation
        rescheduled_count = 0
        for lec in backlog_lecs:
            subj_id = lec['subject_id']
            subj_name = lec['subject_name']
            subj_cap = subject_caps.get(subj_name, 2)
            
            best_date = None
            best_score = float('inf')
            
            for d in range(HORIZON_DAYS):
                cand_date = today + datetime.timedelta(days=d)
                cand_date_str = cand_date.isoformat()
                
                # Pre-test blackout rule: Never schedule on test day or pre-test buffer day
                if cand_date_str in test_blackout_dates:
                    continue
                
                cur_subj_cnt = daily_counts[cand_date_str].get(subj_id, 0)
                cur_total_cnt = sum(daily_counts[cand_date_str].values())
                
                # Hard daily safety limits
                if cur_subj_cnt >= subj_cap or cur_total_cnt >= MAX_DAILY_TOTAL:
                    continue
                
                # Fetch weekly target for this week
                w_monday = get_week_monday_str(cand_date)
                if w_monday not in weekly_target_cache:
                    wt_info = self.db.get_weekly_targets(w_monday)
                    targets_list = wt_info.get('targets', []) if isinstance(wt_info, dict) else wt_info
                    weekly_target_cache[w_monday] = {t['subject_id']: t['target_value'] for t in targets_list}
                
                target_val = weekly_target_cache[w_monday].get(subj_id, lec['weekly_target_val'] or 5.0)
                week_subj_load = weekly_counts.get(w_monday, {}).get(subj_id, 0)
                week_ratio = week_subj_load / max(1.0, float(target_val))
                
                # Scoring function: Smooth spreading across days and weeks
                score = (week_ratio * 6.0) + (cur_total_cnt * 2.0) + (cur_subj_cnt * 2.5) + (d * 0.05)
                
                if score < best_score:
                    best_score = score
                    best_date = cand_date_str

            if not best_date:
                # Horizon fallback: find next available non-blackout day beyond horizon
                extra_d = HORIZON_DAYS
                while extra_d < 60:
                    cand_date = today + datetime.timedelta(days=extra_d)
                    cand_date_str = cand_date.isoformat()
                    if cand_date_str not in test_blackout_dates:
                        best_date = cand_date_str
                        break
                    extra_d += 1
                if not best_date:
                    best_date = (today + datetime.timedelta(days=HORIZON_DAYS)).isoformat()

            # Record allocation in tracking structures
            if best_date in daily_counts:
                daily_counts[best_date][subj_id] = daily_counts[best_date].get(subj_id, 0) + 1
            else:
                daily_counts[best_date] = {subj_id: 1}
                
            w_monday = get_week_monday_str(datetime.date.fromisoformat(best_date))
            if w_monday not in weekly_counts:
                weekly_counts[w_monday] = {}
            weekly_counts[w_monday][subj_id] = weekly_counts[w_monday].get(subj_id, 0) + 1

            c.execute("""
            UPDATE lectures
            SET rescheduled_date = ?,
                is_backlog = 1,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?;
            """, (best_date, lec['id']))
            rescheduled_count += 1

        conn.commit()
        conn.close()
        return {
            'success': True,
            'rescheduled_count': rescheduled_count,
            'message': f"Smoothly redistributed {rescheduled_count} backlog tasks across achievable, test-buffered slots."
        }

if __name__ == '__main__':
    from src.database import DatabaseManager
    db = DatabaseManager('scratch/test_db')
    bm = BacklogManager(db)
    res = bm.scan_and_flag_backlog('2026-09-27')
    print('Scan backlog:', res)
    redist = bm.redistribute_backlog('2026-09-27')
    print('Redistribute backlog:', redist)
