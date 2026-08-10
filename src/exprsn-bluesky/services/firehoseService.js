const { logger } = require('@exprsn/shared');
const { Event } = require('../models');
const { emitFirehoseEvent } = require('./socketService');
const { getRedisSub } = require('../config/redis');

let firehoseInterval = null;
let currentSeq = 0;

async function startFirehose(io) {
  try {
    // Get latest sequence number
    const latestEvent = await Event.findOne({
      order: [['seq', 'DESC']],
      attributes: ['seq']
    });

    currentSeq = latestEvent ? latestEvent.seq : 0;
    logger.info('Firehose starting', { currentSeq });

    // Listen to Redis pub/sub for real-time events
    const redisSub = getRedisSub();
    if (redisSub) {
      await redisSub.subscribe('bluesky:events', (message) => {
        try {
          const event = JSON.parse(message);
          broadcastEvent(io, event);
        } catch (error) {
          logger.error('Failed to parse firehose event from Redis', {
            error: error.message
          });
        }
      });

      logger.info('Subscribed to Redis events channel');
    }

    // Fallback: Poll database for new events every 1 second
    firehoseInterval = setInterval(async () => {
      try {
        const newEvents = await Event.findAll({
          where: {
            seq: { [require('sequelize').Op.gt]: currentSeq }
          },
          order: [['seq', 'ASC']],
          limit: 100
        });

        if (newEvents.length > 0) {
          newEvents.forEach(event => {
            broadcastEvent(io, formatEvent(event));
          });

          currentSeq = newEvents[newEvents.length - 1].seq;
        }
      } catch (error) {
        logger.error('Firehose polling error', {
          error: error.message
        });
      }
    }, 1000);

    logger.info('Firehose started successfully');
  } catch (error) {
    logger.error('Failed to start firehose', {
      error: error.message,
      stack: error.stack
    });
  }
}

function stopFirehose() {
  if (firehoseInterval) {
    clearInterval(firehoseInterval);
    firehoseInterval = null;
    logger.info('Firehose stopped');
  }
}

function broadcastEvent(io, event) {
  const collections = event.collection ? [event.collection] : [];
  emitFirehoseEvent(io, event, collections);

  logger.debug('Firehose event broadcast', {
    seq: event.seq,
    type: event.eventType,
    collection: event.collection
  });
}

function formatEvent(dbEvent) {
  return {
    seq: dbEvent.seq,
    did: dbEvent.did,
    time: dbEvent.time.toISOString(),
    type: dbEvent.eventType,
    operation: dbEvent.operation,
    collection: dbEvent.collection,
    rkey: dbEvent.rkey,
    record: dbEvent.record,
    cid: dbEvent.cid,
    rev: dbEvent.rev
  };
}

module.exports = {
  startFirehose,
  stopFirehose
};
