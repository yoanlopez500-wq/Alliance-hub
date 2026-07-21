-- ============================================================
-- Alliance Hub — Esquema Supabase (generado desde la BD real)
-- ============================================================
-- Proyecto Supabase   : qkccyjegkgjzwoxytnqp
-- Fecha de generación : 2026-07-18
-- Regenerado automáticamente desde el catálogo de la base de datos.
-- Fuente de verdad: Supabase.
-- Contenido: extensiones, tipos enum, 28 tablas, 1 vista,
-- RLS (86 políticas), 31 funciones y 7 triggers del schema public.
-- ============================================================

-- ============================================================
-- SECCIÓN 1 — EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;  -- versión instalada: 1.6.4
CREATE EXTENSION IF NOT EXISTS pg_net;  -- versión instalada: 0.20.3
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- versión instalada: 1.11
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- versión instalada: 1.3
CREATE EXTENSION IF NOT EXISTS supabase_vault;  -- versión instalada: 0.3.1
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- versión instalada: 1.1

-- ============================================================
-- SECCIÓN 2 — TIPOS PERSONALIZADOS (ENUMS)
-- ============================================================
-- Nota: game_status y game_type existen en la BD pero ninguna columna los usa
-- (matches.status y matches.match_type son text). rule_visibility se usa en
-- rule_sections.visibility.
DO $$ BEGIN
    CREATE TYPE public.game_status AS ENUM ('draft', 'open', 'in_progress', 'finished', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.game_type AS ENUM ('internal', 'duel', 'tournament');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.rule_visibility AS ENUM ('public', 'player', 'official', 'leader', 'admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SECCIÓN 3 — TABLAS (28, orden alfabético)
-- ============================================================
-- Nota: al ser orden alfabético, algunas FK referencian tablas definidas más
-- adelante (p. ej. admin_invites -> alliances). En una BD vacía, aplicar en
-- una sola transacción o usar este archivo como referencia del esquema real.

-- ------------------------------------------------------------
-- Tabla: public.admin_invites
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_invites (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    created_by uuid,
    used boolean DEFAULT false,
    used_by uuid,
    used_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'moderator'::text NOT NULL,
    player_id integer,
    alliance_id uuid,
    CONSTRAINT admin_invites_pkey1 PRIMARY KEY (id),
    CONSTRAINT admin_invites_code_key1 UNIQUE (code),
    CONSTRAINT admin_invites_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE SET NULL,
    CONSTRAINT admin_invites_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Tabla: public.admin_users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid NOT NULL,
    alliance_id uuid,
    display_name text,
    supremacy_player_id bigint,
    approved_by uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'moderator'::text NOT NULL,
    CONSTRAINT admin_users_pkey PRIMARY KEY (id),
    CONSTRAINT admin_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT admin_users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.alliance_duel_teams
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alliance_duel_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alliance_id uuid NOT NULL,
    match_id uuid,
    player_ids integer[] DEFAULT '{}'::integer[] NOT NULL,
    status text DEFAULT 'forming'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT alliance_duel_teams_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_duel_teams_alliance_id_match_id_key UNIQUE (alliance_id, match_id),
    CONSTRAINT alliance_duel_teams_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
    CONSTRAINT alliance_duel_teams_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
    CONSTRAINT alliance_duel_teams_status_check CHECK ((status = ANY (ARRAY['forming'::text, 'ready'::text, 'matched'::text, 'active'::text, 'completed'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.alliance_leader_requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alliance_leader_requests (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    player_id bigint NOT NULL,
    display_name text NOT NULL,
    supremacy_player_id bigint NOT NULL,
    alliance_name text NOT NULL,
    alliance_tag text NOT NULL,
    evidence_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    invite_code_used uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    alliance_description text,
    discord_handle text,
    member_count integer,
    CONSTRAINT alliance_leader_requests_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_leader_requests_invite_code_used_fkey FOREIGN KEY (invite_code_used) REFERENCES admin_invites(id) ON DELETE SET NULL,
    CONSTRAINT alliance_leader_requests_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT alliance_leader_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT alliance_leader_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'needs_info'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.alliance_memberships
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alliance_memberships (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    player_id bigint NOT NULL,
    alliance_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by text DEFAULT 'player'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    role text DEFAULT 'member'::text NOT NULL,
    CONSTRAINT alliance_memberships_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_memberships_player_id_alliance_id_key UNIQUE (player_id, alliance_id),
    CONSTRAINT alliance_memberships_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
    CONSTRAINT alliance_memberships_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT alliance_memberships_requested_by_check CHECK ((requested_by = ANY (ARRAY['player'::text, 'leader'::text]))),
    CONSTRAINT alliance_memberships_role_check CHECK ((role = ANY (ARRAY['member'::text, 'officer'::text, 'co_leader'::text, 'leader'::text]))),
    CONSTRAINT alliance_memberships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.alliance_officers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alliance_officers (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    alliance_id uuid NOT NULL,
    player_id bigint NOT NULL,
    role text DEFAULT 'officer'::text NOT NULL,
    title text,
    permissions jsonb DEFAULT '{"edit_rules": false, "manage_duels": false, "view_reports": true, "view_strikes": true, "create_matches": true, "manage_members": true, "manage_officers": false, "send_notifications": false}'::jsonb NOT NULL,
    appointed_by uuid,
    appointed_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    deactivated_at timestamp with time zone,
    deactivated_reason text,
    CONSTRAINT alliance_officers_pkey PRIMARY KEY (id),
    CONSTRAINT alliance_officers_alliance_id_player_id_key UNIQUE (alliance_id, player_id),
    CONSTRAINT alliance_officers_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
    CONSTRAINT alliance_officers_appointed_by_fkey FOREIGN KEY (appointed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT alliance_officers_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT alliance_officers_role_check CHECK ((role = ANY (ARRAY['officer'::text, 'co_leader'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.alliances
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alliances (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    tag text NOT NULL,
    description text,
    leader_id bigint,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT alliances_pkey1 PRIMARY KEY (id),
    CONSTRAINT alliances_tag_key1 UNIQUE (tag),
    CONSTRAINT alliances_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'penalized'::text]))),
    CONSTRAINT alliances_tag_check CHECK (((length(tag) >= 2) AND (length(tag) <= 10)))
);

-- ------------------------------------------------------------
-- Tabla: public.app_settings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text NOT NULL,
    value text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT app_settings_pkey1 PRIMARY KEY (key)
);

-- ------------------------------------------------------------
-- Tabla: public.chat_messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id bigint NOT NULL,
    channel text NOT NULL,
    sender_admin_id uuid,
    sender_name text NOT NULL,
    sender_role text,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
    CONSTRAINT chat_messages_sender_admin_id_fkey FOREIGN KEY (sender_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Tabla: public.chat_reports
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    reported_message_id text,
    reporter_id text NOT NULL,
    reporter_name text NOT NULL,
    reason text NOT NULL,
    context_messages jsonb,
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    resolution text,
    reported_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chat_reports_pkey PRIMARY KEY (id),
    CONSTRAINT chat_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.direct_messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_admin_id uuid,
    sender_name text NOT NULL,
    recipient_admin_id uuid,
    recipient_player_id bigint,
    subject text,
    message text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT direct_messages_pkey PRIMARY KEY (id),
    CONSTRAINT direct_messages_recipient_admin_id_fkey FOREIGN KEY (recipient_admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT direct_messages_sender_admin_id_fkey FOREIGN KEY (sender_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Tabla: public.leader_transfer_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leader_transfer_log (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    alliance_id uuid NOT NULL,
    from_player_id bigint,
    to_player_id bigint NOT NULL,
    transferred_by uuid,
    transferred_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    status text DEFAULT 'completed'::text NOT NULL,
    CONSTRAINT leader_transfer_log_pkey PRIMARY KEY (id),
    CONSTRAINT leader_transfer_log_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
    CONSTRAINT leader_transfer_log_from_player_id_fkey FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE SET NULL,
    CONSTRAINT leader_transfer_log_to_player_id_fkey FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT leader_transfer_log_transferred_by_fkey FOREIGN KEY (transferred_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT leader_transfer_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text, 'rejected'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.match_nullified_kills
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_nullified_kills (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    player_strike_id uuid NOT NULL,
    player_id bigint NOT NULL,
    match_id uuid NOT NULL,
    kills_nullified integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT match_nullified_kills_pkey PRIMARY KEY (id),
    CONSTRAINT match_nullified_kills_player_strike_id_fkey FOREIGN KEY (player_strike_id) REFERENCES player_strikes(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: public.match_registrations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_registrations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    match_id uuid,
    player_id bigint,
    nation text,
    registered_at timestamp with time zone DEFAULT now(),
    confirmed_at timestamp with time zone,
    confirmed_by uuid,
    notes text,
    status text DEFAULT 'pending'::text,
    CONSTRAINT match_registrations_pkey PRIMARY KEY (id),
    CONSTRAINT match_registrations_match_id_player_id_key UNIQUE (match_id, player_id),
    CONSTRAINT match_registrations_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    CONSTRAINT match_registrations_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: public.match_results
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_results (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    match_id uuid,
    player_id bigint,
    nation text,
    kills integer DEFAULT 0,
    deaths integer DEFAULT 0,
    kd_ratio numeric(10,2) DEFAULT 0,
    raw_csv_data text[],
    imported_at timestamp with time zone DEFAULT now(),
    CONSTRAINT match_results_pkey PRIMARY KEY (id),
    CONSTRAINT match_results_match_id_player_id_key UNIQUE (match_id, player_id),
    CONSTRAINT unique_match_player UNIQUE (match_id, player_id),
    CONSTRAINT match_results_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    CONSTRAINT match_results_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: public.match_winners
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_winners (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    match_id uuid NOT NULL,
    player_id bigint NOT NULL,
    "position" integer NOT NULL,
    declared_by uuid,
    declared_at timestamp with time zone DEFAULT now(),
    CONSTRAINT match_winners_pkey PRIMARY KEY (id),
    CONSTRAINT match_winners_match_id_player_id_key UNIQUE (match_id, player_id),
    CONSTRAINT match_winners_match_id_position_key UNIQUE (match_id, "position"),
    CONSTRAINT fk_winners_declared_by FOREIGN KEY (declared_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT match_winners_position_check CHECK (("position" = ANY (ARRAY[1, 2, 3])))
);

-- ------------------------------------------------------------
-- Tabla: public.matches
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    game_id text,
    description text,
    alliance_id uuid,
    alliance_a_id uuid,
    alliance_b_id uuid,
    round integer,
    max_players integer DEFAULT 10 NOT NULL,
    winners_declared boolean DEFAULT false,
    rules_url text,
    password text,
    show_game_id boolean DEFAULT true,
    requires_approval boolean DEFAULT false,
    is_private boolean DEFAULT false,
    share_token uuid DEFAULT gen_random_uuid(),
    referee_id bigint,
    auto_delete_at timestamp with time zone,
    created_by uuid,
    csv_imported boolean DEFAULT false,
    notifications_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'draft'::text,
    match_type text DEFAULT 'internal'::text,
    league_id uuid,
    CONSTRAINT matches_pkey PRIMARY KEY (id),
    CONSTRAINT fk_matches_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT matches_alliance_id_fkey FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Tabla: public.player_reports
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid,
    player_id bigint,
    player_name text,
    reported_player_id integer,
    reported_player_name text,
    report_type text NOT NULL,
    description text,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text,
    admin_response text,
    strike_applied boolean DEFAULT false,
    strike_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    resolved_by uuid,
    rule_section_id uuid,
    CONSTRAINT player_reports_pkey PRIMARY KEY (id),
    CONSTRAINT player_reports_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    CONSTRAINT player_reports_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id),
    CONSTRAINT player_reports_reported_player_id_fkey FOREIGN KEY (reported_player_id) REFERENCES players(id),
    CONSTRAINT player_reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES admin_users(id),
    CONSTRAINT player_reports_rule_section_id_fkey FOREIGN KEY (rule_section_id) REFERENCES rule_sections(id),
    CONSTRAINT player_reports_strike_id_fkey FOREIGN KEY (strike_id) REFERENCES player_strikes(id),
    CONSTRAINT player_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'investigating'::text, 'resolved'::text, 'dismissed'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.player_sanctions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_sanctions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    player_id bigint NOT NULL,
    strike_id uuid,
    strike_type_id uuid,
    formula_id uuid,
    kills_before integer DEFAULT 0 NOT NULL,
    points_before integer DEFAULT 0,
    status_before text,
    kills_after integer DEFAULT 0 NOT NULL,
    points_after integer DEFAULT 0,
    status_after text,
    penalty_pct numeric(5,2) DEFAULT 0,
    reputation_delta integer DEFAULT 0,
    formula_used text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT player_sanctions_pkey PRIMARY KEY (id),
    CONSTRAINT player_sanctions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id),
    CONSTRAINT player_sanctions_strike_id_fkey FOREIGN KEY (strike_id) REFERENCES player_strikes(id),
    CONSTRAINT player_sanctions_strike_type_id_fkey FOREIGN KEY (strike_type_id) REFERENCES strike_types(id)
);

-- ------------------------------------------------------------
-- Tabla: public.player_strikes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_strikes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id bigint NOT NULL,
    strike_type_id uuid NOT NULL,
    match_id uuid,
    reason text NOT NULL,
    applied_by uuid,
    applied_at timestamp with time zone DEFAULT now(),
    removed_by uuid,
    removed_at timestamp with time zone,
    removal_reason text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    rule_section_id uuid,
    report_id uuid,
    rule_precedent_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    evidence_urls text[] DEFAULT '{}'::text[],
    expires_at timestamp with time zone,
    CONSTRAINT player_strikes_pkey PRIMARY KEY (id),
    CONSTRAINT fk_strikes_applied_by FOREIGN KEY (applied_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT player_strikes_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
    CONSTRAINT player_strikes_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT player_strikes_report_id_fkey FOREIGN KEY (report_id) REFERENCES player_reports(id),
    CONSTRAINT player_strikes_rule_precedent_id_fkey FOREIGN KEY (rule_precedent_id) REFERENCES rule_precedents(id) ON DELETE SET NULL,
    CONSTRAINT player_strikes_rule_section_id_fkey FOREIGN KEY (rule_section_id) REFERENCES rule_sections(id),
    CONSTRAINT player_strikes_status_check CHECK ((status = ANY (ARRAY['pending_precedent'::text, 'active'::text, 'rejected'::text, 'removed'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.player_tokens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id bigint NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used timestamp with time zone DEFAULT now(),
    transfer_code text,
    transfer_expires_at timestamp with time zone,
    CONSTRAINT player_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT player_tokens_token_key UNIQUE (token),
    CONSTRAINT player_tokens_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: public.players
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
    id bigint NOT NULL,
    current_username text NOT NULL,
    status text DEFAULT 'active'::text,
    total_kills integer DEFAULT 0,
    total_deaths integer DEFAULT 0,
    games_played integer DEFAULT 0,
    last_seen timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    current_alliance_id uuid,
    reputation_score integer DEFAULT 100 NOT NULL,
    suspension_reason text,
    banned_until timestamp with time zone,
    suspended_until timestamp with time zone,
    CONSTRAINT players_pkey1 PRIMARY KEY (id),
    CONSTRAINT players_current_alliance_id_fkey FOREIGN KEY (current_alliance_id) REFERENCES alliances(id) ON DELETE SET NULL,
    CONSTRAINT players_status_check CHECK ((status = ANY (ARRAY['active'::text, 'banned'::text, 'suspended'::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.push_subscriptions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    player_id bigint,
    alliance_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT push_subscriptions_pkey1 PRIMARY KEY (id)
);

-- ------------------------------------------------------------
-- Tabla: public.rule_precedents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_precedents (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    rule_section_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    resolution text NOT NULL,
    severity text DEFAULT 'minor'::text NOT NULL,
    strike_type text,
    report_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    player_id bigint,
    match_id uuid,
    strike_id uuid,
    CONSTRAINT rule_precedents_pkey PRIMARY KEY (id),
    CONSTRAINT rule_precedents_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
    CONSTRAINT rule_precedents_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
    CONSTRAINT rule_precedents_rule_section_id_fkey FOREIGN KEY (rule_section_id) REFERENCES rule_sections(id) ON DELETE CASCADE,
    CONSTRAINT rule_precedents_strike_id_fkey FOREIGN KEY (strike_id) REFERENCES player_strikes(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Tabla: public.rule_section_history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_section_history (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    section_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rule_section_history_pkey PRIMARY KEY (id),
    CONSTRAINT rule_section_history_section_id_fkey FOREIGN KEY (section_id) REFERENCES rule_sections(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Tabla: public.rule_sections
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_sections (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    parent_id uuid,
    section_number text,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visibility rule_visibility DEFAULT 'public'::rule_visibility NOT NULL,
    training_for text,
    CONSTRAINT rule_sections_pkey PRIMARY KEY (id),
    CONSTRAINT rule_sections_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES rule_sections(id) ON DELETE SET NULL,
    CONSTRAINT rule_sections_training_for_check CHECK ((training_for = ANY (ARRAY['leader'::text, 'officer'::text, 'admin'::text, 'moderator'::text, NULL::text])))
);

-- ------------------------------------------------------------
-- Tabla: public.strike_types
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strike_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    severity integer DEFAULT 1 NOT NULL,
    legend text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    nullifies_kills boolean DEFAULT false,
    formula_id uuid,
    is_preset boolean DEFAULT false,
    is_ban boolean DEFAULT false,
    ban_duration_hours integer,
    rule_section_id uuid,
    CONSTRAINT strike_types_pkey PRIMARY KEY (id),
    CONSTRAINT strike_types_code_key UNIQUE (code),
    CONSTRAINT strike_types_rule_section_id_fkey FOREIGN KEY (rule_section_id) REFERENCES rule_sections(id),
    CONSTRAINT strike_types_severity_check CHECK (((severity >= 1) AND (severity <= 3)))
);

-- ------------------------------------------------------------
-- Tabla: public.training_progress
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_progress (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    admin_id uuid,
    player_id bigint,
    section_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    CONSTRAINT training_progress_pkey PRIMARY KEY (id),
    CONSTRAINT training_progress_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT training_progress_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT training_progress_section_id_fkey FOREIGN KEY (section_id) REFERENCES rule_sections(id) ON DELETE CASCADE
);

-- ============================================================
-- SECCIÓN 4 — VISTAS (1)
-- ============================================================
-- Vista: public.player_ranking_stats (kills efectivos = kills - kills anulados)
CREATE OR REPLACE VIEW public.player_ranking_stats AS
 SELECT p.id,
    p.current_username,
    p.current_alliance_id,
    p.total_kills,
    p.total_deaths,
    p.games_played,
    p.status,
    p.last_seen,
    GREATEST(0::bigint, p.total_kills - COALESCE(sum(mnk.kills_nullified), 0::bigint)) AS effective_kills,
    COALESCE(sum(mnk.kills_nullified), 0::bigint) AS total_nullified_kills
   FROM players p
     LEFT JOIN match_nullified_kills mnk ON mnk.player_id = p.id
  GROUP BY p.id;

-- ============================================================
-- SECCIÓN 5 — ROW LEVEL SECURITY
-- ============================================================
-- Tablas con RLS habilitado: 25 de 28.
-- Tablas SIN RLS (acceso público total con la anon key):
--   alliance_officers, leader_transfer_log, training_progress

ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_duel_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_leader_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_nullified_kills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_precedents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_section_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strike_types ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Políticas RLS (86)
-- ------------------------------------------------------------

-- Tabla: public.admin_invites (3 políticas)
CREATE POLICY "admin_invites_admin_only" ON public.admin_invites AS PERMISSIVE FOR ALL TO public
    USING (is_authenticated_admin());
CREATE POLICY "admin_invites_anon_select_own" ON public.admin_invites AS PERMISSIVE FOR SELECT TO anon
    USING (((player_id IS NOT NULL) AND (used = false) AND (expires_at > now())));
CREATE POLICY "admin_invites_insert_admin" ON public.admin_invites AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.admin_users (4 políticas)
CREATE POLICY "admin_users_delete" ON public.admin_users AS PERMISSIVE FOR DELETE TO authenticated
    USING (is_superadmin());
CREATE POLICY "admin_users_insert" ON public.admin_users AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (is_authenticated());
CREATE POLICY "admin_users_select" ON public.admin_users AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "admin_users_update" ON public.admin_users AS PERMISSIVE FOR UPDATE TO authenticated
    USING (is_admin());

-- Tabla: public.alliance_duel_teams (2 políticas)
CREATE POLICY "duel_teams_public_read" ON public.alliance_duel_teams AS PERMISSIVE FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "duel_teams_write" ON public.alliance_duel_teams AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Tabla: public.alliance_leader_requests (4 políticas)
CREATE POLICY "alliance_leader_requests_delete_admin" ON public.alliance_leader_requests AS PERMISSIVE FOR DELETE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "alliance_leader_requests_insert" ON public.alliance_leader_requests AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "alliance_leader_requests_select" ON public.alliance_leader_requests AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "alliance_leader_requests_update_admin" ON public.alliance_leader_requests AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.alliance_memberships (4 políticas)
CREATE POLICY "alliance_memberships_delete" ON public.alliance_memberships AS PERMISSIVE FOR DELETE TO public
    USING (true);
CREATE POLICY "alliance_memberships_insert" ON public.alliance_memberships AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "alliance_memberships_select" ON public.alliance_memberships AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "alliance_memberships_update" ON public.alliance_memberships AS PERMISSIVE FOR UPDATE TO public
    USING (true);

-- Tabla: public.alliances (5 políticas)
CREATE POLICY "Allow public read on alliances" ON public.alliances AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "alliances_delete_admin" ON public.alliances AS PERMISSIVE FOR DELETE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "alliances_insert_admin" ON public.alliances AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "alliances_public_read" ON public.alliances AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "alliances_update_admin" ON public.alliances AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.app_settings (3 políticas)
CREATE POLICY "app_settings_insert_admin" ON public.app_settings AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "app_settings_public_read" ON public.app_settings AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "app_settings_update_admin" ON public.app_settings AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.chat_messages (4 políticas)
CREATE POLICY "chat_messages_insert" ON public.chat_messages AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "chat_messages_insert_player" ON public.chat_messages AS PERMISSIVE FOR INSERT TO anon, authenticated
    WITH CHECK (true);
CREATE POLICY "chat_messages_public_read" ON public.chat_messages AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "chat_messages_select" ON public.chat_messages AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- Tabla: public.chat_reports (2 políticas)
CREATE POLICY "chat_reports_admin_only" ON public.chat_reports AS PERMISSIVE FOR ALL TO public
    USING (is_authenticated_admin());
CREATE POLICY "chat_reports_select" ON public.chat_reports AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- Tabla: public.direct_messages (3 políticas)
CREATE POLICY "direct_messages_admin_access" ON public.direct_messages AS PERMISSIVE FOR ALL TO public
    USING (is_authenticated_admin());
CREATE POLICY "direct_messages_insert" ON public.direct_messages AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "direct_messages_select" ON public.direct_messages AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- Tabla: public.match_nullified_kills (1 políticas)
CREATE POLICY "Allow public read on match_nullified_kills" ON public.match_nullified_kills AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);

-- Tabla: public.match_registrations (6 políticas)
CREATE POLICY "Allow public read on match_registrations" ON public.match_registrations AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "match_registrations_admin_all" ON public.match_registrations AS PERMISSIVE FOR ALL TO public
    USING (is_authenticated_admin());
CREATE POLICY "match_registrations_delete_admin" ON public.match_registrations AS PERMISSIVE FOR DELETE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "match_registrations_insert_player" ON public.match_registrations AS PERMISSIVE FOR INSERT TO anon, authenticated
    WITH CHECK (is_valid_player(player_id));
CREATE POLICY "match_registrations_update_admin" ON public.match_registrations AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "match_registrations_update_player" ON public.match_registrations AS PERMISSIVE FOR UPDATE TO anon, authenticated
    USING (is_valid_player(player_id));

-- Tabla: public.match_results (6 políticas)
CREATE POLICY "Allow public read on match_results" ON public.match_results AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "match_results_delete" ON public.match_results AS PERMISSIVE FOR DELETE TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (admin_users au
     JOIN matches m ON ((m.alliance_id = au.alliance_id)))
  WHERE ((au.id = auth.uid()) AND (au.role = 'alliance_leader'::text) AND (au.status = 'active'::text) AND (m.id = match_results.match_id))))));
CREATE POLICY "match_results_insert" ON public.match_results AS PERMISSIVE FOR INSERT TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "match_results_public_read" ON public.match_results AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "match_results_select" ON public.match_results AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "match_results_update" ON public.match_results AS PERMISSIVE FOR UPDATE TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (admin_users au
     JOIN matches m ON ((m.alliance_id = au.alliance_id)))
  WHERE ((au.id = auth.uid()) AND (au.role = 'alliance_leader'::text) AND (au.status = 'active'::text) AND (m.id = match_results.match_id))))));

-- Tabla: public.match_winners (1 políticas)
CREATE POLICY "match_winners_public_read" ON public.match_winners AS PERMISSIVE FOR SELECT TO public
    USING (true);

-- Tabla: public.matches (6 políticas)
CREATE POLICY "Allow public read on matches" ON public.matches AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "matches_delete" ON public.matches AS PERMISSIVE FOR DELETE TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = 'alliance_leader'::text) AND (admin_users.status = 'active'::text) AND (admin_users.alliance_id = matches.alliance_id)))) OR (created_by = auth.uid())));
CREATE POLICY "matches_insert" ON public.matches AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "matches_public_read" ON public.matches AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "matches_select" ON public.matches AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "matches_update" ON public.matches AS PERMISSIVE FOR UPDATE TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = 'alliance_leader'::text) AND (admin_users.status = 'active'::text) AND (admin_users.alliance_id = matches.alliance_id)))) OR (created_by = auth.uid())));

-- Tabla: public.player_reports (4 políticas)
CREATE POLICY "player_reports_insert_player" ON public.player_reports AS PERMISSIVE FOR INSERT TO anon, authenticated
    WITH CHECK (true);
CREATE POLICY "player_reports_insert_public" ON public.player_reports AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "player_reports_select_own" ON public.player_reports AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "player_reports_update_admin" ON public.player_reports AS PERMISSIVE FOR UPDATE TO public
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.player_sanctions (2 políticas)
CREATE POLICY "player_sanctions_read" ON public.player_sanctions AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "player_sanctions_write_admin" ON public.player_sanctions AS PERMISSIVE FOR ALL TO authenticated
    USING (is_active_admin())
    WITH CHECK (is_active_admin());

-- Tabla: public.player_strikes (5 políticas)
CREATE POLICY "Allow public read on player_strikes" ON public.player_strikes AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "player_strikes_delete" ON public.player_strikes AS PERMISSIVE FOR DELETE TO public
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = 'superadmin'::text) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "player_strikes_insert" ON public.player_strikes AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "player_strikes_select" ON public.player_strikes AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "player_strikes_update" ON public.player_strikes AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'moderator'::text, 'event_admin'::text])) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.player_tokens (4 políticas)
CREATE POLICY "player_tokens_delete" ON public.player_tokens AS PERMISSIVE FOR DELETE TO public
    USING (true);
CREATE POLICY "player_tokens_insert" ON public.player_tokens AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "player_tokens_select" ON public.player_tokens AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "player_tokens_update" ON public.player_tokens AS PERMISSIVE FOR UPDATE TO public
    USING (true);

-- Tabla: public.players (5 políticas)
CREATE POLICY "Allow public read on players" ON public.players AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "players_insert" ON public.players AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (true);
CREATE POLICY "players_public_read" ON public.players AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "players_select" ON public.players AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "players_update_admin" ON public.players AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.push_subscriptions (1 políticas)
CREATE POLICY "push_subscriptions_admin_only" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
    USING (is_authenticated_admin());

-- Tabla: public.rule_precedents (4 políticas)
CREATE POLICY "rule_precedents_delete" ON public.rule_precedents AS PERMISSIVE FOR DELETE TO public
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = 'superadmin'::text) AND (admin_users.status = 'active'::text)))));
CREATE POLICY "rule_precedents_insert" ON public.rule_precedents AS PERMISSIVE FOR INSERT TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.status = 'active'::text) AND (admin_users.role = ANY (ARRAY['superadmin'::text, 'event_admin'::text, 'moderator'::text]))))));
CREATE POLICY "rule_precedents_select" ON public.rule_precedents AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "rule_precedents_update" ON public.rule_precedents AS PERMISSIVE FOR UPDATE TO public
    USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE ((admin_users.id = auth.uid()) AND (admin_users.role = 'superadmin'::text) AND (admin_users.status = 'active'::text)))));

