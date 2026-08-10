#!/usr/bin/env node
/**
 * Detailed Route Analysis for exprsn-svr
 * Creates a comprehensive map of all routes organized by module
 */

const fs = require('fs');
const path = require('path');

const baseDir = '/Users/rickholland/Downloads/Exprsn/src/exprsn-svr';

// Read the main index files to understand actual mounting
const mainIndexPath = path.join(baseDir, 'index.js');
const lowcodeIndexPath = path.join(baseDir, 'lowcode/index.js');
const lowcodeRoutesIndexPath = path.join(baseDir, 'lowcode/routes/index.js');
const workflowIndexPath = path.join(baseDir, 'workflow/index.js');
const forgeIndexPath = path.join(baseDir, 'routes/forge/index.js');

const routePattern = /router\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const mountPattern = /router\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.+)\)/g;

function extractRoutes(filePath) {
  if (!fs.existsSync(filePath)) {
    return { routes: [], mounts: [] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  const mounts = [];

  // Extract route definitions
  let match;
  routePattern.lastIndex = 0;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2]
    });
  }

  // Extract mounts
  mountPattern.lastIndex = 0;
  while ((match = mountPattern.exec(content)) !== null) {
    mounts.push({
      path: match[1],
      handler: match[2].trim()
    });
  }

  return { routes, mounts };
}

function analyzeModule(moduleName, routesDir, apiBasePath) {
  const moduleRoutes = {
    name: moduleName,
    basePath: apiBasePath,
    files: [],
    totalEndpoints: 0,
    endpointsByMethod: {
      GET: 0,
      POST: 0,
      PUT: 0,
      PATCH: 0,
      DELETE: 0,
      ALL: 0
    }
  };

  if (!fs.existsSync(routesDir)) {
    return moduleRoutes;
  }

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(routesDir, file);
    const { routes } = extractRoutes(filePath);

    if (routes.length > 0) {
      const fileInfo = {
        name: file,
        path: filePath.replace(baseDir + '/', ''),
        endpoints: routes.length,
        routes: routes
      };

      moduleRoutes.files.push(fileInfo);
      moduleRoutes.totalEndpoints += routes.length;

      routes.forEach(r => {
        moduleRoutes.endpointsByMethod[r.method]++;
      });
    }
  }

  return moduleRoutes;
}

