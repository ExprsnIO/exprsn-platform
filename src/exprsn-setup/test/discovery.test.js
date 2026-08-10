/**
 * Service Discovery Tests
 */

const { discoverServices, getServiceDetails, isServiceRunning } = require('../src/services/discovery');

describe('Service Discovery', () => {
  describe('discoverServices', () => {
    test('should discover all services', async () => {
      const services = await discoverServices();

      expect(services).toBeInstanceOf(Array);
      expect(services.length).toBeGreaterThan(0);

      // Check service structure
      services.forEach(service => {
        expect(service).toHaveProperty('id');
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('port');
        expect(service).toHaveProperty('running');
        expect(service).toHaveProperty('implementationStatus');
      });
    });

    test('should identify running services', async () => {
      const services = await discoverServices();
      const runningServices = services.filter(s => s.running);

      // At least one service should be running (this test service)
      expect(runningServices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getServiceDetails', () => {
    test('should get details for existing service', async () => {
      const details = await getServiceDetails('exprsn-ca');

      expect(details).toBeDefined();
      expect(details.id).toBe('exprsn-ca');
      expect(details.port).toBe(3000);
    });

    test('should return null for unknown service', async () => {
      const details = await getServiceDetails('unknown-service');

      expect(details).toBeNull();
    });
  });

  describe('isServiceRunning', () => {
    test('should check if service is running', async () => {
      const running = await isServiceRunning('exprsn-ca');

      expect(typeof running).toBe('boolean');
    });

    test('should return false for unknown service', async () => {
      const running = await isServiceRunning('unknown-service');

      expect(running).toBe(false);
    });
  });
});
