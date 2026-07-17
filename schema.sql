# Supremacy 1914 - Alliance Hub: Supabase Schema

## Project Info

| Property | Value |
|----------|-------|
| **Project Name** | Supremacy_proyect |
| **Project ID** | qkccyjegkgjzwoxytnqp |
| **Region** | us-west-2 |
| **Status** | ACTIVE_HEALTHY |
| **PostgreSQL** | 17.6.1.127 |
| **Organization** | yoanlopez500-wq's Org |
| **Created** | 2026-06-17 |
| **Host** | db.qkccyjegkgjzwoxytnqp.supabase.co |

---

## API Keys

| Type | Status |
|------|--------|
| Legacy anon | active |
| Publishable (default) | active |

---

## Custom Enums

**rule_visibility**: VALUES: public, player, official, leader, admin, superadmin
Used in rule_sections.visibility to control access levels to rule content.

---

## Table: alliances

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| name | text | NOT NULL | - |
| tag | text | UNIQUE, len 2-10 | - |
| description | text | nullable | - |
| leader_id | bigint | nullable FK->players.id | - |
| status | text | [active,inactive,penalized] | 'active' |
| created_at | timestamptz | - | now() |

**RLS**: Enabled. Referenced by: matches, admin_invites, leader_transfer_log, alliance_officers, alliance_memberships, players, alliance_duel_teams
**RLS Policies**: SELECT public; INSERT/UPDATE/DELETE requires authenticated active admin

---

## Table: players

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | bigint | PK | - |
| current_username | text | NOT NULL | - |
| status | text | [active,banned,suspended] | 'active' |
| total_kills | int4 | - | 0 |
| total_deaths | int4 | - | 0 |
| games_played | int4 | - | 0 |
| last_seen | timestamptz | nullable | - |
| created_at | timestamptz | - | now() |
| current_alliance_id | uuid | nullable FK->alliances.id | - |
| reputation_score | int4 | - | 100 |
| suspension_reason | text | nullable | - |
| banned_until | timestamptz | nullable | - |
| suspended_until | timestamptz | nullable | -

**RLS**: Enabled. Comment: Alliance Hub players v2
**RLS Policies**: SELECT public; INSERT public (open); UPDATE requires active admin

---

## Table: admin_users

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK, FK->auth.users.id | - |
| alliance_id | uuid | nullable FK->alliances.id | - |
| display_name | text | nullable | - |
| supremacy_player_id | bigint | nullable | - |
| approved_by | uuid | nullable | - |
| approved_at | timestamptz | nullable | - |
| status | text | [active,suspended] | 'active' |
| created_at | timestamptz | - | now() |
| role | text | - | 'moderator' |

**Roles**: superadmin, event_admin, moderator, alliance_leader, co_leader, officer
**RLS**: Enabled
**RLS Policies**: SELECT all; INSERT is_authenticated(); UPDATE is_admin(); DELETE is_superadmin()

---

## Table: admin_invites

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| code | text | UNIQUE | - |
| created_by | uuid | nullable FK->auth.users.id | - |
| used | bool | - | false |
| used_by | uuid | nullable | - |
| used_at | timestamptz | nullable | - |
| expires_at | timestamptz | - | now() + 7 days |
| created_at | timestamptz | - | now() |
| role | text | - | 'moderator' |
| player_id | int4 | nullable FK->players.id | - |
| alliance_id | uuid | nullable FK->alliances.id | - |

**RLS**: Enabled
**RLS Policies**: ALL requires is_authenticated_admin(); SELECT anon sees own unused non-expired; INSERT requires active admin

---

