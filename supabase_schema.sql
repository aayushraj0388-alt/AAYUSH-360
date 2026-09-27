-- ============================================================================
-- AAYUSH 360 - Complete Supabase Cloud Sync Schema & RLS Policies
-- Project: AAYUSH-360 (ID: cfojtvlmayxpfabihqus)
-- ============================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROFILES / USER SETTINGS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT DEFAULT 'Aayush',
    theme TEXT DEFAULT 'dark',
    current_streak INT DEFAULT 1,
    last_active_date DATE DEFAULT CURRENT_DATE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SUBJECTS
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL,
    resource_name TEXT NOT NULL,
    weekly_target_val NUMERIC NOT NULL,
    target_type TEXT NOT NULL, -- 'lectures' | 'hours'
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_subjects_user_client UNIQUE (user_id, client_id)
);

-- 4. CHAPTERS
CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    subject_client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sequence_no INT DEFAULT 0,
    target_hours NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_chapters_user_client UNIQUE (user_id, client_id)
);

-- 5. LECTURES
CREATE TABLE IF NOT EXISTS public.lectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    subject_client_id TEXT NOT NULL,
    chapter_client_id TEXT NOT NULL,
    batch TEXT DEFAULT '',
    lecture_no INT NOT NULL,
    lecture_name TEXT NOT NULL,
    topic TEXT DEFAULT '',
    dpp_no INT NOT NULL,
    resource TEXT DEFAULT '',
    scheduled_date DATE NOT NULL,
    rescheduled_date DATE,
    faculty TEXT DEFAULT '',
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    is_dpp_completed BOOLEAN DEFAULT false,
    dpp_completed_at TIMESTAMPTZ,
    questions_practiced INT DEFAULT 0,
    questions_correct INT DEFAULT 0,
    questions_incorrect INT DEFAULT 0,
    accuracy NUMERIC DEFAULT 0,
    revision1_done BOOLEAN DEFAULT false,
    revision1_date DATE,
    revision2_done BOOLEAN DEFAULT false,
    revision2_date DATE,
    is_backlog BOOLEAN DEFAULT false,
    notes TEXT DEFAULT '',
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lectures_user_client UNIQUE (user_id, client_id)
);

-- 6. TESTS
CREATE TABLE IF NOT EXISTS public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    test_no INT DEFAULT 1,
    test_name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    test_date DATE NOT NULL,
    physics_syllabus TEXT DEFAULT '',
    chemistry_syllabus TEXT DEFAULT '',
    maths_syllabus TEXT DEFAULT '',
    status TEXT DEFAULT 'upcoming',
    score NUMERIC DEFAULT 0,
    total_marks NUMERIC DEFAULT 300,
    questions_correct INT DEFAULT 0,
    questions_incorrect INT DEFAULT 0,
    accuracy NUMERIC DEFAULT 0,
    time_taken_minutes INT DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_tests_user_client UNIQUE (user_id, client_id)
);

-- 7. WEEKLY TARGETS
CREATE TABLE IF NOT EXISTS public.weekly_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    week_start DATE NOT NULL,
    subject_client_id TEXT NOT NULL,
    target_value NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_weekly_targets_user_client UNIQUE (user_id, client_id)
);

-- 8. STUDY SESSIONS (Pomodoro Study Time / Manual Study Logs)
CREATE TABLE IF NOT EXISTS public.study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    source TEXT DEFAULT 'Pomodoro',
    external_session_id TEXT,
    date DATE NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_minutes NUMERIC NOT NULL,
    duration_hours NUMERIC NOT NULL,
    subject TEXT DEFAULT '',
    chapter TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    activity TEXT DEFAULT 'Other',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_study_sessions_user_client UNIQUE (user_id, client_id)
);

-- 9. REVISIONS
CREATE TABLE IF NOT EXISTS public.revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    lecture_client_id TEXT NOT NULL,
    stage_no INT NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    scheduled_date DATE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_revisions_user_client UNIQUE (user_id, client_id)
);

-- 10. QUESTION PRACTICE LOGS
CREATE TABLE IF NOT EXISTS public.question_practice_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    date DATE NOT NULL,
    subject_client_id TEXT NOT NULL,
    chapter_client_id TEXT,
    lecture_client_id TEXT,
    questions_practiced INT NOT NULL,
    correct INT DEFAULT 0,
    incorrect INT DEFAULT 0,
    accuracy NUMERIC DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_qpractice_user_client UNIQUE (user_id, client_id)
);

-- ============================================================================
-- INDEXES FOR ULTRA-FAST SYNC QUERIES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_subjects_user ON public.subjects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chapters_user ON public.chapters(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_lectures_user ON public.lectures(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_lectures_date ON public.lectures(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tests_user ON public.tests(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_weekly_targets_user ON public.weekly_targets(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON public.study_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_revisions_user ON public.revisions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_qpractice_user ON public.question_practice_logs(user_id, updated_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_practice_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
    CREATE POLICY "Users can manage own profile" ON public.profiles
        FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Subjects Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own subjects" ON public.subjects;
    CREATE POLICY "Users can manage own subjects" ON public.subjects
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Chapters Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own chapters" ON public.chapters;
    CREATE POLICY "Users can manage own chapters" ON public.chapters
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Lectures Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own lectures" ON public.lectures;
    CREATE POLICY "Users can manage own lectures" ON public.lectures
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Tests Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own tests" ON public.tests;
    CREATE POLICY "Users can manage own tests" ON public.tests
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Weekly Targets Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own weekly targets" ON public.weekly_targets;
    CREATE POLICY "Users can manage own weekly targets" ON public.weekly_targets
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Study Sessions Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own study sessions" ON public.study_sessions;
    CREATE POLICY "Users can manage own study sessions" ON public.study_sessions
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Revisions Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own revisions" ON public.revisions;
    CREATE POLICY "Users can manage own revisions" ON public.revisions
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Question Practice Logs Policy
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage own question logs" ON public.question_practice_logs;
    CREATE POLICY "Users can manage own question logs" ON public.question_practice_logs
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
