-- ============================================
-- City Reporter Bot — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE SEQUENCE IF NOT EXISTS report_ticket_seq START 1;

-- Reports table (mirrors Google Sheets 29-column schema)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id TEXT UNIQUE NOT NULL,
    ticket_number TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL,
    platform TEXT DEFAULT 'line',
    phone TEXT,
    nickname TEXT,
    problem_type TEXT,
    description TEXT,
    location_text TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT,
    ai_summary TEXT,
    detailed_analysis TEXT,
    smart_analysis TEXT,
    urgency TEXT DEFAULT 'ปานกลาง',
    status TEXT DEFAULT 'received',
    rating TEXT,
    solution_image_url TEXT,
    staff_name TEXT,
    staff_comment TEXT,
    category_locked BOOLEAN DEFAULT FALSE,
    audit_log TEXT,
    ack_timestamp TIMESTAMPTZ,
    in_progress_timestamp TIMESTAMPTZ,
    completed_timestamp TIMESTAMPTZ,
    team_name TEXT,
    internal_notes TEXT,
    ai_reaction TEXT,
    photo_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp DESC);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS smart_analysis TEXT;

DO $$
DECLARE
    max_ticket BIGINT;
BEGIN
    SELECT COALESCE(MAX(
        CASE
            WHEN ticket_number ~ '^[0-9]+$' THEN ticket_number::BIGINT
            ELSE NULL
        END
    ), 0)
    INTO max_ticket
    FROM reports;

    IF max_ticket > 0 THEN
        PERFORM setval('report_ticket_seq', max_ticket, true);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION allocate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    next_ticket BIGINT;
BEGIN
    next_ticket := nextval('report_ticket_seq');
    RETURN LPAD(next_ticket::TEXT, 4, '0');
END;
$$;

-- Conversation state (replaces data/conversation_state.json)
CREATE TABLE IF NOT EXISTS conversation_states (
    user_id TEXT PRIMARY KEY,
    state JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation memory (replaces data/conversation_memory.json)
CREATE TABLE IF NOT EXISTS conversation_memory (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_user ON conversation_memory(user_id, timestamp DESC);

-- User facts
CREATE TABLE IF NOT EXISTS user_facts (
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    learned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, fact)
);

-- User metadata
CREATE TABLE IF NOT EXISTS user_meta (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    total_messages INTEGER DEFAULT 0
);

-- Bot inbox for durable inbound event capture
CREATE TABLE IF NOT EXISTS bot_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    raw_input TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bot_inbox_status_created ON bot_inbox(status, created_at);

-- AI jobs decouple webhook/handler latency from report processing
CREATE TABLE IF NOT EXISTS ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbox_id UUID REFERENCES bot_inbox(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_available ON ai_jobs(status, available_at, created_at);

-- Outbound delivery queue with retries
CREATE TABLE IF NOT EXISTS bot_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_outbox_status_available ON bot_outbox(status, available_at, created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- All access is server-side via service_role key
-- (which bypasses RLS). Enable RLS on every table
-- so the public anon/PostgREST API cannot read or
-- write data.
-- ============================================

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_outbox ENABLE ROW LEVEL SECURITY;

-- No policies are created for the anon role, meaning
-- unauthenticated requests via the public REST API
-- will be denied on all operations (SELECT/INSERT/UPDATE/DELETE).
--
-- The service_role key used by the backend bypasses RLS entirely,
-- so the application continues to work as before.

-- ============================================
-- FUNCTION SECURITY
-- Revoke public access to internal functions so
-- the anon/public REST API cannot call them.
-- ============================================

REVOKE EXECUTE ON FUNCTION allocate_ticket_number() FROM public;
REVOKE EXECUTE ON FUNCTION allocate_ticket_number() FROM anon;

-- ============================================
-- STORAGE: Create bucket for report images
-- (Run this in Supabase Dashboard > Storage > Create bucket)
-- Bucket name: report-images
-- Public: Yes (images are referenced in LINE messages)
-- ============================================
