const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const LeaveRequest = sequelize.define('LeaveRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  requestNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'request_number'
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'employee_id',
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  // Leave details
  leaveType: {
    type: DataTypes.ENUM('pto', 'sick', 'vacation', 'personal', 'bereavement', 'jury_duty', 'military', 'maternity', 'paternity', 'unpaid', 'other'),
    allowNull: false,
    field: 'leave_type'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_date'
  },
  isHalfDay: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_half_day'
  },
  halfDayPeriod: {
    type: DataTypes.ENUM('morning', 'afternoon'),
    allowNull: true,
    field: 'half_day_period'
  },
  totalDays: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    field: 'total_days',
    comment: 'Number of workdays (0.5 for half day)'
  },
  // Request details
  reason: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes from employee'
  },
  // Status and approval
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'withdrawn'),
    allowNull: false,
    defaultValue: 'pending'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'submitted_at'
  },
  // Approval workflow
  approverIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'approver_ids',
    comment: 'Chain of approvers (manager, HR, etc.)'
  },
  currentApproverId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'current_approver_id'
  },
  approvedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approved_by_id'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  approvalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'approval_notes'
  },
  rejectedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'rejected_by_id'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  // Balance impact
  balanceBeforeLeave: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'balance_before_leave'
  },
  balanceAfterLeave: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'balance_after_leave'
  },
  // Coverage
  coveringEmployeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'covering_employee_id',
    comment: 'Employee covering responsibilities'
  },
  handoverNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'handover_notes'
  },
  // Emergency contact during leave
  emergencyContactDuringLeave: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'emergency_contact_during_leave',
    comment: '{ canBeContacted, contactNumber, contactMethod }'
  },
  // Workflow integration
  onApproveWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_approve_workflow_id'
  },
  onRejectWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_reject_workflow_id'
  },
  // Attachments (medical certificates, etc.)
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { fileName, url, type, uploadedAt }'
  },
  // Notifications sent
  notificationsSent: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'notifications_sent',
    comment: 'Track notifications sent for this request'
  },
  // Metadata
  isPaid: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_paid',
    comment: 'Whether this leave is paid'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'leave_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['request_number'],
      unique: true
    },
    {
      fields: ['employee_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['leave_type']
    },
    {
      fields: ['start_date', 'end_date']
    },
    {
      fields: ['current_approver_id']
    },
    {
      fields: ['submitted_at']
    }
  ]
});

module.exports = LeaveRequest;