## Table: matches

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| name | text | NOT NULL | - |
| game_id | text | nullable | - |
| description | text | nullable | - |
| alliance_id | uuid | nullable FK->alliances.id | - |
| alliance_a_id | uuid | nullable | - |
| alliance_b_id | uuid | nullable | - |
| round | int4 | nullable | - |
| max_players | int4 | NOT NULL | 10 |
| winners_declared | bool | - | false |
| rules_url | text | nullable | - |
| password | text | nullable | - |
| show_game_id | bool | - | true |
| requires_approval | bool | - | false |
| is_private | bool | - | false |
| share_token | uuid | - | gen_random_uuid() |
| referee_id | bigint | nullable | - |
| auto_delete_at | timestamptz | nullable | - |
| created_by | uuid | nullable FK->auth.users.id | - |
| csv_imported | bool | - | false |
| notifications_sent | bool | - | false |
| created_at | timestamptz | - | now() |
| status | text | - | 'draft' |
| match_type | text | - | 'internal' |
| league_id | uuid | nullable | - |

**RLS**: Enabled
**RLS Policies**: SELECT public; INSERT public; UPDATE/DELETE requires superadmin/mod/event_admin OR alliance_leader OR creator

---

## Table: match_registrations

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| match_id | uuid | nullable FK->matches.id | - |
| player_id | bigint | nullable FK->players.id | - |
| nation | text | nullable | - |
| registered_at | timestamptz | - | now() |
| confirmed_at | timestamptz | nullable | - |
| confirmed_by | uuid | nullable | - |
| notes | text | nullable | - |
| status | text | - | 'pending' |

**RLS**: Enabled
**RLS Policies**: SELECT public; INSERT/UPDATE player requires is_valid_player(); ALL admin requires is_authenticated_admin()

---

## Table: match_results

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| match_id | uuid | nullable FK->matches.id | - |
| player_id | bigint | nullable FK->players.id | - |
| nation | text | nullable | - |
| kills | int4 | - | 0 |
| deaths | int4 | - | 0 |
| kd_ratio | numeric | - | 0 |
| raw_csv_data | text[] | nullable | - |
| imported_at | timestamptz | - | now() |

**RLS**: Enabled
**Triggers**: trigger_after_insert/update/delete_result + trigger_recalc_player (recalculate player stats)
**RLS Policies**: SELECT public; INSERT requires active admin; UPDATE/DELETE requires superadmin/mod/event_admin OR alliance_leader of match

---

## Table: match_winners

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| match_id | uuid | NOT NULL FK->matches.id | - |
| player_id | bigint | NOT NULL | - |
| position | int4 | CHECK [1,2,3] | - |
| declared_by | uuid | nullable FK->admin_users.id | - |
| declared_at | timestamptz | - | now() |

**RLS**: Enabled. Policy: SELECT public=true

---

## Table: match_nullified_kills

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| player_strike_id | uuid | NOT NULL FK->player_strikes.id | - |
| player_id | bigint | NOT NULL | - |
| match_id | uuid | NOT NULL | - |
| kills_nullified | int4 | - | 0 |
| created_at | timestamptz | - | now() |

**RLS**: Enabled. Policy: SELECT public=true


---

## Table: player_strikes

**Note:** This table must exist in the live Supabase project. The repo documents the schema; create it via the Supabase SQL editor if you get a 404.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| player_id | bigint | NOT NULL FK->players.id | - |
| strike_type_id | uuid | NOT NULL FK->strike_types.id | - |
| match_id | uuid | nullable FK->matches.id | - |
| reason | text | NOT NULL | - |
| applied_by | uuid | nullable FK->admin_users.id | - |
| applied_at | timestamptz | - | now() |
| removed_by | uuid | nullable | - |
| removed_at | timestamptz | nullable | - |
| removal_reason | text | nullable | - |
| is_active | bool | - | true |
| notes | text | nullable | - |
| rule_section_id | uuid | nullable FK->rule_sections.id | - |
| report_id | uuid | nullable FK->player_reports.id | - |
| rule_precedent_id | uuid | nullable FK->rule_precedents.id | - |
| status | text | [pending_precedent,active,rejected,removed] | 'active' |
| evidence_urls | text[] | nullable | '{}' |
| expires_at | timestamptz | nullable | -

**RLS**: Enabled
**Triggers**:
- trg_apply_sanction (AFTER INSERT): applies automatic sanction
- trg_auto_nullify_kills (AFTER INSERT): nullifies kills if strike_type.nullifies_kills=true

