-- ============================================================
-- Alliance Hub v2.0 - Database Schema
-- Supabase PostgreSQL
-- Generated: 2026-07-03
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE rule_visibility AS ENUM ('public', 'training', 'officials_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 1. CORE: Players
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
    id bigint PRIMARY KEY,
    current_username text NOT NULL,
    status text DEFAULT 'active' CHECK (status IN ('active', 'banned', 'suspended')),
    current_alliance_id uuid,
    total_kills integer DEFAULT 0,
    total_deaths integer DEFAULT 0,
    games_played integer DEFAULT 0,
    reputation_score integer NOT NULL DEFAULT 100,
    suspension_reason text,
    last_seen timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. CORE: Alliances
-- ============================================================
CREATE TABLE IF NOT EXISTS alliances (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    tag text NOT NULL UNIQUE,
    description text,
    leader_id bigint REFERENCES players(id),
    status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'penalized')),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE players ADD CONSTRAINT fk_player_alliance
    FOREIGN KEY (current_alliance_id) REFERENCES alliances(id) ON DELETE SET NULL;

-- ============================================================
-- 3. CORE: Matches
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    game_id text,
    description text,
    match_type text NOT NULL DEFAULT 'internal' CHECK (match_type IN ('internal', 'duel', 'tournament')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'in_progress', 'finished', 'archived')),
    alliance_id uuid REFERENCES alliances(id),
    alliance_a_id uuid REFERENCES alliances(id),
    alliance_b_id uuid REFERENCES alliances(id),
    round integer,
    max_players integer NOT NULL DEFAULT 10,
    winners_declared boolean DEFAULT false,
    rules_url text,
    password text,
    show_game_id boolean DEFAULT true,
    requires_approval boolean DEFAULT false,
    is_private boolean DEFAULT false,
    share_token uuid DEFAULT gen_random_uuid(),
    referee_id bigint,
    auto_delete_at timestamptz,
    created_by uuid,
    csv_imported boolean DEFAULT false,
    notifications_sent boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. REGISTRATIONS & RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS match_registrations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
    player_id bigint REFERENCES players(id),
    nation text,
    status text DEFAULT 'pending',
    registered_at timestamptz DEFAULT now(),
    confirmed_at timestamptz,
    confirmed_by uuid,
    notes text
);

CREATE TABLE IF NOT EXISTS match_results (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
    player_id bigint REFERENCES players(id),
    nation text,
    kills integer DEFAULT 0,
    deaths integer DEFAULT 0,
    kd_ratio numeric DEFAULT 0,
    raw_csv_data text[],
    imported_at timestamptz DEFAULT now(),
    UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS match_winners (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id bigint NOT NULL REFERENCES players(id),
    position integer NOT NULL CHECK (position IN (1, 2, 3)),
    declared_by uuid,
    declared_at timestamptz DEFAULT now(),
    UNIQUE(match_id, position),
    UNIQUE(match_id, player_id)
);

-- ============================================================
-- 5. ALLIANCE MANAGEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS alliance_memberships (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id bigint NOT NULL REFERENCES players(id),
    alliance_id uuid NOT NULL REFERENCES alliances(id),
    status text NOT NULL DEFAULT 'pending',
    role text NOT NULL DEFAULT 'member',
    requested_by text NOT NULL DEFAULT 'player',
    requested_at timestamptz DEFAULT now(),
    approved_at timestamptz,
    rejected_at timestamptz
);

CREATE TABLE IF NOT EXISTS alliance_officers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    alliance_id uuid NOT NULL REFERENCES alliances(id),
    player_id bigint NOT NULL REFERENCES players(id),
    role text NOT NULL DEFAULT 'officer',
    title text,
    permissions jsonb NOT NULL DEFAULT '{"edit_rules": false, "manage_duels": false, "view_reports": true, "view_strikes": true, "create_matches": true, "manage_members": true, "manage_officers": false, "send_notifications": false}'::jsonb,
    appointed_by uuid,
    appointed_at timestamptz NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true,
    deactivated_at timestamptz,
    deactivated_reason text
);

CREATE TABLE IF NOT EXISTS alliance_leader_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id bigint NOT NULL REFERENCES players(id),
    display_name text NOT NULL,
    supremacy_player_id bigint NOT NULL,
    alliance_name text NOT NULL,
    alliance_tag text NOT NULL,
    evidence_url text,
    status text NOT NULL DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    rejection_reason text,
    invite_code_used uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alliance_duel_teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alliance_id uuid NOT NULL REFERENCES alliances(id),
    match_id uuid REFERENCES matches(id),
    player_ids integer[] NOT NULL DEFAULT '{}'::integer[],
    status text NOT NULL DEFAULT 'forming',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leader_transfer_log (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    alliance_id uuid NOT NULL REFERENCES alliances(id),
    from_player_id bigint REFERENCES players(id),
    to_player_id bigint NOT NULL REFERENCES players(id),
    transferred_by uuid,
    transferred_at timestamptz NOT NULL DEFAULT now(),
    reason text,
    status text NOT NULL DEFAULT 'completed'
);

