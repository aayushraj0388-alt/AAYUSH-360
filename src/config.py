"""
AAYUSH 360 - Configuration & Cloud Sync Settings
"""

import os

# Supabase Project Configuration
# Using the public publishable anon key which is safe for client applications.
# Row Level Security (RLS) restricts access exclusively to authenticated user data.
DEFAULT_SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://cfojtvlmayxpfabihqus.supabase.co")
DEFAULT_SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_vEOQRrOogOHVyUjoY6Oq3w_1Ym37ygj")

def get_supabase_config():
    return {
        "url": DEFAULT_SUPABASE_URL,
        "key": DEFAULT_SUPABASE_KEY
    }
