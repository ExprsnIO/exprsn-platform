const express = require('express');
const router = express.Router();
const Joi = require('joi');
const hrService = require('../../../services/forge/erp/hrService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

// Payroll Schemas
const createPayrollSchema = Joi.object({
  employeeId: Joi.string().uuid().required(),
  payPeriodStart: Joi.date().required(),
  payPeriodEnd: Joi.date().required(),
  payDate: Joi.date().required(),
  regularHours: Joi.number().min(0).default(0),
  overtimeHours: Joi.number().min(0).default(0),
  bonus: Joi.number().min(0).default(0),
  commission: Joi.number().min(0).default(0),
  otherEarnings: Joi.number().min(0).default(0)
});

const processPayrollSchema = Joi.object({
  payrollIds: Joi.array().items(Joi.string().uuid()).min(1).required()
});

// Leave Request Schemas
const createLeaveRequestSchema = Joi.object({
  employeeId: Joi.string().uuid().required(),
  leaveType: Joi.string().valid(
    'pto', 'sick', 'vacation', 'personal', 'bereavement',
    'jury_duty', 'military', 'maternity', 'paternity',
    'parental', 'sabbatical', 'unpaid', 'other'
  ).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  isHalfDay: Joi.boolean().default(false),
  halfDayPeriod: Joi.string().valid('morning', 'afternoon'),
  reason: Joi.string().allow(''),
  delegateEmployeeId: Joi.string().uuid(),
  emergencyContact: Joi.object({
    name: Joi.string(),
    phone: Joi.string()
  })
});

const approveLeaveSchema = Joi.object({
  approverId: Joi.string().uuid().required()
});

const rejectLeaveSchema = Joi.object({
  approverId: Joi.string().uuid().required(),
  reason: Joi.string().required()
});

// Performance Review Schemas
const createReviewSchema = Joi.object({
  employeeId: Joi.string().uuid().required(),
  reviewerId: Joi.string().uuid().required(),
  reviewPeriodStart: Joi.date().required(),
  reviewPeriodEnd: Joi.date().required(),
  reviewType: Joi.string().valid(
    'annual', 'mid_year', 'quarterly', 'probation', '90_day',
    'project', 'promotion', 'pip', 'other'
  ).required(),
  dueDate: Joi.date(),
  peerReviewers: Joi.array().items(Joi.string().uuid())
});

const submitSelfAssessmentSchema = Joi.object({
  assessment: Joi.string().required(),
  rating: Joi.number().min(1).max(5)
});

const completeReviewSchema = Joi.object({
  overallRating: Joi.number().min(1).max(5).required(),
  overallRatingLabel: Joi.string(),
  competencies: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      rating: Joi.number().min(1).max(5).required(),
      weight: Joi.number().min(0).max(100),
      comments: Joi.string().allow('')
    })
  ),
  previousGoals: Joi.array().items(
    Joi.object({
      goal: Joi.string().required(),
      achieved: Joi.boolean().required(),
      rating: Joi.number().min(1).max(5),
      comments: Joi.string().allow('')
    })
  ),
  newGoals: Joi.array().items(
    Joi.object({
      goal: Joi.string().required(),
      targetDate: Joi.date(),
      metrics: Joi.string().allow(''),
      priority: Joi.string().valid('low', 'medium', 'high')
    })
  ),
  strengths: Joi.string().allow(''),
  areasForImprovement: Joi.string().allow(''),
  developmentPlan: Joi.string().allow(''),
  managerComments: Joi.string().allow(''),
  recommendedSalary: Joi.number().min(0),
  salaryIncrease: Joi.number().min(0),
  salaryIncreasePercent: Joi.number().min(0).max(100),
  bonusRecommended: Joi.number().min(0),
  recommendedJobTitle: Joi.string(),
  promotionRecommended: Joi.boolean().default(false)
});

const acknowledgeReviewSchema = Joi.object({
  employeeComments: Joi.string().allow('')
});

// ===== Payroll Routes =====

/**
 * POST /api/erp/payroll
 * Create payroll record
 */
