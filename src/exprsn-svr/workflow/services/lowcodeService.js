/**
 * Low-Code Platform Integration Service
 *
 * Handles communication with exprsn-svr Low-Code Platform
 * for entity CRUD operations from workflows.
 */

const axios = require('axios');
const logger = require('../utils/logger');

class LowCodeService {
  constructor() {
    this.baseUrl = process.env.LOWCODE_URL || 'http://localhost:5000';
    this.apiPath = '/lowcode/api';
  }

  /**
   * Get full API URL
   */
  getUrl(path) {
    return `${this.baseUrl}${this.apiPath}${path}`;
  }

  /**
   * Create entity record
   */
  async createRecord(entityId, data, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Creating Low-Code entity record', { entityId, applicationId });

      const response = await axios.post(
        this.getUrl(`/entities/${entityId}/records`),
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      logger.info('Low-Code entity record created', {
        entityId,
        recordId: response.data.id
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to create Low-Code entity record', {
        entityId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Read entity record
   */
  async readRecord(entityId, recordId, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Reading Low-Code entity record', { entityId, recordId });

      const response = await axios.get(
        this.getUrl(`/entities/${entityId}/records/${recordId}`),
        {
          headers: {
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to read Low-Code entity record', {
        entityId,
        recordId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Update entity record
   */
  async updateRecord(entityId, recordId, data, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Updating Low-Code entity record', { entityId, recordId });

      const response = await axios.put(
        this.getUrl(`/entities/${entityId}/records/${recordId}`),
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      logger.info('Low-Code entity record updated', { entityId, recordId });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to update Low-Code entity record', {
        entityId,
        recordId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Delete entity record
   */
  async deleteRecord(entityId, recordId, options = {}) {
    try {
      const { userId, applicationId, softDelete = true } = options;

      logger.info('Deleting Low-Code entity record', {
        entityId,
        recordId,
        softDelete
      });

      const response = await axios.delete(
        this.getUrl(`/entities/${entityId}/records/${recordId}`),
        {
          headers: {
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          params: { softDelete },
          timeout: options.timeout || 30000
        }
      );

      logger.info('Low-Code entity record deleted', { entityId, recordId });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to delete Low-Code entity record', {
        entityId,
        recordId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Query entity records
   */
  async queryRecords(entityId, query = {}, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Querying Low-Code entity records', { entityId, query });

      const response = await axios.post(
        this.getUrl(`/entities/${entityId}/query`),
        {
          filter: query.filter || {},
          sort: query.sort || {},
          limit: query.limit || 100,
          offset: query.offset || 0,
          fields: query.fields || []
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      logger.info('Low-Code entity records retrieved', {
        entityId,
        count: response.data.records?.length || 0
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to query Low-Code entity records', {
        entityId,
        query,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Execute entity formula/computed field
   */
  async executeFormula(entityId, recordId, formulaName, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Executing Low-Code entity formula', {
        entityId,
        recordId,
        formulaName
      });

      const response = await axios.post(
        this.getUrl(`/entities/${entityId}/records/${recordId}/formulas/${formulaName}`),
        {},
        {
          headers: {
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to execute Low-Code entity formula', {
        entityId,
        recordId,
        formulaName,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Get entity metadata
   */
  async getEntityMetadata(entityId, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Getting Low-Code entity metadata', { entityId });

      const response = await axios.get(
        this.getUrl(`/entities/${entityId}`),
        {
          headers: {
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to get Low-Code entity metadata', {
        entityId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Batch create records
   */
  async batchCreateRecords(entityId, records, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Batch creating Low-Code entity records', {
        entityId,
        count: records.length
      });

      const response = await axios.post(
        this.getUrl(`/entities/${entityId}/records/batch`),
        { records },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 60000
        }
      );

      logger.info('Low-Code entity records batch created', {
        entityId,
        count: response.data.created?.length || 0
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to batch create Low-Code entity records', {
        entityId,
        count: records.length,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Trigger Low-Code form workflow
   */
  async triggerFormWorkflow(formId, workflowId, formData, options = {}) {
    try {
      const { userId, applicationId } = options;

      logger.info('Triggering Low-Code form workflow', {
        formId,
        workflowId
      });

      const response = await axios.post(
        this.getUrl(`/forms/${formId}/workflows/${workflowId}/trigger`),
        formData,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(userId && { 'X-User-Id': userId }),
            ...(applicationId && { 'X-Application-Id': applicationId })
          },
          timeout: options.timeout || 30000
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to trigger Low-Code form workflow', {
        formId,
        workflowId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }
}

module.exports = new LowCodeService();
