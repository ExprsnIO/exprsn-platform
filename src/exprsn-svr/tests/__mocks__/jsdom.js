/**
 * Mock for jsdom
 * Provides minimal JSDOM functionality for testing
 */

class JSDOM {
  constructor(html) {
    this.window = {
      document: {
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: (tag) => ({
          tagName: tag.toUpperCase(),
          setAttribute: () => {},
          getAttribute: () => null,
          innerHTML: '',
          textContent: ''
        })
      }
    };
  }
}

module.exports = { JSDOM };
