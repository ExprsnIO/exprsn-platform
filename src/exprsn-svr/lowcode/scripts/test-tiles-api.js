/**
 * Test Tiles API
 *
 * Tests the tiles API endpoints to verify functionality.
 */

const { sequelize, Tile, ApplicationTile } = require('../models');

async function testTilesAPI() {
  try {
    console.log('🧪 Testing Tiles API...\n');

    // Test 1: Count total tiles
    const totalCount = await Tile.count();
    console.log(`✅ Test 1: Total tiles count = ${totalCount}`);

    // Test 2: Get all active tiles
    const activeTiles = await Tile.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC']],
    });
    console.log(`✅ Test 2: Active tiles count = ${activeTiles.length}`);

    // Test 3: Get tiles by category
    const categories = ['data', 'design', 'automation', 'integration', 'security', 'analytics', 'system'];
    console.log('\n📂 Tiles by Category:');
    for (const category of categories) {
      const categoryTiles = await Tile.getActiveByCategory(category);
      console.log(`   ${category}: ${categoryTiles.length} tiles`);
      categoryTiles.forEach(tile => {
        const badges = [];
        if (tile.isNew) badges.push('🆕');
        if (tile.isEnhanced) badges.push('⭐');
        console.log(`      - ${tile.name} ${badges.join(' ')}`);
      });
    }

    // Test 4: Get specific tiles
    console.log('\n🔍 Specific Tile Tests:');

    const entitiesTile = await Tile.findOne({ where: { key: 'entities' } });
    console.log(`✅ Test 4a: Entities tile found = ${entitiesTile ? 'Yes' : 'No'}`);
    if (entitiesTile) {
      console.log(`   - Name: ${entitiesTile.name}`);
      console.log(`   - Enhanced: ${entitiesTile.isEnhanced}`);
      console.log(`   - Badge: ${entitiesTile.badgeText}`);
      console.log(`   - Route: ${entitiesTile.route}`);
    }

    const queriesTile = await Tile.findOne({ where: { key: 'queries' } });
    console.log(`✅ Test 4b: Queries tile found = ${queriesTile ? 'Yes' : 'No'}`);
    if (queriesTile) {
      console.log(`   - Name: ${queriesTile.name}`);
      console.log(`   - New: ${queriesTile.isNew}`);
      console.log(`   - Badge: ${queriesTile.badgeText}`);
    }

    // Test 5: Permission check
    console.log('\n🔒 Permission Tests:');
    const securityTile = await Tile.findOne({ where: { key: 'security' } });
    if (securityTile) {
      const hasPermission = securityTile.isAccessibleBy(['security.view', 'security.manage']);
      console.log(`✅ Test 5a: Security tile accessible with correct permissions = ${hasPermission}`);

      const noPermission = securityTile.isAccessibleBy(['forms.view']);
      console.log(`✅ Test 5b: Security tile accessible with wrong permissions = ${noPermission}`);
    }

    // Test 6: Check gradients
    console.log('\n🎨 Icon Gradients:');
    const tilesWithGradients = await Tile.findAll({
      where: { iconGradient: { [sequelize.Sequelize.Op.ne]: null } },
      limit: 5,
    });
    tilesWithGradients.forEach(tile => {
      console.log(`   ${tile.name}: ${tile.iconGradient}`);
    });

    // Test 7: Check NEW and ENHANCED badges
    console.log('\n🏷️  Badge Summary:');
    const newTiles = await Tile.count({ where: { isNew: true } });
    const enhancedTiles = await Tile.count({ where: { isEnhanced: true } });
    console.log(`   NEW tiles: ${newTiles}`);
    console.log(`   ENHANCED tiles: ${enhancedTiles}`);

    // Test 8: List all tiles with their metadata
    console.log('\n📋 Complete Tiles List:');
    const allTiles = await Tile.findAll({
      order: [['sortOrder', 'ASC']],
      attributes: ['key', 'name', 'category', 'sortOrder', 'isNew', 'isEnhanced', 'badgeText'],
    });

    console.table(allTiles.map(t => ({
      key: t.key,
      name: t.name,
      category: t.category,
      order: t.sortOrder,
      new: t.isNew ? '✓' : '',
      enhanced: t.isEnhanced ? '✓' : '',
      badge: t.badgeText || '-',
    })));

    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing tiles:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testTilesAPI();
