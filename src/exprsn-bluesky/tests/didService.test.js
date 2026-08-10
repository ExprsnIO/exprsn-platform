const didService = require('../services/didService');
const { Account, Repository } = require('../models');

describe('DID Service', () => {
  beforeAll(async () => {
    // Setup test database if needed
  });

  afterAll(async () => {
    // Cleanup
    await Account.destroy({ where: {} });
    await Repository.destroy({ where: {} });
  });

  describe('generateDID', () => {
    it('should generate a valid did:web identifier', () => {
      const username = 'testuser';
      const did = didService.generateDID(username);

      expect(did).toBeDefined();
      expect(did).toMatch(/^did:web:/);
      expect(did).toContain('testuser');
    });
  });

  describe('generateHandle', () => {
    it('should generate a valid handle in @username.domain format', () => {
      const username = 'testuser';
      const handle = didService.generateHandle(username);

      expect(handle).toBeDefined();
      expect(handle).toMatch(/^testuser\./);
      expect(handle).toContain('.exprsn.io');
    });
  });

  describe('generateKeyPair', () => {
    it('should generate RSA key pair', async () => {
      const { publicKey, privateKey } = await didService.generateKeyPair();

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
      expect(privateKey).toContain('BEGIN PRIVATE KEY');
    });
  });

  describe('createAccount', () => {
    it('should create account with DID and repository', async () => {
      const userData = {
        username: 'johndoe',
        email: 'john@example.com',
        exprsnUserId: '123e4567-e89b-12d3-a456-426614174000',
        displayName: 'John Doe',
        description: 'Test user'
      };

      const result = await didService.createAccount(userData);

      expect(result).toBeDefined();
      expect(result.account).toBeDefined();
      expect(result.repository).toBeDefined();
      expect(result.account.did).toMatch(/^did:web:/);
      expect(result.account.handle).toContain('johndoe');
      expect(result.repository.did).toBe(result.account.did);
    });

    it('should fail with duplicate username', async () => {
      const userData = {
        username: 'duplicate',
        email: 'dup1@example.com',
        exprsnUserId: '123e4567-e89b-12d3-a456-426614174001'
      };

      await didService.createAccount(userData);

      // Try to create again with same username
      const userData2 = {
        username: 'duplicate',
        email: 'dup2@example.com',
        exprsnUserId: '123e4567-e89b-12d3-a456-426614174002'
      };

      await expect(didService.createAccount(userData2)).rejects.toThrow();
    });
  });

  describe('resolveHandle', () => {
    it('should resolve handle to DID', async () => {
      const userData = {
        username: 'resolver',
        email: 'resolver@example.com',
        exprsnUserId: '123e4567-e89b-12d3-a456-426614174003'
      };

      const { account } = await didService.createAccount(userData);
      const result = await didService.resolveHandle(account.handle);

      expect(result).toBeDefined();
      expect(result.did).toBe(account.did);
    });

    it('should return null for non-existent handle', async () => {
      const result = await didService.resolveHandle('nonexistent.exprsn.io');
      expect(result).toBeNull();
    });
  });

  describe('resolveDID', () => {
    it('should resolve DID to DID document', async () => {
      const userData = {
        username: 'diddoc',
        email: 'diddoc@example.com',
        exprsnUserId: '123e4567-e89b-12d3-a456-426614174004'
      };

      const { account } = await didService.createAccount(userData);
      const didDoc = await didService.resolveDID(account.did);

      expect(didDoc).toBeDefined();
      expect(didDoc.id).toBe(account.did);
      expect(didDoc['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(didDoc.verificationMethod).toBeDefined();
      expect(didDoc.service).toBeDefined();
    });

    it('should return null for non-existent DID', async () => {
      const result = await didService.resolveDID('did:web:nonexistent');
      expect(result).toBeNull();
    });
  });
});
