/**
 * ═══════════════════════════════════════════════════════════
 * HTML Libraries Seeder
 * Populates popular JavaScript and CSS libraries
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Note: dependencies and metadata must be JSON strings for bulkInsert
    const libraries = [
      // JavaScript Libraries
      {
        id: uuidv4(),
        name: 'jQuery',
        version: '3.7.1',
        description: 'Fast, small, and feature-rich JavaScript library for DOM manipulation',
        type: 'javascript',
        cdn_js_url: 'https://code.jquery.com/jquery-3.7.1.min.js',
        integrity_js: 'sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://jquery.com/', category: 'dom' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'jQuery UI',
        version: '1.13.2',
        description: 'Curated set of user interface interactions, effects, widgets, and themes',
        type: 'both',
        cdn_css_url: 'https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.min.css',
        cdn_js_url: 'https://code.jquery.com/ui/1.13.2/jquery-ui.min.js',
        dependencies: JSON.stringify(['jQuery']),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://jqueryui.com/', category: 'ui' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Bootstrap',
        version: '5.3.2',
        description: 'The most popular HTML, CSS, and JS framework for responsive web development',
        type: 'both',
        cdn_css_url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
        integrity_css: 'sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN',
        integrity_js: 'sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://getbootstrap.com/', category: 'framework' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Lodash',
        version: '4.17.21',
        description: 'Modern JavaScript utility library delivering modularity, performance & extras',
        type: 'javascript',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        integrity_js: 'sha384-Hq4M0KvVwvEqEBLV5KPGwkFpS0WwQNp3pNdLrJBDWOWkADYQGwsY0vU5G2VVsVYp',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://lodash.com/', category: 'utility' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Moment.js',
        version: '2.29.4',
        description: 'Parse, validate, manipulate, and display dates and times in JavaScript',
        type: 'javascript',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://momentjs.com/', category: 'date' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Chart.js',
        version: '4.4.0',
        description: 'Simple yet flexible JavaScript charting for designers & developers',
        type: 'javascript',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://www.chartjs.org/', category: 'charts' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'DataTables',
        version: '1.13.7',
        description: 'Add advanced interaction controls to HTML tables',
        type: 'both',
        cdn_css_url: 'https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css',
        cdn_js_url: 'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js',
        dependencies: ['jQuery'],
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://datatables.net/', category: 'tables' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Select2',
        version: '4.1.0',
        description: 'jQuery replacement for select boxes with search, tagging, and more',
        type: 'both',
        cdn_css_url: 'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
        dependencies: ['jQuery'],
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://select2.org/', category: 'forms' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Axios',
        version: '1.6.2',
        description: 'Promise based HTTP client for the browser and node.js',
        type: 'javascript',
        cdn_js_url: 'https://cdn.jsdelivr.net/npm/axios@1.6.2/dist/axios.min.js',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://axios-http.com/', category: 'http' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Socket.IO Client',
        version: '4.5.4',
        description: 'Realtime application framework (client)',
        type: 'javascript',
        cdn_js_url: 'https://cdn.socket.io/4.5.4/socket.io.min.js',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: false,
        metadata: JSON.stringify({ homepage: 'https://socket.io/', category: 'realtime' }),
        created_at: new Date(),
        updated_at: new Date()
      },

      // CSS Libraries
      {
        id: uuidv4(),
        name: 'Font Awesome',
        version: '6.5.1',
        description: 'The internet\'s icon library and toolkit',
        type: 'css',
        cdn_css_url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
        integrity_css: 'sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://fontawesome.com/', category: 'icons' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Animate.css',
        version: '4.1.1',
        description: 'Cross-browser library of CSS animations',
        type: 'css',
        cdn_css_url: 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://animate.style/', category: 'animations' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Tailwind CSS',
        version: '3.3.0',
        description: 'A utility-first CSS framework for rapid UI development',
        type: 'css',
        cdn_css_url: 'https://cdn.jsdelivr.net/npm/tailwindcss@3.3.0/dist/tailwind.min.css',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: true,
        metadata: JSON.stringify({ homepage: 'https://tailwindcss.com/', category: 'framework' }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Bulma',
        version: '0.9.4',
        description: 'Modern CSS framework based on Flexbox',
        type: 'css',
        cdn_css_url: 'https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css',
        dependencies: JSON.stringify([]),
        is_active: true,
        is_popular: false,
        metadata: JSON.stringify({ homepage: 'https://bulma.io/', category: 'framework' }),
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('html_libraries', libraries);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('html_libraries', null, {});
  }
};
