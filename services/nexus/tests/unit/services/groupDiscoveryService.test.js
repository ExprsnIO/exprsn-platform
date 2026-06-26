const groupDiscoveryService = require('../../../src/services/groupDiscoveryService');
const { Group } = require('../../../src/models');

// Mock models and Redis (cache miss so the query path always runs).
jest.mock('../../../src/models');
jest.mock('../../../src/config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK')
}));

// Build a candidate group as Sequelize returns it: DECIMAL coords come back as
// strings and instances expose toJSON().
function fakeGroup(id, latitude, longitude) {
  return {
    id,
    name: id,
    latitude: String(latitude),
    longitude: String(longitude),
    toJSON() {
      return { id: this.id, name: this.name, latitude: this.latitude, longitude: this.longitude };
    }
  };
}

describe('groupDiscoveryService.findGroupsNearLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['latitude > 90', 200, 0],
    ['longitude > 180', 0, 200],
    ['NaN latitude', NaN, 0]
  ])('rejects %s', async (_label, lat, lng) => {
    await expect(groupDiscoveryService.findGroupsNearLocation(lat, lng, 50))
      .rejects.toThrow('INVALID_COORDINATES');
  });

  it('ranks candidates by distance, attaches distanceKm, and drops out-of-radius groups', async () => {
    // Around (0,0): 1° of longitude on the equator ≈ 111.19 km.
    Group.findAll = jest.fn().mockResolvedValue([
      fakeGroup('far', 0, 2.0),   // ≈ 222 km — excluded at radius 100
      fakeGroup('mid', 0, 0.5),   // ≈ 55.6 km
      fakeGroup('near', 0, 0.2)   // ≈ 22.2 km
    ]);

    const result = await groupDiscoveryService.findGroupsNearLocation(0, 0, 100, { limit: 20 });

    expect(result.map((g) => g.id)).toEqual(['near', 'mid']); // nearest first, 'far' dropped
    expect(result[0].distanceKm).toBeGreaterThan(0);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    // Sanity-check the Haversine magnitude (~22 km for 0.2°).
    expect(result[0].distanceKm).toBeCloseTo(22.24, 0);
  });

  it('applies limit/offset after distance ranking', async () => {
    Group.findAll = jest.fn().mockResolvedValue([
      fakeGroup('a', 0, 0.1),
      fakeGroup('b', 0, 0.2),
      fakeGroup('c', 0, 0.3)
    ]);

    const page = await groupDiscoveryService.findGroupsNearLocation(0, 0, 1000, { limit: 1, offset: 1 });
    expect(page.map((g) => g.id)).toEqual(['b']); // second-nearest
  });

  it('queries with an active/visibility + latitude bounding-box filter', async () => {
    Group.findAll = jest.fn().mockResolvedValue([]);

    await groupDiscoveryService.findGroupsNearLocation(40.0, -74.0, 25, {});

    const where = Group.findAll.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.visibility).toBeDefined();
    expect(where.latitude).toBeDefined(); // bounding-box prefilter present
    expect(where.longitude).toBeDefined();
  });
});
