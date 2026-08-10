const { Employee, Department, Payroll, LeaveRequest, PerformanceReview, TimeEntry } = require('../../../models/forge');
const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const logger = require('../../../utils/logger');

/**
 * HR Service
 * Handles Employee Management, Payroll, Leave Requests, and Performance Reviews
 */

// ===== Employee Management =====

/**
 * Generate employee number
 */
async function generateEmployeeNumber() {
  const year = new Date().getFullYear();
  const prefix = `EMP-${year}-`;

  const lastEmployee = await Employee.findOne({
    where: {
      employeeNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastEmployee) {
    const lastNumber = lastEmployee.employeeNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create employee
 */
async function createEmployee(data) {
  try {
    if (!data.employeeNumber) {
      data.employeeNumber = await generateEmployeeNumber();
    }

    // Validate department if provided
    if (data.departmentId) {
      const department = await Department.findByPk(data.departmentId);
      if (!department) {
        throw new Error('Department not found');
      }
    }

    // Validate manager if provided
    if (data.managerId) {
      const manager = await Employee.findByPk(data.managerId);
      if (!manager) {
        throw new Error('Manager not found');
      }
    }

    const employee = await Employee.create({
      ...data,
      status: data.status || 'active'
    });

    logger.info('Employee created', {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      name: `${employee.firstName} ${employee.lastName}`
    });

    return employee;
  } catch (error) {
    logger.error('Failed to create employee', { error: error.message });
    throw error;
  }
}

/**
 * Get employee by ID
 */
async function getEmployeeById(id) {
  try {
    const employee = await Employee.findByPk(id, {
      include: [
        {
          model: Department,
          attributes: ['id', 'departmentName']
        },
        {
          model: Employee,
          as: 'manager',
          attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'email']
        },
        {
          model: Employee,
          as: 'directReports',
          attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'jobTitle']
        }
      ]
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return employee;
  } catch (error) {
    logger.error('Failed to get employee', { error: error.message, employeeId: id });
    throw error;
  }
}

/**
 * List employees with filters
 */
async function listEmployees(filters = {}) {
  try {
    const {
      departmentId,
      managerId,
      status,
      employmentType,
      search,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (departmentId) where.departmentId = departmentId;
    if (managerId) where.managerId = managerId;
    if (status) where.status = status;
    if (employmentType) where.employmentType = employmentType;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { employeeNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Employee.findAndCountAll({
      where,
      include: [
        {
          model: Department,
          attributes: ['id', 'departmentName']
        }
      ],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']],
      limit,
      offset
    });

    return {
      employees: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list employees', { error: error.message });
    throw error;
  }
}

/**
 * Update employee
 */
async function updateEmployee(id, updates) {
  try {
    const employee = await Employee.findByPk(id);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Validate department change
    if (updates.departmentId && updates.departmentId !== employee.departmentId) {
      const department = await Department.findByPk(updates.departmentId);
      if (!department) {
        throw new Error('Department not found');
      }
    }

    // Validate manager change
    if (updates.managerId && updates.managerId !== employee.managerId) {
      if (updates.managerId === employee.id) {
        throw new Error('Employee cannot be their own manager');
      }
      const manager = await Employee.findByPk(updates.managerId);
      if (!manager) {
        throw new Error('Manager not found');
      }
    }

    await employee.update(updates);

    logger.info('Employee updated', {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber
    });

    return employee;
  } catch (error) {
    logger.error('Failed to update employee', { error: error.message, employeeId: id });
    throw error;
  }
}

/**
 * Terminate employee
 */
async function terminateEmployee(id, reason, terminationDate = new Date()) {
  try {
    const employee = await Employee.findByPk(id);

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (employee.status === 'terminated') {
      throw new Error('Employee already terminated');
    }

    await employee.update({
      status: 'terminated',
      terminationDate,
      terminationReason: reason
    });

    logger.info('Employee terminated', {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      terminationDate
    });

    return employee;
  } catch (error) {
    logger.error('Failed to terminate employee', { error: error.message, employeeId: id });
    throw error;
  }
}

// ===== Payroll Management =====

/**
 * Generate payroll number
 */
async function generatePayrollNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const prefix = `PAY-${year}${month}-`;

  const lastPayroll = await Payroll.findOne({
    where: {
      payrollNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastPayroll) {
    const lastNumber = lastPayroll.payrollNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Calculate payroll for employee
 */
async function calculatePayroll(employeeId, payPeriodStart, payPeriodEnd, hoursData = {}) {
  try {
    const employee = await Employee.findByPk(employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    const {
      regularHours = 0,
      overtimeHours = 0,
      bonus = 0,
      commission = 0,
      otherEarnings = 0
    } = hoursData;

    // Calculate pay based on employment type
    let regularPay = 0;
    let overtimePay = 0;

    if (employee.employmentType === 'hourly') {
      const hourlyRate = employee.salary || 0;
      const overtimeRate = hourlyRate * 1.5;
      regularPay = regularHours * hourlyRate;
      overtimePay = overtimeHours * overtimeRate;
    } else if (employee.employmentType === 'salaried') {
      // For salaried, divide annual salary by pay periods
      const payPeriodsPerYear = employee.payFrequency === 'weekly' ? 52 :
                                employee.payFrequency === 'bi_weekly' ? 26 :
                                employee.payFrequency === 'semi_monthly' ? 24 : 12;
      regularPay = (employee.salary || 0) / payPeriodsPerYear;
    }

    const grossPay = regularPay + overtimePay + bonus + commission + otherEarnings;

    // Calculate taxes (simplified - real implementation would use tax tables)
    const federalTaxRate = 0.22; // Example rate
    const stateTaxRate = 0.05;   // Example rate
    const socialSecurityRate = 0.062;
    const medicareRate = 0.0145;

    const federalTax = grossPay * federalTaxRate;
    const stateTax = grossPay * stateTaxRate;
    const socialSecurityTax = Math.min(grossPay * socialSecurityRate, 9114); // 2023 max
    const medicareTax = grossPay * medicareRate;

    // Deductions (from employee record or default values)
    const healthInsurance = employee.healthInsuranceDeduction || 0;
    const retirementContribution = employee.retirementContributionPercent
      ? grossPay * (employee.retirementContributionPercent / 100)
      : 0;

    const totalDeductions = federalTax + stateTax + socialSecurityTax + medicareTax +
                           healthInsurance + retirementContribution;

    const netPay = grossPay - totalDeductions;

    // Employer contributions
    const employerSocialSecurity = grossPay * socialSecurityRate;
    const employerMedicare = grossPay * medicareRate;
    const employerUnemployment = grossPay * 0.006; // FUTA rate
    const employerRetirementMatch = employee.retirementMatchPercent
      ? retirementContribution * (employee.retirementMatchPercent / 100)
      : 0;

    return {
      hoursWorked: regularHours,
      overtimeHours,
      regularPay,
      overtimePay,
      bonus,
      commission,
      otherEarnings,
      grossPay,
      federalTax,
      stateTax,
      socialSecurityTax,
      medicareTax,
      healthInsurance,
      retirementContribution,
      totalDeductions,
      netPay,
      employerSocialSecurity,
      employerMedicare,
      employerUnemployment,
      employerRetirementMatch
    };
  } catch (error) {
    logger.error('Failed to calculate payroll', { error: error.message, employeeId });
    throw error;
  }
}

/**
 * Create payroll record
 */
async function createPayroll(employeeId, payPeriodStart, payPeriodEnd, payDate, hoursData = {}) {
  try {
    const employee = await Employee.findByPk(employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    const calculations = await calculatePayroll(employeeId, payPeriodStart, payPeriodEnd, hoursData);

    // Get previous YTD totals
    const previousPayrolls = await Payroll.findAll({
      where: {
        employeeId,
        payPeriodEnd: {
          [Op.lt]: payPeriodStart
        },
        status: { [Op.in]: ['processed', 'paid'] }
      }
    });

    const ytdGrossPay = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.grossPay), 0) + calculations.grossPay;
    const ytdFederalTax = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.federalTax), 0) + calculations.federalTax;
    const ytdStateTax = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.stateTax), 0) + calculations.stateTax;
    const ytdSocialSecurity = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.socialSecurityTax), 0) + calculations.socialSecurityTax;
    const ytdMedicare = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.medicareTax), 0) + calculations.medicareTax;
    const ytdNetPay = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.netPay), 0) + calculations.netPay;

    const payroll = await Payroll.create({
      payrollNumber: await generatePayrollNumber(),
      employeeId,
      payPeriodStart,
      payPeriodEnd,
      payDate,
      payFrequency: employee.payFrequency || 'bi_weekly',
      ...calculations,
      ytdGrossPay,
      ytdFederalTax,
      ytdStateTax,
      ytdSocialSecurity,
      ytdMedicare,
      ytdNetPay,
      paymentMethod: employee.paymentMethod || 'direct_deposit',
      status: 'draft'
    });

    logger.info('Payroll created', {
      payrollId: payroll.id,
      payrollNumber: payroll.payrollNumber,
      employeeId,
      netPay: payroll.netPay
    });

    return payroll;
  } catch (error) {
    logger.error('Failed to create payroll', { error: error.message, employeeId });
    throw error;
  }
}

