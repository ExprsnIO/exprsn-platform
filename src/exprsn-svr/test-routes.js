const lowcodeRouter = require('./lowcode/index');

function printRoutes(router, basePath = '') {
  if (!router || !router.stack) {
    console.log('No router stack found');
    return;
  }

  router.stack.forEach((layer) => {
    if (layer.route) {
      // Regular route
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      console.log(`${methods} ${basePath}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      // Nested router
      const path = layer.regexp.source
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace('^', '')
        .replace(/\\/g, '')
        .replace('/?(?=/|$)', '');
      printRoutes(layer.handle, basePath + path);
    } else if (layer.name) {
      // Middleware
      console.log(`  [middleware: ${layer.name}]`);
    }
  });
}

console.log('=== Lowcode Router Routes ===');
printRoutes(lowcodeRouter, '/lowcode');
