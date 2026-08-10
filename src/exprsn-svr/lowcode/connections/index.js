/**
 * Connections Index
 *
 * Exports all connection handlers and the connection manager.
 */

const ConnectionManager = require('./ConnectionManager');
const BaseConnectionHandler = require('./BaseConnectionHandler');
const PostgreSQLConnectionHandler = require('./PostgreSQLConnectionHandler');
const ForgeConnectionHandler = require('./ForgeConnectionHandler');
const RESTConnectionHandler = require('./RESTConnectionHandler');
const SOAPConnectionHandler = require('./SOAPConnectionHandler');
const FileConnectionHandler = require('./FileConnectionHandler');

module.exports = {
  // Connection Manager (singleton)
  ConnectionManager,

  // Base Handler
  BaseConnectionHandler,

  // Specific Handlers
  PostgreSQLConnectionHandler,
  ForgeConnectionHandler,
  RESTConnectionHandler,
  SOAPConnectionHandler,
  FileConnectionHandler
};
