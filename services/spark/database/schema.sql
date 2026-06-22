-- ═══════════════════════════════════════════════════════════
-- Exprsn Spark Database Schema
-- Real-time User & Group Messaging Platform
-- PostgreSQL 12+
-- ═══════════════════════════════════════════════════════════

-- Drop existing tables (in correct order)
DROP TABLE IF EXISTS message_keys CASCADE;
DROP TABLE IF EXISTS encryption_keys CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS conversation_type CASCADE;
DROP TYPE IF EXISTS participant_role CASCADE;
DROP TYPE IF EXISTS message_content_type CASCADE;
DROP TYPE IF EXISTS attachment_status CASCADE;
DROP TYPE IF EXISTS encryption_key_type CASCADE;

-- ═══════════════════════════════════════════════════════════
-- Custom Types
-- ═══════════════════════════════════════════════════════════

CREATE TYPE conversation_type AS ENUM ('direct', 'group', 'channel');
CREATE TYPE participant_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE message_content_type AS ENUM ('text', 'image', 'video', 'file', 'audio');
CREATE TYPE attachment_status AS ENUM ('pending', 'processing', 'ready', 'failed');
CREATE TYPE encryption_key_type AS ENUM ('rsa-4096');

-- ═══════════════════════════════════════════════════════════
-- Conversations Table
-- Stores chat conversations (direct, group, channel)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type conversation_type NOT NULL DEFAULT 'direct',
  name VARCHAR(255),
  description TEXT,
  avatar_url VARCHAR(500),

  -- Group/channel settings
  max_participants INTEGER DEFAULT 2,
  is_private BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_direct_conversation CHECK (
    (type = 'direct' AND max_participants = 2) OR
    (type != 'direct')
  )
);

-- Indexes
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversations_metadata ON conversations USING GIN(metadata);

-- ═══════════════════════════════════════════════════════════
-- Participants Table
-- Users participating in conversations
-- ═══════════════════════════════════════════════════════════

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role participant_role DEFAULT 'member',

  -- Read tracking
  last_read_message_id UUID,
  last_read_at TIMESTAMP WITH TIME ZONE,

  -- Notification settings
  muted BOOLEAN DEFAULT false,
  mute_until TIMESTAMP WITH TIME ZONE,
  notifications_enabled BOOLEAN DEFAULT true,

  -- Membership tracking
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_conversation_user UNIQUE (conversation_id, user_id)
);

-- Indexes
CREATE INDEX idx_participants_conversation ON participants(conversation_id);
CREATE INDEX idx_participants_user ON participants(user_id);
CREATE INDEX idx_participants_active ON participants(active);
CREATE INDEX idx_participants_last_read ON participants(last_read_at);

-- ═══════════════════════════════════════════════════════════
-- Messages Table
-- Chat messages with rich features
-- ═══════════════════════════════════════════════════════════

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,

  -- Content
  content TEXT,
  content_type message_content_type DEFAULT 'text',

  -- End-to-End Encryption (E2EE)
  encrypted BOOLEAN DEFAULT false,
  encrypted_content TEXT,
  sender_key_fingerprint VARCHAR(64),

  -- Threading
  parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  thread_id UUID,
  reply_count INTEGER DEFAULT 0,

  -- Attachments
  has_attachments BOOLEAN DEFAULT false,

  -- Mentions
  mentions JSONB DEFAULT '[]',

  -- Editing
  edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMP WITH TIME ZONE,

  -- Soft delete
  deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Read/delivery tracking
  read_by JSONB DEFAULT '[]',
  delivered_to JSONB DEFAULT '[]',

  -- Forwarding
  forwarded_from UUID REFERENCES messages(id) ON DELETE SET NULL,

  -- Pinning
  is_pinned BOOLEAN DEFAULT false,
  pinned_at TIMESTAMP WITH TIME ZONE,
  pinned_by UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_parent ON messages(parent_message_id);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_forwarded ON messages(forwarded_from);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_deleted ON messages(deleted);
