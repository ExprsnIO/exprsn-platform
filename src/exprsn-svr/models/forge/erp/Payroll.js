const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Payroll = sequelize.define('Payroll', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  payrollNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'payroll_number'
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
  // Pay period
  payPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'pay_period_start'
  },
  payPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'pay_period_end'
  },
  payDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'pay_date'
  },
  // Earnings
  regularHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'regular_hours'
  },
  overtimeHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'overtime_hours'
  },
  regularPay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'regular_pay'
  },
  overtimePay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'overtime_pay'
  },
  bonuses: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  commissions: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  reimbursements: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  otherEarnings: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'other_earnings',
    comment: 'Array of { type, description, amount }'
  },
  grossPay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'gross_pay'
  },
  // Deductions
  federalTax: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'federal_tax'
  },
  stateTax: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'state_tax'
  },
  socialSecurityTax: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'social_security_tax'
  },
  medicareTax: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'medicare_tax'
  },
  healthInsurance: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'health_insurance'
  },
  retirement401k: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'retirement_401k'
  },
  otherDeductions: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'other_deductions',
    comment: 'Array of { type, description, amount }'
  },
  totalDeductions: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'total_deductions'
  },
  // Net pay
  netPay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'net_pay'
  },
  // Employer contributions
  employerSocialSecurity: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'employer_social_security'
  },
  employerMedicare: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'employer_medicare'
  },
  employer401kMatch: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'employer_401k_match'
  },
  employerHealthInsurance: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'employer_health_insurance'
  },
  totalEmployerCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'total_employer_cost'
  },
  // Payment details
  paymentMethod: {
    type: DataTypes.ENUM('direct_deposit', 'check', 'cash', 'payroll_card'),
    allowNull: false,
    defaultValue: 'direct_deposit',
    field: 'payment_method'
  },
  bankAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'bank_account_id',
    comment: 'Employee bank account for direct deposit'
  },
  checkNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'check_number'
  },
  // Status and processing
  status: {
    type: DataTypes.ENUM('draft', 'pending_approval', 'approved', 'processed', 'paid', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  isPaid: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_paid'
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paid_at'
  },
  // Journal entry linkage
  journalEntryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'journal_entry_id'
  },
  // Year-to-date tracking
  ytdGrossPay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'ytd_gross_pay'
  },
  ytdNetPay: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'ytd_net_pay'
  },
  ytdFederalTax: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'ytd_federal_tax'
  },
  // Time tracking reference
  timeEntryIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'time_entry_ids',
    comment: 'Link to time entries used for this payroll'
  },
  // Notes and attachments
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { fileName, url, uploadedAt }'
  },
  // Workflow
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
  processedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'processed_by_id'
  },
  // Metadata
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
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
  tableName: 'payrolls',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['payroll_number'],
      unique: true
    },
    {
      fields: ['employee_id']
    },
    {
      fields: ['pay_date']
    },
    {
      fields: ['pay_period_start', 'pay_period_end']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_paid']
    }
  ]
});

module.exports = Payroll;
