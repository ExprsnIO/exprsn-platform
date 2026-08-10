#!/usr/bin/env node
/**
 * Comprehensive Route Analysis Script for exprsn-svr
 * Analyzes all route files and generates a complete route map
 */

const fs = require('fs');
const path = require('path');

const baseDir = '/Users/rickholland/Downloads/Exprsn/src/exprsn-svr';

// Route directories to analyze
const routeDirs = [
  { name: 'main', path: 'routes', baseMount: '' },
  { name: 'lowcode', path: 'lowcode/routes', baseMount: '/lowcode' },
  { name: 'workflow', path: 'workflow/routes', baseMount: '/workflow' },
  { name: 'forge-crm', path: 'routes/forge/crm', baseMount: '/forge/crm' },
  { name: 'forge-erp', path: 'routes/forge/erp', baseMount: '/forge/erp' },
  { name: 'forge-groupware', path: 'routes/forge/groupware', baseMount: '/forge/groupware' },
  { name: 'forge-other', path: 'routes/forge', baseMount: '/forge' }
];

const routePattern = /router\.(get|post|put|patch|delete|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const results = {
  summary: {
    totalRouteFiles: 0,
    totalEndpoints: 0,
    modules: [],
    issues: []
  },
  routes: {
    main: [],
    lowcode: [],
    workflow: [],
    forge: []
  },
  unmounted: [],
  recommendations: []
};

function analyzeRouteFile(filePath, module, baseMount) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath, '.js');
    const routes = [];

    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const [, method, routePath] = match;

      // Skip middleware mounts for now
      if (method === 'use' && !routePath.startsWith('/api')) {
        continue;
      }

      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        file: filePath.replace(baseDir + '/', ''),
        fileName
      });
    }

    return routes;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return [];
  }
}

function getAllRouteFiles(dir) {
  const files = [];

  function traverse(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && item !== 'node_modules') {
          traverse(fullPath);
        } else if (stat.isFile() && item.endsWith('.js')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }

  traverse(dir);
  return files;
}

// Analyze each module
for (const dir of routeDirs) {
  const fullPath = path.join(baseDir, dir.path);

  if (!fs.existsSync(fullPath)) {
    continue;
  }

  const routeFiles = getAllRouteFiles(fullPath);
  results.summary.totalRouteFiles += routeFiles.length;

  for (const file of routeFiles) {
    const routes = analyzeRouteFile(file, dir.name, dir.baseMount);
    results.summary.totalEndpoints += routes.length;

    const targetModule = dir.name.startsWith('forge-') ? 'forge' : dir.name;

    for (const route of routes) {
      results.routes[targetModule].push({
        ...route,
        module: dir.name,
        baseMount: dir.baseMount,
        fullPath: `${dir.baseMount}${route.path}`
      });
    }
  }
}

// Add modules to summary
results.summary.modules = Object.keys(results.routes).filter(m => results.routes[m].length > 0);

// Identify issues
const methodCounts = {};
for (const module of results.summary.modules) {
  for (const route of results.routes[module]) {
    const key = `${route.method} ${route.fullPath}`;
    methodCounts[key] = (methodCounts[key] || 0) + 1;
  }
}

// Find duplicates
for (const [route, count] of Object.entries(methodCounts)) {
  if (count > 1) {
    results.summary.issues.push({
      type: 'duplicate',
      route,
      count
    });
  }
}

// Generate recommendations
if (results.routes.lowcode.length > 200) {
  results.recommendations.push({
    priority: 'medium',
    message: 'Low-code module has many routes. Consider grouping related endpoints.'
  });
}

// Check for missing CRUD operations
const crudPatterns = {
  'GET /': 'list',
  'GET /:id': 'get',
  'POST /': 'create',
  'PUT /:id': 'update',
  'PATCH /:id': 'patch',
  'DELETE /:id': 'delete'
};

// Output results
console.log(JSON.stringify(results, null, 2));

// Also write to file
const outputPath = path.join(baseDir, 'route-analysis.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.error(`\n✅ Analysis complete! Results saved to: ${outputPath}`);
console.error(`📊 Total Files: ${results.summary.totalRouteFiles}`);
console.error(`📊 Total Endpoints: ${results.summary.totalEndpoints}`);