CREATE INDEX idx_messages_pinned ON messages(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_messages_content ON messages USING GIN(to_tsvector('english', content)) WHERE content IS NOT NULL;
CREATE INDEX idx_messages_mentions ON messages USING GIN(mentions);
CREATE INDEX idx_messages_encrypted ON messages(encrypted);
CREATE INDEX idx_messages_key_fingerprint ON messages(sender_key_fingerprint) WHERE sender_key_fingerprint IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- Attachments Table
-- File attachments for messages
-- ═══════════════════════════════════════════════════════════

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

  -- File info
  file_name VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,

  -- URLs
  file_url VARCHAR(1000) NOT NULL,
  thumbnail_url VARCHAR(1000),

  -- Media metadata
  duration INTEGER, -- For audio/video (seconds)
  dimensions JSONB, -- For images/videos { width, height }

  -- Security
  encrypted BOOLEAN DEFAULT false,

  -- Processing
  status attachment_status DEFAULT 'pending',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_attachments_message ON attachments(message_id);
CREATE INDEX idx_attachments_status ON attachments(status);
CREATE INDEX idx_attachments_mime_type ON attachments(mime_type);
CREATE INDEX idx_attachments_created_at ON attachments(created_at);

-- ═══════════════════════════════════════════════════════════
-- Reactions Table
-- Emoji reactions to messages
-- ═══════════════════════════════════════════════════════════

CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji VARCHAR(100) NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_message_user_emoji UNIQUE (message_id, user_id, emoji)
);

-- Indexes
CREATE INDEX idx_reactions_message ON reactions(message_id);
CREATE INDEX idx_reactions_user ON reactions(user_id);
CREATE INDEX idx_reactions_emoji ON reactions(emoji);

-- ═══════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update conversation updated_at on new message
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update message reply count
CREATE OR REPLACE FUNCTION update_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_message_id IS NOT NULL THEN
    UPDATE messages
    SET reply_count = reply_count + 1
    WHERE id = NEW.parent_message_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update message has_attachments flag
CREATE OR REPLACE FUNCTION update_message_attachments()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE messages
  SET has_attachments = EXISTS(
    SELECT 1 FROM attachments WHERE message_id = NEW.message_id
  )
  WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════

-- Update updated_at for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at for participants
CREATE TRIGGER update_participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at for messages
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update conversation timestamp on new message
CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Update reply count on new reply
CREATE TRIGGER update_message_reply_count
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.parent_message_id IS NOT NULL)
  EXECUTE FUNCTION update_reply_count();

-- Update has_attachments flag
CREATE TRIGGER update_message_has_attachments
  AFTER INSERT ON attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_message_attachments();

-- ═══════════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════════

-- Active conversations with latest message
CREATE VIEW active_conversations AS
SELECT
  c.*,
  (SELECT COUNT(*) FROM participants p WHERE p.conversation_id = c.id AND p.active = true) as participant_count,
  (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.deleted = false) as last_message_at,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted = false) as message_count
FROM conversations c
WHERE EXISTS (
  SELECT 1 FROM participants p WHERE p.conversation_id = c.id AND p.active = true
);

-- Unread message counts per user
CREATE VIEW user_unread_counts AS
SELECT
  p.user_id,
  p.conversation_id,
  COUNT(m.id) as unread_count
FROM participants p
LEFT JOIN messages m ON
  m.conversation_id = p.conversation_id AND
  m.created_at > COALESCE(p.last_read_at, p.joined_at) AND
  m.deleted = false AND
  m.sender_id != p.user_id
WHERE p.active = true
GROUP BY p.user_id, p.conversation_id;

-- ═══════════════════════════════════════════════════════════
-- Comments
-- ═══════════════════════════════════════════════════════════

COMMENT ON TABLE conversations IS 'Chat conversations (direct messages, groups, channels)';
COMMENT ON TABLE participants IS 'Users participating in conversations with roles and settings';
COMMENT ON TABLE messages IS 'Chat messages with threading, forwarding, and pinning support';
COMMENT ON TABLE attachments IS 'File attachments for messages';
COMMENT ON TABLE reactions IS 'Emoji reactions to messages';