-- ============================================================
-- 6. RULES & PRECEDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS rule_sections (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id uuid REFERENCES rule_sections(id),
    section_number text,
    title text NOT NULL,
    content text NOT NULL DEFAULT '',
    order_index integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    visibility rule_visibility NOT NULL DEFAULT 'public',
    training_for text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_precedents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_section_id uuid NOT NULL REFERENCES rule_sections(id),
    title text NOT NULL,
    description text NOT NULL,
    resolution text NOT NULL,
    severity text NOT NULL DEFAULT 'minor',
    strike_type text,
    player_id bigint REFERENCES players(id) ON DELETE SET NULL,
    match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
    strike_id uuid REFERENCES player_strikes(id) ON DELETE SET NULL,
    report_id uuid,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_section_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id uuid NOT NULL REFERENCES rule_sections(id),
    title text NOT NULL,
    content text NOT NULL,
    changed_by uuid,
    changed_at timestamptz DEFAULT now()
);

-- ============================================================
-- 7. STRIKES & SANCTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS strike_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text NOT NULL,
    severity integer NOT NULL DEFAULT 1,
    legend text,
    is_active boolean NOT NULL DEFAULT true,
    nullifies_kills boolean DEFAULT false,
    formula_id uuid,
    is_preset boolean DEFAULT false,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_strikes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id bigint NOT NULL REFERENCES players(id),
    strike_type_id uuid NOT NULL REFERENCES strike_types(id),
    match_id uuid REFERENCES matches(id),
    rule_section_id uuid REFERENCES rule_sections(id),
    rule_precedent_id uuid REFERENCES rule_precedents(id) ON DELETE SET NULL,
    report_id uuid,
    reason text NOT NULL,
    applied_by uuid,
    applied_at timestamptz DEFAULT now(),
    removed_by uuid,
    removed_at timestamptz,
    removal_reason text,
    status text DEFAULT 'pending_precedent' CHECK (status IN ('pending_precedent', 'active', 'rejected', 'removed')),
    is_active boolean NOT NULL DEFAULT true,
    notes text
);

CREATE TABLE IF NOT EXISTS player_sanctions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id bigint NOT NULL REFERENCES players(id),
    strike_id uuid REFERENCES player_strikes(id),
    strike_type_id uuid REFERENCES strike_types(id),
    kills_before integer NOT NULL DEFAULT 0,
    kills_after integer NOT NULL DEFAULT 0,
    points_before integer DEFAULT 0,
    points_after integer DEFAULT 0,
    penalty_pct numeric DEFAULT 0,
    reputation_delta integer DEFAULT 0,
    formula_used text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_nullified_kills (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_strike_id uuid NOT NULL REFERENCES player_strikes(id),
    player_id bigint NOT NULL REFERENCES players(id),
    match_id uuid NOT NULL REFERENCES matches(id),
    kills_nullified integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 8. REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS player_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid REFERENCES matches(id),
    player_id integer,
    player_name text,
    reported_player_id integer,
    reported_player_name text,
    report_type text NOT NULL,
    description text,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending',
    admin_response text,
    strike_applied boolean DEFAULT false,
    strike_id uuid,
    rule_section_id uuid,
    resolved_at timestamptz,
    resolved_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel text NOT NULL,
    reported_message_id text,
    reporter_id text NOT NULL,
    reporter_name text NOT NULL,
    reason text NOT NULL,
    context_messages jsonb,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    reviewed_by uuid,
    reviewed_at timestamptz,
    resolution text,
    reported_at timestamptz DEFAULT now()
);

-- ============================================================
-- 9. CHAT & MESSAGING
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id bigint PRIMARY KEY,
    channel text NOT NULL,
    sender_admin_id uuid,
    sender_name text NOT NULL,
    sender_role text,
    message text NOT NULL,
    message_type text DEFAULT 'text',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS direct_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_admin_id uuid,
    sender_name text NOT NULL,
    recipient_admin_id uuid,
    recipient_player_id bigint,
    subject text,
    message text NOT NULL,
    read_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 10. ADMIN SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    role text NOT NULL DEFAULT 'moderator',
    alliance_id uuid REFERENCES alliances(id),
    display_name text,
    supremacy_player_id bigint REFERENCES players(id),
    approved_by uuid,
    approved_at timestamptz,
    status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS admin_invites (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    code text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'moderator',
    created_by uuid,
    used boolean DEFAULT false,
    used_by uuid,
    used_at timestamptz,
    expires_at timestamptz DEFAULT (now() + interval '7 days'),
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    player_id bigint REFERENCES players(id),
    alliance_id uuid REFERENCES alliances(id),
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 12. AUTH & TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS player_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id bigint NOT NULL REFERENCES players(id),
    token text NOT NULL,
    transfer_code text,
    transfer_expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    last_used timestamptz DEFAULT now()
);

