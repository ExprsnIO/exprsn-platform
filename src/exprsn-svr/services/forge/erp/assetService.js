const { Asset, MaintenanceSchedule, Employee, Department, Supplier } = require('../../../models/forge');
const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const logger = require('../../../utils/logger');

/**
 * Asset Management Service
 * Handles Fixed Assets, Depreciation, and Maintenance Scheduling
 */

// ===== Asset Management =====

/**
 * Generate asset number
 */
async function generateAssetNumber() {
  const year = new Date().getFullYear();
  const prefix = `AST-${year}-`;

  const lastAsset = await Asset.findOne({
    where: {
      assetNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastAsset) {
    const lastNumber = lastAsset.assetNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create asset
 */
async function createAsset(data) {
  try {
    if (!data.assetNumber) {
      data.assetNumber = await generateAssetNumber();
    }

    // Set current value to purchase price initially
    if (!data.currentValue) {
      data.currentValue = data.purchasePrice;
    }

    const asset = await Asset.create({
      ...data,
      status: data.status || 'active',
      accumulatedDepreciation: 0
    });

    logger.info('Asset created', {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      assetName: asset.assetName
    });

    return asset;
  } catch (error) {
    logger.error('Failed to create asset', { error: error.message });
    throw error;
  }
}

/**
 * Get asset by ID
 */
async function getAssetById(id) {
  try {
    const asset = await Asset.findByPk(id, {
      include: [
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'departmentName']
        },
        {
          model: Employee,
          as: 'assignedEmployee',
          attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
        },
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'supplierName', 'email']
        },
        {
          model: MaintenanceSchedule,
          as: 'maintenanceSchedules',
          attributes: ['id', 'scheduleNumber', 'maintenanceType', 'nextDueDate', 'status']
        }
      ]
    });

    if (!asset) {
      throw new Error('Asset not found');
    }

    return asset;
  } catch (error) {
    logger.error('Failed to get asset', { error: error.message, assetId: id });
    throw error;
  }
}

/**
 * List assets with filters
 */
