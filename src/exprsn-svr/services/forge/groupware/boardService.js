const { Op } = require('sequelize');
const { Board, BoardColumn, BoardCard, Task, TimeEntry } = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Board Service
 *
 * Handles Kanban board operations including board, column, and card management
 */

// ===== Board Operations =====

/**
 * Create a new board
 */
async function createBoard({
  name,
  description,
  boardType,
  visibility,
  ownerId,
  projectId,
  teamId,
  settings,
  backgroundColor,
  backgroundImage,
  tags
}) {
  try {
    const board = await Board.create({
      name,
      description,
      boardType: boardType || 'kanban',
      visibility: visibility || 'team',
      ownerId,
      projectId,
      teamId,
      settings: settings || {},
      backgroundColor,
      backgroundImage,
      tags: tags || []
    });

    // Create default columns based on board type
    await createDefaultColumns(board.id, boardType || 'kanban');

    logger.info('Board created', {
      boardId: board.id,
      name,
      ownerId
    });

    return await getBoardById(board.id);
  } catch (error) {
    logger.error('Failed to create board', {
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create default columns for a board based on type
 */
async function createDefaultColumns(boardId, boardType) {
  const columnConfigs = {
    kanban: [
      { name: 'Backlog', position: 0, taskStatus: 'pending', isDefaultColumn: true },
      { name: 'In Progress', position: 1, taskStatus: 'in_progress' },
      { name: 'Done', position: 2, taskStatus: 'completed', isCompleteColumn: true }
    ],
    scrum: [
      { name: 'To Do', position: 0, taskStatus: 'pending', isDefaultColumn: true },
      { name: 'In Progress', position: 1, taskStatus: 'in_progress', wipLimit: 5 },
      { name: 'Review', position: 2, taskStatus: 'in_progress' },
      { name: 'Done', position: 3, taskStatus: 'completed', isCompleteColumn: true }
    ],
    support: [
      { name: 'New', position: 0, taskStatus: 'pending', isDefaultColumn: true },
      { name: 'Triaged', position: 1, taskStatus: 'in_progress' },
      { name: 'In Progress', position: 2, taskStatus: 'in_progress' },
      { name: 'Waiting', position: 3, taskStatus: 'in_progress' },
      { name: 'Resolved', position: 4, taskStatus: 'completed', isCompleteColumn: true }
    ],
    custom: [
      { name: 'To Do', position: 0, taskStatus: 'pending', isDefaultColumn: true },
      { name: 'Done', position: 1, taskStatus: 'completed', isCompleteColumn: true }
    ]
  };

  const columns = columnConfigs[boardType] || columnConfigs.custom;

  for (const col of columns) {
    await BoardColumn.create({
      boardId,
      ...col
    });
  }
}

/**
 * Get board by ID
 */
async function getBoardById(id, includeDetails = true) {
  const include = [];

  if (includeDetails) {
    include.push(
      {
        model: BoardColumn,
        as: 'columns',
        where: { isArchived: false },
        required: false,
        order: [['position', 'ASC']],
        include: [
          {
            model: BoardCard,
            as: 'cards',
            where: { isArchived: false },
            required: false,
            order: [['position', 'ASC']],
            include: [
              {
                model: Task,
                as: 'task',
                attributes: ['id', 'title', 'priority', 'dueDate', 'status']
              }
            ]
          }
        ]
      }
    );
  }

  const board = await Board.findByPk(id, { include });

  if (!board) {
    throw new Error(`Board not found: ${id}`);
  }

  return board;
}

/**
 * List boards
 */
async function listBoards({
  ownerId,
  projectId,
  teamId,
  boardType,
  status,
  visibility,
  search,
  limit = 50,
  offset = 0
}) {
  const where = {};

  if (ownerId) {
    where.ownerId = ownerId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  if (teamId) {
    where.teamId = teamId;
  }

  if (boardType) {
    where.boardType = boardType;
  }

  if (status) {
    where.status = status;
  } else {
    where.status = { [Op.ne]: 'archived' };
  }

  if (visibility) {
    where.visibility = visibility;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await Board.findAndCountAll({
    where,
    limit,
    offset,
    order: [['updatedAt', 'DESC']],
    include: [
      {
        model: BoardColumn,
        as: 'columns',
        attributes: ['id', 'name', 'position'],
        where: { isArchived: false },
        required: false
      }
    ]
  });

  return {
    boards: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update board
 */
async function updateBoard(id, updates) {
  try {
    const board = await getBoardById(id, false);

    await board.update(updates);

    logger.info('Board updated', {
      boardId: id,
      updates: Object.keys(updates)
    });

    return await getBoardById(id);
  } catch (error) {
    logger.error('Failed to update board', {
      boardId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete board (archive)
 */
async function deleteBoard(id, userId) {
  try {
    const board = await getBoardById(id, false);

    await board.update({
      status: 'archived',
      archivedAt: new Date(),
      archivedById: userId
    });

    logger.info('Board archived', { boardId: id, userId });

    return { success: true, message: 'Board archived successfully' };
  } catch (error) {
    logger.error('Failed to archive board', {
      boardId: id,
      error: error.message
    });
    throw error;
  }
}

// ===== Column Operations =====

/**
 * Create board column
 */
async function createColumn({
  boardId,
  name,
  description,
  position,
  color,
  taskStatus,
  wipLimit,
  isCompleteColumn,
  isDefaultColumn
}) {
  try {
    // If no position specified, add to end
    if (position === undefined) {
      const maxPosition = await BoardColumn.max('position', {
        where: { boardId, isArchived: false }
      });
      position = (maxPosition || -1) + 1;
    }

    const column = await BoardColumn.create({
      boardId,
      name,
      description,
      position,
      color,
      taskStatus,
      wipLimit,
      isCompleteColumn: isCompleteColumn || false,
      isDefaultColumn: isDefaultColumn || false
    });

    logger.info('Column created', {
      columnId: column.id,
      boardId,
      name
    });

    return column;
  } catch (error) {
    logger.error('Failed to create column', {
      boardId,
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update column
 */
async function updateColumn(id, updates) {
  try {
    const column = await BoardColumn.findByPk(id);

    if (!column) {
      throw new Error(`Column not found: ${id}`);
    }

    await column.update(updates);

    logger.info('Column updated', {
      columnId: id,
      updates: Object.keys(updates)
    });

    return column;
  } catch (error) {
    logger.error('Failed to update column', {
      columnId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Move column to new position
 */
async function moveColumn(columnId, newPosition) {
  try {
    const column = await BoardColumn.findByPk(columnId);

    if (!column) {
      throw new Error(`Column not found: ${columnId}`);
    }

    const oldPosition = column.position;

    // Get all columns in the board
    const columns = await BoardColumn.findAll({
      where: {
        boardId: column.boardId,
        isArchived: false
      },
      order: [['position', 'ASC']]
    });

    // Reorder columns
    if (newPosition < oldPosition) {
      // Moving left
      for (const col of columns) {
        if (col.id === columnId) {
          col.position = newPosition;
        } else if (col.position >= newPosition && col.position < oldPosition) {
          col.position += 1;
        }
        await col.save();
      }
    } else if (newPosition > oldPosition) {
      // Moving right
      for (const col of columns) {
        if (col.id === columnId) {
          col.position = newPosition;
        } else if (col.position > oldPosition && col.position <= newPosition) {
          col.position -= 1;
        }
        await col.save();
      }
    }

    logger.info('Column moved', {
      columnId,
      oldPosition,
      newPosition
    });

    return await getBoardById(column.boardId);
  } catch (error) {
    logger.error('Failed to move column', {
      columnId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete column
 */
async function deleteColumn(id) {
  try {
    const column = await BoardColumn.findByPk(id);

    if (!column) {
      throw new Error(`Column not found: ${id}`);
    }

    // Check if column has cards
    const cardCount = await BoardCard.count({
      where: { columnId: id, isArchived: false }
    });

    if (cardCount > 0) {
      throw new Error('Cannot delete column with cards. Move or archive cards first.');
    }

    await column.update({ isArchived: true });

    logger.info('Column archived', { columnId: id });

    return { success: true, message: 'Column archived successfully' };
  } catch (error) {
    logger.error('Failed to archive column', {
      columnId: id,
      error: error.message
    });
    throw error;
  }
}

// ===== Card Operations =====

/**
 * Add card to board
 */
async function addCard({
  boardId,
  columnId,
  taskId,
  position,
  addedById,
  coverImage,
  coverColor,
  labels
}) {
  try {
    // Verify task exists
    const task = await Task.findByPk(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // If no column specified, use default column
    if (!columnId) {
      const defaultColumn = await BoardColumn.findOne({
        where: { boardId, isDefaultColumn: true, isArchived: false }
      });

      if (!defaultColumn) {
        throw new Error('No default column found for board');
      }

      columnId = defaultColumn.id;
    }

    // If no position specified, add to end of column
    if (position === undefined) {
      const maxPosition = await BoardCard.max('position', {
        where: { columnId, isArchived: false }
      });
      position = (maxPosition || -1) + 1;
    }

    const card = await BoardCard.create({
      boardId,
      columnId,
      taskId,
      position,
      addedById,
      addedAt: new Date(),
      coverImage,
      coverColor,
      labels: labels || []
    });

    // Update column card count
    await updateColumnCardCount(columnId);

    // Update board card count
    await updateBoardCardCount(boardId);

    logger.info('Card added to board', {
      cardId: card.id,
      boardId,
      taskId
    });

    return await BoardCard.findByPk(card.id, {
      include: [
        {
          model: Task,
          as: 'task'
        }
      ]
    });
  } catch (error) {
    logger.error('Failed to add card', {
      boardId,
      taskId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Move card to different column/position
 */
async function moveCard(cardId, { columnId, position, swimlaneId }) {
  try {
    const card = await BoardCard.findByPk(cardId);

    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    const oldColumnId = card.columnId;
    const oldPosition = card.position;

    // Get target column
    const targetColumn = await BoardColumn.findByPk(columnId);

    if (!targetColumn) {
      throw new Error(`Column not found: ${columnId}`);
    }

    // Check WIP limit
    if (targetColumn.wipLimit) {
      const cardCount = await BoardCard.count({
        where: { columnId, isArchived: false }
      });

      if (cardCount >= targetColumn.wipLimit && columnId !== oldColumnId) {
        throw new Error(`Column has reached WIP limit of ${targetColumn.wipLimit}`);
      }
    }

    // Update card position in old column
    if (oldColumnId !== columnId) {
      await BoardCard.increment('position', {
        by: -1,
        where: {
          columnId: oldColumnId,
          position: { [Op.gt]: oldPosition },
          isArchived: false
        }
      });
    }

    // Make room in new column
    await BoardCard.increment('position', {
      by: 1,
      where: {
        columnId,
        position: { [Op.gte]: position },
        isArchived: false,
        id: { [Op.ne]: cardId }
      }
    });

    // Update card
    await card.update({
      columnId,
      position,
      swimlaneId: swimlaneId !== undefined ? swimlaneId : card.swimlaneId,
      previousColumnId: oldColumnId,
      movedAt: new Date(),
      totalMoves: card.totalMoves + 1,
      timeInColumn: 0
    });

    // Update column card counts
    if (oldColumnId !== columnId) {
      await updateColumnCardCount(oldColumnId);
      await updateColumnCardCount(columnId);
    }

    // If moved to complete column, update task status
    if (targetColumn.isCompleteColumn) {
      const task = await Task.findByPk(card.taskId);
      if (task && task.status !== 'completed') {
        await task.update({
          status: 'completed',
          completedAt: new Date()
        });
      }
    }

    logger.info('Card moved', {
      cardId,
      oldColumnId,
      newColumnId: columnId,
      position
    });

    return await BoardCard.findByPk(cardId, {
      include: [
        {
          model: Task,
          as: 'task'
        }
      ]
    });
  } catch (error) {
    logger.error('Failed to move card', {
      cardId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update card
 */
async function updateCard(cardId, updates) {
  try {
    const card = await BoardCard.findByPk(cardId);

    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    await card.update(updates);

    logger.info('Card updated', {
      cardId,
      updates: Object.keys(updates)
    });

    return await BoardCard.findByPk(cardId, {
      include: [
        {
          model: Task,
          as: 'task'
        }
      ]
    });
  } catch (error) {
    logger.error('Failed to update card', {
      cardId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Remove card from board
 */
async function removeCard(cardId) {
  try {
    const card = await BoardCard.findByPk(cardId);

    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    await card.update({ isArchived: true, archivedAt: new Date() });

    // Update column and board card counts
    await updateColumnCardCount(card.columnId);
    await updateBoardCardCount(card.boardId);

    logger.info('Card removed from board', { cardId });

    return { success: true, message: 'Card removed successfully' };
  } catch (error) {
    logger.error('Failed to remove card', {
      cardId,
      error: error.message
    });
    throw error;
  }
}

// ===== Helper Functions =====

/**
 * Update column card count
 */
async function updateColumnCardCount(columnId) {
  const count = await BoardCard.count({
    where: { columnId, isArchived: false }
  });

  await BoardColumn.update(
    { cardCount: count },
    { where: { id: columnId } }
  );
}

/**
 * Update board card count
 */
async function updateBoardCardCount(boardId) {
  const count = await BoardCard.count({
    where: { boardId, isArchived: false }
  });

  await Board.update(
    { cardCount: count },
    { where: { id: boardId } }
  );
}

/**
 * Get board statistics
 */
async function getBoardStatistics(boardId) {
  const board = await Board.findByPk(boardId);

  if (!board) {
    throw new Error(`Board not found: ${boardId}`);
  }

  const columns = await BoardColumn.findAll({
    where: { boardId, isArchived: false },
    include: [
      {
        model: BoardCard,
        as: 'cards',
        where: { isArchived: false },
        required: false,
        include: [
          {
            model: Task,
            as: 'task',
            attributes: ['id', 'status', 'priority']
          }
        ]
      }
    ]
  });

  const stats = {
    totalCards: 0,
    cardsByColumn: {},
    cardsByStatus: { pending: 0, in_progress: 0, completed: 0, cancelled: 0 },
    cardsByPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
    blockedCards: 0
  };

  for (const column of columns) {
    stats.cardsByColumn[column.name] = column.cards.length;
    stats.totalCards += column.cards.length;

    for (const card of column.cards) {
      if (card.isBlocked) {
        stats.blockedCards++;
      }

      if (card.task) {
        stats.cardsByStatus[card.task.status]++;
        stats.cardsByPriority[card.task.priority]++;
      }
    }
  }

  return stats;
}

module.exports = {
  // Board operations
  createBoard,
  getBoardById,
  listBoards,
  updateBoard,
  deleteBoard,
  getBoardStatistics,

  // Column operations
  createColumn,
  updateColumn,
  moveColumn,
  deleteColumn,

  // Card operations
  addCard,
  moveCard,
  updateCard,
  removeCard
};
