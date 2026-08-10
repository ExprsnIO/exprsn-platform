const {
  sanitizeRichText,
  sanitizePlainText,
  sanitizeGroupData,
  sanitizeEventData,
  sanitizeProposalData,
  sanitizeObject
} = require('../../../src/utils/sanitization');

describe('Sanitization Utils', () => {
  describe('sanitizePlainText', () => {
    it('should remove all HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello <b>World</b>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello World');
    });

    it('should handle empty strings', () => {
      expect(sanitizePlainText('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizePlainText(null)).toBe('');
      expect(sanitizePlainText(undefined)).toBe('');
    });

    it('should remove malicious scripts', () => {
      const input = '<img src=x onerror="alert(1)">';
      const result = sanitizePlainText(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('script');
    });
  });

  describe('sanitizeRichText', () => {
    it('should allow safe HTML tags', () => {
      const input = '<b>Bold</b> <i>Italic</i> <a href="http://example.com">Link</a>';
      const result = sanitizeRichText(input);
      expect(result).toContain('<b>Bold</b>');
      expect(result).toContain('<i>Italic</i>');
      expect(result).toContain('<a href="http://example.com">Link</a>');
    });

    it('should remove dangerous tags', () => {
      const input = '<script>alert("xss")</script><b>Safe</b>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('script');
      expect(result).not.toContain('alert');
      expect(result).toContain('<b>Safe</b>');
    });

    it('should remove event handlers', () => {
      const input = '<b onclick="alert(1)">Click me</b>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<b>Click me</b>');
    });

    it('should sanitize URLs with dangerous protocols', () => {
      const input = '<a href="javascript:alert(1)">Bad Link</a>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('javascript:');
    });

    it('should allow https and http protocols', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeRichText(input);
      expect(result).toContain('https://example.com');
    });
  });

  describe('sanitizeGroupData', () => {
    it('should sanitize group name and description', () => {
      const input = {
        name: '<script>alert("xss")</script>Tech Group',
        description: '<b>Welcome</b> to our <script>bad()</script> community',
        rules: '<h1>Rules</h1><script>bad()</script>',
        website: 'https://example.com'
      };

      const result = sanitizeGroupData(input);

      expect(result.name).not.toContain('script');
      expect(result.name).toBe('Tech Group');
      expect(result.description).toContain('<b>Welcome</b>');
      expect(result.description).not.toContain('script');
      expect(result.rules).toContain('<h1>Rules</h1>');
      expect(result.rules).not.toContain('script');
    });

    it('should handle null fields', () => {
      const input = {
        name: 'Test Group',
        description: null,
        rules: null
      };

      const result = sanitizeGroupData(input);
      expect(result.name).toBe('Test Group');
      expect(result.description).toBe('');
      expect(result.rules).toBeNull();
    });
  });

  describe('sanitizeEventData', () => {
    it('should sanitize event title and description', () => {
      const input = {
        title: '<b>Tech</b> <script>alert()</script> Meetup',
        description: '<p>Join us</p><script>bad()</script>',
        location: '123 Main St <script>bad()</script>'
      };

      const result = sanitizeEventData(input);

      expect(result.title).not.toContain('script');
      expect(result.title).toBe('Tech  Meetup');
      expect(result.description).toContain('<p>Join us</p>');
      expect(result.description).not.toContain('script');
      expect(result.location).not.toContain('script');
    });
  });

  describe('sanitizeProposalData', () => {
    it('should sanitize proposal title and description', () => {
      const input = {
        title: 'Update <script>alert()</script> Rules',
        description: '<p>Proposal details</p><script>bad()</script>',
        rationale: '<b>Important</b> reasons'
      };

      const result = sanitizeProposalData(input);

      expect(result.title).not.toContain('script');
      expect(result.description).toContain('<p>Proposal details</p>');
      expect(result.description).not.toContain('script');
      expect(result.rationale).toContain('<b>Important</b>');
    });
  });

  describe('sanitizeObject', () => {
    it('should recursively sanitize nested objects', () => {
      const input = {
        name: '<script>alert()</script>Test',
        nested: {
          title: '<b>Bold</b><script>bad()</script>'
        },
        array: ['<script>bad()</script>item1', 'item2']
      };

      const result = sanitizeObject(input);

      expect(result.name).not.toContain('script');
      expect(result.nested.title).not.toContain('script');
      expect(result.array[0]).not.toContain('script');
    });

    it('should handle arrays', () => {
      const input = ['<script>bad()</script>test', 'safe'];
      const result = sanitizeObject(input);

      expect(result[0]).not.toContain('script');
      expect(result[1]).toBe('safe');
    });
  });
});
