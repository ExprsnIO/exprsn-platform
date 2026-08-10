const { Contact, Company, Activity, Opportunity, Lead, sequelize } = require('../../../models/forge');
const { Op } = require('sequelize');
const logger = require('../../../utils/logger');

/**
 * Contact Service
 * Business logic for contact management, deduplication, and merging
 */

/**
 * Calculate similarity score between two strings (0-100)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  // Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  return Math.round((1 - distance / maxLength) * 100);
};

/**
 * Find potential duplicate contacts
 * @param {Object} contactData - Contact data to check
 * @param {string} excludeId - Contact ID to exclude from results
 * @returns {Promise<Array>} Array of potential duplicates with match scores
 */
const findDuplicates = async (contactData, excludeId = null) => {
  const { email, phone, firstName, lastName } = contactData;
  const duplicates = [];

  // Exact email match (highest priority)
  if (email) {
    const emailMatches = await Contact.findAll({
      where: {
        email: { [Op.iLike]: email },
        ...(excludeId && { id: { [Op.ne]: excludeId } })
      },
      include: [{ model: Company, as: 'company' }]
    });

    for (const contact of emailMatches) {
      duplicates.push({
        contact,
        matchScore: 100,
        matchReasons: ['Exact email match']
      });
    }
  }

  // Exact phone match
  if (phone && duplicates.length === 0) {
    const phoneMatches = await Contact.findAll({
      where: {
        phone: phone,
        ...(excludeId && { id: { [Op.ne]: excludeId } })
      },
      include: [{ model: Company, as: 'company' }]
    });

    for (const contact of phoneMatches) {
      if (!duplicates.find(d => d.contact.id === contact.id)) {
        duplicates.push({
          contact,
          matchScore: 90,
          matchReasons: ['Exact phone match']
        });
      }
    }
  }

  // Fuzzy name matching
  if (firstName && lastName && duplicates.length === 0) {
    const nameMatches = await Contact.findAll({
      where: {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${firstName}%` } },
          { lastName: { [Op.iLike]: `%${lastName}%` } }
        ],
        ...(excludeId && { id: { [Op.ne]: excludeId } })
      },
      include: [{ model: Company, as: 'company' }],
      limit: 20
    });

    for (const contact of nameMatches) {
      if (!duplicates.find(d => d.contact.id === contact.id)) {
        const firstNameScore = calculateSimilarity(firstName, contact.firstName);
        const lastNameScore = calculateSimilarity(lastName, contact.lastName);
        const avgScore = (firstNameScore + lastNameScore) / 2;

        if (avgScore >= 70) {
          const reasons = [];
          if (firstNameScore >= 80) reasons.push('Similar first name');
          if (lastNameScore >= 80) reasons.push('Similar last name');

          duplicates.push({
            contact,
            matchScore: Math.round(avgScore),
            matchReasons: reasons.length > 0 ? reasons : ['Similar name']
          });
        }
      }
    }
  }

  // Sort by match score descending
  duplicates.sort((a, b) => b.matchScore - a.matchScore);

  return duplicates;
};

/**
 * Merge two contacts
 * @param {string} primaryId - Primary contact ID (winner)
 * @param {string} secondaryId - Secondary contact ID (to be merged)
 * @param {Object} mergeStrategy - Strategy for merging fields
 * @returns {Promise<Object>} Merged contact
 */
const mergeContacts = async (primaryId, secondaryId, mergeStrategy = {}) => {
  const transaction = await sequelize.transaction();

  try {
    const primary = await Contact.findByPk(primaryId, { transaction });
    const secondary = await Contact.findByPk(secondaryId, { transaction });

    if (!primary || !secondary) {
      throw new Error('One or both contacts not found');
    }

    if (primaryId === secondaryId) {
      throw new Error('Cannot merge a contact with itself');
    }

    // Merge fields based on strategy (prefer primary, use secondary if primary is null)
    const mergedData = {
      firstName: primary.firstName || secondary.firstName,
      lastName: primary.lastName || secondary.lastName,
      email: primary.email || secondary.email,
      phone: primary.phone || secondary.phone,
      mobile: primary.mobile || secondary.mobile,
      website: primary.website || secondary.website,
      companyId: primary.companyId || secondary.companyId,
      jobTitle: primary.jobTitle || secondary.jobTitle,
      department: primary.department || secondary.department,
      address: primary.address || secondary.address,
      city: primary.city || secondary.city,
      state: primary.state || secondary.state,
      country: primary.country || secondary.country,
      postalCode: primary.postalCode || secondary.postalCode,
      // Merge tags (unique)
      tags: [...new Set([...(primary.tags || []), ...(secondary.tags || [])])],
      // Merge custom fields (primary takes precedence)
      customFields: {
        ...(secondary.customFields || {}),
        ...(primary.customFields || {})
      },
      // Merge metadata
      metadata: {
        ...(secondary.metadata || {}),
        ...(primary.metadata || {}),
        mergedFrom: secondaryId,
        mergedAt: new Date()
      }
    };

    // Apply custom merge strategy
    if (mergeStrategy.preferSecondary) {
      for (const field of mergeStrategy.preferSecondary) {
        if (secondary[field]) {
          mergedData[field] = secondary[field];
        }
      }
    }

    // Update primary contact with merged data
    await primary.update(mergedData, { transaction });

    // Reassign all activities from secondary to primary
    await Activity.update(
      { contactId: primaryId },
      { where: { contactId: secondaryId }, transaction }
    );

    // Reassign all opportunities from secondary to primary
    await Opportunity.update(
      { contactId: primaryId },
      { where: { contactId: secondaryId }, transaction }
    );

    // Reassign any leads that converted to secondary contact
    await Lead.update(
      { convertedContactId: primaryId },
      { where: { convertedContactId: secondaryId }, transaction }
    );

    // Soft delete or hard delete secondary contact
    await secondary.destroy({ transaction });

    await transaction.commit();

    logger.info('Contacts merged', {
      primaryId,
      secondaryId,
      mergedTags: mergedData.tags.length,
      activitiesMoved: await Activity.count({ where: { contactId: primaryId } })
    });

    return await Contact.findByPk(primaryId, {
      include: [
        { model: Company, as: 'company' },
        { model: Activity, as: 'activities', limit: 10, order: [['createdAt', 'DESC']] }
      ]
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Contact merge failed', {
      primaryId,
      secondaryId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get contact activity timeline
 * @param {string} contactId - Contact ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Activity timeline
 */
const getContactTimeline = async (contactId, options = {}) => {
  const {
    limit = 50,
    offset = 0,
    activityType = null,
    startDate = null,
    endDate = null
  } = options;

  const whereClause = {
    contactId,
    ...(activityType && { activityType }),
    ...(startDate && { createdAt: { [Op.gte]: new Date(startDate) } }),
    ...(endDate && { createdAt: { [Op.lte]: new Date(endDate) } })
  };

  const activities = await Activity.findAll({
    where: whereClause,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'firstName', 'lastName', 'email'] }
    ]
  });

  const total = await Activity.count({ where: whereClause });

  return {
    activities,
    total,
    limit,
    offset,
    hasMore: offset + limit < total
  };
};

/**
 * Segment contacts based on criteria
 * @param {Object} criteria - Segmentation criteria
 * @returns {Promise<Array>} Segmented contacts
 */
const segmentContacts = async (criteria) => {
  const {
    tags = [],
    companyId = null,
    city = null,
    state = null,
    country = null,
    jobTitles = [],
    hasActivity = null, // true, false, or null
    activitySince = null, // Date
    customFieldFilters = []
  } = criteria;

  const whereClause = {};

  if (tags.length > 0) {
    whereClause.tags = { [Op.overlap]: tags };
  }

  if (companyId) {
    whereClause.companyId = companyId;
  }

  if (city) {
    whereClause.city = { [Op.iLike]: `%${city}%` };
  }

  if (state) {
    whereClause.state = state;
  }

  if (country) {
    whereClause.country = country;
  }

  if (jobTitles.length > 0) {
    whereClause.jobTitle = { [Op.in]: jobTitles };
  }

  // Custom field filters (JSONB queries)
  for (const filter of customFieldFilters) {
    const { field, operator, value } = filter;

    if (operator === 'equals') {
      whereClause[`customFields.${field}`] = value;
    } else if (operator === 'contains') {
      whereClause[`customFields.${field}`] = { [Op.iLike]: `%${value}%` };
    }
  }

  let contacts = await Contact.findAll({
    where: whereClause,
    include: [{ model: Company, as: 'company' }]
  });

  // Filter by activity criteria (if specified)
  if (hasActivity !== null || activitySince !== null) {
    const contactIds = contacts.map(c => c.id);

    const activityWhere = {
      contactId: { [Op.in]: contactIds }
    };

    if (activitySince) {
      activityWhere.createdAt = { [Op.gte]: new Date(activitySince) };
    }

    const contactsWithActivity = await Activity.findAll({
      where: activityWhere,
      attributes: ['contactId'],
      group: ['contactId'],
      raw: true
    });

    const activeContactIds = contactsWithActivity.map(a => a.contactId);

    if (hasActivity === true) {
      contacts = contacts.filter(c => activeContactIds.includes(c.id));
    } else if (hasActivity === false) {
      contacts = contacts.filter(c => !activeContactIds.includes(c.id));
    }
  }

  return contacts;
};

/**
 * Enrich contact with social profile data
 * @param {string} contactId - Contact ID
 * @param {Object} socialData - Social profile data
 * @returns {Promise<Object>} Updated contact
 */
const enrichContact = async (contactId, socialData) => {
  const contact = await Contact.findByPk(contactId);

  if (!contact) {
    throw new Error('Contact not found');
  }

  const updatedMetadata = {
    ...(contact.metadata || {}),
    socialProfiles: {
      ...(contact.metadata?.socialProfiles || {}),
      ...socialData
    },
    enrichedAt: new Date()
  };

  await contact.update({ metadata: updatedMetadata });

  logger.info('Contact enriched with social data', {
    contactId,
    platforms: Object.keys(socialData)
  });

  return contact;
};

/**
 * Bulk export contacts
 * @param {Object} filters - Export filters
 * @param {string} format - Export format (csv, json, vcard)
 * @returns {Promise<Object>} Export data
 */
const exportContacts = async (filters = {}, format = 'json') => {
  const contacts = await Contact.findAll({
    where: filters,
    include: [{ model: Company, as: 'company' }],
    order: [['lastName', 'ASC'], ['firstName', 'ASC']]
  });

  if (format === 'json') {
    return {
      format: 'json',
      data: contacts.map(c => c.toJSON()),
      count: contacts.length
    };
  }

  if (format === 'csv') {
    const headers = [
      'id', 'firstName', 'lastName', 'email', 'phone', 'mobile',
      'company', 'jobTitle', 'city', 'state', 'country'
    ];

    const rows = contacts.map(c => [
      c.id,
      c.firstName || '',
      c.lastName || '',
      c.email || '',
      c.phone || '',
      c.mobile || '',
      c.company?.name || '',
      c.jobTitle || '',
      c.city || '',
      c.state || '',
      c.country || ''
    ]);

    return {
      format: 'csv',
      headers,
      rows,
      count: contacts.length
    };
  }

  if (format === 'vcard') {
    const vcards = contacts.map(c => {
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${c.firstName} ${c.lastName}`,
        `N:${c.lastName};${c.firstName};;;`,
        c.email ? `EMAIL:${c.email}` : null,
        c.phone ? `TEL;TYPE=WORK:${c.phone}` : null,
        c.mobile ? `TEL;TYPE=CELL:${c.mobile}` : null,
        c.jobTitle ? `TITLE:${c.jobTitle}` : null,
        c.company?.name ? `ORG:${c.company.name}` : null,
        'END:VCARD'
      ].filter(Boolean).join('\n');

      return vcard;
    });

    return {
      format: 'vcard',
      data: vcards.join('\n\n'),
      count: contacts.length
    };
  }

  throw new Error(`Unsupported export format: ${format}`);
};