async function listAssets(filters = {}) {
  try {
    const {
      assetType,
      status,
      departmentId,
      assignedToEmployeeId,
      search,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (assetType) where.assetType = assetType;
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (assignedToEmployeeId) where.assignedToEmployeeId = assignedToEmployeeId;
    if (search) {
      where[Op.or] = [
        { assetName: { [Op.iLike]: `%${search}%` } },
        { assetNumber: { [Op.iLike]: `%${search}%` } },
        { serialNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Asset.findAndCountAll({
      where,
      include: [
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'departmentName']
        },
        {
          model: Employee,
          as: 'assignedEmployee',
          attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
        }
      ],
      order: [['assetNumber', 'ASC']],
      limit,
      offset
    });

    return {
      assets: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list assets', { error: error.message });
    throw error;
  }
}

/**
 * Update asset
 */
async function updateAsset(id, updates) {
  try {
    const asset = await Asset.findByPk(id);

    if (!asset) {
      throw new Error('Asset not found');
    }

    await asset.update(updates);

    logger.info('Asset updated', {
      assetId: asset.id,
      assetNumber: asset.assetNumber
    });

    return asset;
  } catch (error) {
    logger.error('Failed to update asset', { error: error.message, assetId: id });
    throw error;
  }
}

/**
 * Dispose asset
 */
async function disposeAsset(id, disposalData) {
  try {
    const asset = await Asset.findByPk(id);

    if (!asset) {
      throw new Error('Asset not found');
    }

    await asset.update({
      status: 'disposed',
      disposalDate: disposalData.disposalDate || new Date(),
      disposalMethod: disposalData.disposalMethod,
      disposalValue: disposalData.disposalValue || 0,
      disposalNotes: disposalData.disposalNotes
    });

    logger.info('Asset disposed', {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      disposalMethod: disposalData.disposalMethod
    });

    return asset;
  } catch (error) {
    logger.error('Failed to dispose asset', { error: error.message, assetId: id });
    throw error;
  }
}

/**
 * Calculate depreciation for an asset
 */
async function calculateDepreciation(assetId, asOfDate = new Date()) {
  try {
    const asset = await Asset.findByPk(assetId);

    if (!asset) {
      throw new Error('Asset not found');
    }

    if (asset.depreciationMethod === 'none') {
      return {
        assetId: asset.id,
        depreciationMethod: 'none',
        depreciation: 0,
        accumulatedDepreciation: 0,
        bookValue: asset.purchasePrice
      };
    }

    const purchaseDate = new Date(asset.purchaseDate);
    const yearsElapsed = (asOfDate - purchaseDate) / (1000 * 60 * 60 * 24 * 365.25);

    const depreciableAmount = asset.purchasePrice - asset.salvageValue;
    let annualDepreciation = 0;
    let accumulatedDepreciation = 0;

    switch (asset.depreciationMethod) {
      case 'straight_line':
        if (asset.usefulLifeYears) {
          annualDepreciation = depreciableAmount / asset.usefulLifeYears;
          accumulatedDepreciation = Math.min(
            annualDepreciation * yearsElapsed,
            depreciableAmount
          );
        }
        break;

      case 'declining_balance':
        // Double declining balance (200%)
        if (asset.usefulLifeYears) {
          const rate = 2 / asset.usefulLifeYears;
          let bookValue = asset.purchasePrice;

          for (let year = 1; year <= Math.floor(yearsElapsed); year++) {
            const yearDepreciation = bookValue * rate;
            accumulatedDepreciation += yearDepreciation;
            bookValue -= yearDepreciation;

            if (accumulatedDepreciation >= depreciableAmount) {
              accumulatedDepreciation = depreciableAmount;
              break;
            }
          }
        }
        break;

      case 'sum_of_years_digits':
        if (asset.usefulLifeYears) {
          const totalYears = asset.usefulLifeYears;
          const sumOfYears = (totalYears * (totalYears + 1)) / 2;

          for (let year = 1; year <= Math.floor(yearsElapsed) && year <= totalYears; year++) {
            const remainingLife = totalYears - year + 1;
            const yearDepreciation = (remainingLife / sumOfYears) * depreciableAmount;
            accumulatedDepreciation += yearDepreciation;
          }

          accumulatedDepreciation = Math.min(accumulatedDepreciation, depreciableAmount);
        }
        break;

      case 'units_of_production':
        // Would require tracking actual units produced/used
        // Stub for now
        accumulatedDepreciation = 0;
        break;

      default:
        accumulatedDepreciation = 0;
    }

    const bookValue = asset.purchasePrice - accumulatedDepreciation;

    return {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      assetName: asset.assetName,
      purchasePrice: asset.purchasePrice,
      salvageValue: asset.salvageValue,
      depreciableAmount,
      depreciationMethod: asset.depreciationMethod,
      usefulLifeYears: asset.usefulLifeYears,
      yearsElapsed: parseFloat(yearsElapsed.toFixed(2)),
      annualDepreciation: parseFloat(annualDepreciation.toFixed(2)),
      accumulatedDepreciation: parseFloat(accumulatedDepreciation.toFixed(2)),
      bookValue: parseFloat(bookValue.toFixed(2)),
      asOfDate
    };
  } catch (error) {
    logger.error('Failed to calculate depreciation', { error: error.message, assetId });
    throw error;
  }
}

/**
 * Record depreciation for an asset
 */
async function recordDepreciation(assetId) {
  try {
    const depreciation = await calculateDepreciation(assetId);

    const asset = await Asset.findByPk(assetId);
    await asset.update({
      accumulatedDepreciation: depreciation.accumulatedDepreciation,
      currentValue: depreciation.bookValue,
      lastDepreciationDate: new Date()
    });

    logger.info('Depreciation recorded', {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      accumulatedDepreciation: depreciation.accumulatedDepreciation
    });

    return asset;
  } catch (error) {
    logger.error('Failed to record depreciation', { error: error.message, assetId });
    throw error;
  }
}

/**
 * Assign asset to employee
 */
async function assignAsset(assetId, employeeId) {
  try {
    const asset = await Asset.findByPk(assetId);

    if (!asset) {
      throw new Error('Asset not found');
    }

    const employee = await Employee.findByPk(employeeId);
    if (!employee) {
      throw new Error('Employee not found');
    }

    await asset.update({
      assignedToEmployeeId: employeeId,
      assignedDate: new Date(),
      status: 'in_use'
    });

    logger.info('Asset assigned', {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      employeeId
    });

    return asset;
  } catch (error) {
    logger.error('Failed to assign asset', { error: error.message, assetId });
    throw error;
  }
}

// ===== Maintenance Scheduling =====

/**
 * Generate maintenance schedule number
 */
async function generateMaintenanceScheduleNumber() {
  const year = new Date().getFullYear();
  const prefix = `MNT-${year}-`;

  const lastSchedule = await MaintenanceSchedule.findOne({
    where: {
      scheduleNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastSchedule) {
    const lastNumber = lastSchedule.scheduleNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create maintenance schedule
 */
async function createMaintenanceSchedule(data) {
  try {
    const asset = await Asset.findByPk(data.assetId);

    if (!asset) {
      throw new Error('Asset not found');
    }

    if (!data.scheduleNumber) {
      data.scheduleNumber = await generateMaintenanceScheduleNumber();
    }

    // Set next due date if not provided
    if (!data.nextDueDate) {
      data.nextDueDate = data.startDate;
    }

    const schedule = await MaintenanceSchedule.create({
      ...data,
      status: data.status || 'active'
    });

    logger.info('Maintenance schedule created', {
      scheduleId: schedule.id,
      scheduleNumber: schedule.scheduleNumber,
      assetId: data.assetId
    });

    return schedule;
  } catch (error) {
    logger.error('Failed to create maintenance schedule', { error: error.message });
    throw error;
  }
}

/**
 * Get maintenance schedule by ID
 */
async function getMaintenanceScheduleById(id) {
  try {
    const schedule = await MaintenanceSchedule.findByPk(id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          attributes: ['id', 'assetNumber', 'assetName', 'serialNumber']
        },
        {
          model: Employee,
          as: 'assignedEmployee',
          attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
        },
        {
          model: Department,
          as: 'assignedDepartment',
          attributes: ['id', 'departmentName']
        }
      ]
    });

    if (!schedule) {
      throw new Error('Maintenance schedule not found');
    }

    return schedule;
  } catch (error) {
    logger.error('Failed to get maintenance schedule', { error: error.message, scheduleId: id });
    throw error;
  }
}

/**
 * List maintenance schedules
 */
async function listMaintenanceSchedules(filters = {}) {
  try {
    const {
      assetId,
      status,
      maintenanceType,
      priority,
      overdue,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (assetId) where.assetId = assetId;
    if (status) where.status = status;
    if (maintenanceType) where.maintenanceType = maintenanceType;
    if (priority) where.priority = priority;
    if (overdue) {
      where.nextDueDate = { [Op.lt]: new Date() };
      where.status = 'active';
    }

    const { count, rows } = await MaintenanceSchedule.findAndCountAll({
      where,
      include: [
        {
          model: Asset,
          as: 'asset',
          attributes: ['id', 'assetNumber', 'assetName']
        }
      ],
      order: [['nextDueDate', 'ASC']],
      limit,
      offset
    });

    return {
      schedules: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list maintenance schedules', { error: error.message });
    throw error;
  }
}

/**
 * Complete maintenance task
 */
async function completeMaintenance(scheduleId, completionData) {
  try {
    const schedule = await MaintenanceSchedule.findByPk(scheduleId);

    if (!schedule) {
      throw new Error('Maintenance schedule not found');
    }

    // Add to completion history
    const completionHistory = schedule.completionHistory || [];
    completionHistory.push({
      date: completionData.completedDate || new Date(),
      performedBy: completionData.performedBy,
      duration: completionData.duration,
      cost: completionData.cost,
      notes: completionData.notes
    });

    // Calculate next due date if recurring
    let nextDueDate = schedule.nextDueDate;
    if (schedule.isRecurring && schedule.frequency !== 'one_time') {
      const currentDue = new Date(schedule.nextDueDate);

      switch (schedule.frequency) {
        case 'daily':
          nextDueDate = new Date(currentDue.setDate(currentDue.getDate() + (schedule.frequencyInterval || 1)));
          break;
        case 'weekly':
          nextDueDate = new Date(currentDue.setDate(currentDue.getDate() + 7 * (schedule.frequencyInterval || 1)));
          break;
        case 'monthly':
          nextDueDate = new Date(currentDue.setMonth(currentDue.getMonth() + (schedule.frequencyInterval || 1)));
          break;
        case 'quarterly':
          nextDueDate = new Date(currentDue.setMonth(currentDue.getMonth() + 3));
          break;
        case 'semi_annually':
          nextDueDate = new Date(currentDue.setMonth(currentDue.getMonth() + 6));
          break;
        case 'annually':
          nextDueDate = new Date(currentDue.setFullYear(currentDue.getFullYear() + 1));
          break;
      }
    }

    const updates = {
      lastCompletedDate: completionData.completedDate || new Date(),
      completionCount: schedule.completionCount + 1,
      completionHistory
    };

    if (schedule.isRecurring && schedule.frequency !== 'one_time') {
      updates.nextDueDate = nextDueDate;
    } else {
      updates.status = 'completed';
    }

    await schedule.update(updates);

    // Update asset last maintenance date
    await Asset.update(
      { lastMaintenanceDate: updates.lastCompletedDate },
      { where: { id: schedule.assetId } }
    );

    logger.info('Maintenance completed', {
      scheduleId: schedule.id,
      scheduleNumber: schedule.scheduleNumber,
      nextDueDate: updates.nextDueDate
    });

    return schedule;
  } catch (error) {
    logger.error('Failed to complete maintenance', { error: error.message, scheduleId });
    throw error;
  }
}

/**
 * Get asset statistics
 */
async function getAssetStatistics() {
  try {
    const [
      totalAssets,
      activeAssets,
      totalValue,
      totalDepreciation
    ] = await Promise.all([
      Asset.count(),
      Asset.count({ where: { status: 'active' } }),
      Asset.sum('purchasePrice'),
      Asset.sum('accumulatedDepreciation')
    ]);

    const currentValue = (totalValue || 0) - (totalDepreciation || 0);

    return {
      totalAssets: totalAssets || 0,
      activeAssets: activeAssets || 0,
      totalPurchaseValue: totalValue || 0,
      totalDepreciation: totalDepreciation || 0,
      currentBookValue: currentValue
    };
  } catch (error) {
    logger.error('Failed to get asset statistics', { error: error.message });
    throw error;
  }
}

module.exports = {
  // Asset Management
  generateAssetNumber,
  createAsset,
  getAssetById,
  listAssets,
  updateAsset,
  disposeAsset,
  calculateDepreciation,
  recordDepreciation,
  assignAsset,

  // Maintenance Scheduling
  generateMaintenanceScheduleNumber,
  createMaintenanceSchedule,
  getMaintenanceScheduleById,
  listMaintenanceSchedules,
  completeMaintenance,

  // Statistics
  getAssetStatistics
};
