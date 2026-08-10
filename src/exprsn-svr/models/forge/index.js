const { sequelize } = require('../../config/database');

// ===== Groupware Models =====
const Calendar = require('./groupware/Calendar');
const CalendarEvent = require('./groupware/CalendarEvent');
const Task = require('./groupware/Task');
const TaskDependency = require('./groupware/TaskDependency');
const TaskAssignment = require('./groupware/TaskAssignment');
const Document = require('./groupware/Document');
const WikiPage = require('./groupware/WikiPage');
const Note = require('./groupware/Note');
const Folder = require('./groupware/Folder');
const Board = require('./groupware/Board');
const BoardColumn = require('./groupware/BoardColumn');
const BoardCard = require('./groupware/BoardCard');
const TimeEntry = require('./groupware/TimeEntry');

// ===== CRM Models =====
const Contact = require('./crm/Contact');
const Company = require('./crm/Company');
const Lead = require('./crm/Lead');
const Opportunity = require('./crm/Opportunity');
const Activity = require('./crm/Activity');
const ServiceLevelAgreement = require('./crm/ServiceLevelAgreement');
const Contract = require('./crm/Contract');
const Service = require('./crm/Service');
const Campaign = require('./crm/Campaign');
const SupportTicket = require('./crm/SupportTicket');

// ===== ERP Models =====
const Product = require('./erp/Product');
const Customer = require('./erp/Customer');
const Invoice = require('./erp/Invoice');
const SalesOrder = require('./erp/SalesOrder');
const PurchaseOrder = require('./erp/PurchaseOrder');
const Inventory = require('./erp/Inventory');
const StockMovement = require('./erp/StockMovement');
const Supplier = require('./erp/Supplier');
const Employee = require('./erp/Employee');
const Department = require('./erp/Department');
const Project = require('./erp/Project');
const Account = require('./erp/Account');
const JournalEntry = require('./erp/JournalEntry');
const Payment = require('./erp/Payment');
const Payroll = require('./erp/Payroll');
const LeaveRequest = require('./erp/LeaveRequest');
const PerformanceReview = require('./erp/PerformanceReview');
const Asset = require('./erp/Asset');
const MaintenanceSchedule = require('./erp/MaintenanceSchedule');

// ===== Shared Models =====
const CustomField = require('./shared/CustomField');
const Comment = require('./shared/Comment');
const Report = require('./shared/Report')(sequelize);
const ReportSchedule = require('./shared/ReportSchedule')(sequelize);
const ReportExecution = require('./shared/ReportExecution')(sequelize);

// ===== Schema Management Models =====
const ForgeSchema = require('./schema/ForgeSchema');
const ForgeSchemaVersion = require('./schema/ForgeSchemaVersion');
const ForgeSchemaDependency = require('./schema/ForgeSchemaDependency');
const ForgeMigration = require('./schema/ForgeMigration');
const ForgeSchemaChange = require('./schema/ForgeSchemaChange');

// ===== Define Associations =====

// Groupware associations
CalendarEvent.belongsTo(Calendar, { foreignKey: 'calendar_id' });
Calendar.hasMany(CalendarEvent, { foreignKey: 'calendar_id' });

TaskDependency.belongsTo(Task, { foreignKey: 'task_id', as: 'task' });
TaskDependency.belongsTo(Task, { foreignKey: 'depends_on_task_id', as: 'dependsOnTask' });

TaskAssignment.belongsTo(Task, { foreignKey: 'task_id' });
Task.hasMany(TaskAssignment, { foreignKey: 'task_id', as: 'assignments' });

// Task self-referential relationship for subtasks
Task.belongsTo(Task, { foreignKey: 'parent_task_id', as: 'parentTask' });
Task.hasMany(Task, { foreignKey: 'parent_task_id', as: 'subtasks' });

// Task dependencies
Task.hasMany(TaskDependency, { foreignKey: 'task_id', as: 'dependencies' });

WikiPage.belongsTo(WikiPage, { foreignKey: 'parent_page_id', as: 'parentPage' });
WikiPage.hasMany(WikiPage, { foreignKey: 'parent_page_id', as: 'childPages' });

Note.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });
Folder.hasMany(Note, { foreignKey: 'folder_id' });

Document.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });
Folder.hasMany(Document, { foreignKey: 'folder_id' });

Folder.belongsTo(Folder, { foreignKey: 'parent_folder_id', as: 'parentFolder' });
Folder.hasMany(Folder, { foreignKey: 'parent_folder_id', as: 'subFolders' });

