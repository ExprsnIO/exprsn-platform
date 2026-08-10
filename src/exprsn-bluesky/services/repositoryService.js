const crypto = require('crypto');
const { logger } = require('@exprsn/shared');
const { Repository, Record, Account, Event } = require('../models');
const { Op } = require('sequelize');
const didService = require('./didService');
const { getRedisPub } = require('../config/redis');

class RepositoryService {
  async getRepository(did) {
    try {
      const repository = await Repository.findOne({
        where: { did },
        include: [{
          model: Account,
          as: 'account',
          attributes: ['did', 'handle', 'displayName', 'status']
        }]
      });

      return repository;
    } catch (error) {
      logger.error('Failed to get repository', {
        error: error.message,
        did
      });
      throw error;
    }
  }

  async createRecord(did, collection, rkey, value) {
    try {
      const repository = await this.getRepository(did);
      if (!repository) {
        throw new Error('Repository not found');
      }

      // Generate CID (content identifier)
      const cid = this.generateCID(value);

      // Generate URI
      const uri = `at://${did}/${collection}/${rkey}`;

      // Create record
      const record = await Record.create({
        repositoryId: repository.id,
        uri,
        cid,
        collection,
        rkey,
        value,
        indexedAt: new Date()
      });

      // Update repository stats
      await repository.update({
        recordCount: repository.recordCount + 1,
        rev: didService.generateRev()
      });

      // Create event for firehose
      await this.createEvent({
        accountId: repository.accountId,
        did,
        eventType: 'commit',
        operation: 'create',
        collection,
        rkey,
        record: value,
        cid,
        rev: repository.rev
      });

      logger.info('Record created', {
        uri,
        collection,
        did
      });

      return record;
    } catch (error) {
      logger.error('Failed to create record', {
        error: error.message,
        did,
        collection
      });
      throw error;
    }
  }

  async updateRecord(did, collection, rkey, value) {
    try {
      const repository = await this.getRepository(did);
      if (!repository) {
        throw new Error('Repository not found');
      }

      const uri = `at://${did}/${collection}/${rkey}`;
      const record = await Record.findOne({
        where: { uri }
      });

      if (!record) {
        throw new Error('Record not found');
      }

      // Generate new CID
      const cid = this.generateCID(value);

      // Update record
      await record.update({
        value,
        cid,
        indexedAt: new Date()
      });

      // Update repository rev
      await repository.update({
        rev: didService.generateRev()
      });

      // Create event
      await this.createEvent({
        accountId: repository.accountId,
        did,
        eventType: 'commit',
        operation: 'update',
        collection,
        rkey,
        record: value,
        cid,
        rev: repository.rev
      });

      logger.info('Record updated', {
        uri,
        collection
      });

      return record;
    } catch (error) {
      logger.error('Failed to update record', {
        error: error.message,
        did,
        collection
      });
      throw error;
    }
  }

  async deleteRecord(did, collection, rkey) {
    try {
      const repository = await this.getRepository(did);
      if (!repository) {
        throw new Error('Repository not found');
      }

      const uri = `at://${did}/${collection}/${rkey}`;
      const record = await Record.findOne({
        where: { uri }
      });

      if (!record) {
        throw new Error('Record not found');
      }

      // Delete record
      await record.destroy();

      // Update repository stats
      await repository.update({
        recordCount: Math.max(0, repository.recordCount - 1),
        rev: didService.generateRev()
      });

      // Create event
      await this.createEvent({
        accountId: repository.accountId,
        did,
        eventType: 'commit',
        operation: 'delete',
        collection,
        rkey,
        cid: record.cid,
        rev: repository.rev
      });

      logger.info('Record deleted', {
        uri,
        collection
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete record', {
        error: error.message,
        did,
        collection
      });
      throw error;
    }
  }

  async getRecord(uri) {
    try {
      const record = await Record.findOne({
        where: { uri }
      });

      return record;
    } catch (error) {
      logger.error('Failed to get record', {
        error: error.message,
        uri
      });
      throw error;
    }
  }

  async listRecords(did, collection, options = {}) {
    try {
      const { limit = 50, cursor } = options;

      const where = {
        collection
      };

      if (cursor) {
        where.indexedAt = { [Op.lt]: new Date(cursor) };
      }

      const repository = await this.getRepository(did);
      if (!repository) {
        throw new Error('Repository not found');
      }

      const records = await Record.findAll({
        where: {
          repositoryId: repository.id,
          ...where
        },
        order: [['indexedAt', 'DESC']],
        limit: limit + 1
      });

      const hasMore = records.length > limit;
      const items = hasMore ? records.slice(0, limit) : records;

      const nextCursor = hasMore
        ? items[items.length - 1].indexedAt.toISOString()
        : null;

      return {
        records: items,
        cursor: nextCursor
      };
    } catch (error) {
      logger.error('Failed to list records', {
        error: error.message,
        did,
        collection
      });
      throw error;
    }
  }

  async createEvent(eventData) {
    try {
      // Get next sequence number
      const lastEvent = await Event.findOne({
        order: [['seq', 'DESC']],
        attributes: ['seq']
      });

      const seq = lastEvent ? lastEvent.seq + 1 : 1;

      const event = await Event.create({
        ...eventData,
        seq,
        time: new Date()
      });

      // Publish to Redis for real-time updates
      const redisPub = getRedisPub();
      if (redisPub) {
        await redisPub.publish('bluesky:events', JSON.stringify({
          seq,
          did: eventData.did,
          time: event.time.toISOString(),
          eventType: eventData.eventType,
          operation: eventData.operation,
          collection: eventData.collection,
          rkey: eventData.rkey,
          record: eventData.record,
          cid: eventData.cid,
          rev: eventData.rev
        }));
      }

      return event;
    } catch (error) {
      logger.error('Failed to create event', {
        error: error.message
      });
      throw error;
    }
  }

  generateCID(value) {
    // Generate a simple hash as CID
    // In production, use proper IPLD/DAG-CBOR encoding and CIDv1
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(value));
    return `baf${hash.digest('hex').substring(0, 56)}`;
  }
}

module.exports = new RepositoryService();
