/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * User registration schema
 */
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email must not exceed 255 characters',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
      'any.required': 'Password is required'
    }),
  displayName: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .optional()
    .allow('')
    .messages({
      'string.min': 'Display name cannot be empty if provided',
      'string.max': 'Display name must not exceed 100 characters'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .optional()
    .messages({
      'any.only': 'Passwords do not match'
    })
});

/**
 * User login schema
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    }),
  rememberMe: Joi.boolean()
    .optional()
    .default(false)
});

/**
 * Forgot password schema
 */
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

/**
 * Reset password schema
 */
const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .length(64)
    .hex()
    .messages({
      'string.length': 'Invalid reset token format',
      'string.hex': 'Invalid reset token format',
      'any.required': 'Reset token is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * Change password schema
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .invalid(Joi.ref('currentPassword'))
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.max': 'New password must not exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.invalid': 'New password must be different from current password',
      'any.required': 'New password is required'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * Accept invite / activation schema (FEAT-034)
 * The token is an opaque base64url string (not the 64-hex reset token), so it is
 * validated only for presence/length here; resolveInvite does the real check.
 */
const acceptInviteSchema = Joi.object({
  token: Joi.string()
    .required()
    .max(512)
    .messages({
      'any.required': 'Invitation token is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  displayName: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .optional()
    .allow('')
    .messages({
      'string.max': 'Display name must not exceed 100 characters'
    })
});

/**
 * Public org-signup schema (FEAT-033)
 * Registers the owner AND carries the org intent (name/type + optional
 * slug/description). `stripUnknown` on the validate() middleware drops any extra
 * top-level field (e.g. a client-sent `plan`) BEFORE the handler — a first layer
 * of the mass-assignment guard; the handler then allowlists, and the engine's
 * buildOrgPayload is the final guard.
 */
const signupSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email must not exceed 255 characters',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
      'any.required': 'Password is required'
    }),
  displayName: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .optional()
    .allow('')
    .messages({
      'string.min': 'Display name cannot be empty if provided',
      'string.max': 'Display name must not exceed 100 characters'
    }),
  org: Joi.object({
    name: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .required()
      .messages({
        'string.min': 'Organization name cannot be empty',
        'string.max': 'Organization name must not exceed 200 characters',
        'any.required': 'Organization name is required'
      }),
    // Public self-service signup is restricted to team/personal. 'enterprise'
    // (unlimited members, 5yr CA, plan=enterprise) is NOT self-provisionable
    // without a billing/entitlement gate — it is admin-provisioned only.
    type: Joi.string()
      .valid('team', 'personal')
      .required()
      .messages({
        'any.only': 'Organization type must be team or personal',
        'any.required': 'Organization type is required'
      }),
    slug: Joi.string()
      .max(100)
      .trim()
      .lowercase()
      .pattern(/^[a-z0-9-]+$/)
      .optional()
      .allow('')
      .messages({
        'string.pattern.base': 'Slug may contain only lowercase letters, numbers, and hyphens',
        'string.max': 'Slug must not exceed 100 characters'
      }),
    description: Joi.string()
      .max(1000)
      .trim()
      .optional()
      .allow('')
      .messages({
        'string.max': 'Description must not exceed 1000 characters'
      })
  })
    .required()
    .messages({
      'any.required': 'Organization details are required'
    })
});

/**
 * Self-serve org provisioning schema (FEAT-033, POST /organizations/provision-self)
 * The self-serve front carries the org intent as a FLAT body (unlike /signup's
 * nested `org`), but is subject to the SAME privilege constraints:
 *   - `type` is restricted to team|personal. 'enterprise' (unlimited members,
 *     5yr CA, plan=enterprise, extra RBAC groups) is NOT self-provisionable — it
 *     is admin-provisioned only (mirrors signupSchema.org.type).
 *   - `idempotencyKey` is deliberately NOT a field here: `stripUnknown` drops any
 *     client-supplied key so it can never be honored, and the route derives an
 *     owner-scoped key server-side (a client key would otherwise short-circuit
 *     into another owner's completed run — engine dedups by {idempotencyKey,kind}
 *     with no owner scoping).
 * Only descriptive org fields are accepted; plan/settings/status/type-as-privilege
 * are template/server-derived.
 */
const provisionSelfSchema = Joi.object({
  type: Joi.string()
    .valid('team', 'personal')
    .required()
    .messages({
      'any.only': 'Organization type must be team or personal',
      'any.required': 'Organization type is required'
    }),
  name: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .required()
    .messages({
      'string.min': 'Organization name cannot be empty',
      'string.max': 'Organization name must not exceed 200 characters',
      'any.required': 'Organization name is required'
    }),
  slug: Joi.string()
    .max(100)
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Slug may contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Slug must not exceed 100 characters'
    }),
  description: Joi.string()
    .max(1000)
    .trim()
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),
  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email must not exceed 255 characters'
    }),
  website: Joi.string()
    .max(255)
    .trim()
    .optional()
    .allow('')
    .messages({
      'string.max': 'Website must not exceed 255 characters'
    })
});

/**
 * Email verification token schema
 */
const verifyEmailSchema = Joi.object({
  token: Joi.string()
    .required()
    .length(64)
    .hex()
    .messages({
      'string.length': 'Invalid verification token format',
      'string.hex': 'Invalid verification token format',
      'any.required': 'Verification token is required'
    })
});

/**
 * Resend verification email schema
 */
const resendVerificationSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .lowercase()
    .trim()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  acceptInviteSchema,
  signupSchema,
  provisionSelfSchema,
  verifyEmailSchema,
  resendVerificationSchema
};
