/**
 * Seed HTML App Builder Libraries and Components
 */

const { Sequelize } = require('sequelize');
const path = require('path');

// Database configuration
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'exprsn_svr',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: false // Suppress SQL logging for cleaner output
});

async function seedData() {
  try {
    console.log('🔍 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');

    // Load seeders
    console.log('📦 Loading seeders...');
    const librariesSeeder = require('../lowcode/seeders/seed-html-libraries.js');
    const componentsSeeder = require('../lowcode/seeders/seed-html-components.js');

    // Seed libraries
    console.log('\n🌐 Seeding HTML libraries...');
    await librariesSeeder.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ Libraries seeded successfully!');
    console.log('   - 14 popular libraries installed:');
    console.log('     • jQuery 3.7.1');
    console.log('     • jQuery UI 1.13.2');
    console.log('     • Bootstrap 5.3.2 (CSS + JS)');
    console.log('     • Lodash 4.17.21');
    console.log('     • Moment.js 2.29.4');
    console.log('     • Chart.js 4.4.0');
    console.log('     • DataTables 1.13.7');
    console.log('     • Select2 4.1.0');
    console.log('     • Axios 1.6.2');
    console.log('     • Socket.IO Client 4.5.4');
    console.log('     • Font Awesome 6.5.1');
    console.log('     • Animate.css 4.1.1');
    console.log('     • Tailwind CSS 3.3.0');
    console.log('     • Bulma 0.9.4');

    // Seed components
    console.log('\n🧩 Seeding HTML components...');
    await componentsSeeder.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ Components seeded successfully!');
    console.log('   - 11 system components installed:');
    console.log('     Layout:');
    console.log('       • Container');
    console.log('       • Card');
    console.log('       • Modal');
    console.log('     Forms:');
    console.log('       • Text Input');
    console.log('       • Button');
    console.log('     Data:');
    console.log('       • Data Table');
    console.log('     Charts:');
    console.log('       • Line Chart');
    console.log('     Navigation:');
    console.log('       • Navbar');
    console.log('     Display:');
    console.log('       • Alert');
    console.log('       • Progress Bar');

    console.log('\n✅ All seed data loaded successfully!');
    console.log('\n🚀 HTML App Builder is ready to use!');
    console.log('\n📍 Access the application:');
    console.log('   - Projects: http://localhost:5001/lowcode/html-projects');
    console.log('   - Designer: http://localhost:5001/lowcode/html-designer?projectId=<id>');
    console.log('   - Marketplace: http://localhost:5001/lowcode/html-components');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedData();
