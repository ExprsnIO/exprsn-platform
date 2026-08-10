# Power Query-Style Data Import System

Complete documentation for the Low-Code Platform data import and transformation system, similar to Excel Power Query and PowerApps data connectors.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Parsers](#file-parsers)
4. [Services](#services)
5. [Import Wizard UI](#import-wizard-ui)
6. [Transformation Engine](#transformation-engine)
7. [Schema Inference](#schema-inference)
8. [API Reference](#api-reference)
9. [Usage Examples](#usage-examples)

---

## Overview

The Data Import System provides a comprehensive solution for importing, transforming, and managing data from multiple sources. It combines:

- **5 specialized file parsers** (CSV, TSV, JSON, XML, Excel)
- **30+ transformation operations** (similar to Power Query M language)
- **Automatic schema inference** with data quality analysis
- **Visual import wizard** (6-step guided workflow)
- **Transformation pipeline editor** (visual M-like pipeline)
- **Job tracking and history** (import status, errors, logs)

### Key Features

✅ **Multi-format Support**
- CSV with auto-detection (delimiter, encoding)
- TSV (tab-separated values)
- Excel (.xlsx, .xls) with multi-sheet support
- JSON (files and API endpoints)
- XML with nested element handling

✅ **Power Query-Style Transformations**
- Column operations (rename, remove, split, merge)
- Type conversions with error handling
- Data cleaning (duplicates, nulls, errors, whitespace)
- Row operations (filter, sort, keep/remove)
- Calculated columns (formulas, conditionals)
- Aggregations (group by, pivot, unpivot)

✅ **Intelligent Schema Inference**
- Auto-detect column types (string, number, date, boolean, email, URL, phone)
- Pattern detection (SSN, postal codes, phone numbers)
- Data quality metrics (completeness, uniqueness, null rates)
- Suggested transformations based on data patterns

✅ **Production-Ready**
- Import job tracking with status and errors
- Preview before import (validate without committing)
- Retry failed imports
- Export/import transformation templates
- Comprehensive error handling and logging

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Import System                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │      DataImportService (Orchestrator)   │
        │  • Coordinate import workflow           │
        │  • Track import jobs                    │
        │  • Handle errors and retries            │
        └────────────────────────────────────────┘
                     │         │         │
        ┌────────────┴──┐  ┌──┴──────┐  └───────────┐
        │               │  │         │              │
        ▼               ▼  ▼         ▼              ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│   Parsers   │  │ Transformation│  │ Schema Inference │
│             │  │    Engine     │  │     Service      │
│ • CSV       │  │               │  │                  │
│ • TSV       │  │ • 30+ ops     │  │ • Auto-detect    │
│ • JSON      │  │ • Pipeline    │  │ • Validate       │
│ • XML       │  │ • Formulas    │  │ • Quality check  │
│ • Excel     │  │               │  │                  │
└─────────────┘  └──────────────┘  └──────────────────┘
```

---

## File Parsers

### CSV Parser (`/services/parsers/CSVParser.js`)

Parses CSV files with intelligent auto-detection.

**Features:**
- Auto-detect delimiter (, ; \t |)
- Auto-detect encoding (UTF-8, ISO-8859-1, Windows-1252)
- Header inference
- Whitespace trimming
- Streaming for large files

**Usage:**
```javascript
const CSVParser = require('./services/parsers/CSVParser');

// Auto-detect everything
const data = await CSVParser.parse('data.csv');

// Manual configuration
const data = await CSVParser.parse('data.csv', {
  delimiter: ',',
  encoding: 'utf-8',
  hasHeaders: true,
  skipLines: 0,
  maxRows: 1000,
  trimWhitespace: true
});

// Preview (first 100 rows)
const preview = await CSVParser.preview('data.csv');

// Get metadata without parsing all data
const metadata = await CSVParser.getMetadata('data.csv');
// Returns: { encoding, delimiter, estimatedRows, columnCount, columns, preview }
```

### TSV Parser (`/services/parsers/TSVParser.js`)

Extends CSV parser with tab delimiter.

**Usage:**
```javascript
const TSVParser = require('./services/parsers/TSVParser');
const data = await TSVParser.parse('data.tsv');
```

### JSON Parser (`/services/parsers/JSONParser.js`)

Parses JSON files and API endpoints with nested object flattening.

**Features:**
- File, buffer, URL, or object input
- JSONPath array extraction
- Nested object flattening
- API endpoint support with HTTP methods

**Usage:**
```javascript
const JSONParser = require('./services/parsers/JSONParser');

// Parse file
const data = await JSONParser.parse('data.json');

// Parse from API
const data = await JSONParser.parse('https://api.example.com/data', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer token' }
});

// Extract nested array
const data = await JSONParser.parse('data.json', {
  arrayPath: 'data.items', // Extract items from { data: { items: [...] } }
  flatten: true,           // Flatten nested objects
  maxDepth: 5             // Max nesting depth
});

// Nested object flattening
// Input:  { user: { name: "John", age: 30 } }
// Output: { "user.name": "John", "user.age": 30 }
```

### XML Parser (`/services/parsers/XMLParser.js`)

Parses XML files with automatic array detection.

**Features:**
- Automatic repeating element detection
- Attribute handling
- Nested element flattening
- API endpoint support

**Usage:**
```javascript
const XMLParser = require('./services/parsers/XMLParser');

// Parse file
const data = await XMLParser.parse('data.xml');

// Extract specific repeating element
const data = await XMLParser.parse('data.xml', {
  arrayPath: 'root.items.item',
  flatten: true
});

// Detect repeating elements
const repeatables = XMLParser.detectRepeatables(xmlString);
// Returns: [{ path: 'root.items.item', count: 100, sample: {...} }]
```

### Excel Parser (`/services/parsers/ExcelParser.js`)

Parses Excel files (.xlsx, .xls) with multi-sheet support.

**Features:**
- Multiple sheet handling
- Cell range extraction
- Type preservation (numbers, dates)
- Export to CSV

**Usage:**
```javascript
const ExcelParser = require('./services/parsers/ExcelParser');

// Parse first sheet
const data = await ExcelParser.parse('data.xlsx');

// Parse specific sheet
const data = await ExcelParser.parse('data.xlsx', {
  sheetName: 'Sales Data',
  hasHeaders: true
});

// Parse by sheet index
const data = await ExcelParser.parse('data.xlsx', {
  sheetIndex: 1
});

// Parse all sheets
const allSheets = await ExcelParser.parseAllSheets('data.xlsx');
// Returns: { 'Sheet1': [...], 'Sheet2': [...] }

// Get metadata (all sheets)
const metadata = await ExcelParser.getMetadata('data.xlsx');
// Returns: { sheetCount, sheetNames, sheets: [...] }

// Get cell value
const value = ExcelParser.getCellValue('data.xlsx', 'A1', { sheetName: 'Sheet1' });

// Get cell range
const range = ExcelParser.getRange('data.xlsx', 'A1:C10', { sheetName: 'Sheet1' });

// Convert to CSV
const csv = await ExcelParser.toCSV('data.xlsx', {
  sheetName: 'Sheet1',
  delimiter: ','
});
```

---

## Services

### DataImportService (`/services/DataImportService.js`)

Main orchestration service for data imports.

**Methods:**

#### `importData(config)` - Execute full import

```javascript
const DataImportService = require('./services/DataImportService');

const result = await DataImportService.importData({
  dataSourceId: 'uuid',
  source: 'data.csv',        // File path, buffer, or URL
  sourceType: 'csv',         // csv, tsv, json, xml, excel
  parserOptions: {           // Parser-specific options
    delimiter: ',',
    hasHeaders: true
  },
  transformations: [         // Array of transformation steps
    {
      type: 'removeDuplicates',
      params: {}
    },
    {
      type: 'changeType',
      params: {
        columnName: 'age',
        targetType: 'number'
      }
    }
  ],
  inferSchema: true,         // Auto-detect schema
  sampleSize: 1000,          // Rows for schema inference
  userId: 'user-uuid'        // User triggering import
});

// Returns:
// {
//   success: true,
//   importId: 'uuid',
//   data: [...],            // Transformed data
//   schema: {...},          // Inferred schema
//   stats: {
//     rowsImported: 1000,
//     rowsTransformed: 950,
//     rowsWithErrors: 50,
//     columnCount: 10
//   },
//   transformationLog: [...],
//   errors: [...]
// }
```

#### `previewImport(config)` - Preview without importing

```javascript
const preview = await DataImportService.previewImport({
  source: 'data.csv',
  sourceType: 'csv',
  parserOptions: {},
  transformations: [],
  inferSchema: true,
  sampleSize: 100
});

// Returns:
// {
//   success: true,
//   preview: {
//     original: [...],      // First 10 rows original
//     transformed: [...]    // First 10 rows after transformations
//   },
//   schema: {...},
//   stats: {
//     sampleRows: 100,
//     transformedRows: 95,
//     columnCount: 10
//   }
// }
```

#### `getSourceMetadata(source, sourceType, options)` - Get metadata

```javascript
const metadata = await DataImportService.getSourceMetadata('data.xlsx', 'excel');
// Returns parser-specific metadata (row count, columns, sheets, etc.)
```

#### `validateTransformations(data, transformations)` - Validate pipeline

```javascript
const validation = await DataImportService.validateTransformations(sampleData, transformations);
// Returns:
// {
//   valid: true/false,
//   errors: [...],
//   warnings: [...],
//   preview: [...]  // First 10 rows after transformations
// }
```

#### `getImportHistory(dataSourceId, options)` - Get import jobs

```javascript
const history = await DataImportService.getImportHistory('uuid', {
  limit: 50,
  offset: 0,
  status: 'success' // pending, running, success, error, cancelled
});
```

#### `retryImport(importId)` - Retry failed import

```javascript
const result = await DataImportService.retryImport('failed-import-uuid');
```

#### `suggestTransformations(data)` - Get AI suggestions

```javascript
const suggestions = await DataImportService.suggestTransformations(sampleData);
// Returns:
// [
//   {
//     type: 'changeType',
//     params: { columnName: 'age', targetType: 'number' },
//     reason: 'Column appears to be number but is detected as string'
//   },
//   {
//     type: 'removeColumn',
//     params: { columnName: 'empty_col' },
//     reason: 'Column has 500 null values (95.2%)'
//   }
// ]
```

---

## Import Wizard UI

Multi-step visual wizard for data imports (`/views/import-wizard.ejs`).

### Steps

**Step 1: Select Source**
- Choose data source type (CSV, TSV, Excel, JSON, XML)
- Visual cards with icons

**Step 2: Configure**
- Upload file (drag-and-drop or browse)
- Parser-specific options (delimiter, encoding, sheet name, etc.)

**Step 3: Preview**
- Table preview of first 10 rows
- Schema inference results
- Data quality metrics

**Step 4: Transform**
- Add transformation steps
- Visual pipeline builder
- Suggested transformations

**Step 5: Schema**
- Configure column types
- Mark columns as nullable
- View unique value counts

**Step 6: Summary**
- Review configuration
- Statistics (rows, columns, transformations)
- Execute final import

### Usage

```javascript
// Initialize wizard
const wizard = new ImportWizard(dataSourceId, appId);
wizard.init();

// Navigate steps
wizard.goToStep(3);
wizard.nextStep();
wizard.previousStep();

// Execute import
await wizard.executeImport();
```

---

## Transformation Engine

Power Query M-style transformation engine (`/services/TransformationEngine.js`).

### Transformation Types

#### Column Operations

**renameColumn**
```javascript
{
  type: 'renameColumn',
  params: { oldName: 'firstName', newName: 'first_name' }
}
```

**removeColumn**
```javascript
{
  type: 'removeColumn',
  params: { columnName: 'temp_col' }
}
```

**duplicateColumn**
```javascript
{
  type: 'duplicateColumn',
  params: { columnName: 'email', newColumnName: 'email_backup' }
}
```

**splitColumn**
```javascript
{
  type: 'splitColumn',
  params: {
    columnName: 'fullName',
    delimiter: ' ',
    newColumnNames: ['firstName', 'lastName']
  }
}
```

**mergeColumns**
```javascript
{
  type: 'mergeColumns',
  params: {
    columnNames: ['firstName', 'lastName'],
    separator: ' ',
    newColumnName: 'fullName',
    removeOriginal: true
  }
}
```

#### Type Conversions

**changeType**
```javascript
{
  type: 'changeType',
  params: {
    columnName: 'age',
    targetType: 'number',
    errorStrategy: 'null' // keep, null, error
  }
}
```

#### Data Cleaning

**removeDuplicates**
```javascript
{
  type: 'removeDuplicates',
  params: {
    columnNames: ['email'] // Or omit for all columns
  }
}
```

**removeNulls**
```javascript
{
  type: 'removeNulls',
  params: { columnName: 'email' }
}
```

**replaceValue**
```javascript
{
  type: 'replaceValue',
  params: {
    columnName: 'status',
    oldValue: 'N/A',
    newValue: null
  }
}
```

**trim**
```javascript
{
  type: 'trim',
  params: { columnName: 'name' }
}
```

#### Row Operations

**filterRows**
```javascript
{
  type: 'filterRows',
  params: {
    columnName: 'age',
    operator: 'greaterThan',
    value: 18
  }
}
// Operators: equals, notEquals, contains, startsWith, endsWith, greaterThan, lessThan, isEmpty, isNotEmpty
```

**sortRows**
```javascript
{
  type: 'sortRows',
  params: {
    columnName: 'created_at',
    order: 'desc' // asc, desc
  }
}
```

**keepTopRows**
```javascript
{
  type: 'keepTopRows',
  params: { count: 100 }
}
```

#### Calculated Columns

**addColumn**
```javascript
{
  type: 'addColumn',
  params: {
    columnName: 'category',
    value: 'General'
  }
}
```

**customColumn** (with formula)
```javascript
{
  type: 'customColumn',
  params: {
    columnName: 'fullPrice',
    formula: '[price] * 1.2' // Column references in brackets
  }
}
```

**conditionalColumn**
```javascript
{
  type: 'conditionalColumn',
  params: {
    columnName: 'ageGroup',
    conditions: [
      { columnName: 'age', operator: 'lessThan', value: 18, value: 'Minor' },
      { columnName: 'age', operator: 'lessThan', value: 65, value: 'Adult' }
    ],
    defaultValue: 'Senior'
  }
}
```

#### Aggregations

**groupBy**
```javascript
{
  type: 'groupBy',
  params: {
    groupColumns: ['category'],
    aggregations: [
      { operation: 'count', columnName: 'id', newColumnName: 'total_items' },
      { operation: 'sum', columnName: 'price', newColumnName: 'total_price' },
      { operation: 'average', columnName: 'rating', newColumnName: 'avg_rating' }
    ]
  }
}
// Operations: count, sum, average, min, max, first, last
```

**fillDown**
```javascript
{
  type: 'fillDown',
  params: { columnName: 'category' }
}
```

**fillUp**
```javascript
{
  type: 'fillUp',
  params: { columnName: 'category' }
}
```

**unpivot**
```javascript
{
  type: 'unpivot',
  params: {
    columnsToUnpivot: ['Jan', 'Feb', 'Mar'],
    attributeColumnName: 'Month',
    valueColumnName: 'Sales'
  }
}
// Converts: { Product: 'A', Jan: 100, Feb: 120 }
// To: [
//   { Product: 'A', Month: 'Jan', Sales: 100 },
//   { Product: 'A', Month: 'Feb', Sales: 120 }
// ]
```

### Usage

```javascript
const TransformationEngine = require('./services/TransformationEngine');

const result = await TransformationEngine.applyTransformations(data, [
  { type: 'removeDuplicates', params: {} },
  { type: 'trim', params: { columnName: 'name' } },
  { type: 'changeType', params: { columnName: 'age', targetType: 'number' } }
]);

// Returns:
// {
//   data: [...],              // Transformed data
//   transformationLog: [...], // Step-by-step log
//   errors: [...],            // Any errors encountered
//   stats: {
//     totalRows: 950,
//     errorCount: 0
//   }
// }
```

---

## Schema Inference

Automatic schema detection and data quality analysis (`/services/SchemaInferenceService.js`).

### Features

- **Type Detection:** string, number, date, boolean, email, URL, phone
- **Pattern Detection:** SSN, postal codes, phone numbers
- **Data Quality Metrics:**
  - Completeness (% non-null)
  - Uniqueness (% unique values)
  - Null counts
  - Min/max/average length
- **Suggested Types:** Recommends optimal type based on content
- **Issue Detection:**
  - High null rate warnings
  - Low cardinality (categorical) suggestions
  - Constant value columns

### Usage

```javascript
const SchemaInferenceService = require('./services/SchemaInferenceService');

const schema = SchemaInferenceService.inferSchema(data, {
  sampleSize: 1000 // Number of rows to analyze
});

// Returns:
// {
//   columns: [
//     {
//       name: 'email',
//       displayName: 'Email',
//       type: 'email',
//       nullable: true,
//       nullCount: 5,
//       uniqueCount: 995,
//       sampleValues: ['john@example.com', ...],
//       min: null,
//       max: null,
//       avgLength: 24,
//       pattern: null,
//       suggestedType: 'email',
//       dataQuality: {
//         completeness: 99.5,
//         uniqueness: 99.5,
//         hasErrors: false,
//         errorCount: 0
//       }
//     }
//   ],
//   rowCount: 1000,
//   dataQuality: {
//     completeness: 98.5,
//     totalRows: 1000,
//     totalColumns: 10,
//     emptyValues: 150,
//     issues: [
//       {
//         severity: 'warning',
//         column: 'optional_field',
//         issue: 'high_null_rate',
//         message: 'Column "optional_field" has 500 null values (50.0%)'
//       }
//     ]
//   }
// }
```

---

## API Reference

### Import API Endpoints

#### `POST /lowcode/api/data-imports` - Create import

**Request:**
```javascript
FormData {
  file: File,
  sourceType: 'csv',
  parserOptions: '{"delimiter":","}',
  transformations: '[...]',
  dataSourceId: 'uuid',
  inferSchema: 'true'
}
```

**Response:**
```json
{
  "success": true,
  "importId": "uuid",
  "data": [...],
  "schema": {...},
  "stats": {
    "rowsImported": 1000,
    "rowsTransformed": 950,
    "rowsWithErrors": 50,
    "columnCount": 10
  }
}
```

#### `POST /lowcode/api/data-imports/preview` - Preview import

**Request:** Same as create import

**Response:**
```json
{
  "success": true,
  "preview": {
    "original": [...],
    "transformed": [...]
  },
  "schema": {...},
  "stats": {...}
}
```

#### `GET /lowcode/api/data-imports/:id` - Get import details

**Response:**
```json
{
  "success": true,
  "import": {
    "id": "uuid",
    "status": "success",
    "rowsImported": 1000,
    "errors": [],
    "transformationLog": [...]
  }
}
```

#### `GET /lowcode/api/data-imports/history/:dataSourceId` - Get history

**Response:**
```json
{
  "success": true,
  "imports": [...]
}
```

#### `POST /lowcode/api/data-imports/:id/retry` - Retry failed import

---

## Usage Examples

### Example 1: Import CSV with Type Detection

```javascript
const result = await DataImportService.importData({
  dataSourceId: 'my-source-id',
  source: 'customers.csv',
  sourceType: 'csv',
  parserOptions: {
    hasHeaders: true,
    trimWhitespace: true
  },
  transformations: [
    { type: 'removeDuplicates', params: { columnNames: ['email'] } },
    { type: 'trim', params: { columnName: 'name' } },
    { type: 'changeType', params: { columnName: 'age', targetType: 'number' } }
  ],
  inferSchema: true,
  userId: 'user-123'
});

console.log(`Imported ${result.stats.rowsImported} rows`);
```

### Example 2: Import Excel with Sheet Selection

```javascript
const result = await DataImportService.importData({
  dataSourceId: 'my-source-id',
  source: 'sales.xlsx',
  sourceType: 'excel',
  parserOptions: {
    sheetName: 'Q1 Sales',
    hasHeaders: true
  },
  transformations: [
    { type: 'filterRows', params: { columnName: 'amount', operator: 'greaterThan', value: 0 } },
    { type: 'sortRows', params: { columnName: 'date', order: 'desc' } }
  ]
});
```

### Example 3: Import JSON from API

```javascript
const result = await DataImportService.importData({
  dataSourceId: 'my-source-id',
  source: 'https://api.example.com/users',
  sourceType: 'json',
  parserOptions: {
    arrayPath: 'data.users',
    flatten: true,
    headers: {
      'Authorization': 'Bearer token123'
    }
  },
  transformations: [
    { type: 'removeColumn', params: { columnName: 'password' } },
    { type: 'changeType', params: { columnName: 'created_at', targetType: 'date' } }
  ]
});
```

### Example 4: Preview Before Import

```javascript
// First, preview
const preview = await DataImportService.previewImport({
  source: 'data.csv',
  sourceType: 'csv',
  transformations: [
    { type: 'removeDuplicates', params: {} }
  ]
});

console.log('Preview:', preview.preview.original);
console.log('After transform:', preview.preview.transformed);
console.log('Schema:', preview.schema);

// If looks good, execute full import
if (confirm('Import looks good?')) {
  const result = await DataImportService.importData({
    ...preview.config,
    dataSourceId: 'my-source-id'
  });
}
```

### Example 5: Use Suggested Transformations

```javascript
// Get sample data
const preview = await DataImportService.previewImport({
  source: 'messy-data.csv',
  sourceType: 'csv'
});

// Get AI suggestions
const suggestions = await DataImportService.suggestTransformations(preview.preview.original);

console.log('Suggested transformations:', suggestions);
// [
//   { type: 'changeType', params: {...}, reason: '...' },
//   { type: 'removeColumn', params: {...}, reason: '...' }
// ]

// Apply suggestions
const result = await DataImportService.importData({
  source: 'messy-data.csv',
  sourceType: 'csv',
  dataSourceId: 'my-source-id',
  transformations: suggestions.map(s => ({ type: s.type, params: s.params }))
});
```

---

## Database Schema

### DataImport Model

```javascript
{
  id: UUID,
  dataSourceId: UUID,
  status: ENUM('pending', 'running', 'success', 'error', 'cancelled'),
  startedAt: DATE,
  completedAt: DATE,
  sourceData: JSONB,          // Sample of raw data
  transformedData: JSONB,     // Sample of transformed data
  rowsImported: INTEGER,
  rowsTransformed: INTEGER,
  rowsWithErrors: INTEGER,
  errors: JSONB,              // Array of error details
  transformationLog: JSONB,   // Log of transformation steps
  metadata: JSONB,            // Import metadata
  triggeredBy: UUID           // User who triggered import
}
```

---

## Performance Considerations

**Large Files:**
- Parsers use streaming where possible (CSV, TSV)
- Preview limited to first 100 rows
- Schema inference limited to sample size (default 1000 rows)

**Memory:**
- Transformations operate on in-memory arrays
- For very large datasets (millions of rows), consider batch processing
- Store only samples in database (first 100 rows)

**Optimization Tips:**
1. Use preview before full import
2. Limit transformation count to essentials
3. Filter early in pipeline to reduce data volume
4. Use indexes on frequently queried columns
5. Consider background job queue for large imports

---

## Error Handling

All services include comprehensive error handling:

```javascript
try {
  const result = await DataImportService.importData(config);
} catch (error) {
  console.error('Import failed:', error.message);

  // Check specific error types
  if (error.message.includes('parsing failed')) {
    // Parser error - check file format
  } else if (error.message.includes('transformation failed')) {
    // Transformation error - check transformation config
  }

  // Get detailed error from import record
  const importRecord = await DataImport.findByPk(importId);
  console.log('Errors:', importRecord.errors);
}
```

---

## Future Enhancements

Potential improvements for future versions:

1. **Additional Data Sources:**
   - SQL databases (PostgreSQL, MySQL, SQLite)
   - Cloud storage (S3, Azure Blob, Google Cloud Storage)
   - REST APIs with pagination
   - GraphQL endpoints

2. **Advanced Transformations:**
   - Fuzzy matching and deduplication
   - Geocoding and address parsing
   - Text extraction (NER, sentiment analysis)
   - Machine learning transformations

3. **Performance:**
   - Streaming transformations for large datasets
   - Parallel processing with worker threads
   - Incremental imports (only new/changed data)
   - Delta detection

4. **UI Enhancements:**
   - Visual transformation builder (drag-and-drop)
   - Data profiling and visualization
   - Template library for common transformations
   - Scheduling and automation

5. **Collaboration:**
   - Share transformation templates
   - Version control for data pipelines
   - Audit logs and approval workflows

---

## Dependencies

Required npm packages:

```json
{
  "csv-parser": "^3.0.0",
  "iconv-lite": "^0.6.3",
  "chardet": "^2.0.0",
  "fast-xml-parser": "^4.3.0",
  "xlsx": "^0.18.5",
  "axios": "^1.6.0"
}
```

Install:
```bash
npm install csv-parser iconv-lite chardet fast-xml-parser xlsx axios
```

---

## Summary

This Power Query-style data import system provides enterprise-grade data ingestion and transformation capabilities for the Low-Code Platform. It combines the flexibility of Power Query M language with the ease of use of a visual wizard, making it accessible to both technical and non-technical users.

**Key Benefits:**
- ✅ **Multi-format support** - Import from CSV, Excel, JSON, XML, TSV
- ✅ **Intelligent auto-detection** - Delimiters, encodings, types, patterns
- ✅ **30+ transformations** - Column ops, type conversions, aggregations
- ✅ **Visual workflow** - 6-step wizard with preview and validation
- ✅ **Production-ready** - Error handling, retry, job tracking, logging
- ✅ **Extensible** - Easy to add new parsers and transformations

**Architecture Highlights:**
- Clean separation of concerns (parsers, transformations, inference, orchestration)
- Service-oriented design for easy testing and maintenance
- Comprehensive error handling and logging
- Preview-before-import pattern reduces errors
- Template export/import for reusable pipelines

For questions or issues, contact Rick Holland at engineering@exprsn.com