**RLS Policies**: SELECT public; INSERT/UPDATE requires superadmin/mod/event_admin; DELETE requires is_superadmin()

---

## Table: strike_types

**Note:** This table must exist in the live Supabase project. The repo documents the schema; create it via the Supabase SQL editor if queries fail.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| code | text | UNIQUE | - |
| name | text | NOT NULL | - |
| description | text | NOT NULL | - |
| severity | int4 | CHECK 1-3 | 1 |
| legend | text | nullable | - |
| is_active | bool | - | true |
| created_at | timestamptz | - | now() |
| created_by | uuid | nullable | - |
| nullifies_kills | bool | - | false |
| formula_id | uuid | nullable | - |
| is_preset | bool | - | false |
| is_ban | bool | - | false |
| ban_duration_hours | int4 | nullable | - |
| rule_section_id | uuid | nullable FK->rule_sections.id | -

**Notes:**
- `legend` may contain a JSON formula config: `{"penalty_pct":30,"nullifies_kills":false,"is_ban":true,"ban_duration_hours":168}`.
- `ban_duration_hours` is null for permanent bans.

**Severity**: 1=Leve, 2=Medio, 3=Grave
**RLS**: Enabled

**Preset Types**:
| Code | Name | Severity | nullifies_kills |
|------|------|----------|----------------|
| strike_1 | Strike Leve - Advertencia | 1 | false |
| strike_2 | Strike Medio - Sancion Temporal | 2 | false |
| strike_3 | Strike Grave - Expulsion | 3 | false |
| kill_nullifier | Kill Nullifier | 3 | true |

**RLS Policies**: SELECT public (is_active filter)

---

## Table: player_reports

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| match_id | uuid | nullable FK->matches.id | - |
| player_id | bigint | nullable FK->players.id | - |
| player_name | text | nullable | - |
| reported_player_id | int4 | nullable FK->players.id | - |
| reported_player_name | text | nullable | - |
| report_type | text | NOT NULL | - |
| description | text | nullable | - |
| evidence_urls | text[] | nullable | '{}' |
| status | text | [pending,investigating,resolved,dismissed] | 'pending' |
| admin_response | text | nullable | - |
| strike_applied | bool | - | false |
| strike_id | uuid | nullable FK->player_strikes.id | - |
| created_at | timestamptz | - | now() |
| resolved_at | timestamptz | nullable | - |
| resolved_by | uuid | nullable FK->admin_users.id | - |
| rule_section_id | uuid | nullable FK->rule_sections.id | - |

**RLS**: Enabled
**RLS Policies**: INSERT public; SELECT public; UPDATE requires active admin

---

## Table: player_sanctions

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| player_id | bigint | NOT NULL FK->players.id | - |
| strike_id | uuid | nullable FK->player_strikes.id | - |
| strike_type_id | uuid | nullable FK->strike_types.id | - |
| formula_id | uuid | nullable | - |
| kills_before | int4 | - | 0 |
| points_before | int4 | - | 0 |
| status_before | text | nullable | - |
| kills_after | int4 | - | 0 |
| points_after | int4 | - | 0 |
| status_after | text | nullable | - |
| penalty_pct | numeric | - | 0 |
| reputation_delta | int4 | - | 0 |
| formula_used | text | nullable | - |
| created_at | timestamptz | - | now() |

**RLS**: Enabled
**RLS Policies**: SELECT public; ALL write authenticated=true

---

## Table: rule_sections

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| parent_id | uuid | nullable FK->rule_sections.id (self) | - |
| section_number | text | nullable | - |
| title | text | NOT NULL | - |
| content | text | NOT NULL | '' |
| order_index | int4 | NOT NULL | 0 |
| is_active | bool | - | true |
| created_by | uuid | nullable | - |
| created_at | timestamptz | - | now() |
| updated_at | timestamptz | - | now() |
| visibility | rule_visibility | - | 'public' |
| training_for | text | [leader,officer,admin,moderator,NULL] | - |

