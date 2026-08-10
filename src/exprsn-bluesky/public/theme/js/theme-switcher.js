/**
 * Exprsn Theme Switcher
 * WCAG 2.1 AA Compliant - Light/Dark Mode Toggle
 * Respects system preferences and saves user choice
 */

class ExpRsnThemeSwitcher {
  constructor(options = {}) {
    this.options = {
      storageKey: options.storageKey || 'exprsn-theme',
      defaultTheme: options.defaultTheme || 'auto',
      toggleButtonId: options.toggleButtonId || 'theme-toggle',
      onChange: options.onChange || null,
      ...options
    };

    this.currentTheme = null;
    this.systemPreference = null;
    this.toggleButton = null;

    this.init();
  }

  /**
   * Initialize theme switcher
   */
  init() {
    // Detect system preference
    this.detectSystemPreference();

    // Load saved theme or use default
    this.currentTheme = this.getSavedTheme() || this.options.defaultTheme;

    // Apply theme
    this.applyTheme(this.currentTheme);

    // Set up toggle button
    this.setupToggleButton();

    // Listen for system preference changes
    this.watchSystemPreference();

    // Announce theme to screen readers
    this.announceTheme();
  }

  /**
   * Detect system color scheme preference
   */
  detectSystemPreference() {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemPreference = darkModeQuery.matches ? 'dark' : 'light';
    } else {
      this.systemPreference = 'light';
    }
  }

  /**
   * Watch for changes in system preference
   */
  watchSystemPreference() {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

      // Modern browsers
      if (darkModeQuery.addEventListener) {
        darkModeQuery.addEventListener('change', (e) => {
          this.systemPreference = e.matches ? 'dark' : 'light';

          // If using auto mode, update theme
          if (this.currentTheme === 'auto') {
            this.applyTheme('auto');
            this.announceTheme();
          }
        });
      }
      // Older browsers
      else if (darkModeQuery.addListener) {
        darkModeQuery.addListener((e) => {
          this.systemPreference = e.matches ? 'dark' : 'light';
          if (this.currentTheme === 'auto') {
            this.applyTheme('auto');
            this.announceTheme();
          }
        });
      }
    }
  }

  /**
   * Get saved theme from localStorage
   * @returns {string|null} Saved theme or null
   */
  getSavedTheme() {
    try {
      return localStorage.getItem(this.options.storageKey);
    } catch (e) {
      console.warn('LocalStorage not available:', e);
      return null;
    }
  }

  /**
   * Save theme to localStorage
   * @param {string} theme - Theme to save
   */
  saveTheme(theme) {
    try {
      localStorage.setItem(this.options.storageKey, theme);
    } catch (e) {
      console.warn('Could not save theme:', e);
    }
  }

  /**
   * Apply theme to document
   * @param {string} theme - Theme to apply ('light', 'dark', or 'auto')
   */
  applyTheme(theme) {
    const actualTheme = theme === 'auto' ? this.systemPreference : theme;

    // Remove existing theme attribute
    document.documentElement.removeAttribute('data-theme');

    // Apply new theme
    if (actualTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    // Light is default, no attribute needed

    // Update current theme
    this.currentTheme = theme;

    // Save to localStorage
    this.saveTheme(theme);

    // Update toggle button
    this.updateToggleButton(actualTheme);

    // Fire onChange callback
    if (this.options.onChange) {
      this.options.onChange(theme, actualTheme);
    }

    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(actualTheme);
  }

  /**
   * Set up theme toggle button
   */
  setupToggleButton() {
    this.toggleButton = document.getElementById(this.options.toggleButtonId);

    if (!this.toggleButton) {
      console.warn(`Theme toggle button with id "${this.options.toggleButtonId}" not found`);
      return;
    }

    // Set ARIA attributes
    this.toggleButton.setAttribute('role', 'button');
    this.toggleButton.setAttribute('aria-label', 'Toggle theme');

    // Add click listener
    this.toggleButton.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Add keyboard listener
    this.toggleButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleTheme();
      }
    });

    // Update button appearance
    const actualTheme = this.currentTheme === 'auto' ? this.systemPreference : this.currentTheme;
    this.updateToggleButton(actualTheme);
  }

  /**
   * Update toggle button appearance
   * @param {string} theme - Current theme
   */
  updateToggleButton(theme) {
    if (!this.toggleButton) return;

    const isDark = theme === 'dark';

    // Update icon
    const icon = this.toggleButton.querySelector('.theme-icon');
    if (icon) {
      icon.textContent = isDark ? '☀️' : '🌙';
    } else {
      this.toggleButton.innerHTML = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    }

    // Update ARIA label
    this.toggleButton.setAttribute(
      'aria-label',
      isDark ? 'Switch to light mode' : 'Switch to dark mode'
    );

    // Update pressed state
    this.toggleButton.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    const currentActualTheme = this.currentTheme === 'auto' ? this.systemPreference : this.currentTheme;
    const newTheme = currentActualTheme === 'dark' ? 'light' : 'dark';

    this.applyTheme(newTheme);
    this.announceTheme();
  }

  /**
   * Set specific theme
   * @param {string} theme - Theme to set ('light', 'dark', or 'auto')
   */
  setTheme(theme) {
    if (['light', 'dark', 'auto'].includes(theme)) {
      this.applyTheme(theme);
      this.announceTheme();
    } else {
      console.warn(`Invalid theme: ${theme}. Use 'light', 'dark', or 'auto'.`);
    }
  }

  /**
   * Get current theme
   * @returns {string} Current theme
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Get actual applied theme (resolves 'auto')
   * @returns {string} Actual theme ('light' or 'dark')
   */
  getActualTheme() {
    return this.currentTheme === 'auto' ? this.systemPreference : this.currentTheme;
  }

  /**
   * Update meta theme-color for mobile browsers
   * @param {string} theme - Theme to apply
   */
  updateMetaThemeColor(theme) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }

    // Set appropriate color based on theme
    const color = theme === 'dark' ? '#1a1d20' : '#ffffff';
    metaThemeColor.setAttribute('content', color);
  }

  /**
   * Announce theme change to screen readers
   */
  announceTheme() {
    const actualTheme = this.getActualTheme();
    const message = `${actualTheme.charAt(0).toUpperCase() + actualTheme.slice(1)} mode activated`;

    // Create or update live region
    let announcer = document.getElementById('theme-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'theme-announcer';
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }

    // Announce message
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  }

  /**
   * Create theme selector dropdown
   * @param {string} containerId - Container element ID
   * @returns {HTMLElement} Created select element
   */
  createThemeSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container with id "${containerId}" not found`);
      return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', 'theme-selector');
    label.textContent = 'Theme';

    const select = document.createElement('select');
    select.id = 'theme-selector';
    select.className = 'form-select';
    select.setAttribute('aria-label', 'Select theme');

    const options = [
      { value: 'auto', label: 'Auto (System)' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' }
    ];

    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === this.currentTheme) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      this.setTheme(e.target.value);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);

    return select;
  }

  /**
   * Destroy theme switcher
   */
  destroy() {
    if (this.toggleButton) {
      this.toggleButton.removeEventListener('click', this.toggleTheme);
      this.toggleButton.removeEventListener('keydown', this.toggleTheme);
    }

    const announcer = document.getElementById('theme-announcer');
    if (announcer) {
      announcer.remove();
    }
  }
}

/**
 * Theme Persistence Manager
 * Syncs theme across tabs and windows
 */
class ExpRsnThemeSync {
  constructor(themeSwitcher) {
    this.themeSwitcher = themeSwitcher;
    this.init();
  }

  init() {
    // Listen for storage events (theme changes in other tabs)
    window.addEventListener('storage', (e) => {
      if (e.key === this.themeSwitcher.options.storageKey && e.newValue) {
        this.themeSwitcher.applyTheme(e.newValue);
      }
    });
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExpRsnThemeSwitcher, ExpRsnThemeSync };
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Check for theme toggle button
  if (document.getElementById('theme-toggle')) {
    const themeSwitcher = new ExpRsnThemeSwitcher();

    // Enable theme sync across tabs
    new ExpRsnThemeSync(themeSwitcher);

    // Make globally accessible
    window.ExpRsnTheme = themeSwitcher;
  }
});

// Apply theme immediately to prevent flash
(function() {
  try {
    const savedTheme = localStorage.getItem('exprsn-theme') || 'auto';
    let actualTheme = savedTheme;

    if (savedTheme === 'auto') {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      actualTheme = darkModeQuery.matches ? 'dark' : 'light';
    }

    if (actualTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // Fail silently
  }
})();
