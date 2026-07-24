// assets/js/db-schema.js v22
// Centralized Database Schema - Single source of truth for all DB mappings
// Use DB.from('tableKey'), DB.col('tableKey', 'colKey'), DB.select('tableKey', 'setName')
// v22: supabase → window.supabase (strict mode compat)
// ============================================================

(function() {
    'use strict';

    // ===================== SCHEMA DEFINITION =====================
    var SCHEMA = {
        // ---- RULES & PRECEDENTS ----
        ruleSections: {
            name: 'rule_sections',
            cols: {
                id: 'id',
                title: 'title',
                content: 'content',
                visibility: 'visibility',
                orderIndex: 'order_index',
                sectionNumber: 'section_number',
                parentId: 'parent_id',
                isActive: 'is_active',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, title, content, visibility, order_index, section_number, parent_id, is_active',
                all: '*'
            }
        },
        rulePrecedents: {
            name: 'rule_precedents',
            cols: {
                id: 'id',
                title: 'title',
                description: 'description',
                ruleSectionId: 'rule_section_id',
                playerId: 'player_id',
                matchId: 'match_id',
                strikeId: 'strike_id',
                createdBy: 'created_by',
                severity: 'severity',
                strikeType: 'strike_type',
                resolution: 'resolution',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, title, description, rule_section_id, player_id, match_id, strike_id, created_by, severity, strike_type, resolution, created_at',
                withRelations: 'id, title, description, rule_section_id, player_id, match_id, strike_id, created_by, severity, strike_type, resolution, created_at, players:player_id(current_username), matches:match_id(name)',
                withFullRelations: 'id, title, description, rule_section_id, player_id, match_id, strike_id, created_by, severity, strike_type, resolution, created_at, players:player_id(current_username), matches:match_id(name, match_type), player_strikes:strike_id(reason, created_at)',
                all: '*'
            }
        },
        playerStrikes: {
            name: 'player_strikes',
            cols: {
                id: 'id',
                playerId: 'player_id',
                strikeTypeId: 'strike_type_id',
                matchId: 'match_id',
                ruleSectionId: 'rule_section_id',
                rulePrecedentId: 'rule_precedent_id',
                reportId: 'report_id',
                reason: 'reason',
                appliedBy: 'applied_by',
                appliedAt: 'applied_at',
                removedBy: 'removed_by',
                removedAt: 'removed_at',
                removalReason: 'removal_reason',
                status: 'status',
                isActive: 'is_active',
                notes: 'notes',
                evidenceUrls: 'evidence_urls',
                expiresAt: 'expires_at'
            },
            selectSets: {
                basic: 'id, player_id, strike_type_id, match_id, rule_section_id, rule_precedent_id, report_id, reason, applied_by, applied_at, status, is_active, expires_at',
                withRelations: 'id, player_id, strike_type_id, match_id, rule_section_id, rule_precedent_id, report_id, reason, applied_by, applied_at, removed_by, removed_at, removal_reason, status, is_active, notes, evidence_urls, expires_at, players:player_id(current_username), strike_types:strike_type_id(name), rule_sections:rule_section_id(title), rule_precedents:rule_precedent_id(title)',
                pending: 'id, player_id, strike_type_id, match_id, rule_section_id, rule_precedent_id, report_id, reason, applied_by, applied_at, status, expires_at, players:player_id(current_username), strike_types:strike_type_id(name)',
                withType: 'id, player_id, strike_type_id, status, is_active, expires_at, strike_types:strike_type_id(id, name, legend, severity, nullifies_kills, is_ban, ban_duration_hours)',
                all: '*'
            }
        },
        strikeTypes: {
            name: 'strike_types',
            cols: {
                id: 'id',
                code: 'code',
                name: 'name',
                description: 'description',
                severity: 'severity',
                legend: 'legend',
                nullifiesKills: 'nullifies_kills',
                isActive: 'is_active',
                createdAt: 'created_at',
                createdBy: 'created_by',
                isBan: 'is_ban',
                banDurationHours: 'ban_duration_hours',
                ruleSectionId: 'rule_section_id'
            },
            selectSets: {
                basic: 'id, code, name, description, severity, legend, nullifies_kills, is_active, is_ban, ban_duration_hours, rule_section_id',
                all: '*'
            }
        },
        playerReports: {
            name: 'player_reports',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                playerName: 'player_name',
                reportedPlayerId: 'reported_player_id',
                reportedPlayerName: 'reported_player_name',
                reportType: 'report_type',
                description: 'description',
                evidenceUrls: 'evidence_urls',
                status: 'status',
                adminResponse: 'admin_response',
                strikeApplied: 'strike_applied',
                strikeId: 'strike_id',
                ruleSectionId: 'rule_section_id',
                createdAt: 'created_at',
                resolvedAt: 'resolved_at',
                resolvedBy: 'resolved_by'
            },
            selectSets: {
                basic: 'id, match_id, player_id, reported_player_id, report_type, status, rule_section_id, created_at',
                withRelations: 'id, match_id, player_id, player_name, reported_player_id, reported_player_name, report_type, description, evidence_urls, status, admin_response, strike_applied, strike_id, rule_section_id, created_at, resolved_at, resolved_by, players:player_id(current_username), matches:match_id(name)',
                all: '*'
            }
        },
        players: {
            name: 'players',
            cols: {
                id: 'id',
                currentUsername: 'current_username',
                currentAllianceId: 'current_alliance_id',
                status: 'status',
                totalKills: 'total_kills',
                totalDeaths: 'total_deaths',
                gamesPlayed: 'games_played',
                lastSeen: 'last_seen',
                createdAt: 'created_at',
                reputationScore: 'reputation_score',
                suspensionReason: 'suspension_reason',
                bannedUntil: 'banned_until',
                suspendedUntil: 'suspended_until'
            },
            selectSets: {
                basic: 'id, current_username, current_alliance_id, status',
                profile: 'id, current_username, current_alliance_id, status, total_kills, total_deaths, games_played, last_seen, reputation_score, suspension_reason, banned_until, suspended_until',
                all: '*'
            }
        },
        alliances: {
            name: 'alliances',
            cols: {
                id: 'id',
                name: 'name',
                tag: 'tag',
                description: 'description',
                leaderId: 'leader_id',
                status: 'status',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, name, tag, description, leader_id, status',
                all: '*'
            }
        },
        allianceMemberships: {
            name: 'alliance_memberships',
            cols: {
                id: 'id',
                playerId: 'player_id',
                allianceId: 'alliance_id',
                status: 'status',
                role: 'role',
                requestedBy: 'requested_by',
                requestedAt: 'requested_at',
                approvedAt: 'approved_at',
                rejectedAt: 'rejected_at'
            },
            selectSets: {
                basic: 'id, player_id, alliance_id, status',
                withPlayer: 'id, player_id, alliance_id, status, role, players:player_id(current_username, total_kills, total_deaths)',
                all: '*'
            }
        },
        adminUsers: {
            name: 'admin_users',
            cols: {
                id: 'id',
                role: 'role',
                allianceId: 'alliance_id',
                displayName: 'display_name',
                supremacyPlayerId: 'supremacy_player_id',
                approvedBy: 'approved_by',
                approvedAt: 'approved_at',
                status: 'status',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, role, alliance_id, display_name, supremacy_player_id, status',
                withAlliance: 'id, role, alliance_id, display_name, supremacy_player_id, status, alliances:alliance_id(name)',
                all: '*'
            }
        },
        matches: {
            name: 'matches',
            cols: {
                id: 'id',
                matchType: 'match_type',
                name: 'name',
                gameId: 'game_id',
                description: 'description',
                allianceId: 'alliance_id',
                allianceAId: 'alliance_a_id',
                allianceBId: 'alliance_b_id',
                leagueId: 'league_id',
                round: 'round',
                maxPlayers: 'max_players',
                status: 'status',
                winnersDeclared: 'winners_declared',
                rulesUrl: 'rules_url',
                password: 'password',
                showGameId: 'show_game_id',
                requiresApproval: 'requires_approval',
                isPrivate: 'is_private',
                shareToken: 'share_token',
                refereeId: 'referee_id',
                autoDeleteAt: 'auto_delete_at',
                createdBy: 'created_by',
                csvImported: 'csv_imported',
                notificationsSent: 'notifications_sent',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, name, match_type, game_id, status, alliance_id, created_at',
                list: 'id, name, match_type, game_id, status, alliance_id, alliance_a_id, alliance_b_id, league_id, max_players, created_at',
                all: '*'
            }
        },
        matchWinners: {
            name: 'match_winners',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                position: 'position',
                declaredBy: 'declared_by',
                declaredAt: 'declared_at'
            },
            selectSets: {
                basic: 'id, match_id, player_id, position',
                withPlayer: 'id, match_id, player_id, position, players:player_id(current_username)',
                all: '*'
            }
        },
        matchResults: {
            name: 'match_results',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                nation: 'nation',
                kills: 'kills',
                deaths: 'deaths',
                kdRatio: 'kd_ratio',
                rawCsvData: 'raw_csv_data',
                importedAt: 'imported_at'
            },
            selectSets: {
                basic: 'id, match_id, player_id, kills, deaths, kd_ratio',
                withPlayer: 'id, match_id, player_id, nation, kills, deaths, kd_ratio, players:player_id(current_username)',
                all: '*'
            }
        },
        matchRegistrations: {
            name: 'match_registrations',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                nation: 'nation',
                status: 'status',
                registeredAt: 'registered_at',
                confirmedAt: 'confirmed_at',
                confirmedBy: 'confirmed_by',
                notes: 'notes'
            },
            selectSets: {
                basic: 'id, match_id, player_id, status',
                withPlayer: 'id, match_id, player_id, nation, status, players:player_id(current_username)',
                all: '*'
            }
        },
        leagues: {
            name: 'leagues',
            cols: {
                id: 'id',
                name: 'name',
                season: 'season',
                startDate: 'start_date',
                endDate: 'end_date',
                status: 'status',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, name, season, status',
                all: '*'
            }
        },
        leagueSchedule: {
            name: 'league_schedule',
            cols: {
                id: 'id',
                leagueId: 'league_id',
                matchId: 'match_id',
                round: 'round',
                scheduledAt: 'scheduled_at',
                allianceAId: 'alliance_a_id',
                allianceBId: 'alliance_b_id',
                status: 'status',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, league_id, match_id, round, status',
                all: '*'
            }
        },
        allianceChat: {
            name: 'alliance_chat',
            cols: {
                id: 'id',
                matchId: 'match_id',
                allianceId: 'alliance_id',
                senderId: 'sender_id',
                message: 'message',
                sentAt: 'sent_at'
            },
            selectSets: {
                basic: 'id, match_id, alliance_id, sender_id, message, sent_at',
                withPlayer: 'id, match_id, alliance_id, sender_id, message, sent_at, players:sender_id(current_username)',
                all: '*'
            }
        },
        // Canales del chat consolidado (ver assets/js/chat-channels.js)
        chatChannels: {
            name: 'chat_channels',
            cols: {
                id: 'id',
                name: 'name',
                type: 'type',
                allowedRoles: 'allowed_roles',
                minLevel: 'min_level',
                allianceId: 'alliance_id',
                isActive: 'is_active'
            },
            selectSets: {
                basic: 'id, name, type, allowed_roles, min_level, alliance_id, is_active',
                all: '*'
            }
        },
        chatReports: {
            name: 'chat_reports',
            cols: {
                id: 'id',
                channel: 'channel',
                reportedMessageId: 'reported_message_id',
                reporterId: 'reporter_id',
                reporterName: 'reporter_name',
                reason: 'reason',
                contextMessages: 'context_messages',
                status: 'status',
                reviewedBy: 'reviewed_by',
                reviewedAt: 'reviewed_at',
                resolution: 'resolution',
                reportedAt: 'reported_at'
            },
            selectSets: {
                basic: 'id, channel, reporter_id, reporter_name, reason, status, reported_at',
                all: '*'
            }
        },
        auditLog: {
            name: 'audit_log',
            cols: {
                id: 'id',
                action: 'action',
                entityType: 'entity_type',
                entityId: 'entity_id',
                adminId: 'admin_id',
                details: 'details',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, action, entity_type, entity_id, admin_id, created_at',
                all: '*'
            }
        },
        appSettings: {
            name: 'app_settings',
            cols: {
                id: 'id',
                key: 'key',
                value: 'value',
                updatedAt: 'updated_at'
            },
            selectSets: {
                basic: 'id, key, value',
                all: '*'
            }
        },
        matchNullifiedKills: {
            name: 'match_nullified_kills',
            cols: {
                id: 'id',
                playerStrikeId: 'player_strike_id',
                playerId: 'player_id',
                matchId: 'match_id',
                killsNullified: 'kills_nullified',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, player_id, match_id, kills_nullified, created_at',
                all: '*'
            }
        },
        playerSanctions: {
            name: 'player_sanctions',
            cols: {
                id: 'id',
                playerId: 'player_id',
                strikeId: 'strike_id',
                strikeTypeId: 'strike_type_id',
                formulaId: 'formula_id',
                killsBefore: 'kills_before',
                killsAfter: 'kills_after',
                pointsBefore: 'points_before',
                pointsAfter: 'points_after',
                statusBefore: 'status_before',
                statusAfter: 'status_after',
                penaltyPct: 'penalty_pct',
                reputationDelta: 'reputation_delta',
                formulaUsed: 'formula_used',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, player_id, strike_id, strike_type_id, kills_after, penalty_pct, created_at',
                withStrike: 'id, player_id, strike_id, strike_type_id, kills_before, kills_after, penalty_pct, status_before, status_after, formula_used, created_at',
                all: '*'
            }
        },
        adminInvites: {
            name: 'admin_invites',
            cols: {
                id: 'id',
                code: 'code',
                role: 'role',
                playerId: 'player_id',
                allianceId: 'alliance_id',
                createdBy: 'created_by',
                used: 'used',
                usedBy: 'used_by',
                usedAt: 'used_at',
                expiresAt: 'expires_at',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, code, role, player_id, alliance_id, used, created_at',
                all: '*'
            }
        },
        // ---- PUBLIC VIEWS (read-only) ----
        publicRankings: {
            name: 'public_rankings_view',
            cols: {
                playerId: 'player_id',
                currentUsername: 'current_username',
                currentAllianceId: 'current_alliance_id',
                allianceName: 'alliance_name',
                allianceTag: 'alliance_tag',
                totalKills: 'total_kills',
                totalDeaths: 'total_deaths',
                gamesPlayed: 'games_played'
            },
            selectSets: {
                basic: 'player_id, current_username, current_alliance_id, alliance_name, alliance_tag, total_kills, total_deaths, games_played',
                all: '*'
            }
        },
        publicAllianceRankings: {
            name: 'public_alliance_rankings_view',
            cols: {
                allianceId: 'alliance_id',
                name: 'name',
                tag: 'tag',
                memberCount: 'member_count',
                totalKills: 'total_kills'
            },
            selectSets: {
                basic: 'alliance_id, name, tag, member_count, total_kills',
                all: '*'
            }
        },
        publicMatches: {
            name: 'public_matches_view',
            cols: {
                id: 'id',
                name: 'name',
                matchType: 'match_type',
                status: 'status',
                allianceId: 'alliance_id',
                allianceAId: 'alliance_a_id',
                allianceBId: 'alliance_b_id',
                leagueId: 'league_id',
                maxPlayers: 'max_players',
                winnersDeclared: 'winners_declared',
                requiresApproval: 'requires_approval',
                isPrivate: 'is_private',
                createdAt: 'created_at'
            },
            selectSets: {
                basic: 'id, name, match_type, status, alliance_id, alliance_a_id, alliance_b_id, league_id, max_players, winners_declared, requires_approval, is_private, created_at',
                all: '*'
            }
        },
        publicPlayers: {
            name: 'public_players_view',
            cols: {
                id: 'id',
                currentUsername: 'current_username',
                currentAllianceId: 'current_alliance_id',
                status: 'status',
                totalKills: 'total_kills',
                totalDeaths: 'total_deaths',
                gamesPlayed: 'games_played',
                lastSeen: 'last_seen',
                reputationScore: 'reputation_score'
            },
            selectSets: {
                basic: 'id, current_username, current_alliance_id, status, total_kills, total_deaths, games_played, last_seen, reputation_score',
                all: '*'
            }
        },
        publicMatchWinners: {
            name: 'public_match_winners_view',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                position: 'position',
                currentUsername: 'current_username'
            },
            selectSets: {
                basic: 'id, match_id, player_id, position, current_username',
                all: '*'
            }
        },
        publicMatchResults: {
            name: 'public_match_results_view',
            cols: {
                id: 'id',
                matchId: 'match_id',
                playerId: 'player_id',
                nation: 'nation',
                kills: 'kills',
                deaths: 'deaths',
                kdRatio: 'kd_ratio',
                importedAt: 'imported_at'
            },
            selectSets: {
                basic: 'id, match_id, player_id, nation, kills, deaths, kd_ratio, imported_at',
                all: '*'
            }
        }
    };

    var ACTIVE_FILTERS = {
        players: function() { return { col: SCHEMA.players.cols.status, val: 'active' }; },
        alliances: function() { return { col: SCHEMA.alliances.cols.status, val: 'active' }; },
        matches: function() { return { col: SCHEMA.matches.cols.status, val: 'draft', op: 'neq' }; },
        matchRegistrations: function() { return { col: SCHEMA.matchRegistrations.cols.status, val: 'pending', op: 'neq' }; }
    };

    window.DB = {
        schema: function(tableKey) { return SCHEMA[tableKey] || null; },
        from: function(tableKey) {
            var s = SCHEMA[tableKey];
            if (!s) { console.warn('[DB] Unknown table key:', tableKey); return tableKey; }
            // FIX v22: window.supabase para compatibilidad strict mode
            return window.supabase.from(s.name);
        },
        tableName: function(tableKey) {
            var s = SCHEMA[tableKey];
            return s ? s.name : tableKey;
        },
        col: function(tableKey, colKey) {
            var s = SCHEMA[tableKey];
            if (!s) { console.warn('[DB] Unknown table key:', tableKey); return colKey; }
            return s.cols[colKey] || colKey;
        },
        tableCols: function(tableKey) {
            var s = SCHEMA[tableKey];
            return s ? s.cols : {};
        },
        select: function(tableKey, setName) {
            var s = SCHEMA[tableKey];
            if (!s) { console.warn('[DB] Unknown table key:', tableKey); return '*'; }
            return s.selectSets[setName || 'basic'] || s.selectSets.basic || '*';
        },
        activeFilter: function(tableKey) {
            return ACTIVE_FILTERS[tableKey] ? ACTIVE_FILTERS[tableKey]() : null;
        },
        selectActive: function(tableKey, selectSet, orderBy, ascending) {
            var q = this.from(tableKey).select(this.select(tableKey, selectSet));
            var af = this.activeFilter(tableKey);
            if (af) {
                if (af.op === 'neq') q = q.neq(af.col, af.val);
                else q = q.eq(af.col, af.val);
            }
            if (orderBy) q = q.order(orderBy, { ascending: ascending !== false });
            return q;
        },
        selectAll: function(tableKey, selectSet, orderBy, ascending) {
            var q = this.from(tableKey).select(this.select(tableKey, selectSet));
            if (orderBy) q = q.order(orderBy, { ascending: ascending !== false });
            return q;
        },
        selectById: function(tableKey, id, selectSet) {
            return this.from(tableKey)
                .select(this.select(tableKey, selectSet))
                .eq('id', id)
                .single();
        }
    };

    window.DB.TABLES = Object.keys(SCHEMA);
    window.DB.SCHEMA = SCHEMA;

    console.log('[DB-Schema] v22 initialized. Tables:', window.DB.TABLES.length);
})();