// Analyze main routes
console.log('\n=== MAIN APPLICATION ROUTES ===\n');
const mainRoutes = analyzeModule('main', path.join(baseDir, 'routes'), '/api');
console.log(`📁 Module: ${mainRoutes.name}`);
console.log(`📍 Base Path: ${mainRoutes.basePath}`);
console.log(`📊 Total Files: ${mainRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${mainRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, mainRoutes.endpointsByMethod);
console.log(`\n📂 Route Files:`);
mainRoutes.files.forEach(f => {
  console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
});

// Analyze Low-Code routes
console.log('\n=== LOW-CODE PLATFORM ROUTES ===\n');
const lowcodeRoutes = analyzeModule('lowcode', path.join(baseDir, 'lowcode/routes'), '/lowcode/api');
console.log(`📁 Module: ${lowcodeRoutes.name}`);
console.log(`📍 Base Path: ${lowcodeRoutes.basePath}`);
console.log(`📊 Total Files: ${lowcodeRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${lowcodeRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, lowcodeRoutes.endpointsByMethod);
console.log(`\n📂 Top Route Files:`);
lowcodeRoutes.files
  .sort((a, b) => b.endpoints - a.endpoints)
  .slice(0, 15)
  .forEach(f => {
    console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
  });

// Analyze Workflow routes
console.log('\n=== WORKFLOW MODULE ROUTES ===\n');
const workflowRoutes = analyzeModule('workflow', path.join(baseDir, 'workflow/routes'), '/workflow/api');
console.log(`📁 Module: ${workflowRoutes.name}`);
console.log(`📍 Base Path: ${workflowRoutes.basePath}`);
console.log(`📊 Total Files: ${workflowRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${workflowRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, workflowRoutes.endpointsByMethod);
console.log(`\n📂 Route Files:`);
workflowRoutes.files.forEach(f => {
  console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
});

// Analyze Forge CRM routes
console.log('\n=== FORGE CRM ROUTES ===\n');
const forgeCrmRoutes = analyzeModule('forge-crm', path.join(baseDir, 'routes/forge/crm'), '/forge/crm');
console.log(`📁 Module: ${forgeCrmRoutes.name}`);
console.log(`📍 Base Path: ${forgeCrmRoutes.basePath}`);
console.log(`📊 Total Files: ${forgeCrmRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${forgeCrmRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, forgeCrmRoutes.endpointsByMethod);
console.log(`\n📂 Route Files:`);
forgeCrmRoutes.files.forEach(f => {
  console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
});

// Analyze Forge ERP routes
console.log('\n=== FORGE ERP ROUTES ===\n');
const forgeErpRoutes = analyzeModule('forge-erp', path.join(baseDir, 'routes/forge/erp'), '/forge/erp');
console.log(`📁 Module: ${forgeErpRoutes.name}`);
console.log(`📍 Base Path: ${forgeErpRoutes.basePath}`);
console.log(`📊 Total Files: ${forgeErpRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${forgeErpRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, forgeErpRoutes.endpointsByMethod);
console.log(`\n📂 Route Files:`);
forgeErpRoutes.files.forEach(f => {
  console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
});

// Analyze Forge Groupware routes
console.log('\n=== FORGE GROUPWARE ROUTES ===\n');
const forgeGroupwareRoutes = analyzeModule('forge-groupware', path.join(baseDir, 'routes/forge/groupware'), '/forge/groupware');
console.log(`📁 Module: ${forgeGroupwareRoutes.name}`);
console.log(`📍 Base Path: ${forgeGroupwareRoutes.basePath}`);
console.log(`📊 Total Files: ${forgeGroupwareRoutes.files.length}`);
console.log(`📊 Total Endpoints: ${forgeGroupwareRoutes.totalEndpoints}`);
console.log(`📊 By Method:`, forgeGroupwareRoutes.endpointsByMethod);
console.log(`\n📂 Route Files:`);
forgeGroupwareRoutes.files.forEach(f => {
  console.log(`   - ${f.name} (${f.endpoints} endpoints)`);
});

// Summary
console.log('\n=== OVERALL SUMMARY ===\n');
const totalFiles =
  mainRoutes.files.length +
  lowcodeRoutes.files.length +
  workflowRoutes.files.length +
  forgeCrmRoutes.files.length +
  forgeErpRoutes.files.length +
  forgeGroupwareRoutes.files.length;

const totalEndpoints =
  mainRoutes.totalEndpoints +
  lowcodeRoutes.totalEndpoints +
  workflowRoutes.totalEndpoints +
  forgeCrmRoutes.totalEndpoints +
  forgeErpRoutes.totalEndpoints +
  forgeGroupwareRoutes.totalEndpoints;

console.log(`📊 Total Route Files: ${totalFiles}`);
console.log(`📊 Total Endpoints: ${totalEndpoints}`);
console.log(`\n📊 Endpoints by Module:`);
console.log(`   - Main: ${mainRoutes.totalEndpoints}`);
console.log(`   - Low-Code: ${lowcodeRoutes.totalEndpoints}`);
console.log(`   - Workflow: ${workflowRoutes.totalEndpoints}`);
console.log(`   - Forge CRM: ${forgeCrmRoutes.totalEndpoints}`);
console.log(`   - Forge ERP: ${forgeErpRoutes.totalEndpoints}`);
console.log(`   - Forge Groupware: ${forgeGroupwareRoutes.totalEndpoints}`);

// Create detailed JSON output
const detailedOutput = {
  summary: {
    totalFiles,
    totalEndpoints,
    generatedAt: new Date().toISOString()
  },
  modules: {
    main: mainRoutes,
    lowcode: lowcodeRoutes,
    workflow: workflowRoutes,
    'forge-crm': forgeCrmRoutes,
    'forge-erp': forgeErpRoutes,
    'forge-groupware': forgeGroupwareRoutes
  }
};

const outputPath = path.join(baseDir, 'detailed-route-map.json');
fs.writeFileSync(outputPath, JSON.stringify(detailedOutput, null, 2));
console.log(`\n✅ Detailed analysis saved to: ${outputPath}`);