-- Tabla: public.rule_section_history (2 políticas)
CREATE POLICY "rule_section_history_read" ON public.rule_section_history AS PERMISSIVE FOR SELECT TO public
    USING (true);
CREATE POLICY "rule_section_history_write" ON public.rule_section_history AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Tabla: public.rule_sections (2 políticas)
CREATE POLICY "rule_sections_read" ON public.rule_sections AS PERMISSIVE FOR SELECT TO public
    USING ((is_active = true));
CREATE POLICY "rule_sections_write" ON public.rule_sections AS PERMISSIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Tabla: public.strike_types (3 políticas)
CREATE POLICY "Allow public read on strike_types" ON public.strike_types AS PERMISSIVE FOR SELECT TO anon, authenticated
    USING (true);
CREATE POLICY "strike_types_public_read" ON public.strike_types AS PERMISSIVE FOR SELECT TO public
    USING (((is_active IS NULL) OR (is_active = true)));
CREATE POLICY "strike_types_write_admin" ON public.strike_types AS PERMISSIVE FOR ALL TO authenticated
    USING (is_active_admin())
    WITH CHECK (is_active_admin());

-- ============================================================
-- SECCIÓN 6 — FUNCIONES (31)
-- ============================================================
-- Definiciones exactas de pg_get_functiondef (fines de línea CRLF normalizados a LF).

