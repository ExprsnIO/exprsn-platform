const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const didService = require('../services/didService');
const repositoryService = require('../services/repositoryService');
const { Account, Repository, Record } = require('../models');

// Import route modules
const sessionRoutes = require('./session');
const feedRoutes = require('./feed');
const graphRoutes = require('./graph');
const actorRoutes = require('./actor');
const blobRoutes = require('./blob');

// Mount routes
router.use(sessionRoutes);
router.use(feedRoutes);
router.use(graphRoutes);
router.use(actorRoutes);
router.use(blobRoutes);

// XRPC: Resolve handle
router.get('/com.atproto.identity.resolveHandle', asyncHandler(async (req, res) => {
  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Handle parameter is required'
    });
  }

  const result = await didService.resolveHandle(handle);

  if (!result) {
    return res.status(404).json({
      error: 'HandleNotFound',
      message: 'Handle not found'
    });
  }

  res.json(result);
}));

// XRPC: Get repository description
router.get('/com.atproto.repo.describeRepo', asyncHandler(async (req, res) => {
  const { repo } = req.query;

  if (!repo) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo parameter is required'
    });
  }

  const repository = await repositoryService.getRepository(repo);

  if (!repository) {
    return res.status(404).json({
      error: 'RepoNotFound',
      message: 'Repository not found'
    });
  }

  res.json({
    handle: repository.account.handle,
    did: repository.did,
    didDoc: await didService.resolveDID(repository.did),
    collections: [
      'app.bsky.feed.post',
      'app.bsky.feed.like',
      'app.bsky.graph.follow',
      'app.bsky.actor.profile'
    ],
    handleIsCorrect: true
  });
}));

// XRPC: Get record
router.get('/com.atproto.repo.getRecord', asyncHandler(async (req, res) => {
  const { repo, collection, rkey } = req.query;

  if (!repo || !collection || !rkey) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo, collection, and rkey parameters are required'
    });
  }

  const uri = `at://${repo}/${collection}/${rkey}`;
  const record = await repositoryService.getRecord(uri);

  if (!record) {
    return res.status(404).json({
      error: 'RecordNotFound',
      message: 'Record not found'
    });
  }

  res.json({
    uri: record.uri,
    cid: record.cid,
    value: record.value
  });
}));

// XRPC: List records
router.get('/com.atproto.repo.listRecords', asyncHandler(async (req, res) => {
  const { repo, collection, limit, cursor } = req.query;

  if (!repo || !collection) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo and collection parameters are required'
    });
  }

  const result = await repositoryService.listRecords(repo, collection, {
    limit: limit ? parseInt(limit) : 50,
    cursor
  });

  res.json({
    records: result.records.map(r => ({
      uri: r.uri,
      cid: r.cid,
      value: r.value
    })),
    cursor: result.cursor
  });
}));

// XRPC: Create record
router.post('/com.atproto.repo.createRecord', asyncHandler(async (req, res) => {
  const { repo, collection, rkey, record } = req.body;

  if (!repo || !collection || !record) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo, collection, and record are required'
    });
  }

  // Generate rkey if not provided
  const recordKey = rkey || didService.generateRev();

  const createdRecord = await repositoryService.createRecord(
    repo,
    collection,
    recordKey,
    record
  );

  res.status(201).json({
    uri: createdRecord.uri,
    cid: createdRecord.cid
  });
}));

// XRPC: Put record (update)
router.post('/com.atproto.repo.putRecord', asyncHandler(async (req, res) => {
  const { repo, collection, rkey, record } = req.body;

  if (!repo || !collection || !rkey || !record) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo, collection, rkey, and record are required'
    });
  }

  const updatedRecord = await repositoryService.updateRecord(
    repo,
    collection,
    rkey,
    record
  );

  res.json({
    uri: updatedRecord.uri,
    cid: updatedRecord.cid
  });
}));

// XRPC: Delete record
router.post('/com.atproto.repo.deleteRecord', asyncHandler(async (req, res) => {
  const { repo, collection, rkey } = req.body;

  if (!repo || !collection || !rkey) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Repo, collection, and rkey are required'
    });
  }

  await repositoryService.deleteRecord(repo, collection, rkey);

  res.json({ success: true });
}));

module.exports = router;
