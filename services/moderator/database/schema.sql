-- ═══════════════════════════════════════════════════════════════════════
-- Exprsn Moderator Service - PostgreSQL Database Schema
-- ═══════════════════════════════════════════════════════════════════════
-- Version: 1.0
-- Date: 2025-12-01
-- Description: Database schema for content moderation and safety platform
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════════════════════
-- Custom Types and Enums
-- ═══════════════════════════════════════════════════════════════════════

-- Content types that can be moderated
CREATE TYPE content_type AS ENUM (
  'text',
  'image',
  'video',
  'audio',
  'post',
  'comment',
  'message',
  'profile',
  'file',
  'llm_message' -- BUG-015: Cortex moderatorScreen submits llm_message
);

-- Moderation status
CREATE TYPE moderation_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'flagged',
  'reviewing',
  'appealed',
  'escalated'
);

-- Risk levels for content
CREATE TYPE risk_level AS ENUM (
  'safe',
  'low',
  'medium',
  'high',
  'critical'
);

-- Moderation actions
CREATE TYPE moderation_action AS ENUM (
  'auto_approve',
  'approve',
  'reject',
  'hide',
  'remove',
  'warn',
  'flag',
  'escalate',
  'require_review'
);

-- Report status
CREATE TYPE report_status AS ENUM (
  'open',
  'investigating',
  'resolved',
  'dismissed',
  'escalated'
);

-- Report reasons
CREATE TYPE report_reason AS ENUM (
  'spam',
  'harassment',
  'hate_speech',
  'violence',
  'nsfw',
  'misinformation',
  'copyright',
  'personal_info',
  'other'
);

-- AI provider types
CREATE TYPE ai_provider AS ENUM (
  'claude',
  'openai',
  'deepseek',
  'local',
  'cortex'
);

-- User action types
CREATE TYPE user_action_type AS ENUM (
  'warn',
  'suspend',
  'ban',
  'restrict',
  'unsuspend',
  'unban'
);

-- Appeal status
CREATE TYPE appeal_status AS ENUM (
  'pending',
  'reviewing',
  'approved',
  'denied'
);

-- ═══════════════════════════════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- moderation_items: Content submitted for moderation
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE moderation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content identification
  content_type content_type NOT NULL,
  content_id VARCHAR(255) NOT NULL,              -- External content ID from source service
  source_service VARCHAR(100) NOT NULL,          -- timeline, spark, gallery, etc.

  -- User information
  user_id UUID NOT NULL,

  -- Content data
  content_text TEXT,
  content_url TEXT,
  content_metadata JSONB DEFAULT '{}',

  -- Moderation scores
  risk_score INTEGER NOT NULL DEFAULT 0,         -- 0-100
  risk_level risk_level NOT NULL DEFAULT 'safe',

  -- Individual scores
  toxicity_score INTEGER DEFAULT 0,              -- 0-100
  nsfw_score INTEGER DEFAULT 0,
  spam_score INTEGER DEFAULT 0,
  violence_score INTEGER DEFAULT 0,
  hate_speech_score INTEGER DEFAULT 0,

  -- AI provider used
  ai_provider ai_provider,
  ai_model VARCHAR(100),
  ai_response JSONB,

  -- Status and actions
  status moderation_status NOT NULL DEFAULT 'pending',
  action moderation_action,

  -- Review information
  requires_review BOOLEAN DEFAULT FALSE,
  reviewed_by UUID,
  reviewed_at BIGINT,
  review_notes TEXT,

  -- Timestamps
  submitted_at BIGINT NOT NULL,
  processed_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Composite index for content lookup
  UNIQUE(source_service, content_type, content_id)
);

COMMENT ON TABLE moderation_items IS 'Content items submitted for moderation analysis';
COMMENT ON COLUMN moderation_items.risk_score IS 'Overall risk score 0-100, higher = more risky';
COMMENT ON COLUMN moderation_items.ai_response IS 'Full response from AI provider for audit trail';

-- ───────────────────────────────────────────────────────────────────────
-- moderation_rules: Custom moderation rules and policies
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE moderation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Rule identification
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,

  -- Rule scope
  applies_to content_type[],
  source_services VARCHAR(100)[],

  -- Rule configuration
  conditions JSONB NOT NULL,                     -- Rule conditions
  threshold_score INTEGER,                       -- Score threshold
  action moderation_action NOT NULL,             -- Action to take

  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,                    -- Higher priority = evaluated first

  -- Metadata
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE moderation_rules IS 'Custom moderation rules and automatic action policies';
COMMENT ON COLUMN moderation_rules.conditions IS 'JSON conditions for rule evaluation';
COMMENT ON COLUMN moderation_rules.priority IS 'Higher priority rules evaluated first';

