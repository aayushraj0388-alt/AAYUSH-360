# AAYUSH 360 🚀

> **The Ultimate All-in-One JEE Prep Ecosystem & Study Command Center**

AAYUSH 360 seamlessly connects your desktop prep workflow with your mobile device. Featuring automated syllabus tracking, multi-subject analytics, integrated Pomodoro sync, backlog manager, and real-time cloud sync powered by Supabase.

---

## 📱 Download AAYUSH 360 for Android

Get the latest version of AAYUSH 360 directly on your Android device:

[![Download Android APK](https://img.shields.io/badge/Download-Android%20APK-brightgreen?style=for-the-badge&logo=android)](https://github.com/aayushraj0388-alt/AAYUSH-360/releases/latest/download/aayush-360.apk)

* **Direct Download Link (Latest Release)**:  
  👉 **[Download aayush-360.apk](https://github.com/aayushraj0388-alt/AAYUSH-360/releases/latest/download/aayush-360.apk)**

* **All Releases & Change Logs**:  
  📦 [View GitHub Releases](https://github.com/aayushraj0388-alt/AAYUSH-360/releases)

---

### 📲 How to Install on Android

1. Download `aayush-360.apk` onto your Android device using the download link above.
2. Tap the downloaded APK file in your notifications or Downloads folder.
3. If prompted with *"Install unknown apps"*, tap **Settings** and enable **"Allow from this source"**.
4. Tap **Install** and open **AAYUSH 360**.
5. Log in with your AAYUSH 360 credentials to instantly sync your study progress, Pomodoro sessions, and syllabus checklist.

---

## ✨ Features

- **⚡ Real-Time Cloud Sync**: Seamless two-way sync between Windows Desktop and Android mobile apps via Supabase.
- **📚 Complete JEE Syllabus Planner**: Structured tracking for Physics, Physical Chemistry, Organic Chemistry, Inorganic Chemistry, and Mathematics.
- **⏱️ Integrated Pomodoro Tracker**: Live session timers and Pedro Study sync for high-efficiency study blocks.
- **📊 Interactive Analytics & Charts**: Visual breakdown of subject completion, study velocity, and test schedules.
- **🛡️ Offline-First Architecture**: Continue studying and logging progress offline; syncs automatically when connection is restored.

---

## 🖥️ Project Structure

```text
├── android_app/               # Android mobile application (Capacitor + Web assets)
│   ├── android/              # Native Android project wrapper
│   └── www/                  # Mobile UI frontend & cloud client
├── src/                      # Windows desktop application source (Python + PyWebView)
│   ├── ui/                   # Desktop UI components & assets
│   ├── app_api.py            # Desktop backend API bridge
│   ├── cloud_sync.py         # Cloud synchronization engine
│   └── database.py           # SQLite local store
├── supabase_schema.sql       # Database schema & RLS policies
└── .gitignore                # Production ignore definitions
```

---

## 🔒 Security & Privacy

- All user data is safeguarded with PostgreSQL Row-Level Security (RLS).
- Safe public anon-key client authentication.
- No local databases, secrets, or keystores are tracked in source control.
