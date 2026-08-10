const express = require('express');
const router = express.Router();

/**
 * @route   GET /api/shortcuts/documentation
 * @desc    Get keyboard shortcuts documentation
 * @access  Public
 */
router.get('/documentation', (req, res) => {
  const shortcuts = {
    overview: 'Keyboard shortcuts for Exprsn Workflow system',
    platform: {
      windows: 'Ctrl',
      mac: 'Cmd (⌘)',
      linux: 'Ctrl'
    },

    categories: {
      'Workflow Designer': [
        {
          action: 'Save workflow',
          windows: 'Ctrl + S',
          mac: 'Cmd + S',
          description: 'Save current workflow changes'
        },
        {
          action: 'Execute workflow',
          windows: 'Ctrl + E',
          mac: 'Cmd + E',
          description: 'Execute the current workflow'
        },
        {
          action: 'Undo',
          windows: 'Ctrl + Z',
          mac: 'Cmd + Z',
          description: 'Undo last action'
        },
        {
          action: 'Redo',
          windows: 'Ctrl + Shift + Z',
          mac: 'Cmd + Shift + Z',
          description: 'Redo last undone action'
        },
        {
          action: 'Delete selected',
          windows: 'Delete / Backspace',
          mac: 'Delete / Backspace',
          description: 'Delete selected step or connection'
        },
        {
          action: 'Copy step',
          windows: 'Ctrl + C',
          mac: 'Cmd + C',
          description: 'Copy selected step to clipboard'
        },
        {
          action: 'Paste step',
          windows: 'Ctrl + V',
          mac: 'Cmd + V',
          description: 'Paste step from clipboard'
        },
        {
          action: 'Cut step',
          windows: 'Ctrl + X',
          mac: 'Cmd + X',
          description: 'Cut selected step to clipboard'
        },
        {
          action: 'Duplicate step',
          windows: 'Ctrl + D',
          mac: 'Cmd + D',
          description: 'Duplicate selected step'
        },
        {
          action: 'Select all',
          windows: 'Ctrl + A',
          mac: 'Cmd + A',
          description: 'Select all steps'
        },
        {
          action: 'Zoom in',
          windows: 'Ctrl + Plus',
          mac: 'Cmd + Plus',
          description: 'Zoom in workflow canvas'
        },
        {
          action: 'Zoom out',
          windows: 'Ctrl + Minus',
          mac: 'Cmd + Minus',
          description: 'Zoom out workflow canvas'
        },
        {
          action: 'Reset zoom',
          windows: 'Ctrl + 0',
          mac: 'Cmd + 0',
          description: 'Reset canvas zoom to 100%'
        },
        {
          action: 'Fit to screen',
          windows: 'Ctrl + Shift + F',
          mac: 'Cmd + Shift + F',
          description: 'Fit entire workflow to screen'
        }
      ],

      'Navigation': [
        {
          action: 'Search workflows',
          windows: 'Ctrl + K',
          mac: 'Cmd + K',
          description: 'Open workflow search'
        },
        {
          action: 'Open workflow',
          windows: 'Ctrl + O',
          mac: 'Cmd + O',
          description: 'Open workflow dialog'
        },
        {
          action: 'New workflow',
          windows: 'Ctrl + N',
          mac: 'Cmd + N',
          description: 'Create new workflow'
        },
        {
          action: 'Close workflow',
          windows: 'Ctrl + W',
          mac: 'Cmd + W',
          description: 'Close current workflow'
        },
        {
          action: 'Next workflow tab',
          windows: 'Ctrl + Tab',
          mac: 'Cmd + Tab',
          description: 'Switch to next open workflow'
        },
        {
          action: 'Previous workflow tab',
          windows: 'Ctrl + Shift + Tab',
          mac: 'Cmd + Shift + Tab',
          description: 'Switch to previous open workflow'
        },
        {
          action: 'Navigate to executions',
          windows: 'Ctrl + Shift + E',
          mac: 'Cmd + Shift + E',
          description: 'Go to executions view'
        },
        {
          action: 'Navigate to logs',
          windows: 'Ctrl + Shift + L',
          mac: 'Cmd + Shift + L',
          description: 'Go to logs view'
        }
      ],

      'Execution': [
        {
          action: 'Start execution',
          windows: 'Ctrl + Enter',
          mac: 'Cmd + Enter',
          description: 'Start workflow execution'
        },
        {
          action: 'Stop execution',
          windows: 'Ctrl + Shift + X',
          mac: 'Cmd + Shift + X',
          description: 'Stop running execution'
        },
        {
          action: 'Pause execution',
          windows: 'Ctrl + P',
          mac: 'Cmd + P',
          description: 'Pause running execution'
        },
        {
          action: 'Resume execution',
          windows: 'Ctrl + Shift + P',
          mac: 'Cmd + Shift + P',
          description: 'Resume paused execution'
        },
        {
          action: 'Step through',
          windows: 'Ctrl + Shift + S',
          mac: 'Cmd + Shift + S',
          description: 'Execute next step in debug mode'
        },
        {
          action: 'View execution logs',
          windows: 'Ctrl + L',
          mac: 'Cmd + L',
          description: 'Open execution logs panel'
        }
      ],

      'Step Editing': [
        {
          action: 'Edit step',
          windows: 'Enter / Double-click',
          mac: 'Enter / Double-click',
          description: 'Edit selected step properties'
        },
        {
          action: 'Add comment',
          windows: 'Ctrl + M',
          mac: 'Cmd + M',
          description: 'Add comment to selected step'
        },
        {
          action: 'Toggle step enabled',
          windows: 'Ctrl + T',
          mac: 'Cmd + T',
          description: 'Enable/disable selected step'
        },
        {
          action: 'Move step up',
          windows: 'Ctrl + Up Arrow',
          mac: 'Cmd + Up Arrow',
          description: 'Move step up in order'
        },
        {
          action: 'Move step down',
          windows: 'Ctrl + Down Arrow',
          mac: 'Cmd + Down Arrow',
          description: 'Move step down in order'
        }
      ],

      'Canvas': [
        {
          action: 'Pan canvas',
          windows: 'Space + Drag',
          mac: 'Space + Drag',
          description: 'Pan workflow canvas'
        },
        {
          action: 'Multi-select',
          windows: 'Ctrl + Click',
          mac: 'Cmd + Click',
          description: 'Select multiple steps'
        },
        {
          action: 'Box select',
          windows: 'Shift + Drag',
          mac: 'Shift + Drag',
          description: 'Draw selection box'
        },
        {
          action: 'Align left',
          windows: 'Ctrl + Shift + Left',
          mac: 'Cmd + Shift + Left',
          description: 'Align selected steps to left'
        },
        {
          action: 'Align right',
          windows: 'Ctrl + Shift + Right',
          mac: 'Cmd + Shift + Right',
          description: 'Align selected steps to right'
        },
        {
          action: 'Align top',
          windows: 'Ctrl + Shift + Up',
          mac: 'Cmd + Shift + Up',
          description: 'Align selected steps to top'
        },
        {
          action: 'Align bottom',
          windows: 'Ctrl + Shift + Down',
          mac: 'Cmd + Shift + Down',
          description: 'Align selected steps to bottom'
        },
        {
          action: 'Distribute horizontally',
          windows: 'Ctrl + Shift + H',
          mac: 'Cmd + Shift + H',
          description: 'Distribute steps horizontally'
        },
        {
          action: 'Distribute vertically',
          windows: 'Ctrl + Shift + V',
          mac: 'Cmd + Shift + V',
          description: 'Distribute steps vertically'
        }
      ],

      'General': [
        {
          action: 'Show help',
          windows: 'F1 / ?',
          mac: 'F1 / ?',
          description: 'Show keyboard shortcuts help'
        },
        {
          action: 'Toggle sidebar',
          windows: 'Ctrl + B',
          mac: 'Cmd + B',
          description: 'Show/hide sidebar'
        },
        {
          action: 'Toggle panel',
          windows: 'Ctrl + J',
          mac: 'Cmd + J',
          description: 'Show/hide bottom panel'
        },
        {
          action: 'Focus search',
          windows: '/',
          mac: '/',
          description: 'Focus search input'
        },
        {
          action: 'Escape',
          windows: 'Esc',
          mac: 'Esc',
          description: 'Close dialogs, cancel operations, clear selection'
        }
      ]
    },

    tips: [
      'Most shortcuts can be customized in user preferences',
      'Hold Shift while using arrow keys for fine-grained step movement',
      'Use Alt key + mouse drag for free-form step movement',
      'Middle mouse button click for quick pan',
      'Mouse wheel for zoom (Ctrl/Cmd + wheel for faster zoom)',
      'Right-click on steps for context menu with additional actions'
    ],

    accessibility: {
      screenReaders: 'All actions are accessible via keyboard and properly labeled for screen readers',
      keyboardOnly: 'Entire workflow designer is fully operable with keyboard only',
      focusIndicators: 'All interactive elements have clear focus indicators',
      skipLinks: 'Skip links available to jump to main content areas'
    }
  };

  res.json({
    success: true,
    data: shortcuts
  });
});

