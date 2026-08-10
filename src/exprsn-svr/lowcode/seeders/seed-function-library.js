/**
 * Seed Function Library with Excel, Power Query, and R-like functions
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const userId = '00000000-0000-0000-0000-000000000000';

    // Categories
    const categories = [
      { id: uuidv4(), name: 'text', display_name: 'Text Functions', description: 'String manipulation and text processing', icon: 'fa-font', order: 1 },
      { id: uuidv4(), name: 'math', display_name: 'Math & Number', description: 'Mathematical and numerical operations', icon: 'fa-calculator', order: 2 },
      { id: uuidv4(), name: 'datetime', display_name: 'Date & Time', description: 'Date and time manipulation', icon: 'fa-calendar', order: 3 },
      { id: uuidv4(), name: 'array', display_name: 'Array & List', description: 'Array and list operations', icon: 'fa-list', order: 4 },
      { id: uuidv4(), name: 'stats', display_name: 'Statistical', description: 'Statistical and analytical functions', icon: 'fa-chart-line', order: 5 },
      { id: uuidv4(), name: 'query', display_name: 'Query & Filter', description: 'Data querying and filtering', icon: 'fa-filter', order: 6 },
      { id: uuidv4(), name: 'window', display_name: 'Window Functions', description: 'Window and aggregate functions', icon: 'fa-window-maximize', order: 7 },
      { id: uuidv4(), name: 'logical', display_name: 'Logical', description: 'Logical and conditional operations', icon: 'fa-code-branch', order: 8 }
    ];

    await queryInterface.bulkInsert('function_categories', categories.map(cat => ({
      ...cat,
      created_at: new Date(),
      updated_at: new Date()
    })));

    const categoryMap = {};
    categories.forEach(cat => { categoryMap[cat.name] = cat.id; });

    // Function library
    const functions = [
      // TEXT FUNCTIONS
      {
        category_id: categoryMap.text,
        name: 'UPPER',
        display_name: 'UPPER',
        description: 'Converts text to uppercase',
        syntax: 'UPPER(text)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text to convert', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'UPPER("hello")', output: '"HELLO"' },
          { input: 'UPPER("Hello World")', output: '"HELLO WORLD"' }
        ],
        implementation: 'value => String(value).toUpperCase()',
        tags: ['text', 'string', 'case']
      },
      {
        category_id: categoryMap.text,
        name: 'LOWER',
        display_name: 'LOWER',
        description: 'Converts text to lowercase',
        syntax: 'LOWER(text)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text to convert', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'LOWER("HELLO")', output: '"hello"' },
          { input: 'LOWER("Hello World")', output: '"hello world"' }
        ],
        implementation: 'value => String(value).toLowerCase()',
        tags: ['text', 'string', 'case']
      },
      {
        category_id: categoryMap.text,
        name: 'LEFT',
        display_name: 'LEFT',
        description: 'Returns the leftmost characters from a text string',
        syntax: 'LEFT(text, num_chars)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text string', required: true },
          { name: 'num_chars', type: 'number', description: 'Number of characters', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'LEFT("Hello", 2)', output: '"He"' },
          { input: 'LEFT("OpenAI", 4)', output: '"Open"' }
        ],
        implementation: '(text, n) => String(text).substring(0, n)',
        tags: ['text', 'string', 'substring']
      },
      {
        category_id: categoryMap.text,
        name: 'RIGHT',
        display_name: 'RIGHT',
        description: 'Returns the rightmost characters from a text string',
        syntax: 'RIGHT(text, num_chars)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text string', required: true },
          { name: 'num_chars', type: 'number', description: 'Number of characters', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'RIGHT("Hello", 2)', output: '"lo"' },
          { input: 'RIGHT("OpenAI", 2)', output: '"AI"' }
        ],
        implementation: '(text, n) => String(text).slice(-n)',
        tags: ['text', 'string', 'substring']
      },
      {
        category_id: categoryMap.text,
        name: 'MID',
        display_name: 'MID',
        description: 'Returns characters from the middle of a text string',
        syntax: 'MID(text, start_num, num_chars)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text string', required: true },
          { name: 'start_num', type: 'number', description: 'Starting position (1-based)', required: true },
          { name: 'num_chars', type: 'number', description: 'Number of characters', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'MID("Hello World", 7, 5)', output: '"World"' }
        ],
        implementation: '(text, start, length) => String(text).substring(start - 1, start - 1 + length)',
        tags: ['text', 'string', 'substring']
      },
      {
        category_id: categoryMap.text,
        name: 'CONCATENATE',
        display_name: 'CONCATENATE',
        description: 'Joins several text strings into one',
        syntax: 'CONCATENATE(text1, text2, ...)',
        parameters: [
          { name: 'text1', type: 'string', description: 'First text', required: true },
          { name: 'text2', type: 'string', description: 'Second text', required: false },
          { name: '...', type: 'string', description: 'Additional texts', required: false }
        ],
        return_type: 'string',
        examples: [
          { input: 'CONCATENATE("Hello", " ", "World")', output: '"Hello World"' }
        ],
        implementation: '(...args) => args.join("")',
        tags: ['text', 'string', 'join']
      },
      {
        category_id: categoryMap.text,
        name: 'TRIM',
        display_name: 'TRIM',
        description: 'Removes extra spaces from text',
        syntax: 'TRIM(text)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text to trim', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'TRIM("  Hello  ")', output: '"Hello"' }
        ],
        implementation: 'value => String(value).trim()',
        tags: ['text', 'string', 'whitespace']
      },
      {
        category_id: categoryMap.text,
        name: 'LEN',
        display_name: 'LEN',
        description: 'Returns the length of a text string',
        syntax: 'LEN(text)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text string', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'LEN("Hello")', output: '5' },
          { input: 'LEN("OpenAI")', output: '6' }
        ],
        implementation: 'value => String(value).length',
        tags: ['text', 'string', 'length']
      },
      {
        category_id: categoryMap.text,
        name: 'SUBSTITUTE',
        display_name: 'SUBSTITUTE',
        description: 'Replaces old text with new text in a string',
        syntax: 'SUBSTITUTE(text, old_text, new_text)',
        parameters: [
          { name: 'text', type: 'string', description: 'The text string', required: true },
          { name: 'old_text', type: 'string', description: 'Text to replace', required: true },
          { name: 'new_text', type: 'string', description: 'Replacement text', required: true }
        ],
        return_type: 'string',
        examples: [
          { input: 'SUBSTITUTE("Hello World", "World", "Universe")', output: '"Hello Universe"' }
        ],
        implementation: '(text, oldText, newText) => String(text).replace(new RegExp(oldText, "g"), newText)',
        tags: ['text', 'string', 'replace']
      },

      // MATH FUNCTIONS
      {
        category_id: categoryMap.math,
        name: 'SUM',
        display_name: 'SUM',
        description: 'Adds all numbers in a range',
        syntax: 'SUM(number1, number2, ...)',
        parameters: [
          { name: 'number1', type: 'number', description: 'First number or range', required: true },
          { name: '...', type: 'number', description: 'Additional numbers', required: false }
        ],
        return_type: 'number',
        examples: [
          { input: 'SUM(1, 2, 3, 4, 5)', output: '15' },
          { input: 'SUM([1, 2, 3, 4, 5])', output: '15' }
        ],
        implementation: '(...args) => args.flat().reduce((sum, val) => sum + Number(val), 0)',
        tags: ['math', 'aggregate', 'sum']
      },
      {
        category_id: categoryMap.math,
        name: 'AVERAGE',
        display_name: 'AVERAGE',
        description: 'Returns the average of its arguments',
        syntax: 'AVERAGE(number1, number2, ...)',
        parameters: [
          { name: 'number1', type: 'number', description: 'First number or range', required: true },
          { name: '...', type: 'number', description: 'Additional numbers', required: false }
        ],
        return_type: 'number',
        examples: [
          { input: 'AVERAGE(1, 2, 3, 4, 5)', output: '3' },
          { input: 'AVERAGE([10, 20, 30])', output: '20' }
        ],
        implementation: '(...args) => { const arr = args.flat(); return arr.reduce((sum, val) => sum + Number(val), 0) / arr.length; }',
        tags: ['math', 'aggregate', 'average', 'mean']
      },
      {
        category_id: categoryMap.math,
        name: 'MAX',
        display_name: 'MAX',
        description: 'Returns the maximum value in a set of values',
        syntax: 'MAX(number1, number2, ...)',
        parameters: [
          { name: 'number1', type: 'number', description: 'First number or range', required: true },
          { name: '...', type: 'number', description: 'Additional numbers', required: false }
        ],
        return_type: 'number',
        examples: [
          { input: 'MAX(1, 5, 3, 9, 2)', output: '9' }
        ],
        implementation: '(...args) => Math.max(...args.flat().map(Number))',
        tags: ['math', 'aggregate', 'max', 'maximum']
      },
      {
        category_id: categoryMap.math,
        name: 'MIN',
        display_name: 'MIN',
        description: 'Returns the minimum value in a set of values',
        syntax: 'MIN(number1, number2, ...)',
        parameters: [
          { name: 'number1', type: 'number', description: 'First number or range', required: true },
          { name: '...', type: 'number', description: 'Additional numbers', required: false }
        ],
        return_type: 'number',
        examples: [
          { input: 'MIN(1, 5, 3, 9, 2)', output: '1' }
        ],
        implementation: '(...args) => Math.min(...args.flat().map(Number))',
        tags: ['math', 'aggregate', 'min', 'minimum']
      },
      {
        category_id: categoryMap.math,
        name: 'ROUND',
        display_name: 'ROUND',
        description: 'Rounds a number to a specified number of digits',
        syntax: 'ROUND(number, num_digits)',
        parameters: [
          { name: 'number', type: 'number', description: 'The number to round', required: true },
          { name: 'num_digits', type: 'number', description: 'Number of decimal places', required: false }
        ],
        return_type: 'number',
        examples: [
          { input: 'ROUND(3.14159, 2)', output: '3.14' },
          { input: 'ROUND(123.456)', output: '123' }
        ],
        implementation: '(num, digits = 0) => Math.round(num * Math.pow(10, digits)) / Math.pow(10, digits)',
        tags: ['math', 'round', 'precision']
      },
      {
        category_id: categoryMap.math,
        name: 'ABS',
        display_name: 'ABS',
        description: 'Returns the absolute value of a number',
        syntax: 'ABS(number)',
        parameters: [
          { name: 'number', type: 'number', description: 'The number', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'ABS(-5)', output: '5' },
          { input: 'ABS(3.14)', output: '3.14' }
        ],
        implementation: 'num => Math.abs(Number(num))',
        tags: ['math', 'absolute']
      },
      {
        category_id: categoryMap.math,
        name: 'POWER',
        display_name: 'POWER',
        description: 'Returns the result of a number raised to a power',
        syntax: 'POWER(number, power)',
        parameters: [
          { name: 'number', type: 'number', description: 'The base number', required: true },
          { name: 'power', type: 'number', description: 'The exponent', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'POWER(2, 3)', output: '8' },
          { input: 'POWER(10, 2)', output: '100' }
        ],
        implementation: '(base, exp) => Math.pow(Number(base), Number(exp))',
        tags: ['math', 'power', 'exponent']
      },
      {
        category_id: categoryMap.math,
        name: 'SQRT',
        display_name: 'SQRT',
        description: 'Returns the square root of a number',
        syntax: 'SQRT(number)',
        parameters: [
          { name: 'number', type: 'number', description: 'The number', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'SQRT(16)', output: '4' },
          { input: 'SQRT(100)', output: '10' }
        ],
        implementation: 'num => Math.sqrt(Number(num))',
        tags: ['math', 'sqrt', 'root']
      },

      // DATE/TIME FUNCTIONS
      {
        category_id: categoryMap.datetime,
        name: 'NOW',
        display_name: 'NOW',
        description: 'Returns the current date and time',
        syntax: 'NOW()',
        parameters: [],
        return_type: 'datetime',
        examples: [
          { input: 'NOW()', output: '2025-12-25 12:00:00' }
        ],
        implementation: '() => new Date()',
        tags: ['datetime', 'current', 'now']
      },
      {
        category_id: categoryMap.datetime,
        name: 'TODAY',
        display_name: 'TODAY',
        description: 'Returns the current date',
        syntax: 'TODAY()',
        parameters: [],
        return_type: 'date',
        examples: [
          { input: 'TODAY()', output: '2025-12-25' }
        ],
        implementation: '() => new Date().toISOString().split("T")[0]',
        tags: ['datetime', 'current', 'today', 'date']
      },
      {
        category_id: categoryMap.datetime,
        name: 'YEAR',
        display_name: 'YEAR',
        description: 'Returns the year from a date',
        syntax: 'YEAR(date)',
        parameters: [
          { name: 'date', type: 'date', description: 'The date', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'YEAR("2025-12-25")', output: '2025' }
        ],
        implementation: 'date => new Date(date).getFullYear()',
        tags: ['datetime', 'year', 'extract']
      },
      {
        category_id: categoryMap.datetime,
        name: 'MONTH',
        display_name: 'MONTH',
        description: 'Returns the month from a date',
        syntax: 'MONTH(date)',
        parameters: [
          { name: 'date', type: 'date', description: 'The date', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'MONTH("2025-12-25")', output: '12' }
        ],
        implementation: 'date => new Date(date).getMonth() + 1',
        tags: ['datetime', 'month', 'extract']
      },
      {
        category_id: categoryMap.datetime,
        name: 'DAY',
        display_name: 'DAY',
        description: 'Returns the day from a date',
        syntax: 'DAY(date)',
        parameters: [
          { name: 'date', type: 'date', description: 'The date', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'DAY("2025-12-25")', output: '25' }
        ],
        implementation: 'date => new Date(date).getDate()',
        tags: ['datetime', 'day', 'extract']
      },
      {
        category_id: categoryMap.datetime,
        name: 'DATEDIFF',
        display_name: 'DATEDIFF',
        description: 'Returns the difference between two dates in days',
        syntax: 'DATEDIFF(end_date, start_date)',
        parameters: [
          { name: 'end_date', type: 'date', description: 'The end date', required: true },
          { name: 'start_date', type: 'date', description: 'The start date', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'DATEDIFF("2025-12-31", "2025-12-25")', output: '6' }
        ],
        implementation: '(end, start) => Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24))',
        tags: ['datetime', 'difference', 'days']
      },

      // ARRAY/LIST FUNCTIONS
      {
        category_id: categoryMap.array,
        name: 'FILTER',
        display_name: 'FILTER',
        description: 'Filters an array based on a condition',
        syntax: 'FILTER(array, condition)',
        parameters: [
          { name: 'array', type: 'array', description: 'The array to filter', required: true },
          { name: 'condition', type: 'function', description: 'Filter condition', required: true }
        ],
        return_type: 'array',
        examples: [
          { input: 'FILTER([1, 2, 3, 4, 5], x => x > 2)', output: '[3, 4, 5]' }
        ],
        implementation: '(arr, fn) => arr.filter(fn)',
        tags: ['array', 'filter', 'query']
      },
      {
        category_id: categoryMap.array,
        name: 'MAP',
        display_name: 'MAP',
        description: 'Transforms each element in an array',
        syntax: 'MAP(array, transform)',
        parameters: [
          { name: 'array', type: 'array', description: 'The array', required: true },
          { name: 'transform', type: 'function', description: 'Transformation function', required: true }
        ],
        return_type: 'array',
        examples: [
          { input: 'MAP([1, 2, 3], x => x * 2)', output: '[2, 4, 6]' }
        ],
        implementation: '(arr, fn) => arr.map(fn)',
        tags: ['array', 'map', 'transform']
      },
      {
        category_id: categoryMap.array,
        name: 'SORT',
        display_name: 'SORT',
        description: 'Sorts an array',
        syntax: 'SORT(array, order)',
        parameters: [
          { name: 'array', type: 'array', description: 'The array to sort', required: true },
          { name: 'order', type: 'string', description: '"asc" or "desc"', required: false }
        ],
        return_type: 'array',
        examples: [
          { input: 'SORT([3, 1, 4, 1, 5])', output: '[1, 1, 3, 4, 5]' },
          { input: 'SORT([3, 1, 4, 1, 5], "desc")', output: '[5, 4, 3, 1, 1]' }
        ],
        implementation: '(arr, order = "asc") => [...arr].sort((a, b) => order === "desc" ? b - a : a - b)',
        tags: ['array', 'sort', 'order']
      },
      {
        category_id: categoryMap.array,
        name: 'DISTINCT',
        display_name: 'DISTINCT',
        description: 'Returns unique values from an array',
        syntax: 'DISTINCT(array)',
        parameters: [
          { name: 'array', type: 'array', description: 'The array', required: true }
        ],
        return_type: 'array',
        examples: [
          { input: 'DISTINCT([1, 2, 2, 3, 3, 3, 4])', output: '[1, 2, 3, 4]' }
        ],
        implementation: 'arr => [...new Set(arr)]',
        tags: ['array', 'distinct', 'unique']
      },
      {
        category_id: categoryMap.array,
        name: 'CONCAT',
        display_name: 'CONCAT',
        description: 'Concatenates multiple arrays',
        syntax: 'CONCAT(array1, array2, ...)',
        parameters: [
          { name: 'array1', type: 'array', description: 'First array', required: true },
          { name: '...', type: 'array', description: 'Additional arrays', required: false }
        ],
        return_type: 'array',
        examples: [
          { input: 'CONCAT([1, 2], [3, 4], [5])', output: '[1, 2, 3, 4, 5]' }
        ],
        implementation: '(...arrays) => [].concat(...arrays)',
        tags: ['array', 'concat', 'merge']
      },

      // STATISTICAL FUNCTIONS (R-like)
      {
        category_id: categoryMap.stats,
        name: 'MEDIAN',
        display_name: 'MEDIAN',
        description: 'Returns the median of an array of numbers',
        syntax: 'MEDIAN(array)',
        parameters: [
          { name: 'array', type: 'array', description: 'Array of numbers', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'MEDIAN([1, 2, 3, 4, 5])', output: '3' }
        ],
        implementation: 'arr => { const sorted = [...arr].sort((a,b) => a-b); const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid])/2; }',
        tags: ['stats', 'median', 'aggregate']
      },
      {
        category_id: categoryMap.stats,
        name: 'STDEV',
        display_name: 'STDEV',
        description: 'Calculates standard deviation',
        syntax: 'STDEV(array)',
        parameters: [
          { name: 'array', type: 'array', description: 'Array of numbers', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'STDEV([2, 4, 4, 4, 5, 5, 7, 9])', output: '2.138' }
        ],
        implementation: 'arr => { const avg = arr.reduce((s,v) => s+v,0)/arr.length; return Math.sqrt(arr.reduce((s,v) => s+Math.pow(v-avg,2),0)/arr.length); }',
        tags: ['stats', 'stdev', 'variance']
      },
      {
        category_id: categoryMap.stats,
        name: 'COUNT',
        display_name: 'COUNT',
        description: 'Counts the number of items',
        syntax: 'COUNT(array)',
        parameters: [
          { name: 'array', type: 'array', description: 'Array of items', required: true }
        ],
        return_type: 'number',
        examples: [
          { input: 'COUNT([1, 2, 3, 4, 5])', output: '5' }
        ],
        implementation: 'arr => arr.length',
        tags: ['stats', 'count', 'aggregate']
      },

      // LOGICAL FUNCTIONS
      {
        category_id: categoryMap.logical,
        name: 'IF',
        display_name: 'IF',
        description: 'Returns one value if condition is true, another if false',
        syntax: 'IF(condition, value_if_true, value_if_false)',
        parameters: [
          { name: 'condition', type: 'boolean', description: 'The condition to test', required: true },
          { name: 'value_if_true', type: 'any', description: 'Value if condition is true', required: true },
          { name: 'value_if_false', type: 'any', description: 'Value if condition is false', required: true }
        ],
        return_type: 'any',
        examples: [
          { input: 'IF(5 > 3, "Yes", "No")', output: '"Yes"' },
          { input: 'IF(2 > 5, "Yes", "No")', output: '"No"' }
        ],
        implementation: '(condition, ifTrue, ifFalse) => condition ? ifTrue : ifFalse',
        tags: ['logical', 'conditional', 'if']
      },
      {
        category_id: categoryMap.logical,
        name: 'AND',
        display_name: 'AND',
        description: 'Returns TRUE if all arguments are TRUE',
        syntax: 'AND(condition1, condition2, ...)',
        parameters: [
          { name: 'condition1', type: 'boolean', description: 'First condition', required: true },
          { name: '...', type: 'boolean', description: 'Additional conditions', required: false }
        ],
        return_type: 'boolean',
        examples: [
          { input: 'AND(true, true, true)', output: 'true' },
          { input: 'AND(true, false, true)', output: 'false' }
        ],
        implementation: '(...conditions) => conditions.every(c => c)',
        tags: ['logical', 'and', 'boolean']
      },
      {
        category_id: categoryMap.logical,
        name: 'OR',
        display_name: 'OR',
        description: 'Returns TRUE if any argument is TRUE',
        syntax: 'OR(condition1, condition2, ...)',
        parameters: [
          { name: 'condition1', type: 'boolean', description: 'First condition', required: true },
          { name: '...', type: 'boolean', description: 'Additional conditions', required: false }
        ],
        return_type: 'boolean',
        examples: [
          { input: 'OR(false, true, false)', output: 'true' },
          { input: 'OR(false, false, false)', output: 'false' }
        ],
        implementation: '(...conditions) => conditions.some(c => c)',
        tags: ['logical', 'or', 'boolean']
      },
      {
        category_id: categoryMap.logical,
        name: 'NOT',
        display_name: 'NOT',
        description: 'Reverses the logical value',
        syntax: 'NOT(condition)',
        parameters: [
          { name: 'condition', type: 'boolean', description: 'The condition', required: true }
        ],
        return_type: 'boolean',
        examples: [
          { input: 'NOT(true)', output: 'false' },
          { input: 'NOT(false)', output: 'true' }
        ],
        implementation: 'condition => !condition',
        tags: ['logical', 'not', 'boolean']
      }
    ];

    await queryInterface.bulkInsert('function_library', functions.map(fn => ({
      id: uuidv4(),
      ...fn,
      parameters: JSON.stringify(fn.parameters),
      examples: JSON.stringify(fn.examples),
      tags: fn.tags || [],
      is_system: true,
      is_enabled: true,
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date()
    })));

    console.log(`✅ Seeded ${categories.length} function categories and ${functions.length} functions`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('function_library', null, {});
    await queryInterface.bulkDelete('function_categories', null, {});
  }
};
