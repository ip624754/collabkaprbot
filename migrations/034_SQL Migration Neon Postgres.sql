-- 1. Включаем криптографию для детерминированных розыгрышей
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Таблица событий (Outbox)
CREATE TABLE event_outbox (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, DONE, DEAD
    attempts INTEGER DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого выбора задач воркером
CREATE INDEX idx_outbox_worker ON event_outbox (status, next_attempt_at) 
WHERE status = 'PENDING';

-- 3. Таблица аудита
CREATE TABLE audit_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID,
    entity_type TEXT NOT NULL, -- 'giveaway', 'user', 'system'
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для аналитики
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);

-- 4. Оптимизация для Giveaway
CREATE INDEX idx_giveaways_expiration ON giveaways (status, ends_at) 
WHERE status IN ('ACTIVE', 'RUNNING');

CREATE INDEX idx_entries_draw ON giveaway_entries (giveaway_id, is_eligible);
