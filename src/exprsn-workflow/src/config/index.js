/**
 * Workflow Service Configuration
 */

module.exports = {
  workflow: {
    maxExecutionTime: parseInt(process.env.WORKFLOW_MAX_EXECUTION_TIME) || 300,
    maxRetries: parseInt(process.env.WORKFLOW_MAX_RETRIES) || 3,
    enableLogging: process.env.WORKFLOW_ENABLE_LOGGING !== 'false',
    enableNotifications: process.env.WORKFLOW_ENABLE_NOTIFICATIONS !== 'false'
  }
};
