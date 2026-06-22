/**
 * ═══════════════════════════════════════════════════════════════════════
 * CrlCounter Model - Persistent monotonic cRLNumber per issuing CA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RFC 5280 §5.2.3 requires the cRLNumber extension to increase
 * monotonically. The counter is incremented atomically (row lock inside
 * a transaction) on every CRL generation.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const CrlCounter = sequelize.define('CrlCounter', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    issuerId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'issuer_id',
      comment: 'CA certificate this counter belongs to'
    },
    counter: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Last issued cRLNumber'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'crl_counters',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['issuer_id'], unique: true }
    ]
  });

  /**
   * Atomically allocate the next cRLNumber for an issuer.
   * @param {string} issuerId - CA certificate id
   * @returns {Promise<number>} next monotonic CRL number
   */
  CrlCounter.nextNumber = async function(issuerId) {
    return sequelize.transaction(async (transaction) => {
      let row = await CrlCounter.findOne({
        where: { issuerId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!row) {
        row = await CrlCounter.create(
          { id: uuidv4(), issuerId, counter: 0 },
          { transaction }
        );
      }

      const next = Number(row.counter) + 1;
      row.counter = next;
      await row.save({ transaction });

      return next;
    });
  };

  return CrlCounter;
};