**RLS**: Enabled. Notes: Hierarchical rule structure (parent-child). 7 main sections with sub-sections.

**Triggers**:
- set_updated_at (BEFORE UPDATE): updates updated_at
- trg_rule_section_history (BEFORE UPDATE): saves change history
- trg_rule_section_history_insert (AFTER INSERT): saves initial version

**RLS Policies**: SELECT public (is_active=true); ALL write authenticated=true

---

## Table: rule_precedents

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| rule_section_id | uuid | NOT NULL FK->rule_sections.id | - |
| title | text | NOT NULL | - |
| description | text | NOT NULL | - |
| resolution | text | NOT NULL | - |
| severity | text | - | 'minor' |
| strike_type | text | nullable | - |
| report_id | uuid | nullable | - |
| created_by | uuid | nullable | - |
| created_at | timestamptz | - | now() |
| player_id | bigint | nullable FK->players.id | - |
| match_id | uuid | nullable FK->matches.id | - |
| strike_id | uuid | nullable FK->player_strikes.id | - |

**RLS**: Enabled
**RLS Policies**: SELECT public; INSERT requires superadmin/event_admin/moderator active; UPDATE/DELETE requires is_superadmin()

---

## Table: rule_section_history

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| section_id | uuid | NOT NULL FK->rule_sections.id | - |
| title | text | NOT NULL | - |
| content | text | NOT NULL | - |
| changed_by | uuid | nullable | - |
| changed_at | timestamptz | - | now() |

**RLS**: Enabled
**RLS Policies**: SELECT public; ALL write authenticated=true

---

## Table: alliance_leader_requests

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| player_id | bigint | NOT NULL FK->players.id | - |
| display_name | text | NOT NULL | - |
| supremacy_player_id | bigint | NOT NULL | - |
| alliance_name | text | NOT NULL | - |
| alliance_tag | text | NOT NULL | - |
| evidence_url | text | nullable | - |
| status | text | [pending,under_review,approved,rejected,needs_info] | 'pending' |
| reviewed_by | uuid | nullable FK->admin_users.id | - |
| reviewed_at | timestamptz | nullable | - |
| rejection_reason | text | nullable | - |
| invite_code_used | uuid | nullable FK->admin_invites.id | - |
| created_at | timestamptz | - | now() |
| updated_at | timestamptz | - | now() |
| alliance_description | text | nullable | - |
| discord_handle | text | nullable | - |
| member_count | int4 | nullable | - |

**RLS**: Enabled
**Triggers**: trg_create_alliance_on_approval (AFTER UPDATE): creates alliance automatically when status='approved'

**RLS Policies**: SELECT public; INSERT public; UPDATE/DELETE requires active admin

---

## Table: alliance_memberships

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| player_id | bigint | NOT NULL FK->players.id | - |
| alliance_id | uuid | NOT NULL FK->alliances.id | - |
| status | text | [pending,approved,rejected] | 'pending' |
| requested_by | text | [player,leader] | 'player' |
| requested_at | timestamptz | - | now() |
| approved_at | timestamptz | nullable | - |
| rejected_at | timestamptz | nullable | - |
| role | text | [member,officer,co_leader,leader] | 'member' |

**RLS**: Enabled
**RLS Policies**: ALL public=true (fully open - no auth required)

---

## Table: alliance_officers

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| alliance_id | uuid | NOT NULL FK->alliances.id | - |
| player_id | bigint | NOT NULL FK->players.id | - |
| role | text | [officer,co_leader] | 'officer' |
| title | text | nullable | - |
| permissions | jsonb | - | {edit_rules:false, manage_duels:false, view_reports:true, view_strikes:true, create_matches:true, manage_members:true, manage_officers:false, send_notifications:false} |
| appointed_by | uuid | nullable FK->admin_users.id | - |
| appointed_at | timestamptz | - | now() |
| is_active | bool | - | true |
| deactivated_at | timestamptz | nullable | - |
| deactivated_reason | text | nullable | - |

**RLS**: **DISABLED** - CRITICAL SECURITY ISSUE
**Triggers**: trg_log_officer_change (AFTER INSERT): logs officer changes