/**
 * Approve payroll
 */
async function approvePayroll(payrollId, approverUserId) {
  try {
    const payroll = await Payroll.findByPk(payrollId);

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    if (payroll.status !== 'draft' && payroll.status !== 'pending_approval') {
      throw new Error('Payroll cannot be approved in current status');
    }

    await payroll.update({
      status: 'approved',
      approvedByUserId: approverUserId,
      approvedAt: new Date()
    });

    logger.info('Payroll approved', {
      payrollId: payroll.id,
      payrollNumber: payroll.payrollNumber,
      approverUserId
    });

    return payroll;
  } catch (error) {
    logger.error('Failed to approve payroll', { error: error.message, payrollId });
    throw error;
  }
}

/**
 * Process payroll (mark as processed and ready for payment)
 */
async function processPayroll(payrollIds) {
  const transaction = await sequelize.transaction();

  try {
    const payrolls = await Payroll.findAll({
      where: {
        id: { [Op.in]: payrollIds },
        status: 'approved'
      },
      transaction
    });

    if (payrolls.length !== payrollIds.length) {
      throw new Error('Some payrolls not found or not approved');
    }

    for (const payroll of payrolls) {
      await payroll.update({
        status: 'processed',
        processedAt: new Date()
      }, { transaction });
    }

    await transaction.commit();

    logger.info('Payrolls processed', { count: payrolls.length });

    return payrolls;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to process payrolls', { error: error.message });
    throw error;
  }
}

