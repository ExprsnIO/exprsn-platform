const { logger } = require('@exprsn/shared');
const connectionPoolManager = require('../services/ConnectionPoolManager');
const { decrypt } = require('../utils/encryption');

/**
 * Socket.IO event handlers for real-time query execution and monitoring
 */
module.exports = (io) => {
  io.on('connection', (socket) => {
    logger.info('Socket client connected', {
      socketId: socket.id,
      ip: socket.handshake.address
    });

    /**
     * Execute a SQL query with real-time result streaming
     */
    socket.on('query:execute', async (data) => {
      const { connectionId, query, connectionConfig } = data;

      try {
        logger.info('Executing query via socket', {
          socketId: socket.id,
          connectionId,
          queryLength: query.length
        });

        // Emit query started event
        socket.emit('query:started', {
          connectionId,
          timestamp: new Date().toISOString()
        });

        const startTime = Date.now();

        // Execute query
        const result = await connectionPoolManager.executeQuery(
          connectionConfig,
          query
        );

        const executionTime = Date.now() - startTime;

        // Emit success with results
        socket.emit('query:success', {
          connectionId,
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields,
          command: result.command,
          executionTimeMs: executionTime,
          timestamp: new Date().toISOString()
        });

        logger.info('Query executed successfully via socket', {
          socketId: socket.id,
          connectionId,
          rowCount: result.rowCount,
          executionTimeMs: executionTime
        });

      } catch (error) {
        logger.error('Query execution failed via socket', {
          socketId: socket.id,
          connectionId,
          error: error.message,
          stack: error.stack
        });

        socket.emit('query:error', {
          connectionId,
          error: error.message,
          code: error.code,
          position: error.position,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Execute multiple queries in a transaction
     */
    socket.on('transaction:execute', async (data) => {
      const { connectionId, queries, connectionConfig } = data;

      try {
        socket.emit('transaction:started', {
          connectionId,
          queryCount: queries.length,
          timestamp: new Date().toISOString()
        });

        const startTime = Date.now();

        const results = await connectionPoolManager.executeTransaction(
          connectionConfig,
          queries
        );

        const executionTime = Date.now() - startTime;

        socket.emit('transaction:success', {
          connectionId,
          results,
          executionTimeMs: executionTime,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Transaction failed via socket', {
          socketId: socket.id,
          connectionId,
          error: error.message
        });

        socket.emit('transaction:error', {
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Stream large result sets in chunks
     */
    socket.on('query:stream', async (data) => {
      const { connectionId, query, connectionConfig, chunkSize = 100 } = data;

      try {
        socket.emit('stream:started', {
          connectionId,
          timestamp: new Date().toISOString()
        });

        // For simplicity, we'll fetch all and stream in chunks
        // In production, use cursor-based streaming
        const result = await connectionPoolManager.executeQuery(
          connectionConfig,
          query
        );

        const totalRows = result.rows.length;
        let sentRows = 0;

        // Send results in chunks
        for (let i = 0; i < totalRows; i += chunkSize) {
          const chunk = result.rows.slice(i, i + chunkSize);

          socket.emit('stream:chunk', {
            connectionId,
            rows: chunk,
            chunkNumber: Math.floor(i / chunkSize) + 1,
            totalChunks: Math.ceil(totalRows / chunkSize),
            progress: ((i + chunk.length) / totalRows) * 100
          });

          sentRows += chunk.length;

          // Small delay to prevent overwhelming the client
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        socket.emit('stream:completed', {
          connectionId,
          totalRows,
          fields: result.fields,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Query streaming failed', {
          socketId: socket.id,
          error: error.message
        });

        socket.emit('stream:error', {
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Test a database connection
     */
    socket.on('connection:test', async (data) => {
      const { connectionConfig } = data;

      try {
        const result = await connectionPoolManager.testConnection(connectionConfig);

        socket.emit('connection:test:result', {
          success: result.success,
          version: result.version,
          size: result.size,
          message: result.message,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        socket.emit('connection:test:result', {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Get real-time database statistics
     */
    socket.on('stats:subscribe', async (data) => {
      const { connectionId, connectionConfig, interval = 5000 } = data;

      const PostgreSQLService = require('../services/PostgreSQLService');

      // Start periodic stats updates
      const statsInterval = setInterval(async () => {
        try {
          const stats = await PostgreSQLService.getDatabaseStats(connectionConfig);
          const sessions = await PostgreSQLService.getActiveSessions(connectionConfig);

          socket.emit('stats:update', {
            connectionId,
            stats,
            sessions,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          logger.error('Stats update failed', {
            socketId: socket.id,
            error: error.message
          });
        }
      }, interval);

      // Store interval ID on socket for cleanup
      socket.data.statsInterval = statsInterval;

      logger.info('Client subscribed to stats', {
        socketId: socket.id,
        connectionId,
        interval
      });
    });

    /**
     * Unsubscribe from stats updates
     */
    socket.on('stats:unsubscribe', () => {
      if (socket.data.statsInterval) {
        clearInterval(socket.data.statsInterval);
        delete socket.data.statsInterval;

        logger.info('Client unsubscribed from stats', {
          socketId: socket.id
        });
      }
    });

    /**
     * Cancel a running query
     */
    socket.on('query:cancel', async (data) => {
      const { connectionId, pid } = data;

      try {
        const PostgreSQLService = require('../services/PostgreSQLService');
        await PostgreSQLService.killSession(data.connectionConfig, pid);

        socket.emit('query:cancelled', {
          connectionId,
          pid,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        socket.emit('query:cancel:error', {
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Client disconnect
     */
    socket.on('disconnect', () => {
      // Clean up any intervals
      if (socket.data.statsInterval) {
        clearInterval(socket.data.statsInterval);
      }

      logger.info('Socket client disconnected', {
        socketId: socket.id
      });
    });

  });

  logger.info('Socket.IO handlers initialized');
};
