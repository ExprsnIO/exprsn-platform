-- ═══════════════════════════════════════════════════════════════════════
-- Exprsn FileVault Database Schema
-- PostgreSQL 12+
-- ═══════════════════════════════════════════════════════════════════════

-- Create database (run separately as superuser)
-- CREATE DATABASE exprsn_filevault;
-- \c exprsn_filevault;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════
-- Custom Types
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE storage_backend_type AS ENUM ('s3', 'disk', 'ipfs');
CREATE TYPE thumbnail_size_type AS ENUM ('small', 'medium', 'large');
CREATE TYPE share_link_permission_type AS ENUM ('view', 'download', 'edit');

-- ═══════════════════════════════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════════════════════════════

-- Directories
CREATE TABLE directories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    parent_id UUID REFERENCES directories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- File blobs (actual file storage with deduplication)
CREATE TABLE file_blobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checksum VARCHAR(64) NOT NULL UNIQUE,
    size BIGINT NOT NULL,
    storage_backend storage_backend_type NOT NULL DEFAULT 's3',
    storage_key VARCHAR(512) NOT NULL,
    ref_count INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Files
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    directory_id UUID REFERENCES directories(id) ON DELETE SET NULL,
    blob_id UUID REFERENCES file_blobs(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    checksum VARCHAR(64),
    is_public BOOLEAN DEFAULT FALSE,
    download_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- File versions (version history)
CREATE TABLE file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    blob_id UUID NOT NULL REFERENCES file_blobs(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    comment TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Thumbnails
CREATE TABLE thumbnails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    size thumbnail_size_type NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    storage_backend storage_backend_type NOT NULL DEFAULT 's3',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Share links
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_by UUID NOT NULL,
    permission share_link_permission_type NOT NULL DEFAULT 'view',
    max_downloads INTEGER,
    download_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Downloads (tracking)
CREATE TABLE downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Storage quotas
CREATE TABLE storage_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    used_bytes BIGINT NOT NULL DEFAULT 0,
    quota_bytes BIGINT NOT NULL DEFAULT 10737418240,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Directories
CREATE INDEX idx_directories_user_id ON directories(user_id);
CREATE INDEX idx_directories_parent_id ON directories(parent_id);
CREATE INDEX idx_directories_path ON directories(path);
CREATE INDEX idx_directories_is_public ON directories(is_public);

-- File blobs
CREATE INDEX idx_file_blobs_checksum ON file_blobs(checksum);
CREATE INDEX idx_file_blobs_storage_backend ON file_blobs(storage_backend);
CREATE INDEX idx_file_blobs_ref_count ON file_blobs(ref_count);
CREATE INDEX idx_file_blobs_size ON file_blobs(size);

-- Files
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_directory_id ON files(directory_id);
CREATE INDEX idx_files_blob_id ON files(blob_id);
CREATE INDEX idx_files_name ON files(name);
CREATE INDEX idx_files_path ON files(path);
CREATE INDEX idx_files_mime_type ON files(mime_type);
CREATE INDEX idx_files_checksum ON files(checksum);
CREATE INDEX idx_files_is_public ON files(is_public);
CREATE INDEX idx_files_created_at ON files(created_at);
CREATE INDEX idx_files_updated_at ON files(updated_at);

-- File versions
CREATE INDEX idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX idx_file_versions_blob_id ON file_versions(blob_id);
CREATE INDEX idx_file_versions_version_number ON file_versions(version_number);
CREATE INDEX idx_file_versions_created_at ON file_versions(created_at);

-- Thumbnails
CREATE INDEX idx_thumbnails_file_id ON thumbnails(file_id);
CREATE UNIQUE INDEX idx_thumbnails_file_size ON thumbnails(file_id, size);

-- Share links
CREATE INDEX idx_share_links_file_id ON share_links(file_id);
CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_created_by ON share_links(created_by);
CREATE INDEX idx_share_links_expires_at ON share_links(expires_at);
CREATE INDEX idx_share_links_is_active ON share_links(is_active);

-- Downloads
CREATE INDEX idx_downloads_file_id ON downloads(file_id);
CREATE INDEX idx_downloads_user_id ON downloads(user_id);
CREATE INDEX idx_downloads_downloaded_at ON downloads(downloaded_at);
CREATE INDEX idx_downloads_ip_address ON downloads(ip_address);

-- Storage quotas
CREATE UNIQUE INDEX idx_storage_quotas_user_id ON storage_quotas(user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════════════

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════

-- Auto-update updated_at on directories
CREATE TRIGGER update_directories_updated_at
    BEFORE UPDATE ON directories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on file_blobs
CREATE TRIGGER update_file_blobs_updated_at
    BEFORE UPDATE ON file_blobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on files
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on thumbnails
CREATE TRIGGER update_thumbnails_updated_at
    BEFORE UPDATE ON thumbnails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on share_links
CREATE TRIGGER update_share_links_updated_at
    BEFORE UPDATE ON share_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on storage_quotas
CREATE TRIGGER update_storage_quotas_updated_at
    BEFORE UPDATE ON storage_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════════════════════

-- Active files with blob information
CREATE OR REPLACE VIEW active_files_view AS
SELECT
    f.id,
    f.user_id,
    f.directory_id,
    f.name,
    f.path,
    f.size,
    f.mime_type,
    f.checksum,
    f.is_public,
    f.download_count,
    f.created_at,
    f.updated_at,
    fb.storage_backend,
    fb.storage_key,
    fb.ref_count
FROM files f
JOIN file_blobs fb ON f.blob_id = fb.id;

-- User storage usage
CREATE OR REPLACE VIEW user_storage_usage AS
SELECT
    f.user_id,
    COUNT(f.id) as file_count,
    SUM(f.size) as total_size,
    COUNT(DISTINCT fb.checksum) as unique_files
FROM files f
JOIN file_blobs fb ON f.blob_id = fb.id
GROUP BY f.user_id;

-- Expired share links
CREATE OR REPLACE VIEW expired_share_links AS
SELECT *
FROM share_links
WHERE expires_at IS NOT NULL
  AND expires_at < CURRENT_TIMESTAMP
  AND is_active = TRUE;

-- Unreferenced blobs (candidates for cleanup)
CREATE OR REPLACE VIEW unreferenced_blobs AS
SELECT *
FROM file_blobs
WHERE ref_count = 0
  AND updated_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- ═══════════════════════════════════════════════════════════════════════
-- Comments
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE directories IS 'Directory hierarchy for organizing files';
COMMENT ON TABLE file_blobs IS 'Physical file storage with deduplication support';
COMMENT ON TABLE files IS 'File metadata and references';
COMMENT ON TABLE file_versions IS 'Version history for files';
COMMENT ON TABLE thumbnails IS 'Thumbnail cache for preview images';
COMMENT ON TABLE share_links IS 'Public sharing links for files';
COMMENT ON TABLE downloads IS 'Download tracking and analytics';
COMMENT ON TABLE storage_quotas IS 'Per-user storage quotas';

COMMENT ON COLUMN file_blobs.checksum IS 'SHA256 hash for content-based deduplication';
COMMENT ON COLUMN file_blobs.ref_count IS 'Number of files referencing this blob';
COMMENT ON COLUMN files.blob_id IS 'Reference to actual file content (allows deduplication)';
COMMENT ON COLUMN share_links.token IS 'Unique token for accessing shared files';
COMMENT ON COLUMN share_links.max_downloads IS 'Maximum number of downloads allowed (null = unlimited)';

-- ═══════════════════════════════════════════════════════════════════════
-- Sample Data (Optional - for testing)
-- ═══════════════════════════════════════════════════════════════════════

-- Uncomment to insert sample data
/*
-- Sample storage quota
INSERT INTO storage_quotas (user_id, used_bytes, quota_bytes)
VALUES
    ('00000000-0000-0000-0000-000000000001', 0, 10737418240);
*/

-- ═══════════════════════════════════════════════════════════════════════
-- Maintenance Queries
-- ═══════════════════════════════════════════════════════════════════════

-- Find orphaned blobs
-- SELECT * FROM unreferenced_blobs;

-- Calculate storage usage
-- SELECT user_id, total_size FROM user_storage_usage ORDER BY total_size DESC;

-- Find duplicate files (same content)
-- SELECT checksum, COUNT(*) as file_count
-- FROM files
-- GROUP BY checksum
-- HAVING COUNT(*) > 1;

-- Clean up expired share links
-- UPDATE share_links SET is_active = FALSE WHERE id IN (SELECT id FROM expired_share_links);