COMMENT ON COLUMN messages.parent_message_id IS 'Parent message for threaded replies';
COMMENT ON COLUMN messages.thread_id IS 'Thread root message ID';
COMMENT ON COLUMN messages.forwarded_from IS 'Original message ID if forwarded';
COMMENT ON COLUMN messages.is_pinned IS 'Whether message is pinned in conversation';
COMMENT ON COLUMN messages.encrypted IS 'Whether message content is end-to-end encrypted';
COMMENT ON COLUMN messages.encrypted_content IS 'AES-encrypted message content (client-side encryption)';
COMMENT ON COLUMN messages.sender_key_fingerprint IS 'SHA-256 fingerprint of sender public key for verification';
COMMENT ON COLUMN participants.mute_until IS 'Temporary mute expiration timestamp';
COMMENT ON COLUMN attachments.metadata IS 'Additional file metadata (FileVault ID, etc.)';

-- ═══════════════════════════════════════════════════════════
-- Encryption Keys Table
-- User encryption keys for End-to-End Encryption (E2EE)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id VARCHAR(255) NOT NULL,

  -- RSA key pair
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL, -- Encrypted with user's password
                                       -- (opaque blob for client-generated keys)

  -- Per-key random PBKDF2 salt (hex). NULL for legacy rows (deprecated
  -- static-salt fallback) and for client-generated keys.
  -- Existing deployments must run:
  --   ALTER TABLE encryption_keys ADD COLUMN salt VARCHAR(32);
  salt VARCHAR(32),

  -- Key verification
  key_fingerprint VARCHAR(64) NOT NULL UNIQUE,
  key_type encryption_key_type DEFAULT 'rsa-4096',

  -- Key status
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT check_key_fingerprint_format CHECK (key_fingerprint ~ '^[a-f0-9]{64}$')
);

-- Indexes
CREATE INDEX idx_encryption_keys_user ON encryption_keys(user_id);
CREATE INDEX idx_encryption_keys_device ON encryption_keys(device_id);
CREATE UNIQUE INDEX idx_encryption_keys_fingerprint ON encryption_keys(key_fingerprint);
CREATE INDEX idx_encryption_keys_active ON encryption_keys(active);
CREATE INDEX idx_encryption_keys_user_device ON encryption_keys(user_id, device_id);
CREATE INDEX idx_encryption_keys_user_active ON encryption_keys(user_id, active);
CREATE INDEX idx_encryption_keys_expires_at ON encryption_keys(expires_at) WHERE expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- Message Keys Table
-- Stores encrypted message keys for E2EE recipients
-- ═══════════════════════════════════════════════════════════

CREATE TABLE message_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL,

  -- AES message key encrypted with recipient's RSA public key
  encrypted_message_key TEXT NOT NULL,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_message_recipient UNIQUE (message_id, recipient_id)
);

-- Indexes
CREATE INDEX idx_message_keys_message ON message_keys(message_id);
CREATE INDEX idx_message_keys_recipient ON message_keys(recipient_id);
CREATE UNIQUE INDEX idx_message_keys_message_recipient ON message_keys(message_id, recipient_id);

-- ═══════════════════════════════════════════════════════════
-- Additional Triggers for Encryption Keys
-- ═══════════════════════════════════════════════════════════

-- Update updated_at for encryption_keys
CREATE TRIGGER update_encryption_keys_updated_at
  BEFORE UPDATE ON encryption_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
-- Additional Comments
-- ═══════════════════════════════════════════════════════════

COMMENT ON TABLE encryption_keys IS 'User RSA key pairs for end-to-end encryption';
COMMENT ON TABLE message_keys IS 'Encrypted AES message keys for each recipient (E2EE)';
COMMENT ON COLUMN encryption_keys.encrypted_private_key IS 'Private key encrypted with user password (AES-256-GCM)';
COMMENT ON COLUMN encryption_keys.key_fingerprint IS 'SHA-256 hash of public key for verification';
COMMENT ON COLUMN message_keys.encrypted_message_key IS 'AES-256 message key encrypted with recipient RSA public key';
