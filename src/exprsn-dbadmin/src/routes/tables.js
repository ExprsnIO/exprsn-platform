const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const TableService = require('../services/TableService');
const { Connection } = require('../models');

router.get('/', asyncHandler(async (req, res) => {
  const { connectionId, schema = 'public' } = req.query;
  const connection = await Connection.findByPk(connectionId);
  const tables = await TableService.listTables(connection, schema);
  res.json({ success: true, data: tables });
}));

router.get('/:schema/:table', asyncHandler(async (req, res) => {
  const { connectionId } = req.query;
  const { schema, table } = req.params;
  const connection = await Connection.findByPk(connectionId);
  const details = await TableService.getTableDetails(connection, schema, table);
  res.json({ success: true, data: details });
}));

router.get('/:schema/:table/data', asyncHandler(async (req, res) => {
  const { connectionId, limit, offset, orderBy, orderDir, where } = req.query;
  const { schema, table } = req.params;
  const connection = await Connection.findByPk(connectionId);
  const data = await TableService.getTableData(connection, schema, table, { limit, offset, orderBy, orderDir, where });
  res.json({ success: true, data });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { connectionId, schema, name, columns } = req.body;
  const connection = await Connection.findByPk(connectionId);
  const result = await TableService.createTable(connection, schema, name, columns);
  res.status(201).json(result);
}));

router.delete('/:schema/:table', asyncHandler(async (req, res) => {
  const { connectionId, cascade } = req.query;
  const { schema, table } = req.params;
  const connection = await Connection.findByPk(connectionId);
  const result = await TableService.dropTable(connection, schema, table, cascade);
  res.json(result);
}));

module.exports = router;
