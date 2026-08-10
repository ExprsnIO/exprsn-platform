/**
 * Migration: Resource Management & Capacity Planning
 *
 * Adds critical resource management features:
 * - Resource allocations (who's assigned to what % of time)
 * - Employee skills matrix (competencies and proficiency levels)
 * - Employee availability tracking (PTO, holidays, training)
 * - Resource utilization reporting
 *
 * Date: 2025-12-22
 * Author: Product Manager Agent
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // EMPLOYEE SKILLS MATRIX
    // ============================================

    await queryInterface.createTable('employee_skills', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      skill_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g., "JavaScript", "Project Management", "Python"'
      },
      skill_category: {
        type: Sequelize.ENUM('technical', 'soft_skill', 'domain_knowledge', 'tool', 'language', 'certification'),
        allowNull: false,
        defaultValue: 'technical'
      },
      proficiency_level: {
        type: Sequelize.ENUM('beginner', 'intermediate', 'advanced', 'expert'),
        allowNull: false,
        defaultValue: 'intermediate'
      },
      years_experience: {
        type: Sequelize.DECIMAL(4, 1),
        allowNull: true,
        comment: 'e.g., 3.5 years'
      },
      last_used_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When was this skill last used on a project?'
      },
      is_primary_skill: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Is this a core competency for this employee?'
      },
      certification: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'e.g., "AWS Certified Solutions Architect"'
      },
      certification_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      certification_expiry: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('employee_skills', ['employee_id']);
    await queryInterface.addIndex('employee_skills', ['skill_name']);
    await queryInterface.addIndex('employee_skills', ['proficiency_level']);
    await queryInterface.addIndex('employee_skills', ['skill_category']);
    await queryInterface.addConstraint('employee_skills', {
      fields: ['employee_id', 'skill_name'],
      type: 'unique',
      name: 'employee_skills_unique'
    });

    // ============================================
    // EMPLOYEE AVAILABILITY / UNAVAILABILITY
    // ============================================

    await queryInterface.createTable('employee_unavailability', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      unavailability_type: {
        type: Sequelize.ENUM('pto', 'vacation', 'sick_leave', 'holiday', 'training', 'conference', 'jury_duty', 'other'),
        allowNull: false,
        defaultValue: 'pto'
      },
      hours_unavailable: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Total hours unavailable (calculated from dates if not specified)'
      },
      is_paid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      status: {
        type: Sequelize.ENUM('requested', 'approved', 'denied', 'cancelled'),
        allowNull: false,
        defaultValue: 'requested'
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('employee_unavailability', ['employee_id']);
    await queryInterface.addIndex('employee_unavailability', ['start_date', 'end_date']);
    await queryInterface.addIndex('employee_unavailability', ['status']);
    await queryInterface.addIndex('employee_unavailability', ['unavailability_type']);

    // ============================================
    // RESOURCE ALLOCATIONS
    // ============================================

    await queryInterface.createTable('resource_allocations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'If NULL, this is a project-level allocation'
      },
      role_on_project: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g., "Lead Developer", "QA Engineer", "Project Manager"'
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      allocation_percentage: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: 'Percentage of time allocated (0-100, can exceed 100 if over-allocated)',
        validate: {
          min: 0,
          max: 200 // Allow up to 200% to detect over-allocation
        }
      },
      hours_per_week: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Alternative to percentage - specific hours per week'
      },
      total_hours_allocated: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Total hours for this allocation (calculated)'
      },
      actual_hours_worked: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Sum of time entries for this allocation'
      },
      status: {
        type: Sequelize.ENUM('planned', 'confirmed', 'active', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'planned'
      },
      is_billable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      billable_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Override default employee rate for this allocation'
      },
      allocated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Who created this allocation (usually PM or resource manager)'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('resource_allocations', ['employee_id']);
    await queryInterface.addIndex('resource_allocations', ['project_id']);
    await queryInterface.addIndex('resource_allocations', ['task_id']);
    await queryInterface.addIndex('resource_allocations', ['start_date', 'end_date']);
    await queryInterface.addIndex('resource_allocations', ['status']);
    await queryInterface.addIndex('resource_allocations', ['employee_id', 'start_date', 'end_date'], {
      name: 'idx_allocations_employee_dates'
    });

    // ============================================
    // RESOURCE CAPACITY (Weekly capacity tracking)
    // ============================================

    await queryInterface.createTable('resource_capacity', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      week_start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Monday of the week'
      },
      available_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 40,
        comment: 'Total hours available this week (typically 40)'
      },
      allocated_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Sum of allocations for this week'
      },
      unavailable_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Hours unavailable (PTO, holidays, etc.)'
      },
      actual_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Actual hours worked (from time entries)'
      },
      utilization_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Calculated: (allocated_hours / available_hours) * 100'
      },
      is_over_allocated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'True if allocated_hours > available_hours'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('resource_capacity', ['employee_id', 'week_start_date'], {
      unique: true,
      name: 'resource_capacity_employee_week_unique'
    });
    await queryInterface.addIndex('resource_capacity', ['week_start_date']);
    await queryInterface.addIndex('resource_capacity', ['is_over_allocated']);

    // ============================================
    // SKILL REQUIREMENTS (for projects/tasks)
    // ============================================

    await queryInterface.createTable('skill_requirements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      skill_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      required_proficiency: {
        type: Sequelize.ENUM('beginner', 'intermediate', 'advanced', 'expert'),
        allowNull: false,
        defaultValue: 'intermediate'
      },
      is_mandatory: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Must-have vs. nice-to-have skill'
      },
      estimated_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'How many hours of this skill needed?'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('skill_requirements', ['project_id']);
    await queryInterface.addIndex('skill_requirements', ['task_id']);
    await queryInterface.addIndex('skill_requirements', ['skill_name']);

    // Add constraint: either project_id or task_id must be set
    await queryInterface.sequelize.query(`
      ALTER TABLE skill_requirements
      ADD CONSTRAINT skill_requirements_entity_check
      CHECK (project_id IS NOT NULL OR task_id IS NOT NULL);
    `);

    // ============================================
    // VIEWS FOR REPORTING
    // ============================================

    // View: Employee utilization by week
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_employee_utilization AS
      SELECT
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        e.department_id,
        rc.week_start_date,
        rc.available_hours,
        rc.allocated_hours,
        rc.unavailable_hours,
        rc.actual_hours,
        rc.utilization_percentage,
        rc.is_over_allocated,
        CASE
          WHEN rc.utilization_percentage > 100 THEN 'over_allocated'
          WHEN rc.utilization_percentage >= 80 THEN 'optimal'
          WHEN rc.utilization_percentage >= 50 THEN 'moderate'
          ELSE 'under_utilized'
        END as utilization_status
      FROM employees e
      LEFT JOIN resource_capacity rc ON e.id = rc.employee_id
      ORDER BY rc.week_start_date DESC, e.last_name;
    `);

    // View: Resource allocation summary by project
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_project_resource_summary AS
      SELECT
        p.id as project_id,
        p.name as project_name,
        COUNT(DISTINCT ra.employee_id) as total_resources,
        SUM(ra.total_hours_allocated) as total_hours_allocated,
        SUM(ra.actual_hours_worked) as total_hours_worked,
        ROUND(
          CASE
            WHEN SUM(ra.total_hours_allocated) > 0
            THEN (SUM(ra.actual_hours_worked) / SUM(ra.total_hours_allocated)) * 100
            ELSE 0
          END, 2
        ) as hours_consumed_percentage,
        COUNT(CASE WHEN ra.status = 'active' THEN 1 END) as active_allocations,
        SUM(CASE WHEN ra.is_billable THEN ra.actual_hours_worked ELSE 0 END) as billable_hours_worked
      FROM projects p
      LEFT JOIN resource_allocations ra ON p.id = ra.project_id
      GROUP BY p.id, p.name;
    `);

    // View: Skills inventory
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_skills_inventory AS
      SELECT
        es.skill_name,
        es.skill_category,
        COUNT(DISTINCT es.employee_id) as employee_count,
        COUNT(CASE WHEN es.proficiency_level = 'expert' THEN 1 END) as expert_count,
        COUNT(CASE WHEN es.proficiency_level = 'advanced' THEN 1 END) as advanced_count,
        COUNT(CASE WHEN es.proficiency_level = 'intermediate' THEN 1 END) as intermediate_count,
        COUNT(CASE WHEN es.proficiency_level = 'beginner' THEN 1 END) as beginner_count,
        COUNT(CASE WHEN es.is_primary_skill = true THEN 1 END) as primary_skill_count,
        ROUND(AVG(es.years_experience), 1) as avg_years_experience
      FROM employee_skills es
      JOIN employees e ON es.employee_id = e.id
      GROUP BY es.skill_name, es.skill_category
      ORDER BY employee_count DESC;
    `);

    console.log('✅ Resource Management module created successfully!');
    console.log('');
    console.log('Tables:');
    console.log('  - employee_skills (Skills matrix with proficiency levels)');
    console.log('  - employee_unavailability (PTO, holidays, training)');
    console.log('  - resource_allocations (Who is assigned where and when)');
    console.log('  - resource_capacity (Weekly capacity tracking)');
    console.log('  - skill_requirements (Required skills for projects/tasks)');
    console.log('');
    console.log('Views:');
    console.log('  - v_employee_utilization (Weekly utilization by employee)');
    console.log('  - v_project_resource_summary (Resource summary by project)');
    console.log('  - v_skills_inventory (Organization-wide skills inventory)');
    console.log('');
    console.log('Key Features:');
    console.log('  ✓ Track resource allocation % by project/task');
    console.log('  ✓ Detect over-allocation (capacity > 100%)');
    console.log('  ✓ Skills matrix with proficiency levels');
    console.log('  ✓ PTO and availability tracking');
    console.log('  ✓ Weekly capacity planning');
    console.log('  ✓ Skill-based resource matching');
    console.log('');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_skills_inventory;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_project_resource_summary;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_employee_utilization;');
    await queryInterface.dropTable('skill_requirements');
    await queryInterface.dropTable('resource_capacity');
    await queryInterface.dropTable('resource_allocations');
    await queryInterface.dropTable('employee_unavailability');
    await queryInterface.dropTable('employee_skills');
  }
};
