/**
 * Simple Wizard JavaScript Syntax and Structure Test
 */

const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, '../public/js/lowcode-applications.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Wizard JavaScript Analysis');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

// Test 1: Check JavaScript syntax
console.log('Test 1: JavaScript Syntax Validation\n');
try {
  new Function(jsContent);
  test(true, 'JavaScript syntax is valid');
} catch (err) {
  test(false, `JavaScript has syntax errors: ${err.message}`);
}

// Test 2: Check for global function definitions
console.log('\nTest 2: Global Function Definitions\n');

const globalFunctions = [
  'function goToStep(',
  'function nextStep(',
  'function previousStep(',
  'function updateWizardUI(',
  'function validateCurrentStep(',
  'function collectStepData(',
  'function submitWizard(',
  'function resetWizard(',
  'function updateWizardUIOnOpen(',
  'function openNewApplicationModal(',
  'function closeModal('
];

globalFunctions.forEach(funcSig => {
  const funcName = funcSig.match(/function (\w+)/)[1];
  const found = jsContent.includes(funcSig);
  test(found, `${funcName} is defined as a function`);
});

// Test 3: Check for DOMContentLoaded event listener
console.log('\nTest 3: Event Listener Setup\n');

test(
  jsContent.includes("document.addEventListener('DOMContentLoaded'"),
  'DOMContentLoaded event listener exists'
);

test(
  jsContent.includes("getElementById('wizardNextBtn')"),
  'Next button element is referenced'
);

test(
  jsContent.includes("getElementById('wizardPrevBtn')"),
  'Previous button element is referenced'
);

test(
  jsContent.includes("addEventListener('click', nextStep)") ||
  jsContent.includes("addEventListener('click', previousStep)"),
  'Click event listeners are attached to buttons'
);

// Test 4: Check for wizard state management
console.log('\nTest 4: Wizard State Management\n');

test(
  jsContent.includes('AppState') && jsContent.includes('wizard:'),
  'AppState object with wizard property exists'
);

test(
  jsContent.includes('currentStep:') && jsContent.includes('totalSteps:'),
  'Wizard state has currentStep and totalSteps'
);

test(
  jsContent.includes('completedSteps:') && jsContent.includes('new Set('),
  'Wizard state uses Set for completedSteps'
);

// Test 5: Check for UI update logic
console.log('\nTest 5: UI Update Logic\n');

test(
  jsContent.includes("getElementById('wizardProgress')"),
  'Progress bar element is referenced'
);

test(
  jsContent.includes("querySelectorAll('.wizard-step-panel')"),
  'Step panels are queried'
);

test(
  jsContent.includes("querySelectorAll('.wizard-step')"),
  'Wizard steps are queried'
);

test(
  jsContent.includes('classList.add') && jsContent.includes('classList.remove'),
  'CSS classes are manipulated for UI updates'
);

// Test 6: Check for form validation
console.log('\nTest 6: Form Validation\n');

test(
  jsContent.includes('validateCurrentStep'),
  'Validation function exists'
);

test(
  jsContent.includes("getElementById('appName')") &&
  jsContent.includes("getElementById('appDisplayName')"),
  'Form fields are referenced for validation'
);

test(
  jsContent.includes('showToast'),
  'Toast notification function is used'
);

// Test 7: Check for proper scope
console.log('\nTest 7: Function Scope Analysis\n');

// Count how many times each function is defined
const countDefinitions = (funcName) => {
  const regex = new RegExp(`function ${funcName}\\(`, 'g');
  const matches = jsContent.match(regex);
  return matches ? matches.length : 0;
};

const criticalFunctions = ['goToStep', 'nextStep', 'previousStep', 'updateWizardUI'];
let duplicatesFound = false;

criticalFunctions.forEach(funcName => {
  const count = countDefinitions(funcName);
  if (count === 1) {
    test(true, `${funcName} is defined exactly once (no duplicates)`);
  } else if (count === 0) {
    test(false, `${funcName} is not defined`);
  } else {
    test(false, `${funcName} is defined ${count} times (duplicate detected!)`);
    duplicatesFound = true;
  }
});

// Test 8: Check file structure
console.log('\nTest 8: File Structure\n');

const lines = jsContent.split('\n');
test(true, `Total lines: ${lines.length}`);

const functionLines = lines.filter(l => l.trim().startsWith('function ')).length;
test(functionLines > 20, `Function definitions found: ${functionLines}`);

const commentLines = lines.filter(l => l.trim().startsWith('//')).length;
test(commentLines > 30, `Comment lines found: ${commentLines} (good documentation)`);

// Final summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Summary');
console.log('═══════════════════════════════════════════════════════');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('\n✅ ALL TESTS PASSED!');
  console.log('The wizard JavaScript appears to be correctly structured.');
  console.log('\nNext steps:');
  console.log('1. Open the browser dev tools');
  console.log('2. Navigate to https://localhost:5001/lowcode/applications');
  console.log('3. Click "New Application"');
  console.log('4. Check console for errors');
  process.exit(0);
} else {
  console.log('\n❌ SOME TESTS FAILED');
  console.log('Please review the failures above.');
  process.exit(1);
}
