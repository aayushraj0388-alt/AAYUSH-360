"""
AAYUSH 360 - Standalone Windows Desktop JEE Command Center
Runs 100% locally and offline on Windows using Microsoft Edge WebView2.
ZERO localhost servers, ZERO cloud dependency, reliable SQLite ACID storage,
and deep planner/Pomodoro sync readiness.
"""

import os
import sys

_current_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.dirname(_current_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

import webview
import datetime
from src.database import DatabaseManager
from src.extractor import extract_all_planners
from src.app_api import AppAPI
from src.backlog_manager import BacklogManager

def get_app_dir():
    """Gets the application directory whether running as script or PyInstaller bundle."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

def get_bundle_dir():
    """Gets the PyInstaller temp bundle dir (_MEIPASS) or the project root."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

def main():
    app_dir = get_app_dir()
    bundle_dir = get_bundle_dir()

    # Determine UI path
    ui_html_path = os.path.join(bundle_dir, 'src', 'ui', 'index.html')
    if not os.path.exists(ui_html_path):
        ui_html_path = os.path.join(app_dir, 'src', 'ui', 'index.html')

    # Initialize Database in AppData
    db = DatabaseManager()

    # If first run (no lectures), seed from the PDF planners
    conn = db.get_connection()
    lec_count = conn.execute("SELECT COUNT(*) FROM lectures;").fetchone()[0]
    conn.close()

    if lec_count == 0:
        print("[AAYUSH 360] First launch detected: extracting PDF planners...")
        try:
            planner_data = extract_all_planners(app_dir)
            db.import_planner_data(planner_data, preserve_progress=False)
            print(f"[AAYUSH 360] Seeded {len(planner_data.get('lectures', []))} lectures.")
        except Exception as e:
            print("[AAYUSH 360] Warning during initial PDF extraction:", e)

    # Automatically scan for any missed lectures to keep backlog accurate
    try:
        bm = BacklogManager(db)
        bm.scan_and_flag_backlog()
    except Exception as e:
        print("[AAYUSH 360] Backlog scan error:", e)

    # Initialize Native API
    api = AppAPI(db, app_dir)

    # Setup WebView2 storage path in AppData to guarantee clean startup/shutdown
    webview_storage = os.path.join(db.base_dir, 'webview_cache')
    os.makedirs(webview_storage, exist_ok=True)

    # Create PyWebView Native Window
    window = webview.create_window(
        title='AAYUSH 360 - Personal JEE Command Center',
        url=f'file:///{os.path.abspath(ui_html_path).replace(os.sep, "/")}',
        js_api=api,
        width=1380,
        height=880,
        min_size=(1024, 680),
        background_color='#ffffff'
    )

    # Start PyWebView: http_server=False guarantees ZERO localhost server!
    webview.start(
        storage_path=webview_storage,
        http_server=False,
        debug=False
    )

if __name__ == '__main__':
    main()
