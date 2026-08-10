const express = require('express');
const router = express.Router();
const { validateToken } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { ContactAddressbook, Contact } = require('../../models/index');

// =============== ADDRESSBOOKS ===============

router.get('/addressbooks',  async (req, res) => {
  try {
    const addressbooks = await ContactAddressbook.findAll({
      where: { ownerId: req.user.id },
      order: [['name', 'ASC']]
    });

    res.json({ success: true, addressbooks });
  } catch (error) {
    logger.error('GET /carddav/addressbooks failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/addressbooks',  async (req, res) => {
  try {
    const { name, description, color } = req.body;

    const addressbook = await ContactAddressbook.create({
      name,
      description,
      color,
      ownerId: req.user.id,
      syncToken: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ctag: `ctag-${Date.now()}`
    });

    res.status(201).json({ success: true, addressbook });
  } catch (error) {
    logger.error('POST /carddav/addressbooks failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/addressbooks/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { includeContacts } = req.query;

    const include = includeContacts === 'true' ? [{
      model: Contact,
      as: 'Contacts',
      where: { isArchived: false },
      required: false
    }] : [];

    const addressbook = await ContactAddressbook.findByPk(id, { include });

    if (!addressbook) {
      return res.status(404).json({ success: false, error: 'Addressbook not found' });
    }

    res.json({ success: true, addressbook });
  } catch (error) {
    logger.error('GET /carddav/addressbooks/:id failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============== CONTACTS ===============

router.get('/addressbooks/:addressbookId/contacts',  async (req, res) => {
  try {
    const { addressbookId } = req.params;
    const { search, favorite, limit = 50, offset = 0 } = req.query;

    const where = { addressbookId, isArchived: false };
    if (favorite === 'true') where.isFavorite = true;

    if (search) {
      where[sequelize.Sequelize.Op.or] = [
        { firstName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { lastName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { organization: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: contacts } = await Contact.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    res.json({
      success: true,
      contacts,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('GET /carddav/addressbooks/:addressbookId/contacts failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/addressbooks/:addressbookId/contacts',  async (req, res) => {
  try {
    const { addressbookId } = req.params;
    const contactData = req.body;

    // Generate UID if not provided
    if (!contactData.uid) {
      contactData.uid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@exprsn.io`;
    }

    // Generate etag
    contactData.etag = `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`;

    // Build full name if not provided
    if (!contactData.fullName) {
      const parts = [
        contactData.prefix,
        contactData.firstName,
        contactData.middleName,
        contactData.lastName,
        contactData.suffix
      ].filter(Boolean);
      contactData.fullName = parts.join(' ');
    }

    contactData.addressbookId = addressbookId;

    const contact = await Contact.create(contactData);

    // Update addressbook contact count and ctag
    await ContactAddressbook.increment('contactCount', { where: { id: addressbookId } });
    await ContactAddressbook.update(
      { ctag: `ctag-${Date.now()}` },
      { where: { id: addressbookId } }
    );

    res.status(201).json({ success: true, contact });
  } catch (error) {
    logger.error('POST /carddav/addressbooks/:addressbookId/contacts failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/contacts/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id, {
      include: [{
        model: ContactAddressbook,
        as: 'Addressbook',
        attributes: ['id', 'name']
      }]
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.json({ success: true, contact });
  } catch (error) {
    logger.error('GET /carddav/contacts/:id failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/contacts/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    // Update etag
    updates.etag = `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`;

    // Rebuild full name if name fields changed
    if (updates.firstName || updates.lastName || updates.middleName || updates.prefix || updates.suffix) {
      const parts = [
        updates.prefix || contact.prefix,
        updates.firstName || contact.firstName,
        updates.middleName || contact.middleName,
        updates.lastName || contact.lastName,
        updates.suffix || contact.suffix
      ].filter(Boolean);
      updates.fullName = parts.join(' ');
    }

    await contact.update(updates);

    // Update addressbook ctag
    await ContactAddressbook.update(
      { ctag: `ctag-${Date.now()}` },
      { where: { id: contact.addressbookId } }
    );

    res.json({ success: true, contact });
  } catch (error) {
    logger.error('PUT /carddav/contacts/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/contacts/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const addressbookId = contact.addressbookId;
    await contact.destroy();

    // Update addressbook contact count and ctag
    await ContactAddressbook.decrement('contactCount', { where: { id: addressbookId } });
    await ContactAddressbook.update(
      { ctag: `ctag-${Date.now()}` },
      { where: { id: addressbookId } }
    );

    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error('DELETE /carddav/contacts/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Export contact as vCard
router.get('/contacts/:id/vcard',  async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    // Generate vCard if not stored
    if (!contact.vcard) {
      const vcard = generateVCard(contact);
      await contact.update({ vcard });
    }

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${contact.fullName || 'contact'}.vcf"`);
    res.send(contact.vcard);
  } catch (error) {
    logger.error('GET /carddav/contacts/:id/vcard failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate vCard
function generateVCard(contact) {
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${contact.uid}`,
    `FN:${contact.fullName || ''}`,
    `N:${contact.lastName || ''};${contact.firstName || ''};${contact.middleName || ''};${contact.prefix || ''};${contact.suffix || ''}`,
    contact.organization ? `ORG:${contact.organization}` : null,
    contact.jobTitle ? `TITLE:${contact.jobTitle}` : null,
    ...((contact.emails || []).map(email => `EMAIL;TYPE=${email.type}:${email.value}`)),
    ...((contact.phones || []).map(phone => `TEL;TYPE=${phone.type}:${phone.value}`)),
    ...((contact.urls || []).map(url => `URL;TYPE=${url.type}:${url.value}`)),
    contact.birthday ? `BDAY:${contact.birthday}` : null,
    contact.notes ? `NOTE:${contact.notes}` : null,
    'END:VCARD'
  ].filter(Boolean);

  return vcard.join('\r\n');
}

module.exports = router;