/**
 * Generate paystub (simple text format)
 */
async function generatePaystub(payrollId) {
  try {
    const payroll = await Payroll.findByPk(payrollId, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['employeeNumber', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!payroll) {
      throw new Error('Payroll not found');
    }

    const paystub = {
      payrollNumber: payroll.payrollNumber,
      employee: {
        employeeNumber: payroll.employee.employeeNumber,
        name: `${payroll.employee.firstName} ${payroll.employee.lastName}`,
        email: payroll.employee.email
      },
      payPeriod: {
        start: payroll.payPeriodStart,
        end: payroll.payPeriodEnd,
        payDate: payroll.payDate
      },
      earnings: {
        regularPay: payroll.regularPay,
        overtimePay: payroll.overtimePay,
        bonus: payroll.bonus,
        commission: payroll.commission,
        otherEarnings: payroll.otherEarnings,
        grossPay: payroll.grossPay
      },
      deductions: {
        federalTax: payroll.federalTax,
        stateTax: payroll.stateTax,
        socialSecurityTax: payroll.socialSecurityTax,
        medicareTax: payroll.medicareTax,
        healthInsurance: payroll.healthInsurance,
        retirementContribution: payroll.retirementContribution,
        totalDeductions: payroll.totalDeductions
      },
      netPay: payroll.netPay,
      yearToDate: {
        grossPay: payroll.ytdGrossPay,
        federalTax: payroll.ytdFederalTax,
        stateTax: payroll.ytdStateTax,
        socialSecurity: payroll.ytdSocialSecurity,
        medicare: payroll.ytdMedicare,
        netPay: payroll.ytdNetPay
      }
    };

    logger.info('Paystub generated', {
      payrollId,
      payrollNumber: payroll.payrollNumber
    });

    return paystub;
  } catch (error) {
    logger.error('Failed to generate paystub', { error: error.message, payrollId });
    throw error;
  }
}

// ===== Leave Management =====

/**
 * Generate leave request number
 */
async function generateLeaveRequestNumber() {
  const year = new Date().getFullYear();
  const prefix = `LR-${year}-`;

  const lastRequest = await LeaveRequest.findOne({
    where: {
      requestNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastRequest) {
    const lastNumber = lastRequest.requestNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Calculate leave balance
 */
async function calculateLeaveBalance(employeeId, leaveType = 'pto') {
  try {
    const employee = await Employee.findByPk(employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get approved leave requests for this year
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const approvedLeaves = await LeaveRequest.findAll({
      where: {
        employeeId,
        leaveType,
        status: 'approved',
        startDate: { [Op.gte]: yearStart }
      }
    });

    const usedDays = approvedLeaves.reduce((sum, leave) => sum + parseFloat(leave.totalDays), 0);

    // Default accrual (would be configured per employee/policy)
    const annualAllowance = leaveType === 'pto' ? 20 : leaveType === 'sick' ? 10 : 0;
    const available = annualAllowance - usedDays;

    return {
      employeeId,
      leaveType,
      annualAllowance,
      used: usedDays,
      available: Math.max(available, 0)
    };
  } catch (error) {
    logger.error('Failed to calculate leave balance', { error: error.message, employeeId });
    throw error;
  }
}

/**
 * Create leave request
 */
async function createLeaveRequest(data) {
  try {
    const employee = await Employee.findByPk(data.employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Calculate total days
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const totalDays = data.isHalfDay ? 0.5 : diffDays;

    // Check balance
    const balance = await calculateLeaveBalance(data.employeeId, data.leaveType);
    const balanceBeforeLeave = balance.available;
    const balanceAfterLeave = balance.available - totalDays;

    if (balanceAfterLeave < 0 && data.leaveType !== 'unpaid') {
      throw new Error(`Insufficient ${data.leaveType} balance. Available: ${balance.available} days`);
    }

    // Set approvers (typically manager, then HR)
    const approverIds = [];
    if (employee.managerId) {
      approverIds.push(employee.managerId);
    }

    const leaveRequest = await LeaveRequest.create({
      requestNumber: await generateLeaveRequestNumber(),
      ...data,
      totalDays,
      balanceBeforeLeave,
      balanceAfterLeave,
      approverIds,
      currentApproverId: approverIds[0] || null,
      status: 'draft'
    });

    logger.info('Leave request created', {
      leaveRequestId: leaveRequest.id,
      requestNumber: leaveRequest.requestNumber,
      employeeId: data.employeeId,
      totalDays
    });

    return leaveRequest;
  } catch (error) {
    logger.error('Failed to create leave request', { error: error.message });
    throw error;
  }
}

/**
 * Approve leave request
 */
async function approveLeaveRequest(requestId, approverId) {
  try {
    const leaveRequest = await LeaveRequest.findByPk(requestId);

    if (!leaveRequest) {
      throw new Error('Leave request not found');
    }

    if (leaveRequest.status === 'approved') {
      throw new Error('Leave request already approved');
    }

    // Add approval to history
    const approvalHistory = leaveRequest.approvalHistory || [];
    approvalHistory.push({
      approverId,
      action: 'approved',
      timestamp: new Date()
    });

    await leaveRequest.update({
      status: 'approved',
      approvedAt: new Date(),
      approvalHistory
    });

    logger.info('Leave request approved', {
      leaveRequestId: leaveRequest.id,
      requestNumber: leaveRequest.requestNumber,
      approverId
    });

    return leaveRequest;
  } catch (error) {
    logger.error('Failed to approve leave request', { error: error.message, requestId });
    throw error;
  }
}

/**
 * Reject leave request
 */
async function rejectLeaveRequest(requestId, approverId, reason) {
  try {
    const leaveRequest = await LeaveRequest.findByPk(requestId);

    if (!leaveRequest) {
      throw new Error('Leave request not found');
    }

    if (leaveRequest.status === 'approved') {
      throw new Error('Cannot reject approved leave request');
    }

    const approvalHistory = leaveRequest.approvalHistory || [];
    approvalHistory.push({
      approverId,
      action: 'rejected',
      reason,
      timestamp: new Date()
    });

    await leaveRequest.update({
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: reason,
      approvalHistory
    });

    logger.info('Leave request rejected', {
      leaveRequestId: leaveRequest.id,
      requestNumber: leaveRequest.requestNumber,
      approverId
    });

    return leaveRequest;
  } catch (error) {
    logger.error('Failed to reject leave request', { error: error.message, requestId });
    throw error;
  }
}

// ===== Performance Reviews =====

/**
 * Generate review number
 */
async function generateReviewNumber() {
  const year = new Date().getFullYear();
  const prefix = `REV-${year}-`;

  const lastReview = await PerformanceReview.findOne({
    where: {
      reviewNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastReview) {
    const lastNumber = lastReview.reviewNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create performance review
 */
async function createPerformanceReview(data) {
  try {
    const employee = await Employee.findByPk(data.employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    const reviewer = await Employee.findByPk(data.reviewerId);
    if (!reviewer) {
      throw new Error('Reviewer not found');
    }

    const review = await PerformanceReview.create({
      reviewNumber: await generateReviewNumber(),
      ...data,
      currentJobTitle: employee.jobTitle,
      currentSalary: employee.salary,
      status: 'draft'
    });

    logger.info('Performance review created', {
      reviewId: review.id,
      reviewNumber: review.reviewNumber,
      employeeId: data.employeeId
    });

    return review;
  } catch (error) {
    logger.error('Failed to create performance review', { error: error.message });
    throw error;
  }
}

/**
 * Submit self-assessment
 */
async function submitSelfAssessment(reviewId, selfAssessmentData) {
  try {
    const review = await PerformanceReview.findByPk(reviewId);

    if (!review) {
      throw new Error('Performance review not found');
    }

    if (review.status !== 'self_assessment_pending') {
      throw new Error('Review is not pending self-assessment');
    }

    await review.update({
      selfAssessment: selfAssessmentData.assessment,
      selfRating: selfAssessmentData.rating,
      status: 'review_in_progress'
    });

    logger.info('Self-assessment submitted', {
      reviewId: review.id,
      reviewNumber: review.reviewNumber
    });

    return review;
  } catch (error) {
    logger.error('Failed to submit self-assessment', { error: error.message, reviewId });
    throw error;
  }
}

/**
 * Complete review
 */
async function completeReview(reviewId, reviewData) {
  try {
    const review = await PerformanceReview.findByPk(reviewId);

    if (!review) {
      throw new Error('Performance review not found');
    }

    await review.update({
      ...reviewData,
      status: 'pending_employee_acknowledgment',
      completedAt: new Date()
    });

    logger.info('Performance review completed', {
      reviewId: review.id,
      reviewNumber: review.reviewNumber
    });

    return review;
  } catch (error) {
    logger.error('Failed to complete review', { error: error.message, reviewId });
    throw error;
  }
}

/**
 * Acknowledge review (employee signs off)
 */
async function acknowledgeReview(reviewId, employeeComments = '') {
  try {
    const review = await PerformanceReview.findByPk(reviewId);

    if (!review) {
      throw new Error('Performance review not found');
    }

    await review.update({
      employeeAcknowledged: true,
      acknowledgedAt: new Date(),
      employeeComments,
      status: 'pending_hr_approval'
    });

    logger.info('Performance review acknowledged', {
      reviewId: review.id,
      reviewNumber: review.reviewNumber
    });

    return review;
  } catch (error) {
    logger.error('Failed to acknowledge review', { error: error.message, reviewId });
    throw error;
  }
}

module.exports = {
  // Employee Management
  generateEmployeeNumber,
  createEmployee,
  getEmployeeById,
  listEmployees,
  updateEmployee,
  terminateEmployee,

  // Payroll
  generatePayrollNumber,
  calculatePayroll,
  createPayroll,
  approvePayroll,
  processPayroll,
  generatePaystub,

  // Leave Management
  generateLeaveRequestNumber,
  calculateLeaveBalance,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,

  // Performance Reviews
  generateReviewNumber,
  createPerformanceReview,
  submitSelfAssessment,
  completeReview,
  acknowledgeReview
};