---

## Table: leader_transfer_log

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| alliance_id | uuid | NOT NULL FK->alliances.id | - |
| from_player_id | bigint | nullable FK->players.id | - |
| to_player_id | bigint | NOT NULL FK->players.id | - |
| transferred_by | uuid | nullable FK->admin_users.id | - |
| transferred_at | timestamptz | - | now() |
| reason | text | nullable | - |
| status | text | [pending,completed,cancelled,rejected] | 'completed' |

**RLS**: **DISABLED** - CRITICAL SECURITY ISSUE

---

## Table: training_progress

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| admin_id | uuid | nullable FK->admin_users.id | - |
| player_id | bigint | nullable FK->players.id | - |
| section_id | uuid | NOT NULL FK->rule_sections.id | - |
| completed_at | timestamptz | - | now() |
| acknowledged | bool | - | false |
| acknowledged_at | timestamptz | nullable | - |

**RLS**: **DISABLED** - CRITICAL SECURITY ISSUE

---

## Table: player_tokens

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| player_id | bigint | NOT NULL FK->players.id | - |
| token | text | UNIQUE | - |
| created_at | timestamptz | - | now() |
| last_used | timestamptz | - | now() |
| transfer_code | text | nullable | - |
| transfer_expires_at | timestamptz | nullable | - |

**RLS**: Enabled. Comment: Unique tokens per player to prevent identity impersonation
**RLS Policies**: ALL public=true (fully open)

---

## Table: alliance_duel_teams

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| alliance_id | uuid | NOT NULL FK->alliances.id | - |
| match_id | uuid | nullable FK->matches.id | - |
| player_ids | int4[] | - | '{}' |
| status | text | [forming,ready,matched,active,completed] | 'forming' |
| created_at | timestamptz | - | now() |
| updated_at | timestamptz | - | now() |

**RLS**: Enabled. Comment: 5-player teams selected by alliance leaders for duels
**RLS Policies**: SELECT authenticated=true; ALL write authenticated=true

---

## Table: chat_messages

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | bigint | PK | - |
| channel | text | NOT NULL | - |
| sender_admin_id | uuid | nullable FK->admin_users.id | - |
| sender_name | text | NOT NULL | - |
| sender_role | text | nullable | - |
| message | text | NOT NULL | - |
| message_type | text | nullable | 'text' |
| created_at | timestamptz | - | now() |

**RLS**: Enabled
**Triggers**: trim_chat_trigger (AFTER INSERT): limits chat to 30 messages per channel
**RLS Policies**: ALL public=true (fully open chat)

---

## Table: chat_reports

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| channel | text | NOT NULL | - |
| reported_message_id | text | nullable | - |
| reporter_id | text | NOT NULL | - |
| reporter_name | text | NOT NULL | - |
| reason | text | NOT NULL | - |
| context_messages | jsonb | nullable | - |
| status | text | [pending,reviewed,dismissed] | 'pending' |
| reviewed_by | uuid | nullable | - |
| reviewed_at | timestamptz | nullable | - |
| resolution | text | nullable | - |
| reported_at | timestamptz | - | now() |

**RLS**: Enabled
**RLS Policies**: SELECT public; ALL admin requires is_authenticated_admin()

---

## Table: direct_messages

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | gen_random_uuid() |
| sender_admin_id | uuid | nullable FK->admin_users.id | - |
| sender_name | text | NOT NULL | - |
| recipient_admin_id | uuid | nullable FK->admin_users.id | - |
| recipient_player_id | bigint | nullable | - |
| subject | text | nullable | - |
| message | text | NOT NULL | - |
| read_at | timestamptz | nullable | - |
| created_at | timestamptz | - | now() |

**RLS**: Enabled
**RLS Policies**: SELECT public; INSERT public; ALL admin requires is_authenticated_admin()

---