-- fn: auto_nullify_kills
CREATE OR REPLACE FUNCTION public.auto_nullify_kills()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_kills integer;
    v_strike_nullifies boolean;
BEGIN
    SELECT nullifies_kills INTO v_strike_nullifies
    FROM public.strike_types WHERE id = NEW.strike_type_id;

    IF v_strike_nullifies = true AND NEW.match_id IS NOT NULL THEN
        SELECT COALESCE(total_kills, 0) INTO v_kills
        FROM public.match_results
        WHERE player_id = NEW.player_id AND match_id = NEW.match_id;

        IF v_kills > 0 THEN
            INSERT INTO public.match_nullified_kills (
                player_strike_id, player_id, match_id, kills_nullified
            ) VALUES (NEW.id, NEW.player_id, NEW.match_id, v_kills);
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- fn: claim_transfer_code
CREATE OR REPLACE FUNCTION public.claim_transfer_code(p_transfer_code text)
 RETURNS TABLE(player_id bigint, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    UPDATE public.player_tokens pt
    SET token = gen_random_uuid()::text,
        transfer_code = null,
        transfer_expires_at = null,
        last_used = now()
    WHERE pt.transfer_code = p_transfer_code
      AND pt.transfer_expires_at > now()
    RETURNING pt.player_id, pt.token;
END;
$function$;

-- fn: clear_expired_bans
CREATE OR REPLACE FUNCTION public.clear_expired_bans()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.players
  SET status = 'active',
      banned_until = null,
      suspended_until = null,
      suspension_reason = null
  WHERE (status = 'banned' AND banned_until IS NOT NULL AND banned_until <= now())
     OR (status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= now());
$function$;

-- fn: complete_setup
CREATE OR REPLACE FUNCTION public.complete_setup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE app_settings SET value = 'true', updated_at = NOW() WHERE key = 'setup_complete';
END;
$function$;

-- fn: create_alliance_on_leader_approval
CREATE OR REPLACE FUNCTION public.create_alliance_on_leader_approval()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        INSERT INTO alliances (name, tag, leader_id, status)
        VALUES (NEW.alliance_name, UPPER(NEW.alliance_tag), NEW.player_id, 'active')
        ON CONFLICT (tag) DO NOTHING;
        
        UPDATE players 
        SET current_alliance_id = (SELECT id FROM alliances WHERE tag = UPPER(NEW.alliance_tag) LIMIT 1)
        WHERE id = NEW.player_id;
    END IF;
    RETURN NEW;
END;
$function$;

-- fn: create_invite_code
CREATE OR REPLACE FUNCTION public.create_invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_code TEXT;
BEGIN
    new_code := upper(substring(md5(random()::text) from 1 for 8));
    INSERT INTO admin_invites (code, created_by) VALUES (new_code, auth.uid());
    RETURN new_code;
END;
$function$;

-- fn: delete_game_complete
CREATE OR REPLACE FUNCTION public.delete_game_complete(game_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_player RECORD;
BEGIN
    FOR affected_player IN 
        SELECT DISTINCT player_id 
        FROM game_results 
        WHERE game_id = game_uuid
    LOOP
        PERFORM recalc_player_from_scratch(affected_player.player_id);
    END LOOP;

    DELETE FROM game_results WHERE game_id = game_uuid;
    DELETE FROM registrations WHERE game_id = game_uuid;
    DELETE FROM games WHERE id = game_uuid;
END;
$function$;

-- fn: force_schema_cache_refresh
CREATE OR REPLACE FUNCTION public.force_schema_cache_refresh()
 RETURNS void
 LANGUAGE plpgsql
AS $function$ BEGIN PERFORM 1; END; $function$;

-- fn: generate_transfer_code
CREATE OR REPLACE FUNCTION public.generate_transfer_code(p_player_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_code text;
BEGIN
    new_code := 'TR-' || upper(substring(md5(random()::text) from 1 for 6));
    
    UPDATE public.player_tokens 
    SET transfer_code = new_code,
        transfer_expires_at = now() + interval '10 minutes'
    WHERE player_id = p_player_id;
    
    RETURN new_code;
END;
$function$;

-- fn: invalidate_player_stats
CREATE OR REPLACE FUNCTION public.invalidate_player_stats(game_uuid uuid, p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    DELETE FROM game_results WHERE game_id = game_uuid AND player_id = p_id;
END;
$function$;

-- fn: is_active_admin
CREATE OR REPLACE FUNCTION public.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid()
      AND status = 'active'
  );
$function$;

-- fn: is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid() AND status = 'active'
    );
END;
$function$;

-- fn: is_authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN auth.role() = 'authenticated';
END;
$function$;

-- fn: is_authenticated_admin
CREATE OR REPLACE FUNCTION public.is_authenticated_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN is_authenticated();
END;
$function$;

-- fn: is_setup_complete
CREATE OR REPLACE FUNCTION public.is_setup_complete()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result BOOLEAN;
BEGIN
    SELECT value::boolean INTO result FROM app_settings WHERE key = 'setup_complete';
    RETURN COALESCE(result, false);
END;
$function$;

-- fn: is_superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid() AND role = 'superadmin' AND status = 'active'
    );
END;
$function$;

-- fn: is_valid_player
CREATE OR REPLACE FUNCTION public.is_valid_player(p_player_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.players
        WHERE id = p_player_id AND status = 'active'
    );
END;
$function$;

-- fn: log_officer_change
CREATE OR REPLACE FUNCTION public.log_officer_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (admin_id, action, table_name, record_id, new_data)
        VALUES (
            NEW.appointed_by,
            'appointed_officer',
            'alliance_officers',
            NEW.id::text,
            jsonb_build_object(
                'alliance_id', NEW.alliance_id,
                'player_id', NEW.player_id,
                'role', NEW.role,
                'title', NEW.title
            )
        );
    ELSIF TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true THEN
        INSERT INTO audit_log (admin_id, action, table_name, record_id, old_data)
        VALUES (
            null,
            'removed_officer',
            'alliance_officers',
            NEW.id::text,
            jsonb_build_object(
                'alliance_id', NEW.alliance_id,
                'player_id', NEW.player_id,
                'role', NEW.role,
                'reason', NEW.deactivated_reason
            )
        );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- fn: recalc_all_players
CREATE OR REPLACE FUNCTION public.recalc_all_players()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    p RECORD;
BEGIN
    FOR p IN SELECT DISTINCT player_id FROM game_results LOOP
        PERFORM recalc_player_from_scratch(p.player_id);
    END LOOP;

    UPDATE players
    SET total_kills = 0, total_deaths = 0, games_played = 0
    WHERE id NOT IN (SELECT DISTINCT player_id FROM game_results);
END;
$function$;

-- fn: recalc_player_from_scratch
CREATE OR REPLACE FUNCTION public.recalc_player_from_scratch(player_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE players
    SET 
        total_kills = COALESCE((
            SELECT SUM(kills) 
            FROM game_results 
            WHERE game_results.player_id = recalc_player_from_scratch.player_id
        ), 0),
        total_deaths = COALESCE((
            SELECT SUM(deaths) 
            FROM game_results 
            WHERE game_results.player_id = recalc_player_from_scratch.player_id
        ), 0),
        games_played = COALESCE((
            SELECT COUNT(DISTINCT game_id) 
            FROM game_results 
            WHERE game_results.player_id = recalc_player_from_scratch.player_id
        ), 0),
        last_seen = NOW()
    WHERE players.id = recalc_player_from_scratch.player_id;
END;
$function$;

-- fn: recalc_player_stats
CREATE OR REPLACE FUNCTION public.recalc_player_stats(player_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE players
    SET 
        total_kills = (SELECT COALESCE(SUM(kills), 0) FROM game_results WHERE game_results.player_id = players.id),
        total_deaths = (SELECT COALESCE(SUM(deaths), 0) FROM game_results WHERE game_results.player_id = players.id),
        games_played = (SELECT COUNT(*) FROM game_results WHERE game_results.player_id = players.id)
    WHERE players.id = player_id;
END;
$function$;

-- fn: trg_apply_sanction
CREATE OR REPLACE FUNCTION public.trg_apply_sanction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    formula_rec RECORD;
    player_rec RECORD;
    kills_result NUMERIC;
    points_result NUMERIC;
    status_result TEXT;
    penalty_pct NUMERIC;
    match_kills_val INTEGER := 0;
    current_kd_val NUMERIC;
    vars_json JSONB;
BEGIN
    -- Obtener el tipo de strike con su formula
    SELECT st.*, sf.formula_kills, sf.formula_points, sf.formula_status, sf.variables
    INTO formula_rec
    FROM strike_types st
    LEFT JOIN sanction_formulas sf ON st.formula_id = sf.id
    WHERE st.id = NEW.strike_type_id;

    -- Si no tiene formula, no hacer nada (backward compatible)
    IF formula_rec.formula_kills IS NULL THEN
        RETURN NEW;
    END IF;

    -- Obtener datos del jugador
    SELECT * INTO player_rec FROM players WHERE id = NEW.player_id;
    IF player_rec IS NULL THEN
        RETURN NEW;
    END IF;

    -- Obtener kills de la partida si aplica
    IF NEW.match_id IS NOT NULL THEN
        SELECT kills INTO match_kills_val 
        FROM match_results 
        WHERE player_id = NEW.player_id AND match_id = NEW.match_id
        LIMIT 1;
        IF match_kills_val IS NULL THEN match_kills_val := 0; END IF;
    END IF;

    -- Calcular KD actual
    IF player_rec.total_deaths > 0 THEN
        current_kd_val := player_rec.total_kills::NUMERIC / player_rec.total_deaths;
    ELSE
        current_kd_val := player_rec.total_kills::NUMERIC;
    END IF;

    -- Contar strikes activos del jugador
    DECLARE
        strike_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO strike_count 
        FROM player_strikes 
        WHERE player_id = NEW.player_id AND is_active = true;
        
        -- Preparar variables para la formula
        vars_json := jsonb_build_object(
            'kills', COALESCE(player_rec.total_kills, 0),
            'deaths', COALESCE(player_rec.total_deaths, 1),
            'strikes', COALESCE(strike_count, 0),
            'severity', COALESCE(formula_rec.severity, 1),
            'match_kills', match_kills_val,
            'games_played', COALESCE(player_rec.games_played, 0),
            'current_kd', current_kd_val,
            'points', 0,
            'status', player_rec.status
        );

        -- Ejecutar formula de kills usando PL/pgSQL math
        -- Simplificacion: usamos el engine JS para formulas complejas
        -- Pero para las preset basicas, calculamos aqui:
        
        CASE 
            WHEN formula_rec.name = 'Kill Percentage' THEN
                kills_result := player_rec.total_kills * GREATEST(0.5, 1 - strike_count * 0.1);
                points_result := -formula_rec.severity * 10;
                
            WHEN formula_rec.name = 'Flat Kill Reduction' THEN
                kills_result := GREATEST(0, player_rec.total_kills - formula_rec.severity * 200);
                points_result := -formula_rec.severity * 15;
                
            WHEN formula_rec.name = 'Match-Only Nullifier' THEN
                kills_result := player_rec.total_kills - match_kills_val;
                points_result := -formula_rec.severity * 5;
                
            WHEN formula_rec.name = 'Progressive Escalation' THEN
                kills_result := ROUND(player_rec.total_kills * POWER(0.95, strike_count));
                points_result := -5 * POWER(2, strike_count);
                
            WHEN formula_rec.name = 'Three-Strike Rule' THEN
                IF strike_count >= 3 THEN
                    kills_result := player_rec.total_kills * 0.5;
                    points_result := -100;
                    status_result := 'suspended';
                ELSE
                    kills_result := player_rec.total_kills * (1 - strike_count * 0.1);
                    points_result := -formula_rec.severity * 10;
                END IF;
                
            WHEN formula_rec.name = 'Reputation Only' THEN
                kills_result := player_rec.total_kills;
                points_result := -formula_rec.severity * 25;
                
            WHEN formula_rec.name = 'Hybrid: Match + Global' THEN
                kills_result := ROUND(player_rec.total_kills - match_kills_val * formula_rec.severity * 0.3);
                points_result := -formula_rec.severity * 10;
                
            WHEN formula_rec.name = 'KD Protection' THEN
                IF strike_count * formula_rec.severity > 3 THEN
                    kills_result := ROUND(player_rec.total_kills * 0.7);
                ELSE
                    kills_result := player_rec.total_kills;
                END IF;
                points_result := -strike_count * formula_rec.severity * 5;
                
            WHEN formula_rec.name = 'Proportional to KD' THEN
                kills_result := ROUND(player_rec.total_kills * GREATEST(0.5, 1 - (strike_count * 0.1) / GREATEST(0.5, current_kd_val)));
                points_result := -formula_rec.severity * 10;
                
            WHEN formula_rec.name = 'Diminishing Returns' THEN
                kills_result := ROUND(player_rec.total_kills * GREATEST(0.6, 1 - (0.2 + LEAST(0.15, (strike_count - 1) * 0.05))));
                points_result := -formula_rec.severity * 8;
                
            ELSE
                -- Fallback: Kill Percentage
                kills_result := player_rec.total_kills * GREATEST(0.5, 1 - strike_count * 0.1);
                points_result := -formula_rec.severity * 10;
        END CASE;

        -- Asegurar que no baje de 0
        kills_result := GREATEST(0, kills_result);
        
        -- Calcular porcentaje de penalidad
        IF player_rec.total_kills > 0 THEN
            penalty_pct := ROUND(((player_rec.total_kills - kills_result) / player_rec.total_kills::NUMERIC) * 100, 2);
        ELSE
            penalty_pct := 0;
        END IF;

        -- Insertar en player_sanctions
        INSERT INTO player_sanctions (
            player_id, strike_id, strike_type_id, formula_id,
            kills_before, points_before, status_before,
            kills_after, points_after, status_after,
            penalty_pct, reputation_delta, formula_used
        ) VALUES (
            NEW.player_id, NEW.id, NEW.strike_type_id, formula_rec.formula_id,
            player_rec.total_kills, 0, player_rec.status,
            kills_result::INTEGER, 0, COALESCE(status_result, player_rec.status),
            penalty_pct, points_result::INTEGER, formula_rec.formula_kills
        );

        -- Si la formula cambia el estado, actualizar el jugador
        IF status_result IS NOT NULL AND status_result != player_rec.status THEN
            UPDATE players SET status = status_result WHERE id = NEW.player_id;
        END IF;

    END;

    RETURN NEW;
END;
$function$;

-- fn: trg_rule_section_history
CREATE OR REPLACE FUNCTION public.trg_rule_section_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO rule_section_history (section_id, title, content, changed_by, changed_at)
    VALUES (OLD.id, OLD.title, OLD.content, OLD.created_by, now());
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- fn: trg_rule_section_history_insert
CREATE OR REPLACE FUNCTION public.trg_rule_section_history_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO rule_section_history (section_id, title, content, changed_by, changed_at)
    VALUES (NEW.id, NEW.title, NEW.content, NEW.created_by, now());
    RETURN NEW;
END;
$function$;

-- fn: trigger_after_delete_result
CREATE OR REPLACE FUNCTION public.trigger_after_delete_result()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM recalc_player_from_scratch(OLD.player_id);
    RETURN OLD;
END;
$function$;

-- fn: trigger_after_insert_result
CREATE OR REPLACE FUNCTION public.trigger_after_insert_result()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM recalc_player_from_scratch(NEW.player_id);
    RETURN NEW;
END;
$function$;

-- fn: trigger_after_update_result
CREATE OR REPLACE FUNCTION public.trigger_after_update_result()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM recalc_player_from_scratch(NEW.player_id);
    RETURN NEW;
END;
$function$;

-- fn: trigger_recalc_player
CREATE OR REPLACE FUNCTION public.trigger_recalc_player()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM recalc_player_stats(NEW.player_id);
    RETURN NEW;
END;
$function$;

-- fn: trigger_set_updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- fn: trim_chat_messages
CREATE OR REPLACE FUNCTION public.trim_chat_messages()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    DELETE FROM public.chat_messages
    WHERE channel = NEW.channel
      AND id NOT IN (
          SELECT id FROM public.chat_messages
          WHERE channel = NEW.channel
          ORDER BY created_at DESC
          LIMIT 30
      );
    RETURN NEW;
END;
$function$;

-- fn: verify_player_token
CREATE OR REPLACE FUNCTION public.verify_player_token(p_player_id bigint, p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.player_tokens 
        WHERE player_id = p_player_id AND token = p_token
    );
END;
$function$;

-- ============================================================
-- SECCIÓN 7 — TRIGGERS (7)
-- ============================================================
-- Definiciones exactas de pg_get_triggerdef.

-- trigger: trg_create_alliance_on_approval ON alliance_leader_requests
CREATE TRIGGER trg_create_alliance_on_approval AFTER UPDATE ON public.alliance_leader_requests FOR EACH ROW EXECUTE FUNCTION create_alliance_on_leader_approval();

-- trigger: trg_log_officer_change ON alliance_officers
CREATE TRIGGER trg_log_officer_change AFTER INSERT OR UPDATE ON public.alliance_officers FOR EACH ROW EXECUTE FUNCTION log_officer_change();

-- trigger: trim_chat_trigger ON chat_messages
CREATE TRIGGER trim_chat_trigger AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION trim_chat_messages();

-- trigger: trg_auto_nullify_kills ON player_strikes
CREATE TRIGGER trg_auto_nullify_kills AFTER INSERT ON public.player_strikes FOR EACH ROW EXECUTE FUNCTION auto_nullify_kills();

-- trigger: set_updated_at ON rule_sections
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.rule_sections FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- trigger: trg_rule_section_history ON rule_sections
CREATE TRIGGER trg_rule_section_history BEFORE UPDATE ON public.rule_sections FOR EACH ROW EXECUTE FUNCTION trg_rule_section_history();

-- trigger: trg_rule_section_history_insert ON rule_sections
CREATE TRIGGER trg_rule_section_history_insert AFTER INSERT ON public.rule_sections FOR EACH ROW EXECUTE FUNCTION trg_rule_section_history_insert();
