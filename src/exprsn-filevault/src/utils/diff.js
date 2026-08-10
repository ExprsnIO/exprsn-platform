/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Diff Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const diff = require('diff');

/**
 * Calculate diff between two text files
 * @param {string} oldContent - Original content
 * @param {string} newContent - New content
 * @returns {Object} Diff result
 */
function calculateTextDiff(oldContent, newContent) {
  const changes = diff.diffLines(oldContent, newContent);

  const additions = [];
  const deletions = [];
  const modifications = [];

  changes.forEach((change, index) => {
    if (change.added) {
      additions.push({
        line: index,
        content: change.value,
        count: change.count
      });
    } else if (change.removed) {
      deletions.push({
        line: index,
        content: change.value,
        count: change.count
      });
    }
  });

  return {
    changes,
    additions,
    deletions,
    summary: {
      additionsCount: additions.length,
      deletionsCount: deletions.length,
      totalChanges: additions.length + deletions.length
    }
  };
}

/**
 * Check if content is text-based (for diff purposes)
 * @param {string} mimetype - File mimetype
 * @returns {boolean}
 */
function isTextFile(mimetype) {
  const textTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-sh'
  ];

  return textTypes.some(type => mimetype.startsWith(type));
}

module.exports = {
  calculateTextDiff,
  isTextFile
};