/**
 * Bulk import contacts with deduplication
 * @param {Array} contactsData - Array of contact objects
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import results
 */
const bulkImportContacts = async (contactsData, options = {}) => {
  const {
    checkDuplicates = true,
    autoMerge = false,
    skipDuplicates = true
  } = options;

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duplicates: []
  };

  for (const contactData of contactsData) {
    try {
      if (checkDuplicates) {
        const duplicates = await findDuplicates(contactData);

        if (duplicates.length > 0) {
          const bestMatch = duplicates[0];

          if (autoMerge && bestMatch.matchScore >= 90) {
            // Update existing contact
            await bestMatch.contact.update(contactData);
            results.updated++;
          } else if (skipDuplicates) {
            results.skipped++;
            results.duplicates.push({
              data: contactData,
              possibleDuplicates: duplicates.slice(0, 3)
            });
            continue;
          }
        }
      }

      // Create new contact
      await Contact.create(contactData);
      results.created++;
    } catch (error) {
      results.errors.push({
        data: contactData,
        error: error.message
      });
    }
  }

  logger.info('Bulk contact import completed', {
    total: contactsData.length,
    created: results.created,
    updated: results.updated,
    skipped: results.skipped,
    errors: results.errors.length
  });

  return results;
};

/**
 * Get contact statistics
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Contact statistics
 */
