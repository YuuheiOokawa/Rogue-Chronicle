-- CreateTable
CREATE TABLE "characters" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "base_stats" JSONB NOT NULL,
    "growth_rates" JSONB NOT NULL,
    "favored_weapon_type" TEXT NOT NULL,
    "innate_skill_code" TEXT NOT NULL,
    "initial_skill_codes" JSONB NOT NULL,
    "initial_equip_code" TEXT,
    "unlock_condition" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "weapon_type" TEXT,
    "rarity" TEXT NOT NULL,
    "base_stats" JSONB NOT NULL,
    "passive_effect" JSONB,
    "base_price" INTEGER NOT NULL,
    "is_starter" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skill_type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "sp_cost" INTEGER NOT NULL DEFAULT 0,
    "target_type" TEXT NOT NULL,
    "element" TEXT NOT NULL DEFAULT 'none',
    "max_level" INTEGER NOT NULL DEFAULT 3,
    "character_code" TEXT,
    "is_innate" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_effects" (
    "id" SERIAL NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "effect_type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "level_scaling" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "skill_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relics" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "is_cursed" BOOLEAN NOT NULL DEFAULT false,
    "synergy_tags" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "relics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enemies" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enemy_type" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "base_stats" JSONB NOT NULL,
    "base_exp" INTEGER NOT NULL,
    "base_gold" INTEGER NOT NULL,
    "drop_table_code" TEXT,
    "appear_floor_min" INTEGER NOT NULL,
    "appear_floor_max" INTEGER NOT NULL,
    "is_summon" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enemies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enemy_actions" (
    "id" SERIAL NOT NULL,
    "enemy_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effects" JSONB NOT NULL,
    "intent_icon" TEXT NOT NULL,
    "intent_label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enemy_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enemy_ai_rules" (
    "id" SERIAL NOT NULL,
    "enemy_id" INTEGER NOT NULL,
    "priority" INTEGER,
    "boss_phase" INTEGER,
    "conditions" JSONB,
    "action_code" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enemy_ai_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeons" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "floors" INTEGER NOT NULL,
    "generation_config" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dungeons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_difficulties" (
    "id" SERIAL NOT NULL,
    "dungeon_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stat_mod" DOUBLE PRECISION NOT NULL,
    "exp_mod" DOUBLE PRECISION NOT NULL,
    "reward_mod" DOUBLE PRECISION NOT NULL,
    "unlock_condition" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dungeon_difficulties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_node_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dungeon_node_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "random_events" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flavor_text" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "min_floor" INTEGER NOT NULL DEFAULT 1,
    "max_floor" INTEGER NOT NULL DEFAULT 10,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "random_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "random_event_choices" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "outcomes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "random_event_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_tables" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reward_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upgrade_nodes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "max_rank" INTEGER NOT NULL,
    "cost_per_rank" JSONB NOT NULL,
    "prerequisite_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "upgrade_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "reward" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "unlock_condition" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data_versions" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_data_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "is_guest" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "withdrawn_at" TIMESTAMPTZ,
    "last_access_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "battle_speed" INTEGER NOT NULL DEFAULT 1,
    "damage_display" BOOLEAN NOT NULL DEFAULT true,
    "screen_shake" BOOLEAN NOT NULL DEFAULT true,
    "color_assist" BOOLEAN NOT NULL DEFAULT false,
    "tutorial_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "revoked_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_progress" (
    "user_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "rank_exp" INTEGER NOT NULL DEFAULT 0,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "total_clears" INTEGER NOT NULL DEFAULT 0,
    "total_kills" INTEGER NOT NULL DEFAULT 0,
    "best_floor" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "player_progress_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "player_currencies" (
    "user_id" UUID NOT NULL,
    "soul_shards" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "player_currencies_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "player_characters" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "character_code" TEXT NOT NULL,
    "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_equipment" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "equipment_code" TEXT NOT NULL,
    "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_upgrades" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "upgrade_node_code" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "player_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_codex" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "entry_type" TEXT NOT NULL,
    "entry_code" TEXT NOT NULL,
    "discovered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_codex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_achievements" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "achievement_code" TEXT NOT NULL,
    "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_story_progress" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "story_code" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_story_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dungeon_code" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'normal',
    "seed" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "run_state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dungeon_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_run_snapshots" (
    "id" SERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "run_state" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dungeon_run_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_logs" (
    "id" SERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "floor" INTEGER NOT NULL,
    "node_id" TEXT NOT NULL,
    "enemy_codes" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "turns" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "forced_retire" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_code_key" ON "characters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_code_key" ON "equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "skills_code_key" ON "skills"("code");

-- CreateIndex
CREATE UNIQUE INDEX "skill_effects_skill_id_order_key" ON "skill_effects"("skill_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "relics_code_key" ON "relics"("code");

-- CreateIndex
CREATE UNIQUE INDEX "enemies_code_key" ON "enemies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "enemy_actions_enemy_id_code_key" ON "enemy_actions"("enemy_id", "code");

-- CreateIndex
CREATE INDEX "enemy_ai_rules_enemy_id_priority_idx" ON "enemy_ai_rules"("enemy_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "dungeons_code_key" ON "dungeons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_difficulties_dungeon_id_code_key" ON "dungeon_difficulties"("dungeon_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_node_types_code_key" ON "dungeon_node_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "random_events_code_key" ON "random_events"("code");

-- CreateIndex
CREATE UNIQUE INDEX "random_event_choices_event_id_order_key" ON "random_event_choices"("event_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "reward_tables_code_key" ON "reward_tables"("code");

-- CreateIndex
CREATE UNIQUE INDEX "upgrade_nodes_code_key" ON "upgrade_nodes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stories_code_key" ON "stories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "master_data_versions_version_key" ON "master_data_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_characters_user_id_character_code_key" ON "player_characters"("user_id", "character_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_equipment_user_id_equipment_code_key" ON "player_equipment"("user_id", "equipment_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_upgrades_user_id_upgrade_node_code_key" ON "player_upgrades"("user_id", "upgrade_node_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_codex_user_id_entry_type_entry_code_key" ON "player_codex"("user_id", "entry_type", "entry_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_achievements_user_id_achievement_code_key" ON "player_achievements"("user_id", "achievement_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_story_progress_user_id_story_code_key" ON "player_story_progress"("user_id", "story_code");

-- CreateIndex
CREATE UNIQUE INDEX "currency_transactions_idempotency_key_key" ON "currency_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "currency_transactions_user_id_created_at_idx" ON "currency_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "dungeon_runs_user_id_status_idx" ON "dungeon_runs"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_run_snapshots_run_id_generation_key" ON "dungeon_run_snapshots"("run_id", "generation");

-- CreateIndex
CREATE INDEX "battle_logs_run_id_idx" ON "battle_logs"("run_id");

-- CreateIndex
CREATE INDEX "battle_logs_created_at_idx" ON "battle_logs"("created_at");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "skill_effects" ADD CONSTRAINT "skill_effects_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enemy_actions" ADD CONSTRAINT "enemy_actions_enemy_id_fkey" FOREIGN KEY ("enemy_id") REFERENCES "enemies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enemy_ai_rules" ADD CONSTRAINT "enemy_ai_rules_enemy_id_fkey" FOREIGN KEY ("enemy_id") REFERENCES "enemies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_difficulties" ADD CONSTRAINT "dungeon_difficulties_dungeon_id_fkey" FOREIGN KEY ("dungeon_id") REFERENCES "dungeons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "random_event_choices" ADD CONSTRAINT "random_event_choices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "random_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_currencies" ADD CONSTRAINT "player_currencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_characters" ADD CONSTRAINT "player_characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_upgrades" ADD CONSTRAINT "player_upgrades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_codex" ADD CONSTRAINT "player_codex_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_story_progress" ADD CONSTRAINT "player_story_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_transactions" ADD CONSTRAINT "currency_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "dungeon_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_run_snapshots" ADD CONSTRAINT "dungeon_run_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "dungeon_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ================================================================
-- 手書き追記（docs/12 実装時の注意点: Prisma非対応の制約はSQLで補完）
-- ================================================================

-- 同時アクティブラン1つをDBレベルで保証（docs/12 §5.4）
CREATE UNIQUE INDEX "uq_dungeon_runs_active" ON "dungeon_runs" ("user_id") WHERE "status" = 'active';

-- CHECK制約（DEC-240: DB enum不使用のため文字列値をCHECKで制限）
ALTER TABLE "users" ADD CONSTRAINT "chk_users_role" CHECK ("role" IN ('user', 'admin', 'operator', 'developer'));
ALTER TABLE "users" ADD CONSTRAINT "chk_users_status" CHECK ("status" IN ('active', 'withdrawn'));
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "chk_dungeon_runs_status" CHECK ("status" IN ('active', 'cleared', 'failed', 'retired', 'finalized'));
ALTER TABLE "player_currencies" ADD CONSTRAINT "chk_player_currencies_soul_shards" CHECK ("soul_shards" >= 0);
ALTER TABLE "currency_transactions" ADD CONSTRAINT "chk_currency_transactions_amount" CHECK ("amount" <> 0);
ALTER TABLE "currency_transactions" ADD CONSTRAINT "chk_currency_transactions_currency" CHECK ("currency" IN ('gold', 'soul_shards'));
ALTER TABLE "equipment" ADD CONSTRAINT "chk_equipment_slot" CHECK ("slot" IN ('weapon', 'armor', 'accessory'));
ALTER TABLE "equipment" ADD CONSTRAINT "chk_equipment_rarity" CHECK ("rarity" IN ('common', 'rare', 'epic'));
ALTER TABLE "skills" ADD CONSTRAINT "chk_skills_rarity" CHECK ("rarity" IN ('common', 'rare', 'epic'));
ALTER TABLE "skills" ADD CONSTRAINT "chk_skills_type" CHECK ("skill_type" IN ('active', 'passive'));
ALTER TABLE "relics" ADD CONSTRAINT "chk_relics_rarity" CHECK ("rarity" IN ('common', 'rare', 'epic'));
ALTER TABLE "enemies" ADD CONSTRAINT "chk_enemies_type" CHECK ("enemy_type" IN ('normal', 'strong', 'elite', 'boss'));
ALTER TABLE "user_settings" ADD CONSTRAINT "chk_user_settings_battle_speed" CHECK ("battle_speed" IN (1, 2));
ALTER TABLE "battle_logs" ADD CONSTRAINT "chk_battle_logs_result" CHECK ("result" IN ('win', 'lose', 'fled'));