-- ───────────────────────────────────────────────────────────────────────
-- reports: User-submitted content reports
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Report information
  content_type content_type NOT NULL,
  content_id VARCHAR(255) NOT NULL,
  source_service VARCHAR(100) NOT NULL,

  -- Reporter information
  reported_by UUID NOT NULL,
  reason report_reason NOT NULL,
  details TEXT,

  -- Status
  status report_status NOT NULL DEFAULT 'open',

  -- Assignment
  assigned_to UUID,
  assigned_at BIGINT,

  -- Resolution
  resolved_by UUID,
  resolved_at BIGINT,
  resolution_notes TEXT,
  action_taken moderation_action,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE reports IS 'User-submitted reports of problematic content';

-- ───────────────────────────────────────────────────────────────────────
-- review_queue: Items queued for manual review
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content reference
  moderation_item_id UUID NOT NULL REFERENCES moderation_items(id) ON DELETE CASCADE,

  -- Queue information
  priority INTEGER DEFAULT 0,                    -- Higher = more urgent
  escalated BOOLEAN DEFAULT FALSE,
  escalated_reason TEXT,

  -- Assignment
  assigned_to UUID,
  assigned_at BIGINT,

  -- Status
  status moderation_status NOT NULL DEFAULT 'pending',

  -- Timestamps
  queued_at BIGINT NOT NULL,
  completed_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE review_queue IS 'Queue of content items requiring manual moderator review';

-- ───────────────────────────────────────────────────────────────────────
-- moderation_actions: Audit trail of all moderation actions
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Action details
  action moderation_action NOT NULL,
  content_type content_type NOT NULL,
  content_id VARCHAR(255) NOT NULL,
  source_service VARCHAR(100) NOT NULL,

  -- Actor
  performed_by UUID,                             -- NULL for automated actions
  is_automated BOOLEAN DEFAULT FALSE,

  -- Context
  reason TEXT,
  moderation_item_id UUID REFERENCES moderation_items(id) ON DELETE SET NULL,
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  performed_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE moderation_actions IS 'Complete audit trail of all moderation actions taken';

-- ───────────────────────────────────────────────────────────────────────
-- user_actions: Actions taken against user accounts
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE user_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User and action
  user_id UUID NOT NULL,
  action_type user_action_type NOT NULL,

  -- Details
  reason TEXT NOT NULL,
  duration_seconds INTEGER,                      -- For temporary actions (suspend)
  expires_at BIGINT,

  -- Context
  performed_by UUID NOT NULL,
  related_content_id VARCHAR(255),
  related_report_id UUID REFERENCES reports(id) ON DELETE SET NULL,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  revoked_by UUID,
  revoked_at BIGINT,
  revoke_reason TEXT,

  -- Timestamps
  performed_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE user_actions IS 'Disciplinary actions taken against user accounts';

-- ───────────────────────────────────────────────────────────────────────
-- appeals: User appeals of moderation decisions
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Appeal target
  moderation_item_id UUID REFERENCES moderation_items(id) ON DELETE CASCADE,
  user_action_id UUID REFERENCES user_actions(id) ON DELETE CASCADE,

  -- Appellant
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  additional_info TEXT,

  -- Status
  status appeal_status NOT NULL DEFAULT 'pending',

  -- Review
  reviewed_by UUID,
  reviewed_at BIGINT,
  review_notes TEXT,
  decision TEXT,

  -- Timestamps
  submitted_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure appeal targets either a moderation item or user action
  CHECK (
    (moderation_item_id IS NOT NULL AND user_action_id IS NULL) OR
    (moderation_item_id IS NULL AND user_action_id IS NOT NULL)
  )
);

COMMENT ON TABLE appeals IS 'User appeals of moderation decisions and account actions';

-- ───────────────────────────────────────────────────────────────────────
-- moderator_performance: Track moderator performance metrics
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE moderator_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Moderator
  moderator_id UUID NOT NULL,

  -- Time period
  period_start BIGINT NOT NULL,
  period_end BIGINT NOT NULL,

  -- Metrics
  items_reviewed INTEGER DEFAULT 0,
  items_approved INTEGER DEFAULT 0,
  items_rejected INTEGER DEFAULT 0,
  items_escalated INTEGER DEFAULT 0,

  -- Performance indicators
  avg_review_time_seconds INTEGER,
  accuracy_score DECIMAL(5,2),                   -- Percentage
  appeals_received INTEGER DEFAULT 0,
  appeals_overturned INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(moderator_id, period_start, period_end)
);

COMMENT ON TABLE moderator_performance IS 'Performance metrics for moderators by time period';

