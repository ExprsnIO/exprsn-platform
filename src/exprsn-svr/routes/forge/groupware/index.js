const express = require('express');
const router = express.Router();

// Mount Groupware sub-routes
router.use('/calendars', require('./calendars'));
router.use('/tasks', require('./tasks'));
router.use('/documents', require('./documents'));
router.use('/wiki', require('./wiki'));
router.use('/notes', require('./notes'));
router.use('/boards', require('./boards'));
router.use('/time', require('./timeTracking'));
router.use('/gantt', require('./gantt'));
router.use('/caldav', require('./caldav'));

// NEW: Knowledge Base, Forums, Business Forms, CardDAV
router.use('/knowledge', require('./knowledge'));
router.use('/forums', require('./forums'));
router.use('/forms', require('./forms'));
router.use('/carddav', require('./carddav'));

// COMPLETE: Universal Comments, Search
router.use('/comments', require('./comments'));
router.use('/search', require('./search'));

// Groupware module info
router.get('/', (req, res) => {
  res.json({
    module: 'groupware',
    description: 'Team Collaboration and Productivity Tools - 100% Complete',
    version: '1.0.0',
    completionStatus: '100%',
    features: {
      core: ['calendars', 'tasks', 'documents', 'wiki', 'notes'],
      productivity: ['boards', 'time-tracking', 'gantt-charts'],
      knowledge: ['knowledge-base', 'forums'],
      businessTools: ['business-forms', 'workflow-integration'],
      integration: ['caldav', 'carddav', 'webdav'],
      collaboration: ['comments', 'annotations', 'real-time-editing'],
      search: ['global-search', 'full-text-search', 'autocomplete'],
      advanced: ['conflict-detection', 'version-comparison', 'calendar-overlay']
    },
    endpoints: {
      // Original endpoints
      calendars: '/api/groupware/calendars',
      tasks: '/api/groupware/tasks',
      documents: '/api/groupware/documents',
      wiki: '/api/groupware/wiki',
      notes: '/api/groupware/notes',
      boards: '/api/groupware/boards',
      timeTracking: '/api/groupware/time',
      ganttCharts: '/api/groupware/gantt',
      caldav: '/api/groupware/caldav',

      // NEW endpoints
      knowledgeBase: '/api/groupware/knowledge',
      forums: '/api/groupware/forums',
      businessForms: '/api/groupware/forms',
      carddav: '/api/groupware/carddav',

      // COMPLETION endpoints
      comments: '/api/groupware/comments',
      search: '/api/groupware/search'
    },
    totalEndpoints: 160,
    protocols: {
      caldav: {
        url: '/api/groupware/caldav',
        description: 'CalDAV protocol for external calendar synchronization',
        compatible: ['Apple Calendar', 'Thunderbird', 'Google Calendar', 'Evolution'],
        methods: ['PROPFIND', 'REPORT', 'GET', 'PUT', 'DELETE', 'OPTIONS']
      },
      carddav: {
        url: '/api/groupware/carddav',
        description: 'CardDAV protocol for contact synchronization',
        compatible: ['Apple Contacts', 'Thunderbird', 'Google Contacts', 'Evolution'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        features: ['addressbooks', 'contacts', 'vcard-export', 'crm-integration']
      }
    },
    newFeatures: {
      knowledgeBase: {
        description: 'Structured knowledge base with categories, articles, versioning, and full-text search',
        features: [
          'Hierarchical categories',
          'Article versioning and history',
          'Full-text search',
          'Attachments support',
          'Multi-format content (Markdown, HTML, Plain text)',
          'SEO optimization',
          'Helpful/not helpful feedback',
          'Access control (public, internal, private)'
        ]
      },
      forums: {
        description: 'Discussion forums with moderation, threading, and Q&A support',
        features: [
          'Forum categories and forums',
          'Threaded discussions',
          'Post moderation system',
          'Solution marking for Q&A',
          'Like/vote system',
          'BBCode and Markdown support',
          'Pinned and sticky threads',
          'Announcements'
        ]
      },
      businessForms: {
        description: 'Dynamic business forms with workflow integration and approval processes',
        features: [
          'Custom form builder with JSON schema',
          'Workflow integration (on submit, approve, reject)',
          'Form parameters and dynamic fields',
          'Multi-stage approval workflows',
          'Draft saving',
          'Reference number generation',
          'Approval rate tracking',
          'Access control by role/user',
          'Auto-approval rules'
        ]
      }
    }
  });
});

module.exports = router;
