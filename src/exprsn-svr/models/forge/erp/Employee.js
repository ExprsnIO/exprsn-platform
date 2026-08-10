const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  employeeNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'employee_number'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'user_id',
    comment: 'Link to user account'
  },
  // Personal information
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'last_name'
  },
  middleName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'middle_name'
  },
  preferredName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'preferred_name'
  },
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'date_of_birth'
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other', 'prefer_not_to_say'),
    allowNull: true
  },
  // Contact information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  mobile: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  emergencyContact: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'emergency_contact',
    comment: '{ name, relationship, phone, email }'
  },
  // Address
  address: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: '{ line1, line2, city, state, postalCode, country }'
  },
  // Employment details
  jobTitle: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'job_title'
  },
  departmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'department_id'
  },
  managerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'manager_id',
    comment: 'Employee ID of manager'
  },
  employmentType: {
    type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'temporary', 'intern'),
    allowNull: false,
    defaultValue: 'full_time',
    field: 'employment_type'
  },
  status: {
    type: DataTypes.ENUM('active', 'on_leave', 'terminated', 'retired'),
    allowNull: false,
    defaultValue: 'active'
  },
  // Dates
  hireDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'hire_date'
  },
  probationEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'probation_end_date'
  },
  terminationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'termination_date'
  },
  terminationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'termination_reason'
  },
  // Compensation
  baseSalary: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'base_salary'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  payFrequency: {
    type: DataTypes.ENUM('hourly', 'weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'annual'),
    allowNull: true,
    field: 'pay_frequency'
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'hourly_rate'
  },
  // Benefits
  benefitsEligible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'benefits_eligible'
  },
  benefitsStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'benefits_start_date'
  },
  // Time off
  ptoBalance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'pto_balance',
    comment: 'Paid time off balance in days'
  },
  sickLeaveBalance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'sick_leave_balance'
  },
  // Work location
  workLocation: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'work_location'
  },
  workSchedule: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'work_schedule'
  },
  remoteWork: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'remote_work'
  },
  // Performance
  lastReviewDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_review_date'
  },
  nextReviewDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_review_date'
  },
  performanceRating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'performance_rating',
    comment: '1-5 rating'
  },
  // Skills and certifications
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  certifications: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { name, issuedBy, issuedDate, expiryDate }'
  },
  // Documents
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { type, url, uploadedDate }'
  },
  // Workflow integration
  onHireWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_hire_workflow_id'
  },
  onTerminateWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_terminate_workflow_id'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
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
  tableName: 'employees',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['employee_number'],
      unique: true
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['email']
    },
    {
      fields: ['department_id']
    },
    {
      fields: ['manager_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['employment_type']
    }
  ]
});

module.exports = Employee;