## Table: push_subscriptions

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| id | uuid | PK | uuid_generate_v4() |
| endpoint | text | NOT NULL | - |
| p256dh | text | NOT NULL | - |
| auth | text | NOT NULL | - |
| player_id | bigint | nullable | - |
| alliance_id | uuid | nullable | - |
| created_at | timestamptz | - | now() |

**RLS**: Enabled
**RLS Policies**: ALL requires is_authenticated_admin()

---

## Table: app_settings

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| key | text | PK | - |
| value | text | nullable | - |
| updated_at | timestamptz | - | now() |

**RLS**: Enabled
**Current Settings**:
| Key | Value |
|-----|-------|
| setup_complete | false |
| rules_url | (Google Docs URL) |
| cache_version | v2.1782787413803 |
| force_clear_cache | false |

**RLS Policies**: SELECT public; INSERT/UPDATE requires active admin


---

## Triggers (Automation)

| Trigger | Table | Timing | Event | Function | Description |
|---------|-------|--------|-------|----------|-------------|
| trg_create_alliance_on_approval | alliance_leader_requests | AFTER | UPDATE | create_alliance_on_leader_approval | Creates alliance when request approved |
| trg_log_officer_change | alliance_officers | AFTER | INSERT | log_officer_change | Logs officer changes |
| trim_chat_trigger | chat_messages | AFTER | INSERT | trim_chat_messages | Limits chat to 30 messages per channel |
| trg_apply_sanction | player_strikes | AFTER | INSERT | trg_apply_sanction | Applies automatic sanction on strike |
| trg_auto_nullify_kills | player_strikes | AFTER | INSERT | auto_nullify_kills | Nullifies kills if strike_type.nullifies_kills=true |
| set_updated_at | rule_sections | BEFORE | UPDATE | trigger_set_updated_at | Updates updated_at timestamp |
| trg_rule_section_history | rule_sections | BEFORE | UPDATE | trg_rule_section_history | Saves rule change history |
| trg_rule_section_history_insert | rule_sections | AFTER | INSERT | trg_rule_section_history_insert | Saves initial rule version |
| trigger_after_insert_result | match_results | AFTER | INSERT | trigger_after_insert_result | Recalculates player stats |
| trigger_after_update_result | match_results | AFTER | UPDATE | trigger_after_update_result | Recalculates player stats |
| trigger_after_delete_result | match_results | AFTER | DELETE | trigger_after_delete_result | Recalculates player stats |
| trigger_recalc_player | match_results | AFTER | INSERT/UPDATE | trigger_recalc_player | Recalculates player stats |

---

## Custom Functions (Schema: public)

| Function | Args | Return | Security Definer | Description |
|----------|------|--------|------------------|-------------|
| auto_nullify_kills | - | trigger | No | Nullifies kills on nullify strike |
| claim_transfer_code | p_transfer_code text | TABLE(player_id bigint, token text) | Yes | Claims a transfer code |
| complete_setup | - | void | Yes | Completes initial app setup |
| create_alliance_on_leader_approval | - | trigger | No | Creates alliance on approval |
| create_invite_code | - | text | Yes | Generates invite code |
| delete_game_complete | game_uuid uuid | void | No | Fully deletes a game |
| force_schema_cache_refresh | - | void | No | Forces schema cache refresh |
| generate_transfer_code | p_player_id bigint | text | Yes | Generates transfer code for player |
| invalidate_player_stats | game_uuid uuid, p_id bigint | void | No | Invalidates player stats |
| is_admin | - | boolean | Yes | Checks if user is admin |
| is_authenticated | - | boolean | Yes | Checks if user is authenticated |
| is_authenticated_admin | - | boolean | Yes | Checks if user is authenticated admin |
| is_setup_complete | - | boolean | Yes | Checks if setup is complete |
| is_superadmin | - | boolean | Yes | Checks if user is superadmin |
| is_valid_player | p_player_id bigint | boolean | Yes | Validates player_id |
| log_officer_change | - | trigger | No | Logs officer changes |
| recalc_all_players | - | void | No | Recalculates all player stats |
| recalc_player_from_scratch | player_id bigint | void | No | Recalculates player from scratch |
| recalc_player_stats | player_id bigint | void | No | Recalculates player stats |
| trg_apply_sanction | - | trigger | No | Applies automatic sanction |
| trg_rule_section_history | - | trigger | No | Saves rule section history |
| trg_rule_section_history_insert | - | trigger | No | Saves initial rule version |
| trigger_after_delete_result | - | trigger | No | Post-delete result handler |
| trigger_after_insert_result | - | trigger | No | Post-insert result handler |
| trigger_after_update_result | - | trigger | No | Post-update result handler |
| trigger_recalc_player | - | trigger | No | Recalculates player |
| trigger_set_updated_at | - | trigger | No | Updates updated_at field |
| trim_chat_messages | - | trigger | No | Trims chat messages to limit |
| verify_player_token | p_player_id bigint, p_token text | boolean | Yes | Verifies player token |

