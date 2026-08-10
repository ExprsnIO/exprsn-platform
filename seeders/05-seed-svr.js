/**
 * SVR Service Seeder - Pages, templates, analytics
 */

const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  const sequelize = new Sequelize(process.env.SVR_DB_NAME || 'exprsn_svr', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || '', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_svr database');

    // Create sample pages
    for (let i = 0; i < 30; i++) {
      const slug = `page-${i}`;
      await sequelize.query(`
        INSERT INTO pages (owner_id, slug, title, description, html_content, css_content, javascript_content, 
                           is_static, is_public, status, views_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, {
        replacements: [uuidv4(), slug, `Sample Page ${i}`, 'Sample description', '<h1>Sample</h1>', 'h1{color:blue}', 'console.log("hi")', Math.random() > 0.5, Math.random() > 0.3, 'published', Math.floor(Math.random() * 1000)]
      });
      recordsCreated++;
    }

    // Create sample templates
    for (let i = 0; i < 15; i++) {
      await sequelize.query(`
        INSERT INTO templates (created_by, name, slug, category, description, html_template, css_template, 
                               is_public, is_featured, uses_count, rating, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, {
        replacements: [uuidv4(), `Template ${i}`, `template-${i}`, ['landing', 'blog', 'portfolio'][i % 3], 'Sample template', '<div>Template</div>', 'div{padding:20px}', Math.random() > 0.5, Math.random() > 0.7, Math.floor(Math.random() * 100), (Math.random() * 5).toFixed(1)]
      });
      recordsCreated++;
    }

    return { recordsCreated, duration: ((Date.now() - startTime) / 1000).toFixed(2) };
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed().then(r => { console.log(`\nSVR seeded: ${r.recordsCreated} records`); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
