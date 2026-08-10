const crypto = require('crypto');
const { logger } = require('@exprsn/shared');
const { Account, Repository } = require('../models');

class DIDService {
  generateDID(username) {
    // For this implementation, we'll use did:web format
    // In production, you might want to use did:plc with proper PLC operations
    const domain = process.env.BLUESKY_DOMAIN || 'exprsn.io';
    return `did:web:${domain}:${username}`;
  }

  generateHandle(username) {
    const domain = process.env.BLUESKY_DOMAIN || 'exprsn.io';
    return `${username}.${domain}`;
  }

  async generateKeyPair() {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ publicKey, privateKey });
        }
      });
    });
  }

  async createAccount(userData) {
    try {
      const { username, email, exprsnUserId, displayName, description } = userData;

      // Generate DID and handle
      const did = this.generateDID(username);
      const handle = this.generateHandle(username);

      // Generate signing keys
      const { publicKey, privateKey } = await this.generateKeyPair();

      // Encrypt private key (in production, use proper encryption)
      const encryptedPrivateKey = this.encryptPrivateKey(privateKey);

      // Create account
      const account = await Account.create({
        did,
        handle,
        exprsnUserId,
        email,
        displayName: displayName || username,
        description: description || '',
        publicKey,
        privateKey: encryptedPrivateKey,
        status: 'active',
        isVerified: false
      });

      // Create repository
      const repository = await Repository.create({
        accountId: account.id,
        did,
        head: null,
        rev: this.generateRev(),
        commitCount: 0,
        recordCount: 0,
        blobCount: 0,
        totalSize: 0
      });

      logger.info('Account created', {
        did,
        handle,
        exprsnUserId
      });

      return {
        account,
        repository
      };
    } catch (error) {
      logger.error('Failed to create account', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async resolveHandle(handle) {
    try {
      const account = await Account.findOne({
        where: { handle },
        attributes: ['did', 'handle', 'status']
      });

      if (!account || account.status !== 'active') {
        return null;
      }

      return {
        did: account.did
      };
    } catch (error) {
      logger.error('Failed to resolve handle', {
        error: error.message,
        handle
      });
      return null;
    }
  }

  async resolveDID(did) {
    try {
      const account = await Account.findOne({
        where: { did },
        attributes: ['id', 'did', 'handle', 'publicKey', 'status']
      });

      if (!account || account.status !== 'active') {
        return null;
      }

      // Return DID document
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: account.did,
        alsoKnownAs: [`at://${account.handle}`],
        verificationMethod: [
          {
            id: `${account.did}#atproto`,
            type: 'EcdsaSecp256r1VerificationKey2019',
            controller: account.did,
            publicKeyMultibase: Buffer.from(account.publicKey).toString('base64')
          }
        ],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: process.env.PDS_ENDPOINT || `http://localhost:${process.env.PORT || 3018}`
          }
        ]
      };
    } catch (error) {
      logger.error('Failed to resolve DID', {
        error: error.message,
        did
      });
      return null;
    }
  }

  encryptPrivateKey(privateKey) {
    // Use AES-256-GCM encryption for private keys
    const encryptionService = require('./encryptionService');
    return encryptionService.encryptPrivateKey(privateKey);
  }

  decryptPrivateKey(encryptedKey) {
    // Decrypt using AES-256-GCM
    const encryptionService = require('./encryptionService');
    return encryptionService.decryptPrivateKey(encryptedKey);
  }

  generateRev() {
    // Generate a revision identifier (similar to Bluesky's TID)
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
  }
}

module.exports = new DIDService();