router.post('/payroll',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createPayrollSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const { employeeId, payPeriodStart, payPeriodEnd, payDate, ...hoursData } = value;

      const payroll = await hrService.createPayroll(
        employeeId,
        payPeriodStart,
        payPeriodEnd,
        payDate,
        hoursData
      );

      res.status(201).json({
        success: true,
        payroll
      });
    } catch (err) {
      logger.error('Failed to create payroll', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/payroll
 * List payroll records
 */
router.get('/payroll',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      // This would require a listPayroll function in hrService
      // Stub for now
      res.json({
        success: true,
        payrolls: [],
        total: 0
      });
    } catch (err) {
      logger.error('Failed to list payroll', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/payroll/:id
 * Get payroll by ID
 */
router.get('/payroll/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { Payroll } = require('../../../models/forge');
      const payroll = await Payroll.findByPk(req.params.id, {
        include: [
          {
            model: require('../../../models/forge').Employee,
            as: 'employee',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'email']
          }
        ]
      });

      if (!payroll) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Payroll not found'
        });
      }

      res.json({
        success: true,
        payroll
      });
    } catch (err) {
      logger.error('Failed to get payroll', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/payroll/:id/approve
 * Approve payroll
 */
router.post('/payroll/:id/approve',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { approverUserId } = req.body;

      if (!approverUserId) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Approver user ID is required'
        });
      }

      const payroll = await hrService.approvePayroll(req.params.id, approverUserId);

      res.json({
        success: true,
        payroll,
        message: 'Payroll approved successfully'
      });
    } catch (err) {
      logger.error('Failed to approve payroll', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'APPROVAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/payroll/process
 * Process multiple payrolls
 */
router.post('/payroll/process',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = processPayrollSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const payrolls = await hrService.processPayroll(value.payrollIds);

      res.json({
        success: true,
        payrolls,
        message: `${payrolls.length} payroll(s) processed successfully`
      });
    } catch (err) {
      logger.error('Failed to process payroll', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'PROCESS_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/payroll/:id/paystub
 * Get paystub for payroll
 */
router.get('/payroll/:id/paystub',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const paystub = await hrService.generatePaystub(req.params.id);

      res.json({
        success: true,
        paystub
      });
    } catch (err) {
      logger.error('Failed to generate paystub', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'PAYSTUB_ERROR',
        message: err.message
      });
    }
  }
);

// ===== Leave Request Routes =====

/**
 * POST /api/erp/leave-requests
 * Create leave request
 */
router.post('/leave-requests',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createLeaveRequestSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const leaveRequest = await hrService.createLeaveRequest(value);

      res.status(201).json({
        success: true,
        leaveRequest
      });
    } catch (err) {
      logger.error('Failed to create leave request', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'CREATION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/leave-requests
 * List leave requests
 */
router.get('/leave-requests',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { LeaveRequest, Employee } = require('../../../models/forge');
      const { employeeId, status, leaveType } = req.query;

      const where = {};
      if (employeeId) where.employeeId = employeeId;
      if (status) where.status = status;
      if (leaveType) where.leaveType = leaveType;

      const leaveRequests = await LeaveRequest.findAll({
        where,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
          }
        ],
        order: [['startDate', 'DESC']]
      });

      res.json({
        success: true,
        leaveRequests
      });
    } catch (err) {
      logger.error('Failed to list leave requests', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/leave-requests/:id
 * Get leave request by ID
 */
router.get('/leave-requests/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { LeaveRequest, Employee } = require('../../../models/forge');
      const leaveRequest = await LeaveRequest.findByPk(req.params.id, {
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'email']
          }
        ]
      });

      if (!leaveRequest) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Leave request not found'
        });
      }

      res.json({
        success: true,
        leaveRequest
      });
    } catch (err) {
      logger.error('Failed to get leave request', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/leave-requests/:id/approve
 * Approve leave request
 */
router.post('/leave-requests/:id/approve',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = approveLeaveSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const leaveRequest = await hrService.approveLeaveRequest(req.params.id, value.approverId);

      res.json({
        success: true,
        leaveRequest,
        message: 'Leave request approved successfully'
      });
    } catch (err) {
      logger.error('Failed to approve leave request', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'APPROVAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/leave-requests/:id/reject
 * Reject leave request
 */
router.post('/leave-requests/:id/reject',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = rejectLeaveSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const leaveRequest = await hrService.rejectLeaveRequest(
        req.params.id,
        value.approverId,
        value.reason
      );

      res.json({
        success: true,
        leaveRequest,
        message: 'Leave request rejected'
      });
    } catch (err) {
      logger.error('Failed to reject leave request', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'REJECTION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/leave-balance/:employeeId
 * Get leave balance for employee
 */
router.get('/leave-balance/:employeeId',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { leaveType = 'pto' } = req.query;
      const balance = await hrService.calculateLeaveBalance(req.params.employeeId, leaveType);

      res.json({
        success: true,
        balance
      });
    } catch (err) {
      logger.error('Failed to get leave balance', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

// ===== Performance Review Routes =====

/**
 * POST /api/erp/performance-reviews
 * Create performance review
 */
router.post('/performance-reviews',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createReviewSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const review = await hrService.createPerformanceReview(value);

      res.status(201).json({
        success: true,
        review
      });
    } catch (err) {
      logger.error('Failed to create performance review', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/performance-reviews
 * List performance reviews
 */
router.get('/performance-reviews',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { PerformanceReview, Employee } = require('../../../models/forge');
      const { employeeId, reviewerId, status, reviewType } = req.query;

      const where = {};
      if (employeeId) where.employeeId = employeeId;
      if (reviewerId) where.reviewerId = reviewerId;
      if (status) where.status = status;
      if (reviewType) where.reviewType = reviewType;

      const reviews = await PerformanceReview.findAll({
        where,
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
          },
          {
            model: Employee,
            as: 'reviewer',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName']
          }
        ],
        order: [['reviewPeriodStart', 'DESC']]
      });

      res.json({
        success: true,
        reviews
      });
    } catch (err) {
      logger.error('Failed to list performance reviews', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/performance-reviews/:id
 * Get performance review by ID
 */
router.get('/performance-reviews/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { PerformanceReview, Employee } = require('../../../models/forge');
      const review = await PerformanceReview.findByPk(req.params.id, {
        include: [
          {
            model: Employee,
            as: 'employee',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'email', 'jobTitle']
          },
          {
            model: Employee,
            as: 'reviewer',
            attributes: ['id', 'employeeNumber', 'firstName', 'lastName', 'email']
          }
        ]
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Performance review not found'
        });
      }

      res.json({
        success: true,
        review
      });
    } catch (err) {
      logger.error('Failed to get performance review', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/performance-reviews/:id/self-assessment
 * Submit self-assessment
 */
router.post('/performance-reviews/:id/self-assessment',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = submitSelfAssessmentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const review = await hrService.submitSelfAssessment(req.params.id, value);

      res.json({
        success: true,
        review,
        message: 'Self-assessment submitted successfully'
      });
    } catch (err) {
      logger.error('Failed to submit self-assessment', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'SUBMISSION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/performance-reviews/:id/complete
 * Complete performance review
 */
router.post('/performance-reviews/:id/complete',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = completeReviewSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const review = await hrService.completeReview(req.params.id, value);

      res.json({
        success: true,
        review,
        message: 'Performance review completed successfully'
      });
    } catch (err) {
      logger.error('Failed to complete review', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'COMPLETION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/performance-reviews/:id/acknowledge
 * Acknowledge performance review (employee sign-off)
 */
router.post('/performance-reviews/:id/acknowledge',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = acknowledgeReviewSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const review = await hrService.acknowledgeReview(req.params.id, value.employeeComments);

      res.json({
        success: true,
        review,
        message: 'Performance review acknowledged successfully'
      });
    } catch (err) {
      logger.error('Failed to acknowledge review', { error: err.message });
      res.status(400).json({
        success: false,
        error: 'ACKNOWLEDGMENT_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
