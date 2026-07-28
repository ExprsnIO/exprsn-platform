'use strict';

/**
 * BUG-057 — every FileVault upload 500'd because associations named their
 * foreign key by DB COLUMN (`file_id`) while the model attribute is camelCase
 * (`fileId`, `field: 'file_id'`). Sequelize found no attribute literally named
 * `file_id`, registered a duplicate snake_case attribute, and — because the
 * hasMany passed `allowNull: false` — validation failed with
 * `notNull Violation: FileVersion.file_id cannot be null` on every create,
 * even though code correctly set `fileId` (fileService.js upload path).
 *
 * These tests load the REAL model files with an unconnected Sequelize (model
 * definition and association wiring never touch the DB), exactly as
 * src/models/index.js wires them, and assert:
 *   1. no duplicate snake_case attribute exists next to a camelCase one,
 *   2. the upload-path shape (create FileVersion with `fileId`) validates,
 *   3. the generated SQL column names are UNCHANGED (identifierField).
 */

const { Sequelize } = require('sequelize');

function loadModels() {
  const sequelize = new Sequelize('fv_test', 'fv', 'fv', {
    host: 'localhost',
    dialect: 'postgres',
    logging: false,
  });
  const { DataTypes } = Sequelize;
  const models = {
    File: require('../../src/models/File')(sequelize, DataTypes),
    FileVersion: require('../../src/models/FileVersion')(sequelize, DataTypes),
    Directory: require('../../src/models/Directory')(sequelize, DataTypes),
    ShareLink: require('../../src/models/ShareLink')(sequelize, DataTypes),
    FileBlob: require('../../src/models/FileBlob')(sequelize, DataTypes),
    Thumbnail: require('../../src/models/Thumbnail')(sequelize, DataTypes),
    Download: require('../../src/models/Download')(sequelize, DataTypes),
    StorageQuota: require('../../src/models/StorageQuota')(sequelize, DataTypes),
    FileModeration: require('../../src/models/FileModeration')(sequelize, DataTypes),
  };
  Object.values(models)
    .filter((m) => typeof m.associate === 'function')
    .forEach((m) => m.associate(models));
  return models;
}

const models = loadModels();
const UUID = '11111111-2222-4333-8444-555555555555';

describe('BUG-057 — association FKs are named by attribute, not column', () => {
  test('no duplicate snake_case attribute is registered next to a camelCase one', () => {
    // Each pair: [model, camel attribute, snake column]. Pre-fix, the snake
    // name showed up as a second rawAttribute and shadowed the real one.
    const pairs = [
      [models.FileVersion, 'fileId', 'file_id'],
      [models.ShareLink, 'fileId', 'file_id'],
      [models.FileModeration, 'fileId', 'file_id'],
      [models.File, 'directoryId', 'directory_id'],
      [models.Directory, 'parentId', 'parent_id'],
    ];
    for (const [model, camel, snake] of pairs) {
      expect(model.rawAttributes[camel]).toBeDefined();
      expect(model.rawAttributes[camel].field).toBe(snake);
      expect(model.rawAttributes[snake]).toBeUndefined();
    }
  });

  test('upload-path shape validates: FileVersion.create sets fileId (fileService.js)', async () => {
    // Pre-fix this rejected with `notNull Violation: FileVersion.file_id
    // cannot be null` — the exact 500 every upload hit.
    const version = models.FileVersion.build({
      fileId: UUID,
      version: 1,
      userId: UUID,
      size: 10,
      contentHash: 'a'.repeat(64),
      storageBackend: 'disk',
      storageKey: 'ab/cd/hash',
      metadata: {},
    });
    await expect(version.validate()).resolves.toBeDefined();
    expect(version.fileId).toBe(UUID);
  });

  test('ShareLink with fileId validates (share-create path)', async () => {
    const link = models.ShareLink.build({ fileId: UUID, createdBy: UUID });
    await link.validate({ fields: ['fileId'] });
    expect(link.fileId).toBe(UUID);
  });

  test('generated SQL column names are unchanged (identifierField stays snake_case)', () => {
    expect(models.File.associations.versions.identifierField).toBe('file_id');
    expect(models.File.associations.shareLinks.identifierField).toBe('file_id');
    expect(models.File.associations.moderation.identifierField).toBe('file_id');
    expect(models.FileVersion.associations.file.identifierField).toBe('file_id');
    expect(models.ShareLink.associations.file.identifierField).toBe('file_id');
    expect(models.File.associations.directory.identifierField).toBe('directory_id');
    expect(models.Directory.associations.parent.identifierField).toBe('parent_id');
    expect(models.Directory.associations.subdirectories.identifierField).toBe('parent_id');
    expect(models.Directory.associations.files.identifierField).toBe('directory_id');
  });

  test('natively snake_case models are untouched (Download/Thumbnail use file_id as attribute)', () => {
    // These models declare `file_id` as their real attribute name — the
    // by-column foreignKey name is CORRECT there and must not be "fixed".
    expect(models.Download.rawAttributes.file_id).toBeDefined();
    expect(models.Thumbnail.rawAttributes.file_id).toBeDefined();
    expect(models.Download.associations.file.identifierField).toBe('file_id');
    expect(models.Thumbnail.associations.file.identifierField).toBe('file_id');
  });
});
