/**
 * ═══════════════════════════════════════════════════════════════════════
 * Export All Database Data to Excel
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Exports data from all Exprsn service databases to Excel format.
 * Creates one workbook per service with sheets for each table.
 *
 * Usage: node seeders/export-to-excel.js
 */

const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70) + '\n');
}

// Service database configurations
const services = [
  { name: 'exprsn-ca', database: 'exprsn_ca' },
  { name: 'exprsn-auth', database: 'exprsn_auth' },
  { name: 'exprsn-spark', database: 'exprsn_spark' },
  { name: 'exprsn-timeline', database: 'exprsn_timeline' },
  { name: 'exprsn-prefetch', database: 'exprsn_prefetch' },
  { name: 'exprsn-moderator', database: 'exprsn_moderator' },
  { name: 'exprsn-filevault', database: 'exprsn_filevault' },
  { name: 'exprsn-gallery', database: 'exprsn_gallery' },
  { name: 'exprsn-live', database: 'exprsn_live' },
  { name: 'exprsn-nexus', database: 'exprsn_nexus' },
  { name: 'exprsn-pulse', database: 'exprsn_pulse' },
  { name: 'exprsn-vault', database: 'exprsn_vault' },
  { name: 'exprsn-herald', database: 'exprsn_herald' },
  { name: 'exprsn-setup', database: 'exprsn_setup' },
  { name: 'exprsn-forge', database: 'exprsn_forge' },
  { name: 'exprsn-workflow', database: 'exprsn_workflow' },
  { name: 'exprsn-svr', database: 'exprsn_svr' }
];

async function getTables(pool) {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'SequelizeMeta'
    ORDER BY table_name
  `);
  return result.rows.map(row => row.table_name);
}

async function getTableData(pool, tableName) {
  try {
    const result = await pool.query(`SELECT * FROM "${tableName}" LIMIT 10000`);
    return result.rows;
  } catch (error) {
    log(`  Warning: Could not export table ${tableName}: ${error.message}`, 'yellow');
    return [];
  }
}

async function exportServiceToExcel(service, outputDir) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: service.database,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    await pool.query('SELECT 1');
    log(`\n📊 Exporting ${service.name}...`, 'blue');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exprsn Platform';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Get all tables
    const tables = await getTables(pool);

    if (tables.length === 0) {
      log(`  No tables found in ${service.database}`, 'yellow');
      await pool.end();
      return { tables: 0, rows: 0, skipped: true };
    }

    let totalRows = 0;

    for (const tableName of tables) {
      log(`  Exporting table: ${tableName}`);

      const data = await getTableData(pool, tableName);

      if (data.length === 0) {
        log(`    (empty table, skipping)`, 'yellow');
        continue;
      }

      // Create worksheet
      const worksheet = workbook.addWorksheet(tableName.substring(0, 31)); // Excel limit is 31 chars

      // Get columns from first row
      const columns = Object.keys(data[0]).map(key => ({
        header: key,
        key: key,
        width: Math.min(Math.max(key.length + 5, 15), 50)
      }));

      worksheet.columns = columns;

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add data rows
      data.forEach(row => {
        const processedRow = {};
        Object.keys(row).forEach(key => {
          let value = row[key];

          // Handle special data types
          if (value === null || value === undefined) {
            value = '';
          } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            value = JSON.stringify(value);
          } else if (Array.isArray(value)) {
            value = JSON.stringify(value);
          } else if (value instanceof Date) {
            value = value.toISOString();
          } else if (typeof value === 'boolean') {
            value = value ? 'TRUE' : 'FALSE';
          } else if (Buffer.isBuffer(value)) {
            value = `[Binary data: ${value.length} bytes]`;
          }

          processedRow[key] = value;
        });

        worksheet.addRow(processedRow);
      });

      // Auto-filter
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
      };

      totalRows += data.length;
      log(`    ✓ ${data.length} rows exported`, 'green');
    }

    // Save workbook
    const filename = path.join(outputDir, `${service.name}.xlsx`);
    await workbook.xlsx.writeFile(filename);

    log(`✅ ${service.name} exported: ${tables.length} tables, ${totalRows} rows`, 'green');
    log(`   File: ${filename}`, 'bright');

    await pool.end();

    return {
      tables: tables.length,
      rows: totalRows,
      filename,
      skipped: false
    };

  } catch (error) {
    log(`❌ Failed to export ${service.name}: ${error.message}`, 'red');
    await pool.end();
    return {
      tables: 0,
      rows: 0,
      error: error.message,
      skipped: false
    };
  }
}

async function exportAll() {
  logSection('Exprsn Platform Data Export to Excel');

  const startTime = Date.now();

  // Create output directory
  const outputDir = path.join(__dirname, '../data-exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  log(`Output directory: ${outputDir}`, 'bright');

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const service of services) {
    const result = await exportServiceToExcel(service, outputDir);

    if (result.error) {
      results.failed.push({ service: service.name, error: result.error });
    } else if (result.skipped) {
      results.skipped.push(service.name);
    } else {
      results.success.push({
        service: service.name,
        tables: result.tables,
        rows: result.rows,
        filename: result.filename
      });
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logSection('Export Summary');
  log(`Total Duration: ${duration}s`, 'bright');
  log(`Output Directory: ${outputDir}\n`, 'bright');

  if (results.success.length > 0) {
    log(`Successfully Exported: ${results.success.length} services`, 'green');
    results.success.forEach(r => {
      console.log(`  ✅ ${r.service}: ${r.tables} tables, ${r.rows} rows`);
      console.log(`     ${r.filename}`);
    });
  }

  if (results.failed.length > 0) {
    log(`\nFailed: ${results.failed.length} services`, 'red');
    results.failed.forEach(r => {
      console.log(`  ❌ ${r.service}: ${r.error}`);
    });
  }

  if (results.skipped.length > 0) {
    log(`\nSkipped (no data): ${results.skipped.length} services`, 'yellow');
    results.skipped.forEach(s => {
      console.log(`  ⏭️  ${s}`);
    });
  }

  log('\n✨ Export complete!', 'bright');

  return results;
}

// Run if called directly
if (require.main === module) {
  exportAll()
    .then(() => process.exit(0))
    .catch((error) => {
      log(`\n💥 Fatal error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { exportAll, exportServiceToExcel };