-- ───────────────────────────────────────────────────────────────────────
-- ai_provider_config: Configuration for AI moderation providers
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE ai_provider_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Provider details
  provider ai_provider NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT TRUE,

  -- Configuration
  api_endpoint TEXT,
  model_name VARCHAR(100),
  config JSONB DEFAULT '{}',

  -- Rate limits
  rate_limit_per_minute INTEGER,
  rate_limit_per_day INTEGER,

  -- Usage tracking
  requests_today INTEGER DEFAULT 0,
  requests_this_month INTEGER DEFAULT 0,
  last_request_at BIGINT,

  -- Status
  last_error TEXT,
  last_error_at BIGINT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ai_provider_config IS 'Configuration and status for AI moderation providers';

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- moderation_items indexes
CREATE INDEX idx_moderation_items_user ON moderation_items(user_id);
CREATE INDEX idx_moderation_items_status ON moderation_items(status);
CREATE INDEX idx_moderation_items_risk ON moderation_items(risk_level, risk_score DESC);
CREATE INDEX idx_moderation_items_service ON moderation_items(source_service);
CREATE INDEX idx_moderation_items_submitted ON moderation_items(submitted_at DESC);
CREATE INDEX idx_moderation_items_requires_review ON moderation_items(requires_review) WHERE requires_review = TRUE;

-- reports indexes
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_reporter ON reports(reported_by);
CREATE INDEX idx_reports_content ON reports(source_service, content_type, content_id);
CREATE INDEX idx_reports_assigned ON reports(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_reports_created ON reports(created_at DESC);

-- review_queue indexes
CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_priority ON review_queue(priority DESC, queued_at ASC);
CREATE INDEX idx_review_queue_assigned ON review_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_review_queue_escalated ON review_queue(escalated) WHERE escalated = TRUE;

-- moderation_actions indexes
CREATE INDEX idx_moderation_actions_content ON moderation_actions(source_service, content_type, content_id);
CREATE INDEX idx_moderation_actions_performed ON moderation_actions(performed_at DESC);
CREATE INDEX idx_moderation_actions_actor ON moderation_actions(performed_by) WHERE performed_by IS NOT NULL;
CREATE INDEX idx_moderation_actions_automated ON moderation_actions(is_automated);

-- user_actions indexes
CREATE INDEX idx_user_actions_user ON user_actions(user_id);
CREATE INDEX idx_user_actions_active ON user_actions(active) WHERE active = TRUE;
CREATE INDEX idx_user_actions_expires ON user_actions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_user_actions_type ON user_actions(action_type);

-- appeals indexes
CREATE INDEX idx_appeals_user ON appeals(user_id);
CREATE INDEX idx_appeals_status ON appeals(status);
CREATE INDEX idx_appeals_submitted ON appeals(submitted_at DESC);

-- moderator_performance indexes
CREATE INDEX idx_moderator_performance_moderator ON moderator_performance(moderator_id);
CREATE INDEX idx_moderator_performance_period ON moderator_performance(period_start, period_end);

-- ═══════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_moderation_items_updated_at BEFORE UPDATE ON moderation_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moderation_rules_updated_at BEFORE UPDATE ON moderation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_review_queue_updated_at BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_actions_updated_at BEFORE UPDATE ON user_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appeals_updated_at BEFORE UPDATE ON appeals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moderator_performance_updated_at BEFORE UPDATE ON moderator_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_provider_config_updated_at BEFORE UPDATE ON ai_provider_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════════════

-- Function to calculate risk level from risk score
CREATE OR REPLACE FUNCTION calculate_risk_level(score INTEGER)
RETURNS risk_level AS $$
BEGIN
  IF score <= 30 THEN
    RETURN 'safe'::risk_level;
  ELSIF score <= 50 THEN
    RETURN 'low'::risk_level;
  ELSIF score <= 75 THEN
    RETURN 'medium'::risk_level;
  ELSIF score <= 90 THEN
    RETURN 'high'::risk_level;
  ELSE
    RETURN 'critical'::risk_level;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine action from risk score
CREATE OR REPLACE FUNCTION determine_moderation_action(score INTEGER)
RETURNS moderation_action AS $$
BEGIN
  IF score <= 30 THEN
    RETURN 'auto_approve'::moderation_action;
  ELSIF score <= 75 THEN
    RETURN 'require_review'::moderation_action;
  ELSE
    RETURN 'reject'::moderation_action;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get pending review count
CREATE OR REPLACE FUNCTION get_pending_review_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM review_queue WHERE status = 'pending');
END;
$$ LANGUAGE plpgsql;

