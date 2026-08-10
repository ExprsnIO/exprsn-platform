const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');
const FormData = require('form-data');

const FILEVAULT_SERVICE_URL = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

class FilevaultIntegration {
  async uploadBlob(buffer, metadata) {
    try {
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: metadata.filename || 'blob',
        contentType: metadata.mimeType
      });
      formData.append('metadata', JSON.stringify({
        source: 'bluesky',
        ...metadata
      }));

      const response = await serviceRequest({
        method: 'POST',
        url: `${FILEVAULT_SERVICE_URL}/api/files/upload`,
        data: formData,
        headers: formData.getHeaders(),
        serviceName: 'exprsn-bluesky',
        resource: `${FILEVAULT_SERVICE_URL}/api/files/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to upload blob to filevault', {
        error: error.message,
        size: buffer.length
      });
      throw error;
    }
  }

  async getBlob(fileId) {
    try {
      const response = await serviceRequest({
        method: 'GET',
        url: `${FILEVAULT_SERVICE_URL}/api/files/${fileId}`,
        serviceName: 'exprsn-bluesky',
        resource: `${FILEVAULT_SERVICE_URL}/api/files/*`,
        permissions: { read: true },
        responseType: 'arraybuffer'
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get blob from filevault', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  async deleteBlob(fileId) {
    try {
      const response = await serviceRequest({
        method: 'DELETE',
        url: `${FILEVAULT_SERVICE_URL}/api/files/${fileId}`,
        serviceName: 'exprsn-bluesky',
        resource: `${FILEVAULT_SERVICE_URL}/api/files/*`,
        permissions: { delete: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to delete blob from filevault', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }
}

module.exports = new FilevaultIntegration();
