/**
 * Wizard Functionality Unit Test
 *
 * Tests the wizard JavaScript in a Node.js environment using JSDOM
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Read the applications HTML and JavaScript
const htmlPath = path.join(__dirname, '../views/applications.ejs');
const jsPath = path.join(__dirname, '../public/js/lowcode-applications.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// Create a virtual DOM
const dom = new JSDOM(htmlContent, {
  url: 'http://localhost:5001/lowcode/applications',
  runScripts: 'outside-only',
  resources: 'usable'
});

const { window } = dom;
const { document } = window;

// Make global objects available
global.window = window;
global.document = document;
global.fetch = async () => ({ json: async () => ({ data: { applications: [] } }) });
global.localStorage = {
  getItem: () => 'light',
  setItem: () => {}
};

// Test results
const tests = {
  passed: 0,
  failed: 0,
  errors: []
};

function assert(condition, message) {
  if (condition) {
    tests.passed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    tests.failed++;
    tests.errors.push(message);
    console.log(`❌ FAIL: ${message}`);
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Wizard Functionality Unit Test');
console.log('═══════════════════════════════════════════════════════\n');

try {
  // Execute the JavaScript in the context of the window
  const script = new vm.Script(jsContent);
  const context = vm.createContext(window);
  script.runInContext(context);

  console.log('Step 1: Checking Global Functions\n');

  // Test 1: Check if wizard functions exist in global scope
  const wizardFunctions = [
    'goToStep',
    'nextStep',
    'previousStep',
    'updateWizardUI',
    'validateCurrentStep',
    'collectStepData',
    'submitWizard',
    'resetWizard',
    'updateWizardUIOnOpen'
  ];

  wizardFunctions.forEach(funcName => {
    assert(
      typeof window[funcName] === 'function',
      `${funcName} exists in global scope`
    );
  });

  console.log('\nStep 2: Checking AppState\n');

  // Test 2: Check AppState
  assert(
    typeof window.AppState !== 'undefined',
    'AppState exists'
  );

  if (window.AppState) {
    assert(
      window.AppState.wizard !== undefined,
      'AppState.wizard exists'
    );

    if (window.AppState.wizard) {
      assert(
        window.AppState.wizard.currentStep === 1,
        'Initial currentStep is 1'
      );

      assert(
        window.AppState.wizard.totalSteps === 9,
        'totalSteps is 9'
      );

      assert(
        window.AppState.wizard.completedSteps instanceof Set,
        'completedSteps is a Set'
      );

      assert(
        typeof window.AppState.wizard.formData === 'object',
        'formData is an object'
      );
    }
  }

  console.log('\nStep 3: Testing Function Execution\n');

  // Test 3: Try calling wizard functions
  try {
    window.resetWizard();
    assert(
      window.AppState.wizard.currentStep === 1,
      'resetWizard() sets currentStep to 1'
    );
  } catch (err) {
    assert(false, `resetWizard() throws no errors (${err.message})`);
  }

  try {
    window.goToStep(2);
    // Note: Without full DOM, this might not fully work, but shouldn't throw
    assert(true, 'goToStep(2) executes without throwing');
  } catch (err) {
    assert(false, `goToStep(2) throws no errors (${err.message})`);
  }

  console.log('\nStep 4: Checking DOM Elements\n');

  // Test 4: Check if critical DOM elements exist
  const elements = [
    'appModal',
    'wizardNextBtn',
    'wizardPrevBtn',
    'cancelBtn',
    'wizardProgress',
    'appForm'
  ];

  elements.forEach(id => {
    const elem = document.getElementById(id);
    assert(
      elem !== null,
      `Element #${id} exists in DOM`
    );

    if (elem && id.includes('Btn')) {
      assert(
        elem.getAttribute('type') === 'button',
        `Button #${id} has type="button"`
      );
    }
  });

  // Check for wizard steps
  const steps = document.querySelectorAll('.wizard-step');
  assert(
    steps.length === 9,
    `Found 9 wizard steps (actual: ${steps.length})`
  );

  // Check for wizard step panels
  const panels = document.querySelectorAll('.wizard-step-panel');
  assert(
    panels.length === 9,
    `Found 9 wizard step panels (actual: ${panels.length})`
  );

} catch (err) {
  console.error('\n❌ Fatal Error:', err.message);
  console.error(err.stack);
  tests.failed++;
  tests.errors.push(`Fatal error: ${err.message}`);
}

// Print summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Results');
console.log('═══════════════════════════════════════════════════════');
console.log(`✅ Passed: ${tests.passed}`);
console.log(`❌ Failed: ${tests.failed}`);

if (tests.failed > 0) {
  console.log('\n❌ Failures:');
  tests.errors.forEach((err, i) => {
    console.log(`  ${i + 1}. ${err}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  console.log('The wizard appears to be properly configured.');
  process.exit(0);
}
