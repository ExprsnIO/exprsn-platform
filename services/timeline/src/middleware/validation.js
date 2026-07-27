/**
 * ═══════════════════════════════════════════════════════════
 * Request Validation Middleware
 * Input validation for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

const { AppError, validateRequired } = require('@exprsn/shared');

// Default max post length. The Post.content column is Postgres TEXT (no length
// limit), so the column imposes no smaller bound — 4000 is the effective cap.
// Override with MAX_POST_LENGTH.
const DEFAULT_MAX_POST_LENGTH = 4000;

/**
 * Validate post creation data
 */
function validatePostCreation(req, res, next) {
  try {
    const { content, visibility = 'public' } = req.body;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      throw new AppError('Content is required', 400, 'MISSING_CONTENT');
    }

    // Validate content length
    const maxLength = parseInt(process.env.MAX_POST_LENGTH) || DEFAULT_MAX_POST_LENGTH;
    if (content.length > maxLength) {
      throw new AppError(
        `Content exceeds maximum length of ${maxLength} characters`,
        400,
        'CONTENT_TOO_LONG'
      );
    }

    // Validate visibility
    const validVisibilities = ['public', 'followers', 'private'];
    if (!validVisibilities.includes(visibility)) {
      throw new AppError(
        'Invalid visibility option',
        400,
        'INVALID_VISIBILITY'
      );
    }

    // Validate media count (both the legacy `mediaIds` array and the
    // structured `media` array — [{ id, altText? }], BUG-040).
    const mediaCount = Math.max(
      Array.isArray(req.body.mediaIds) ? req.body.mediaIds.length : 0,
      Array.isArray(req.body.media) ? req.body.media.length : 0
    );
    if (mediaCount > 4) {
      throw new AppError(
        'Maximum 4 media items allowed per post',
        400,
        'TOO_MANY_MEDIA'
      );
    }

    // Validate per-image alt text (BUG-040): optional, string, bounded.
    if (Array.isArray(req.body.media)) {
      for (const m of req.body.media) {
        if (m && m.altText !== undefined && m.altText !== null) {
          if (typeof m.altText !== 'string') {
            throw new AppError('Media altText must be a string', 400, 'INVALID_ALT_TEXT');
          }
          if (m.altText.length > 1000) {
            throw new AppError(
              'Media altText exceeds maximum length of 1000 characters',
              400,
              'ALT_TEXT_TOO_LONG'
            );
          }
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate post update data
 */
function validatePostUpdate(req, res, next) {
  try {
    const { content } = req.body;

    if (content !== undefined) {
      if (content.trim().length === 0) {
        throw new AppError('Content cannot be empty', 400, 'EMPTY_CONTENT');
      }

      const maxLength = parseInt(process.env.MAX_POST_LENGTH) || DEFAULT_MAX_POST_LENGTH;
      if (content.length > maxLength) {
        throw new AppError(
          `Content exceeds maximum length of ${maxLength} characters`,
          400,
          'CONTENT_TOO_LONG'
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate list creation
 */
function validateListCreation(req, res, next) {
  try {
    const { name, visibility = 'public' } = req.body;

    validateRequired({ name }, ['name']);

    if (name.length > 100) {
      throw new AppError('List name too long (max 100 characters)', 400, 'NAME_TOO_LONG');
    }

    const validVisibilities = ['public', 'private'];
    if (!validVisibilities.includes(visibility)) {
      throw new AppError('Invalid visibility option', 400, 'INVALID_VISIBILITY');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validate UUID parameter
 */
function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(value)) {
      return next(new AppError(`Invalid ${paramName}`, 400, 'INVALID_UUID'));
    }

    next();
  };
}

module.exports = {
  validatePostCreation,
  validatePostUpdate,
  validateListCreation,
  validateUUID
};