/**
 * @route   GET /api/shortcuts/quick-reference
 * @desc    Get quick reference card for most common shortcuts
 * @access  Public
 */
router.get('/quick-reference', (req, res) => {
  const quickRef = {
    title: 'Keyboard Shortcuts - Quick Reference',
    mostUsed: [
      { action: 'Save', shortcut: 'Ctrl/Cmd + S' },
      { action: 'Execute', shortcut: 'Ctrl/Cmd + E' },
      { action: 'Undo', shortcut: 'Ctrl/Cmd + Z' },
      { action: 'Redo', shortcut: 'Ctrl/Cmd + Shift + Z' },
      { action: 'Copy', shortcut: 'Ctrl/Cmd + C' },
      { action: 'Paste', shortcut: 'Ctrl/Cmd + V' },
      { action: 'Search', shortcut: 'Ctrl/Cmd + K' },
      { action: 'New Workflow', shortcut: 'Ctrl/Cmd + N' },
      { action: 'Help', shortcut: 'F1 or ?' },
      { action: 'Escape', shortcut: 'Esc' }
    ]
  };

  res.json({
    success: true,
    data: quickRef
  });
});

/**
 * @route   GET /api/shortcuts/by-category/:category
 * @desc    Get shortcuts for a specific category
 * @access  Public
 */
router.get('/by-category/:category', (req, res) => {
  const categoryMap = {
    'designer': 'Workflow Designer',
    'navigation': 'Navigation',
    'execution': 'Execution',
    'editing': 'Step Editing',
    'canvas': 'Canvas',
    'general': 'General'
  };

  const category = categoryMap[req.params.category.toLowerCase()];

  if (!category) {
    return res.status(404).json({
      success: false,
      error: 'Category not found. Available categories: designer, navigation, execution, editing, canvas, general'
    });
  }

  // Return just this category from the full documentation
  // (In a real implementation, this would fetch from the main endpoint)

  res.json({
    success: true,
    data: {
      category,
      message: 'Use GET /api/shortcuts/documentation for full shortcuts list'
    }
  });
});

module.exports = router;
