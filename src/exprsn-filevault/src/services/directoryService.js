/**
 * ═══════════════════════════════════════════════════════════════════════
 * Directory Service - Directory management
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Directory, File, sequelize } = require('../models');
const logger = require('../utils/logger');

/**
 * Create directory
 */
async function createDirectory(userId, name, parentId = null) {
  try {
    let path;

    if (parentId) {
      const parent = await Directory.findOne({ where: { id: parentId, userId } });
      if (!parent) {
        throw new Error('PARENT_DIRECTORY_NOT_FOUND');
      }
      path = `${parent.path}/${name}`;
    } else {
      path = `/${name}`;
    }

    // Check if directory already exists
    const existing = await Directory.findOne({ where: { path, userId } });
    if (existing) {
      throw new Error('DIRECTORY_ALREADY_EXISTS');
    }

    const directory = await Directory.create({
      userId,
      parentId,
      name,
      path
    });

    logger.info(`Directory created: ${directory.id} (${path})`);
    return directory;
  } catch (error) {
    logger.error('Failed to create directory:', error);
    throw error;
  }
}

/**
 * Get directory by ID
 */
async function getDirectory(directoryId, userId) {
  const directory = await Directory.findOne({
    where: { id: directoryId, userId, isDeleted: false },
    include: [
      { model: Directory, as: 'parent' },
      { model: Directory, as: 'subdirectories', where: { isDeleted: false }, required: false },
      { model: File, as: 'files', where: { isDeleted: false }, required: false }
    ]
  });

  if (!directory) {
    throw new Error('DIRECTORY_NOT_FOUND');
  }

  return directory;
}

/**
 * List directory contents
 */
async function listDirectoryContents(userId, directoryId = null) {
  const [subdirectories, files] = await Promise.all([
    Directory.findAll({
      where: { userId, parentId: directoryId, isDeleted: false },
      order: [['name', 'ASC']]
    }),
    File.findAll({
      where: { userId, directoryId, isDeleted: false },
      order: [['name', 'ASC']]
    })
  ]);

  return { subdirectories, files };
}

/**
 * Rename directory
 */
async function renameDirectory(directoryId, userId, newName) {
  const transaction = await sequelize.transaction();

  try {
    const directory = await Directory.findOne({
      where: { id: directoryId, userId },
      transaction
    });

    if (!directory) {
      throw new Error('DIRECTORY_NOT_FOUND');
    }

    const oldPath = directory.path;
    const newPath = directory.parentId
      ? `${oldPath.substring(0, oldPath.lastIndexOf('/'))}/${newName}`
      : `/${newName}`;

    // Update directory
    await directory.update({ name: newName, path: newPath }, { transaction });

    // Update all subdirectories and files with new path
    await updateDescendantPaths(directory.id, oldPath, newPath, transaction);

    await transaction.commit();
    logger.info(`Directory renamed: ${directoryId} to ${newName}`);

    return directory;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to rename directory:', error);
    throw error;
  }
}

/**
 * Move directory
 */
async function moveDirectory(directoryId, userId, newParentId) {
  const transaction = await sequelize.transaction();

  try {
    const directory = await Directory.findOne({
      where: { id: directoryId, userId },
      transaction
    });

    if (!directory) {
      throw new Error('DIRECTORY_NOT_FOUND');
    }

    // Verify new parent exists
    if (newParentId) {
      const newParent = await Directory.findOne({
        where: { id: newParentId, userId },
        transaction
      });

      if (!newParent) {
        throw new Error('PARENT_DIRECTORY_NOT_FOUND');
      }

      // Prevent moving directory into itself or its descendants
      if (newParent.path.startsWith(directory.path)) {
        throw new Error('CANNOT_MOVE_INTO_DESCENDANT');
      }
    }

    const oldPath = directory.path;
    const newPath = newParentId
      ? `${newParent.path}/${directory.name}`
      : `/${directory.name}`;

    // Update directory
    await directory.update({ parentId: newParentId, path: newPath }, { transaction });

    // Update all subdirectories and files
    await updateDescendantPaths(directory.id, oldPath, newPath, transaction);

    await transaction.commit();
    logger.info(`Directory moved: ${directoryId} to ${newPath}`);

    return directory;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to move directory:', error);
    throw error;
  }
}

/**
 * Delete directory (soft delete)
 */
async function deleteDirectory(directoryId, userId, recursive = false) {
  const transaction = await sequelize.transaction();

  try {
    const directory = await Directory.findOne({
      where: { id: directoryId, userId },
      transaction
    });

    if (!directory) {
      throw new Error('DIRECTORY_NOT_FOUND');
    }

    if (!recursive) {
      // Check if directory is empty
      const [subdirCount, fileCount] = await Promise.all([
        Directory.count({ where: { parentId: directoryId, isDeleted: false }, transaction }),
        File.count({ where: { directoryId, isDeleted: false }, transaction })
      ]);

      if (subdirCount > 0 || fileCount > 0) {
        throw new Error('DIRECTORY_NOT_EMPTY');
      }
    }

    // Soft delete directory
    await directory.update({
      isDeleted: true,
      deletedAt: new Date()
    }, { transaction });

    if (recursive) {
      // Recursively delete subdirectories and files
      await deleteDescendants(directory.id, transaction);
    }

    await transaction.commit();
    logger.info(`Directory deleted: ${directoryId}`);

    return true;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to delete directory:', error);
    throw error;
  }
}

/**
 * Helper: Update paths of all descendants
 */
async function updateDescendantPaths(directoryId, oldPath, newPath, transaction) {
  // Update subdirectories
  const subdirs = await Directory.findAll({
    where: {
      path: { [sequelize.Op.like]: `${oldPath}/%` }
    },
    transaction
  });

  for (const subdir of subdirs) {
    const updatedPath = subdir.path.replace(oldPath, newPath);
    await subdir.update({ path: updatedPath }, { transaction });
  }

  // Update files
  const files = await File.findAll({
    where: {
      path: { [sequelize.Op.like]: `${oldPath}/%` }
    },
    transaction
  });

  for (const file of files) {
    const updatedPath = file.path.replace(oldPath, newPath);
    await file.update({ path: updatedPath }, { transaction });
  }
}

/**
 * Helper: Recursively delete descendants
 */
async function deleteDescendants(directoryId, transaction) {
  const now = new Date();

  // Get all subdirectories
  const subdirs = await Directory.findAll({
    where: { parentId: directoryId, isDeleted: false },
    transaction
  });

  // Recursively delete subdirectories
  for (const subdir of subdirs) {
    await deleteDescendants(subdir.id, transaction);
  }

  // Soft delete all subdirectories
  await Directory.update(
    { isDeleted: true, deletedAt: now },
    { where: { parentId: directoryId }, transaction }
  );

  // Soft delete all files in directory
  await File.update(
    { isDeleted: true, deletedAt: now },
    { where: { directoryId }, transaction }
  );
}

module.exports = {
  createDirectory,
  getDirectory,
  listDirectoryContents,
  renameDirectory,
  moveDirectory,
  deleteDirectory
};