---

## Edge Functions

### push-notify
- **Method**: POST
- **Auth**: verify_jwt = false (anon access)
- **Body**: { match_id?, alliance_id?, title?, body? }
- **Functionality**:
  1. Queries push_subscriptions table filtering by alliance_id
  2. Generates VAPID JWT for push service authentication
  3. Sends web push notification to each subscriber
  4. Removes invalid endpoints (404/410)
  5. Marks notifications as processed in push_notification_queue

---

## Installed Extensions

| Extension | Schema | Version | Purpose |
|-----------|--------|---------|---------|
| pgcrypto | extensions | 1.3 | Crypto functions & UUIDs |
| pg_stat_statements | extensions | 1.11 | Query tracking |
| uuid-ossp | extensions | 1.1 | UUID generation |
| supabase_vault | vault | 0.3.1 | Secure secret storage |
| pg_net | public | 0.20.3 | Async HTTP from Postgres |

---

## Migrations (49 total)

| Version | Name | Description |
|---------|------|-------------|
| 20260625031521 | fix_trigger_and_add_queue | Fix triggers & notification queue |
| 20260625031616 | fix_search_path_functions | Fix function search paths |
| 20260625033255 | migrate_mvp_to_v2 | MVP to v2 migration |
| 20260625033723 | fix_players_add_alliance_fk | Fix alliance FK on players |
| 20260625033921 | fix_trigger_notify_after | Fix notification trigger |
| 20260625132540 | strike_types_and_global_rules | Strike types & global rules |
| 20260625181157 | create_direct_messages_table | Direct messages table |
| 20260625200907 | create_chat_messages_table | Chat messages table |
| 20260625203304 | chat_messages_lite_30_limit | 30 message chat limit |
| 20260626191000 | add_suspension_reason_to_players | Suspension reason field |
| 20260626235103 | fix_matches_rls_update_delete | Fix matches RLS |
| 20260627000815 | create_alliance_duel_teams | Duel teams |
| 20260628023601 | create_certification_requests_table | Certification requests |
| 20260628030821 | create_player_tokens_table | Player tokens |
| 20260628040046 | fix_rankings_public_schema | Fix rankings |
| 20260628041444 | add_kill_nullifier_strike | Kill nullifier strike |
| 20260628042855 | create_match_nullified_kills | Nullified kills |
| 20260628042907 | create_nullifier_trigger_and_view | Nullifier trigger & view |
| 20260628044408 | fix_player_tokens_delete_policy | Fix token delete policy |
| 20260628050038 | fix_players_alliance_fk_and_security | Fix FK & security |
| 20260628212934 | create_alliance_memberships | Alliance memberships |
| 20260629044340 | rule_sections_system_v2 | Rule sections v2 |
| 20260629051256 | sanctions_engine | Sanctions engine |
| 20260629051321 | seed_sanction_formulas | Seed sanction formulas |
| 20260629051526 | sanctions_trigger | Sanctions trigger |
| 20260629150058 | v5_alliance_officer_system | Officer system v5 |
| 20260703014354 | drop_orphan_tables | Drop orphan tables |
| 20260703014403 | drop_v2_schema | Drop v2 schema |
| 20260703014427 | add_rule_precedent_columns | Precedent columns |
| 20260703025537 | add_role_to_admin_users | Role in admin_users |
| 20260703025611 | fix_rls_security_policies_v2 | Fix RLS policies v2 |
| 20260703025720 | add_strike_status_and_pending_flow | Strike status & flow |
| 20260703030518 | add_data_integrity_constraints | Data integrity constraints |
| 20260704142813 | add_leader_request_missing_columns | Leader request columns |
| 20260705230111 | add_role_to_admin_invites | Role in invites |
| 20260705235402 | fix_admin_invites_anon_select | Fix anon select on invites |
| 20260707161024 | fix_admin_users_rls_security | Fix admin RLS security |
| 20260709181717 | add_username_to_match_registrations | Username in registrations |
| 20260709184910 | revert_username_column_match_registrations | Revert username column |
| 20260709225658 | fix_match_registrations_rls_for_players | Fix registrations RLS |
| 20260709225726 | fix_chat_and_reports_rls_for_players | Fix chat & reports RLS |
| 20260709233900 | add_evidence_urls_to_reports_and_strikes_v2 | Evidence URLs |
| 20260709235833 | evidence_bucket_rls_policies | Evidence bucket RLS |
| 20260710020252 | match_registrations_admin_update | Admin update registrations |
| 20260710033911 | alliance_leader_requests_rls | Leader requests RLS |
| 20260710035054 | alliances_rls_admin_insert_update | Alliance admin RLS |
| 20260710035733 | alliance_memberships_role_add_leader | Leader role in memberships |
| 20260710043204 | alliances_delete_admin_rls | Alliance delete RLS |
| 20260710044447 | admin_invites_add_player_alliance_ids | Player/alliance IDs in invites |