const getContactStats = async (filters = {}) => {
  const total = await Contact.count({ where: filters });

  const byCountry = await Contact.findAll({
    where: { ...filters, country: { [Op.ne]: null } },
    attributes: [
      'country',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['country'],
    order: [[sequelize.literal('count'), 'DESC']],
    limit: 10,
    raw: true
  });

  const byCompany = await Contact.findAll({
    where: { ...filters, companyId: { [Op.ne]: null } },
    attributes: [
      'companyId',
      [sequelize.fn('COUNT', sequelize.col('Contact.id')), 'count']
    ],
    group: ['companyId', 'company.id', 'company.name'],
    order: [[sequelize.literal('count'), 'DESC']],
    limit: 10,
    raw: true,
    include: [{ model: Company, as: 'company', attributes: ['name'] }]
  });

  const recentlyAdded = await Contact.count({
    where: {
      ...filters,
      createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  });

  const withEmail = await Contact.count({
    where: { ...filters, email: { [Op.ne]: null } }
  });

  const withPhone = await Contact.count({
    where: { ...filters, phone: { [Op.ne]: null } }
  });

  return {
    total,
    recentlyAdded,
    withEmail,
    withPhone,
    emailPercentage: total > 0 ? Math.round((withEmail / total) * 100) : 0,
    phonePercentage: total > 0 ? Math.round((withPhone / total) * 100) : 0,
    topCountries: byCountry.map(c => ({ country: c.country, count: parseInt(c.count) })),
    topCompanies: byCompany.map(c => ({
      companyId: c.companyId,
      companyName: c['company.name'],
      count: parseInt(c.count)
    }))
  };
};

module.exports = {
  findDuplicates,
  mergeContacts,
  getContactTimeline,
  segmentContacts,
  enrichContact,
  exportContacts,
  bulkImportContacts,
  getContactStats,
  calculateSimilarity
};