-- Function to get active user actions for a user
CREATE OR REPLACE FUNCTION get_active_user_actions(target_user_id UUID)
RETURNS TABLE (
  action_type user_action_type,
  reason TEXT,
  expires_at BIGINT,
  performed_at BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ua.action_type, ua.reason, ua.expires_at, ua.performed_at
  FROM user_actions ua
  WHERE ua.user_id = target_user_id
    AND ua.active = TRUE
    AND (ua.expires_at IS NULL OR ua.expires_at > EXTRACT(EPOCH FROM NOW()) * 1000)
  ORDER BY ua.performed_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════════════════════

-- View for pending reviews with details
CREATE OR REPLACE VIEW pending_reviews AS
SELECT
  rq.id as queue_id,
  rq.priority,
  rq.escalated,
  rq.assigned_to,
  mi.id as moderation_item_id,
  mi.content_type,
  mi.content_id,
  mi.source_service,
  mi.user_id,
  mi.risk_score,
  mi.risk_level,
  mi.toxicity_score,
  mi.nsfw_score,
  mi.spam_score,
  mi.violence_score,
  mi.hate_speech_score,
  mi.content_text,
  mi.submitted_at,
  rq.queued_at
FROM review_queue rq
JOIN moderation_items mi ON rq.moderation_item_id = mi.id
WHERE rq.status = 'pending'
ORDER BY rq.priority DESC, rq.queued_at ASC;

COMMENT ON VIEW pending_reviews IS 'Pending review items with full moderation details';

-- View for high-risk content
CREATE OR REPLACE VIEW high_risk_content AS
SELECT
  mi.id,
  mi.content_type,
  mi.content_id,
  mi.source_service,
  mi.user_id,
  mi.risk_score,
  mi.risk_level,
  mi.status,
  mi.submitted_at,
  mi.content_text
FROM moderation_items mi
WHERE mi.risk_level IN ('high', 'critical')
  AND mi.status NOT IN ('approved', 'rejected')
ORDER BY mi.risk_score DESC, mi.submitted_at DESC;

COMMENT ON VIEW high_risk_content IS 'High and critical risk content requiring attention';

-- View for moderation statistics
CREATE OR REPLACE VIEW moderation_stats AS
SELECT
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'approved') as approved,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE status = 'reviewing') as in_review,
  COUNT(*) FILTER (WHERE risk_level = 'critical') as critical_items,
  COUNT(*) FILTER (WHERE risk_level = 'high') as high_risk_items,
  AVG(risk_score) as avg_risk_score,
  COUNT(*) FILTER (WHERE ai_provider = 'claude') as claude_processed,
  COUNT(*) FILTER (WHERE ai_provider = 'openai') as openai_processed,
  COUNT(*) FILTER (WHERE ai_provider = 'deepseek') as deepseek_processed
FROM moderation_items
WHERE submitted_at > EXTRACT(EPOCH FROM (NOW() - INTERVAL '24 hours')) * 1000;

COMMENT ON VIEW moderation_stats IS 'Moderation statistics for the last 24 hours';

-- ═══════════════════════════════════════════════════════════════════════
-- Initial Data
-- ═══════════════════════════════════════════════════════════════════════

-- Insert default AI provider configurations
INSERT INTO ai_provider_config (provider, enabled, model_name, config) VALUES
('claude', TRUE, 'claude-3-5-sonnet-20241022', '{"temperature": 0.3, "max_tokens": 1000}'::jsonb),
('openai', TRUE, 'gpt-4-turbo-preview', '{"temperature": 0.3, "max_tokens": 1000}'::jsonb),
('deepseek', TRUE, 'deepseek-chat', '{"temperature": 0.3, "max_tokens": 1000}'::jsonb)
ON CONFLICT (provider) DO NOTHING;

-- Insert default moderation rules
INSERT INTO moderation_rules (name, description, applies_to, action, threshold_score, priority, conditions) VALUES
(
  'Auto-approve safe content',
  'Automatically approve content with risk score <= 30',
  ARRAY['text', 'post', 'comment']::content_type[],
  'auto_approve',
  30,
  100,
  '{"max_risk_score": 30}'::jsonb
),
(
  'Flag high-risk content',
  'Flag content with risk score > 75 for review',
  ARRAY['text', 'image', 'video', 'post', 'comment']::content_type[],
  'flag',
  75,
  90,
  '{"min_risk_score": 75}'::jsonb
),
(
  'Auto-reject critical content',
  'Automatically reject content with risk score > 90',
  ARRAY['text', 'image', 'video', 'post', 'comment', 'message']::content_type[],
  'reject',
  90,
  80,
  '{"min_risk_score": 90}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Permissions (Optional - uncomment and customize for your setup)
-- ═══════════════════════════════════════════════════════════════════════

-- CREATE ROLE moderator_service WITH LOGIN PASSWORD 'change_me_in_production';
-- GRANT CONNECT ON DATABASE exprsn_moderator TO moderator_service;
-- GRANT USAGE ON SCHEMA public TO moderator_service;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moderator_service;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moderator_service;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO moderator_service;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO moderator_service;