---

## Security Advisory - CRITICAL

### Tables with RLS DISABLED (Fully Exposed)

These tables have RLS disabled and are publicly accessible with the anon key:

| Table | Risk |
|-------|------|
| alliance_officers | Anyone can read/write officers of any alliance |
| leader_transfer_log | Anyone can read/write transfer logs |
| training_progress | Anyone can read/write training progress |

### Fix SQL (run supervised):
```sql
ALTER TABLE public.alliance_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_transfer_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
```
Note: Enabling RLS without policies blocks ALL access. Create policies before or immediately after.

---

## Table Summary

| # | Table | RLS | Purpose |
|---|-------|-----|---------|
| 1 | alliances | Yes | Game alliances |
| 2 | players | Yes | Registered players |
| 3 | admin_users | Yes | Administrative users |
| 4 | admin_invites | Yes | Invitation codes |
| 5 | matches | Yes | Games/matches |
| 6 | match_registrations | Yes | Match registrations |
| 7 | match_results | Yes | Match results |
| 8 | match_winners | Yes | Declared winners |
| 9 | match_nullified_kills | Yes | Nullified kills |
| 10 | player_strikes | Yes | Player strikes/sanctions |
| 11 | strike_types | Yes | Predefined strike types |
| 12 | player_reports | Yes | Player reports |
| 13 | player_sanctions | Yes | Applied sanctions |
| 14 | rule_sections | Yes | Hierarchical rules |
| 15 | rule_precedents | Yes | Rule precedents |
| 16 | rule_section_history | Yes | Rule change history |
| 17 | alliance_leader_requests | Yes | Leadership requests |
| 18 | alliance_memberships | Yes | Alliance memberships |
| 19 | alliance_officers | **NO** | Alliance officers |
| 20 | leader_transfer_log | **NO** | Transfer log |
| 21 | training_progress | **NO** | Training progress |
| 22 | player_tokens | Yes | Auth tokens |
| 23 | alliance_duel_teams | Yes | Duel teams |
| 24 | chat_messages | Yes | Chat messages |
| 25 | chat_reports | Yes | Chat reports |
| 26 | direct_messages | Yes | Direct messages |
| 27 | push_subscriptions | Yes | Push subscriptions |
| 28 | app_settings | Yes | App configuration |

**Total: 28 tables** (25 with RLS, 3 without)
