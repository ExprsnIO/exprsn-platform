const auditService = require('../services/auditService');

/**
 * Middleware to automatically log API requests
 */
const auditMiddleware = (eventType, options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();

    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseData = null;
    let responseSent = false;

    // Override res.json to capture response
    res.json = function(data) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalJson(data);
    };

    // Override res.send to capture response
    res.send = function(data) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalSend(data);
    };

    // Log after response is sent
    res.on('finish', async () => {
      try {
        const durationMs = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 400;

        // Extract IDs from request
        const workflowId = req.params.workflowId || req.params.id || req.body?.workflow_id;
        const executionId = req.params.executionId || req.body?.execution_id;
        const userId = req.user?.id || req.user?.userId;

        // Build metadata
        const metadata = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          ...options.metadata
        };

        // Determine severity
        let severity = 'info';
        if (res.statusCode >= 500) severity = 'critical';
        else if (res.statusCode >= 400) severity = 'error';
        else if (res.statusCode >= 300) severity = 'warning';

        await auditService.log({
          eventType,
          workflowId,
          executionId,
          userId,
          userIp: req.ip,
          userAgent: req.get('user-agent'),
          success,
          errorMessage: success ? null : responseData?.error || responseData?.message,
          durationMs,
          severity,
          metadata
        });
      } catch (error) {
        // Never fail the request due to audit logging errors
        console.error('Audit middleware error:', error);
      }
    });

    next();
  };
};

module.exports = auditMiddleware;