// Board associations
Board.hasMany(BoardColumn, { foreignKey: 'board_id', as: 'columns' });
BoardColumn.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

Board.hasMany(BoardCard, { foreignKey: 'board_id', as: 'cards' });
BoardCard.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

BoardColumn.hasMany(BoardCard, { foreignKey: 'column_id', as: 'cards' });
BoardCard.belongsTo(BoardColumn, { foreignKey: 'column_id', as: 'column' });

BoardCard.belongsTo(Task, { foreignKey: 'task_id', as: 'task' });
Task.hasMany(BoardCard, { foreignKey: 'task_id', as: 'boardCards' });

// Time tracking associations
TimeEntry.belongsTo(Task, { foreignKey: 'task_id', as: 'task' });
Task.hasMany(TimeEntry, { foreignKey: 'task_id', as: 'timeEntries' });

// CRM associations
Contact.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Contact, { foreignKey: 'company_id' });

Lead.belongsTo(Contact, { foreignKey: 'converted_contact_id', as: 'convertedContact' });

Opportunity.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });
Contact.hasMany(Opportunity, { foreignKey: 'contact_id' });

Opportunity.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Opportunity, { foreignKey: 'company_id' });

Activity.belongsTo(Contact, { foreignKey: 'contact_id' });
Activity.belongsTo(Company, { foreignKey: 'company_id' });
Activity.belongsTo(Lead, { foreignKey: 'lead_id' });
Activity.belongsTo(Opportunity, { foreignKey: 'opportunity_id' });

ServiceLevelAgreement.belongsTo(Company, { foreignKey: 'company_id' });
ServiceLevelAgreement.belongsTo(Contract, { foreignKey: 'contract_id' });

Contract.belongsTo(Company, { foreignKey: 'company_id' });
Company.hasMany(Contract, { foreignKey: 'company_id' });

Contract.belongsTo(Contact, { foreignKey: 'contact_id' });

SupportTicket.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });
SupportTicket.belongsTo(Company, { foreignKey: 'company_id' });
SupportTicket.belongsTo(ServiceLevelAgreement, { foreignKey: 'sla_id' });
SupportTicket.belongsTo(SupportTicket, { foreignKey: 'parent_ticket_id', as: 'parentTicket' });

// ERP associations
SalesOrder.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Customer.hasMany(SalesOrder, { foreignKey: 'customer_id' });

SalesOrder.belongsTo(Opportunity, { foreignKey: 'opportunity_id' });

PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id' });

PurchaseOrder.belongsTo(Department, { foreignKey: 'department_id' });

Inventory.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(Inventory, { foreignKey: 'product_id' });

Employee.belongsTo(Department, { foreignKey: 'department_id' });
Department.hasMany(Employee, { foreignKey: 'department_id' });

Employee.belongsTo(Employee, { foreignKey: 'manager_id', as: 'manager' });
Employee.hasMany(Employee, { foreignKey: 'manager_id', as: 'directReports' });

Department.belongsTo(Employee, { foreignKey: 'manager_id', as: 'manager' });

Department.belongsTo(Department, { foreignKey: 'parent_department_id', as: 'parentDepartment' });
Department.hasMany(Department, { foreignKey: 'parent_department_id', as: 'subDepartments' });

Project.belongsTo(Customer, { foreignKey: 'customer_id' });
Project.belongsTo(Company, { foreignKey: 'company_id' });
Project.belongsTo(Opportunity, { foreignKey: 'opportunity_id' });
Project.belongsTo(Employee, { foreignKey: 'project_manager_id', as: 'projectManager' });
Project.belongsTo(Department, { foreignKey: 'department_id' });

// Financial associations
Invoice.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Customer.hasMany(Invoice, { foreignKey: 'customer_id' });

Payment.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Payment.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Payment.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Payment.belongsTo(Account, { foreignKey: 'deposit_to_account_id', as: 'depositAccount' });
Payment.belongsTo(JournalEntry, { foreignKey: 'journal_entry_id', as: 'journalEntry' });

Account.belongsTo(Account, { foreignKey: 'parent_account_id', as: 'parentAccount' });
Account.hasMany(Account, { foreignKey: 'parent_account_id', as: 'subAccounts' });

// HR associations
Payroll.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Employee.hasMany(Payroll, { foreignKey: 'employee_id', as: 'payrolls' });

LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Employee.hasMany(LeaveRequest, { foreignKey: 'employee_id', as: 'leaveRequests' });

PerformanceReview.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
PerformanceReview.belongsTo(Employee, { foreignKey: 'reviewer_id', as: 'reviewer' });
Employee.hasMany(PerformanceReview, { foreignKey: 'employee_id', as: 'reviews' });

// Asset associations
Asset.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
Asset.belongsTo(Employee, { foreignKey: 'assigned_to_employee_id', as: 'assignedEmployee' });
Asset.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Asset.belongsTo(Account, { foreignKey: 'asset_account_id', as: 'assetAccount' });

MaintenanceSchedule.belongsTo(Asset, { foreignKey: 'asset_id', as: 'asset' });
Asset.hasMany(MaintenanceSchedule, { foreignKey: 'asset_id', as: 'maintenanceSchedules' });

MaintenanceSchedule.belongsTo(Employee, { foreignKey: 'assigned_to_employee_id', as: 'assignedEmployee' });
MaintenanceSchedule.belongsTo(Department, { foreignKey: 'assigned_to_department_id', as: 'assignedDepartment' });

// Schema Management associations
ForgeSchemaVersion.belongsTo(ForgeSchema, { foreignKey: 'schema_id', as: 'schema' });
ForgeSchema.hasMany(ForgeSchemaVersion, { foreignKey: 'schema_id', as: 'versions' });

ForgeSchemaVersion.belongsTo(ForgeSchemaVersion, { foreignKey: 'previous_version_id', as: 'previousVersion' });

ForgeSchemaDependency.belongsTo(ForgeSchema, { foreignKey: 'schema_id', as: 'schema' });
ForgeSchemaDependency.belongsTo(ForgeSchema, { foreignKey: 'depends_on_schema_id', as: 'dependsOnSchema' });
ForgeSchema.hasMany(ForgeSchemaDependency, { foreignKey: 'schema_id', as: 'dependencies' });
ForgeSchema.hasMany(ForgeSchemaDependency, { foreignKey: 'depends_on_schema_id', as: 'dependents' });

ForgeMigration.belongsTo(ForgeSchema, { foreignKey: 'from_schema_id', as: 'fromSchema' });
ForgeMigration.belongsTo(ForgeSchema, { foreignKey: 'to_schema_id', as: 'toSchema' });
ForgeSchema.hasMany(ForgeMigration, { foreignKey: 'to_schema_id', as: 'migrations' });

ForgeSchemaChange.belongsTo(ForgeSchema, { foreignKey: 'schema_id', as: 'schema' });
ForgeSchema.hasMany(ForgeSchemaChange, { foreignKey: 'schema_id', as: 'changes' });

// Report associations
Report.hasMany(ReportSchedule, { foreignKey: 'reportId', as: 'schedules' });
ReportSchedule.belongsTo(Report, { foreignKey: 'reportId', as: 'report' });

Report.hasMany(ReportExecution, { foreignKey: 'reportId', as: 'executions' });
ReportExecution.belongsTo(Report, { foreignKey: 'reportId', as: 'report' });

ReportSchedule.hasMany(ReportExecution, { foreignKey: 'scheduleId', as: 'executions' });
ReportExecution.belongsTo(ReportSchedule, { foreignKey: 'scheduleId', as: 'schedule' });

const models = {
  // Groupware
  Calendar,
  CalendarEvent,
  Task,
  TaskDependency,
  TaskAssignment,
  Document,
  WikiPage,
  Note,
  Folder,
  Board,
  BoardColumn,
  BoardCard,
  TimeEntry,

  // CRM
  Contact,
  Company,
  Lead,
  Opportunity,
  Activity,
  ServiceLevelAgreement,
  Contract,
  Service,
  Campaign,
  SupportTicket,

  // ERP
  Product,
  Customer,
  Invoice,
  SalesOrder,
  PurchaseOrder,
  Inventory,
  StockMovement,
  Supplier,
  Employee,
  Department,
  Project,
  Account,
  JournalEntry,
  Payment,
  Payroll,
  LeaveRequest,
  PerformanceReview,
  Asset,
  MaintenanceSchedule,

  // Shared
  CustomField,
  Comment,
  Report,
  ReportSchedule,
  ReportExecution,

  // Schema Management
  ForgeSchema,
  ForgeSchemaVersion,
  ForgeSchemaDependency,
  ForgeMigration,
  ForgeSchemaChange
};

module.exports = {
  sequelize,
  ...models
};
