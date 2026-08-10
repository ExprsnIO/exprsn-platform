/**
 * Formula Engine
 *
 * Power Apps-style formula language parser and evaluator.
 * Supports 50+ functions for data manipulation, text processing, logic, and more.
 */

const { Parser } = require('expr-eval');
const vm2 = require('vm2');

class FormulaEngine {
  constructor() {
    this.parser = new Parser();
    this.context = {};
    this.collections = new Map();
    this.variables = new Map();
  }

  /**
   * Set context for formula evaluation
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Set collections (in-memory tables)
   */
  setCollections(collections) {
    if (Array.isArray(collections)) {
      collections.forEach(col => {
        this.collections.set(col.name, col.data || []);
      });
    } else {
      Object.keys(collections).forEach(name => {
        this.collections.set(name, collections[name]);
      });
    }
  }

  /**
   * Evaluate a formula expression
   */
  evaluate(formula, localContext = {}) {
    try {
      const fullContext = {
        ...this.context,
        ...localContext,
        ...this.getBuiltInFunctions(),
      };

      // If formula is a simple variable reference
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formula)) {
        return fullContext[formula];
      }

      // Parse and evaluate the formula
      const expression = this.parser.parse(formula);
      const result = expression.evaluate(fullContext);

      return result;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      throw new Error(`Formula error: ${error.message}`);
    }
  }

  /**
   * Get all built-in formula functions
   */
  getBuiltInFunctions() {
    return {
      // Data Functions
      Filter: this.Filter.bind(this),
      LookUp: this.LookUp.bind(this),
      Sort: this.Sort.bind(this),
      CountRows: this.CountRows.bind(this),
      Sum: this.Sum.bind(this),
      Average: this.Average.bind(this),
      Min: this.Min.bind(this),
      Max: this.Max.bind(this),
      First: this.First.bind(this),
      Last: this.Last.bind(this),

      // Collection Functions
      ClearCollect: this.ClearCollect.bind(this),
      Collect: this.Collect.bind(this),
      Remove: this.Remove.bind(this),
      Clear: this.Clear.bind(this),

      // Variable Functions
      Set: this.Set.bind(this),
      UpdateContext: this.UpdateContext.bind(this),

      // Text Functions
      Upper: this.Upper.bind(this),
      Lower: this.Lower.bind(this),
      Proper: this.Proper.bind(this),
      Concatenate: this.Concatenate.bind(this),
      Len: this.Len.bind(this),
      Left: this.Left.bind(this),
      Right: this.Right.bind(this),
      Mid: this.Mid.bind(this),
      Trim: this.Trim.bind(this),
      Replace: this.Replace.bind(this),
      Substitute: this.Substitute.bind(this),
      Split: this.Split.bind(this),

      // Logical Functions
      If: this.If.bind(this),
      Switch: this.Switch.bind(this),
      And: this.And.bind(this),
      Or: this.Or.bind(this),
      Not: this.Not.bind(this),

      // Date/Time Functions
      Now: this.Now.bind(this),
      Today: this.Today.bind(this),
      DateAdd: this.DateAdd.bind(this),
      DateDiff: this.DateDiff.bind(this),
      Year: this.Year.bind(this),
      Month: this.Month.bind(this),
      Day: this.Day.bind(this),
      Hour: this.Hour.bind(this),
      Minute: this.Minute.bind(this),
      Second: this.Second.bind(this),

      // Math Functions
      Abs: Math.abs,
      Round: Math.round,
      RoundUp: Math.ceil,
      RoundDown: Math.floor,
      Power: Math.pow,
      Sqrt: Math.sqrt,
      Exp: Math.exp,
      Ln: Math.log,
      Log: Math.log10,

      // Validation Functions
      IsBlank: this.IsBlank.bind(this),
      IsEmpty: this.IsEmpty.bind(this),
      IsNumeric: this.IsNumeric.bind(this),
      IsToday: this.IsToday.bind(this),

      // Utility Functions
      Coalesce: this.Coalesce.bind(this),
      Blank: this.Blank.bind(this),
      Defaults: this.Defaults.bind(this),
      RGBA: this.RGBA.bind(this),
    };
  }

  // ============ DATA FUNCTIONS ============

  Filter(collection, condition) {
    const data = this.getCollection(collection);
    // In a real implementation, condition would be evaluated for each row
    // For now, accept a function
    if (typeof condition === 'function') {
      return data.filter(condition);
    }
    return data;
  }

  LookUp(collection, condition, returnField) {
    const data = this.getCollection(collection);
    const result = typeof condition === 'function'
      ? data.find(condition)
      : data[0];

    if (returnField && result) {
      return result[returnField];
    }
    return result;
  }

  Sort(collection, field, direction = 'Ascending') {
    const data = [...this.getCollection(collection)];
    const sortDir = direction === 'Ascending' ? 1 : -1;

    return data.sort((a, b) => {
      const aVal = typeof field === 'function' ? field(a) : a[field];
      const bVal = typeof field === 'function' ? field(b) : b[field];

      if (aVal < bVal) return -1 * sortDir;
      if (aVal > bVal) return 1 * sortDir;
      return 0;
    });
  }

  CountRows(collection) {
    const data = this.getCollection(collection);
    return data.length;
  }

  Sum(collection, field) {
    const data = this.getCollection(collection);
    return data.reduce((sum, item) => {
      const val = typeof field === 'function' ? field(item) : item[field];
      return sum + (Number(val) || 0);
    }, 0);
  }

  Average(collection, field) {
    const count = this.CountRows(collection);
    return count > 0 ? this.Sum(collection, field) / count : 0;
  }

  Min(collection, field) {
    const data = this.getCollection(collection);
    const values = data.map(item =>
      typeof field === 'function' ? field(item) : item[field]
    );
    return Math.min(...values);
  }

  Max(collection, field) {
    const data = this.getCollection(collection);
    const values = data.map(item =>
      typeof field === 'function' ? field(item) : item[field]
    );
    return Math.max(...values);
  }

  First(collection) {
    const data = this.getCollection(collection);
    return data[0];
  }

  Last(collection) {
    const data = this.getCollection(collection);
    return data[data.length - 1];
  }

  // ============ COLLECTION FUNCTIONS ============

  ClearCollect(collectionName, data) {
    this.collections.set(collectionName, Array.isArray(data) ? data : [data]);
    return this.collections.get(collectionName);
  }

  Collect(collectionName, data) {
    const existing = this.collections.get(collectionName) || [];
    const newData = Array.isArray(data) ? data : [data];
    this.collections.set(collectionName, [...existing, ...newData]);
    return this.collections.get(collectionName);
  }

  Remove(collectionName, condition) {
    const data = this.collections.get(collectionName) || [];
    const filtered = typeof condition === 'function'
      ? data.filter(item => !condition(item))
      : data;
    this.collections.set(collectionName, filtered);
    return filtered;
  }

  Clear(collectionName) {
    this.collections.set(collectionName, []);
    return [];
  }

  // ============ VARIABLE FUNCTIONS ============

  Set(variableName, value) {
    this.variables.set(variableName, value);
    this.context[variableName] = value;
    return value;
  }

  UpdateContext(updates) {
    Object.keys(updates).forEach(key => {
      this.variables.set(key, updates[key]);
      this.context[key] = updates[key];
    });
    return updates;
  }

  // ============ TEXT FUNCTIONS ============

  Upper(text) {
    return String(text).toUpperCase();
  }

  Lower(text) {
    return String(text).toLowerCase();
  }

  Proper(text) {
    return String(text).replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  Concatenate(...args) {
    return args.map(a => String(a)).join('');
  }

  Len(text) {
    return String(text).length;
  }

  Left(text, count) {
    return String(text).substring(0, count);
  }

  Right(text, count) {
    const str = String(text);
    return str.substring(str.length - count);
  }

  Mid(text, start, count) {
    return String(text).substring(start, start + count);
  }

  Trim(text) {
    return String(text).trim();
  }

  Replace(text, oldText, newText) {
    return String(text).replace(new RegExp(oldText, 'g'), newText);
  }

  Substitute(text, oldText, newText, instanceNum) {
    const str = String(text);
    if (instanceNum) {
      let count = 0;
      return str.replace(new RegExp(oldText, 'g'), match => {
        count++;
        return count === instanceNum ? newText : match;
      });
    }
    return str.replace(new RegExp(oldText, 'g'), newText);
  }

  Split(text, separator) {
    return String(text).split(separator);
  }

  // ============ LOGICAL FUNCTIONS ============

  If(condition, trueValue, falseValue) {
    return condition ? trueValue : falseValue;
  }

  Switch(expression, ...pairs) {
    for (let i = 0; i < pairs.length - 1; i += 2) {
      if (expression === pairs[i]) {
        return pairs[i + 1];
      }
    }
    // Return default if provided (last argument if odd number)
    return pairs.length % 2 === 1 ? pairs[pairs.length - 1] : undefined;
  }

  And(...conditions) {
    return conditions.every(c => Boolean(c));
  }

  Or(...conditions) {
    return conditions.some(c => Boolean(c));
  }

  Not(condition) {
    return !condition;
  }

  // ============ DATE/TIME FUNCTIONS ============

  Now() {
    return new Date();
  }

  Today() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  DateAdd(date, amount, unit = 'days') {
    const d = new Date(date);
    switch (unit.toLowerCase()) {
      case 'years': d.setFullYear(d.getFullYear() + amount); break;
      case 'months': d.setMonth(d.getMonth() + amount); break;
      case 'days': d.setDate(d.getDate() + amount); break;
      case 'hours': d.setHours(d.getHours() + amount); break;
      case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
      case 'seconds': d.setSeconds(d.getSeconds() + amount); break;
    }
    return d;
  }

  DateDiff(date1, date2, unit = 'days') {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = d2 - d1;

    switch (unit.toLowerCase()) {
      case 'years': return diff / (365.25 * 24 * 60 * 60 * 1000);
      case 'months': return diff / (30.44 * 24 * 60 * 60 * 1000);
      case 'days': return diff / (24 * 60 * 60 * 1000);
      case 'hours': return diff / (60 * 60 * 1000);
      case 'minutes': return diff / (60 * 1000);
      case 'seconds': return diff / 1000;
      default: return diff;
    }
  }

  Year(date) {
    return new Date(date).getFullYear();
  }

  Month(date) {
    return new Date(date).getMonth() + 1;
  }

  Day(date) {
    return new Date(date).getDate();
  }

  Hour(date) {
    return new Date(date).getHours();
  }

  Minute(date) {
    return new Date(date).getMinutes();
  }

  Second(date) {
    return new Date(date).getSeconds();
  }

  // ============ VALIDATION FUNCTIONS ============

  IsBlank(value) {
    return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
  }

  IsEmpty(value) {
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return this.IsBlank(value);
  }

  IsNumeric(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }

  IsToday(date) {
    const d = new Date(date);
    const today = new Date();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  }

  // ============ UTILITY FUNCTIONS ============

  Coalesce(...values) {
    for (const val of values) {
      if (!this.IsBlank(val)) return val;
    }
    return values[values.length - 1];
  }

  Blank() {
    return '';
  }

  Defaults(entity) {
    // Return default values for an entity
    // In real implementation, this would fetch from entity schema
    return {};
  }

  RGBA(r, g, b, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ============ HELPER METHODS ============

  getCollection(collectionName) {
    if (typeof collectionName === 'string') {
      return this.collections.get(collectionName) || [];
    }
    // If it's already an array, return it
    return Array.isArray(collectionName) ? collectionName : [];
  }
}

module.exports = FormulaEngine;
