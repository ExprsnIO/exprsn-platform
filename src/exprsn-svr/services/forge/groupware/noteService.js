const { Op } = require('sequelize');
const { Note, Folder } = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Note Service
 *
 * Handles note management, snippets, checklists, and bookmarks
 */

/**
 * Create a note
 */
async function createNote({
  title,
  content,
  contentFormat,
  noteType,
  folderId,
  tags,
  isPinned,
  isFavorite,
  isShared,
  sharedWith,
  sharePermissions,
  relatedEntityType,
  relatedEntityId,
  hasReminder,
  reminderAt,
  checklistItems,
  language,
  url,
  isEncrypted,
  attachments,
  color,
  ownerId,
  metadata
}) {
  try {
    const note = await Note.create({
      title,
      content,
      contentFormat: contentFormat || 'plain',
      noteType: noteType || 'note',
      folderId,
      tags: tags || [],
      isPinned: isPinned || false,
      isFavorite: isFavorite || false,
      isShared: isShared || false,
      sharedWith: sharedWith || [],
      sharePermissions: sharePermissions || 'view',
      relatedEntityType,
      relatedEntityId,
      hasReminder: hasReminder || false,
      reminderAt,
      checklistItems: checklistItems || [],
      language,
      url,
      isEncrypted: isEncrypted || false,
      attachments: attachments || [],
      color,
      ownerId,
      metadata: metadata || {}
    });

    logger.info('Note created', {
      noteId: note.id,
      noteType: note.noteType,
      ownerId
    });

    return note;
  } catch (error) {
    logger.error('Failed to create note', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get note by ID
 */
async function getNoteById(id, includeFolder = false) {
  const include = [];

  if (includeFolder) {
    include.push({
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    });
  }

  const note = await Note.findByPk(id, { include });

  if (!note) {
    throw new Error(`Note not found: ${id}`);
  }

  return note;
}

/**
 * List notes for a user
 */
async function listNotes({
  ownerId,
  folderId,
  noteType,
  tags,
  isPinned,
  isFavorite,
  isArchived,
  search,
  limit = 50,
  offset = 0,
  orderBy = 'updatedAt',
  orderDirection = 'DESC'
}) {
  const where = { ownerId };

  if (folderId !== undefined) {
    where.folderId = folderId;
  }

  if (noteType) {
    where.noteType = noteType;
  }

  if (isPinned !== undefined) {
    where.isPinned = isPinned;
  }

  if (isFavorite !== undefined) {
    where.isFavorite = isFavorite;
  }

  if (isArchived !== undefined) {
    where.isArchived = isArchived;
  }

  // Tag filtering (array overlap)
  if (tags && tags.length > 0) {
    where.tags = { [Op.overlap]: tags };
  }

  // Search functionality
  if (search) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${search}%` } },
      { content: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await Note.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['isPinned', 'DESC'], // Pinned notes first
      [orderBy, orderDirection]
    ],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return {
    notes: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update a note
 */
async function updateNote(id, updates) {
  try {
    const note = await getNoteById(id);

    Object.assign(note, updates);
    await note.save();

    logger.info('Note updated', {
      noteId: id,
      updates: Object.keys(updates)
    });

    return note;
  } catch (error) {
    logger.error('Failed to update note', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a note
 */
async function deleteNote(id) {
  try {
    const note = await getNoteById(id);
    await note.destroy();

    logger.info('Note deleted', {
      noteId: id
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete note', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Search notes
 */
async function searchNotes({ query, ownerId, noteType, tags, limit = 50 }) {
  const where = {
    ownerId,
    isArchived: false,
    [Op.or]: [
      { title: { [Op.iLike]: `%${query}%` } },
      { content: { [Op.iLike]: `%${query}%` } },
      { tags: { [Op.contains]: [query] } }
    ]
  };

  if (noteType) {
    where.noteType = noteType;
  }

  if (tags && tags.length > 0) {
    where.tags = { [Op.overlap]: tags };
  }

  const notes = await Note.findAll({
    where,
    limit,
    order: [['updatedAt', 'DESC']],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return notes;
}

/**
 * Add tags to a note
 */
async function addTags(id, newTags) {
  try {
    const note = await getNoteById(id);

    const currentTags = note.tags || [];
    const tagsToAdd = newTags.filter(tag => !currentTags.includes(tag));
    const updatedTags = [...currentTags, ...tagsToAdd];

    note.tags = updatedTags;
    await note.save();

    logger.info('Tags added to note', {
      noteId: id,
      tagsAdded: tagsToAdd.length
    });

    return note;
  } catch (error) {
    logger.error('Failed to add tags', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Remove tags from a note
 */
async function removeTags(id, tagsToRemove) {
  try {
    const note = await getNoteById(id);

    const currentTags = note.tags || [];
    const updatedTags = currentTags.filter(tag => !tagsToRemove.includes(tag));

    note.tags = updatedTags;
    await note.save();

    logger.info('Tags removed from note', {
      noteId: id,
      tagsRemoved: tagsToRemove.length
    });

    return note;
  } catch (error) {
    logger.error('Failed to remove tags', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Toggle note pin status
 */
async function togglePin(id) {
  try {
    const note = await getNoteById(id);
    note.isPinned = !note.isPinned;
    await note.save();

    logger.info('Note pin status toggled', {
      noteId: id,
      isPinned: note.isPinned
    });

    return note;
  } catch (error) {
    logger.error('Failed to toggle pin', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Toggle note favorite status
 */
async function toggleFavorite(id) {
  try {
    const note = await getNoteById(id);
    note.isFavorite = !note.isFavorite;
    await note.save();

    logger.info('Note favorite status toggled', {
      noteId: id,
      isFavorite: note.isFavorite
    });

    return note;
  } catch (error) {
    logger.error('Failed to toggle favorite', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Archive/unarchive a note
 */
async function setArchiveStatus(id, archived) {
  try {
    const note = await getNoteById(id);
    note.isArchived = archived;
    note.archivedAt = archived ? new Date() : null;
    await note.save();

    logger.info('Note archive status changed', {
      noteId: id,
      isArchived: archived
    });

    return note;
  } catch (error) {
    logger.error('Failed to set archive status', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update checklist items
 */
async function updateChecklistItems(id, checklistItems) {
  try {
    const note = await getNoteById(id);

    if (note.noteType !== 'checklist') {
      throw new Error('Note is not a checklist');
    }

    note.checklistItems = checklistItems;
    await note.save();

    logger.info('Checklist items updated', {
      noteId: id,
      itemCount: checklistItems.length
    });

    return note;
  } catch (error) {
    logger.error('Failed to update checklist items', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Toggle checklist item completion
 */
async function toggleChecklistItem(id, itemId) {
  try {
    const note = await getNoteById(id);

    if (note.noteType !== 'checklist') {
      throw new Error('Note is not a checklist');
    }

    const items = note.checklistItems || [];
    const itemIndex = items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      throw new Error(`Checklist item not found: ${itemId}`);
    }

    items[itemIndex].completed = !items[itemIndex].completed;
    note.checklistItems = items;
    await note.save();

    logger.info('Checklist item toggled', {
      noteId: id,
      itemId,
      completed: items[itemIndex].completed
    });

    return note;
  } catch (error) {
    logger.error('Failed to toggle checklist item', {
      noteId: id,
      itemId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get notes by type
 */
async function getNotesByType(ownerId, noteType, limit = 50) {
  const notes = await Note.findAll({
    where: {
      ownerId,
      noteType,
      isArchived: false
    },
    limit,
    order: [
      ['isPinned', 'DESC'],
      ['updatedAt', 'DESC']
    ],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return notes;
}

/**
 * Get pinned notes
 */
async function getPinnedNotes(ownerId, limit = 20) {
  const notes = await Note.findAll({
    where: {
      ownerId,
      isPinned: true,
      isArchived: false
    },
    limit,
    order: [['updatedAt', 'DESC']],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return notes;
}

/**
 * Get favorite notes
 */
async function getFavoriteNotes(ownerId, limit = 50) {
  const notes = await Note.findAll({
    where: {
      ownerId,
      isFavorite: true,
      isArchived: false
    },
    limit,
    order: [['updatedAt', 'DESC']],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return notes;
}

/**
 * Get notes with reminders
 */
async function getNotesWithReminders(ownerId, upcoming = true) {
  const where = {
    ownerId,
    hasReminder: true,
    isArchived: false
  };

  if (upcoming) {
    where.reminderAt = {
      [Op.gte]: new Date(),
      [Op.lte]: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
    };
  }

  const notes = await Note.findAll({
    where,
    order: [['reminderAt', 'ASC']],
    include: [{
      model: Folder,
      as: 'folder',
      attributes: ['id', 'name', 'color']
    }]
  });

  return notes;
}

/**
 * Get note statistics
 */
async function getNoteStatistics(ownerId) {
  const total = await Note.count({ where: { ownerId } });
  const byType = await Note.findAll({
    where: { ownerId, isArchived: false },
    attributes: [
      'noteType',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['noteType']
  });

  const pinned = await Note.count({
    where: { ownerId, isPinned: true, isArchived: false }
  });

  const favorites = await Note.count({
    where: { ownerId, isFavorite: true, isArchived: false }
  });

  const archived = await Note.count({
    where: { ownerId, isArchived: true }
  });

  const withReminders = await Note.count({
    where: { ownerId, hasReminder: true, isArchived: false }
  });

  return {
    total,
    active: total - archived,
    archived,
    byType: byType.map(item => ({
      type: item.noteType,
      count: parseInt(item.dataValues.count)
    })),
    pinned,
    favorites,
    withReminders
  };
}

/**
 * Duplicate a note
 */
async function duplicateNote(id, ownerId) {
  try {
    const original = await getNoteById(id);

    // Create a copy
    const copy = await Note.create({
      title: `${original.title} (Copy)`,
      content: original.content,
      contentFormat: original.contentFormat,
      noteType: original.noteType,
      folderId: original.folderId,
      tags: original.tags || [],
      isPinned: false, // Don't copy pin status
      isFavorite: false, // Don't copy favorite status
      isShared: false, // Don't copy sharing
      sharedWith: [],
      checklistItems: original.checklistItems || [],
      language: original.language,
      url: original.url,
      color: original.color,
      ownerId,
      metadata: original.metadata || {}
    });

    logger.info('Note duplicated', {
      originalId: id,
      copyId: copy.id
    });

    return copy;
  } catch (error) {
    logger.error('Failed to duplicate note', {
      noteId: id,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createNote,
  getNoteById,
  listNotes,
  updateNote,
  deleteNote,
  searchNotes,
  addTags,
  removeTags,
  togglePin,
  toggleFavorite,
  setArchiveStatus,
  updateChecklistItems,
  toggleChecklistItem,
  getNotesByType,
  getPinnedNotes,
  getFavoriteNotes,
  getNotesWithReminders,
  getNoteStatistics,
  duplicateNote
};