-- ============================================================
-- 13. APP SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 14. TRAINING
-- ============================================================
CREATE TABLE IF NOT EXISTS training_progress (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id uuid,
    player_id bigint,
    section_id uuid NOT NULL REFERENCES rule_sections(id),
    completed_at timestamptz NOT NULL DEFAULT now(),
    acknowledged boolean NOT NULL DEFAULT false,
    acknowledged_at timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_players_alliance ON players(current_alliance_id);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_alliance ON matches(alliance_id);
CREATE INDEX IF NOT EXISTS idx_match_registrations_match ON match_registrations(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_match ON match_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_player ON match_results(player_id);
CREATE INDEX IF NOT EXISTS idx_rule_precedents_section ON rule_precedents(rule_section_id);
CREATE INDEX IF NOT EXISTS idx_rule_precedents_player ON rule_precedents(player_id);
CREATE INDEX IF NOT EXISTS idx_rule_precedents_match ON rule_precedents(match_id);
CREATE INDEX IF NOT EXISTS idx_rule_precedents_strike ON rule_precedents(strike_id);
CREATE INDEX IF NOT EXISTS idx_rule_precedents_created ON rule_precedents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_strikes_player ON player_strikes(player_id);
CREATE INDEX IF NOT EXISTS idx_player_strikes_precedent ON player_strikes(rule_precedent_id);
CREATE INDEX IF NOT EXISTS idx_player_strikes_status ON player_strikes(status);
CREATE INDEX IF NOT EXISTS idx_alliance_memberships_alliance ON alliance_memberships(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_memberships_player ON alliance_memberships(player_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION create_invite_code(p_role text DEFAULT 'moderator')
RETURNS text AS $$
DECLARE new_code text;
BEGIN
    new_code := upper(substring(md5(random()::text) from 1 for 8));
    INSERT INTO admin_invites (code, role, created_by) VALUES (new_code, p_role, auth.uid());
    RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION complete_setup()
RETURNS void AS $$
BEGIN
    UPDATE app_settings SET value = 'true', updated_at = now() WHERE key = 'setup_complete';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_setup_complete()
RETURNS boolean AS $$
DECLARE result boolean;
BEGIN
    SELECT value::boolean INTO result FROM app_settings WHERE key = 'setup_complete';
    RETURN coalesce(result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION recalc_player_stats(p_player_id bigint)
RETURNS void AS $$
DECLARE
    total_kills integer; total_deaths integer; games_count integer;
BEGIN
    SELECT coalesce(sum(kills), 0), coalesce(sum(deaths), 0), count(*)
    INTO total_kills, total_deaths, games_count
    FROM match_results WHERE player_id = p_player_id;
    UPDATE players SET total_kills = total_kills, total_deaths = total_deaths, games_played = games_count
    WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_recalc_on_insert()
RETURNS TRIGGER AS $$
BEGIN PERFORM recalc_player_stats(NEW.player_id); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_recalc_on_update()
RETURNS TRIGGER AS $$
BEGIN PERFORM recalc_player_stats(NEW.player_id); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_recalc_on_delete()
RETURNS TRIGGER AS $$
BEGIN PERFORM recalc_player_stats(OLD.player_id); RETURN OLD; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_result_insert ON match_results;
CREATE TRIGGER after_result_insert AFTER INSERT ON match_results
    FOR EACH ROW EXECUTE FUNCTION trigger_recalc_on_insert();

DROP TRIGGER IF EXISTS after_result_update ON match_results;
CREATE TRIGGER after_result_update AFTER UPDATE ON match_results
    FOR EACH ROW EXECUTE FUNCTION trigger_recalc_on_update();

DROP TRIGGER IF EXISTS after_result_delete ON match_results;
CREATE TRIGGER after_result_delete AFTER DELETE ON match_results
    FOR EACH ROW EXECUTE FUNCTION trigger_recalc_on_delete();

-- ============================================================
-- RLS POLICIES (Production-ready)
-- ============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_leader_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_precedents ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read players" ON players FOR SELECT USING (true);
CREATE POLICY "Public read alliances" ON alliances FOR SELECT USING (true);
CREATE POLICY "Public read matches" ON matches FOR SELECT USING (status != 'draft');
CREATE POLICY "Public read registrations" ON match_registrations FOR SELECT USING (true);
CREATE POLICY "Public read results" ON match_results FOR SELECT USING (true);
CREATE POLICY "Public read winners" ON match_winners FOR SELECT USING (true);
CREATE POLICY "Public read rule sections" ON rule_sections FOR SELECT USING (is_active = true);
CREATE POLICY "Public read rule precedents" ON rule_precedents FOR SELECT USING (true);
CREATE POLICY "Public read strike types" ON strike_types FOR SELECT USING (is_active = true);
CREATE POLICY "Public read player strikes" ON player_strikes FOR SELECT USING (is_active = true);

-- Authenticated write policies
CREATE POLICY "Auth write matches" ON matches FOR ALL
    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth write registrations" ON match_registrations FOR ALL
    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth write results" ON match_results FOR ALL
    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- INITIAL DATA
-- ============================================================
INSERT INTO app_settings (key, value) VALUES
    ('setup_complete', 'false'),
    ('cache_version', 'v20'),
    ('force_reload', 'false')
ON CONFLICT (key) DO NOTHING;
