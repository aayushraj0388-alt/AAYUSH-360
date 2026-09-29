-- ============================================================================
-- AAYUSH 360 - Dedicated Pomodoro Sessions Table Migration
-- Project: AAYUSH-360 (ID: cfojtvlmayxpfabihqus)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pomodoro_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    duration_minutes NUMERIC NOT NULL,
    duration_hours NUMERIC NOT NULL,
    focus_count INT DEFAULT 1,
    topic TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_pomodoro_sessions_user_client UNIQUE (user_id, client_id)
);

-- Index for delta queries and user filtering
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user ON public.pomodoro_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_date ON public.pomodoro_sessions(date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage exclusively their own pomodoro sessions
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own pomodoro sessions" ON public.pomodoro_sessions;
    CREATE POLICY "Users can manage own pomodoro sessions" ON public.pomodoro_sessions
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
