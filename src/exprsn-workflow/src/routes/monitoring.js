const express = require('express');
const router = express.Router();
const { WorkflowExecution, Workflow, WorkflowLog } = require('../models');
const { Op } = require('sequelize');
const executionEngine = require('../services/executionEngine');

router.get('/running', async (req, res) => {
    try {
        const executions = await WorkflowExecution.findAll({
            where: { status: { [Op.in]: ['running', 'pending'] } },
            include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'] }],
            order: [['started_at', 'DESC']],
            limit: 100
        });
        res.json({ success: true, data: executions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/approvals', async (req, res) => {
    try {
        const executions = await WorkflowExecution.findAll({
            where: { status: 'waiting_approval' },
            include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'] }]
        });

        const approvals = executions.flatMap(e => {
            const pending = e.context?.pendingApprovals || {};
            return Object.values(pending).map(a => ({
                ...a,
                workflow: e.workflow
            }));
        });

        res.json({ success: true, data: approvals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/history', async (req, res) => {
    try {
        const { limit = 50, search } = req.query;

        const where = {
            status: { [Op.in]: ['completed', 'failed', 'cancelled'] }
        };

        const executions = await WorkflowExecution.findAll({
            where,
            include: [{
                model: Workflow,
                as: 'workflow',
                attributes: ['id', 'name'],
                where: search ? { name: { [Op.iLike]: `%${search}%` } } : undefined
            }],
            order: [['completed_at', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ success: true, data: executions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [running, waitingApproval, completedToday, failedToday] = await Promise.all([
            WorkflowExecution.count({ where: { status: 'running' } }),
            WorkflowExecution.count({ where: { status: 'waiting_approval' } }),
            WorkflowExecution.count({ where: { status: 'completed', completed_at: { [Op.gte]: today } } }),
            WorkflowExecution.count({ where: { status: 'failed', completed_at: { [Op.gte]: today } } })
        ]);

        res.json({
            success: true,
            data: { running, waitingApproval, completedToday, failedToday }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
