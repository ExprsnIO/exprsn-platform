/**
 * ═══════════════════════════════════════════════════════════
 * Visual Query Builder - Advanced Tabs (Aggregation, Ordering, Preview)
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  if (typeof window.QueryBuilderUI === 'undefined') {
    console.error('[QueryBuilderUI-Advanced] QueryBuilderUI not loaded');
    return;
  }

  Object.assign(window.QueryBuilderUI.prototype, {

    // ═══════════════════════════════════════════════════════════
    // Aggregation Tab
    // ═══════════════════════════════════════════════════════════

    renderAggregationTab(container) {
      const query = this.qb.currentQuery;
      if (!query) {
        container.innerHTML = '<div class="alert alert-info">Please select a data source first</div>';
        return;
      }

      const aggregations = query.aggregations || [];
      const groupBy = query.groupBy || [];

      container.innerHTML = `
        <div class="aggregation-builder">
          <!-- Group By -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-layer-group"></i> Group By</h5>
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addGroupByField()">
                <i class="fas fa-plus"></i> Add Field
              </button>
            </div>
            <div class="group-by-fields">
              ${groupBy.length === 0
                ? '<div class="text-muted text-center p-3">No grouping configured</div>'
                : groupBy.map((field, idx) => this.renderGroupByField(field, idx)).join('')}
            </div>
          </div>

          <!-- Aggregations -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-calculator"></i> Aggregations</h5>
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addAggregationField()">
                <i class="fas fa-plus"></i> Add Aggregation
              </button>
            </div>
            <div class="aggregation-fields">
              ${aggregations.length === 0
                ? '<div class="text-muted text-center p-3">No aggregations configured</div>'
                : aggregations.map((agg, idx) => this.renderAggregationField(agg, idx)).join('')}
            </div>
          </div>

          <!-- Having Clause -->
          <div class="section-card">
            <div class="section-header">
              <h5><i class="fas fa-filter"></i> Having (Filter Aggregated Results)</h5>
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addHavingRule()">
                <i class="fas fa-plus"></i> Add Rule
              </button>
            </div>
            <div class="having-rules">
              ${this.renderHavingRules(query.having)}
            </div>
          </div>
        </div>
      `;
    }

    renderGroupByField(field, index) {
      return `
        <div class="group-by-field-item">
          <div class="field-handle"><i class="fas fa-grip-vertical"></i></div>
          <select class="form-select" onchange="window.queryBuilderUI.updateGroupByField(${index}, this.value)">
            <option value="">-- Select Field --</option>
            ${this.availableFields.map(f => `
              <option value="${f.name}" ${field === f.name ? 'selected' : ''}>${f.label || f.name}</option>
            `).join('')}
          </select>
          <button class="btn btn-sm btn-outline-danger" onclick="window.queryBuilderUI.removeGroupByField(${index})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }

    renderAggregationField(agg, index) {
      return `
        <div class="aggregation-field-item">
          <div class="row g-2 align-items-center">
            <div class="col-md-4">
              <label class="form-label-sm">Function</label>
              <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateAggFunction(${index}, this.value)">
                ${Object.entries(window.AGGREGATION_FUNCTIONS).map(([key, func]) => `
                  <option value="${key}" ${agg.function === key ? 'selected' : ''}>${func.label}</option>
                `).join('')}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label-sm">Field</label>
              <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateAggField(${index}, this.value)">
                <option value="">-- Select Field --</option>
                ${this.availableFields.map(f => `
                  <option value="${f.name}" ${agg.field === f.name ? 'selected' : ''}>${f.label || f.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label-sm">Alias</label>
              <input type="text" class="form-control form-control-sm" value="${agg.alias || ''}"
                placeholder="result_name"
                onchange="window.queryBuilderUI.updateAggAlias(${index}, this.value)">
            </div>
            <div class="col-md-1">
              <label class="form-label-sm">&nbsp;</label>
              <button class="btn btn-sm btn-outline-danger w-100" onclick="window.queryBuilderUI.removeAggregation(${index})">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    renderHavingRules(having) {
      if (!having || !having.rules || having.rules.length === 0) {
        return '<div class="text-muted text-center p-3">No HAVING filters configured</div>';
      }

      // Similar to filter rules rendering
      return this.renderFilterGroup(having);
    }

    addGroupByField() {
      const query = this.qb.currentQuery;
      if (!query) return;

      if (!query.groupBy) {
        query.groupBy = [];
      }

      query.groupBy.push('');
      this.qb.updateQuery(query.id, {});
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }

    updateGroupByField(index, field) {
      const query = this.qb.currentQuery;
      if (!query || !query.groupBy) return;

      query.groupBy[index] = field;
      this.qb.updateQuery(query.id, {});
    }

    removeGroupByField(index) {
      const query = this.qb.currentQuery;
      if (!query || !query.groupBy) return;

      query.groupBy.splice(index, 1);
      this.qb.updateQuery(query.id, {});
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }

    addAggregationField() {
      const query = this.qb.currentQuery;
      if (!query) return;

      if (!query.aggregations) {
        query.aggregations = [];
      }

      query.aggregations.push({
        id: this.qb.generateAggregationId(),
        function: 'count',
        field: '',
        alias: ''
      });

      this.qb.updateQuery(query.id, {});
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }

    updateAggFunction(index, func) {
      const query = this.qb.currentQuery;
      if (!query || !query.aggregations) return;

      query.aggregations[index].function = func;
      this.qb.updateQuery(query.id, {});
    }

    updateAggField(index, field) {
      const query = this.qb.currentQuery;
      if (!query || !query.aggregations) return;

      query.aggregations[index].field = field;
      this.qb.updateQuery(query.id, {});
    }

    updateAggAlias(index, alias) {
      const query = this.qb.currentQuery;
      if (!query || !query.aggregations) return;

      query.aggregations[index].alias = alias;
      this.qb.updateQuery(query.id, {});
    }

    removeAggregation(index) {
      const query = this.qb.currentQuery;
      if (!query || !query.aggregations) return;

      query.aggregations.splice(index, 1);
      this.qb.updateQuery(query.id, {});
      this.renderAggregationTab(document.getElementById('queryTabContent'));
    }

    addHavingRule() {
      const query = this.qb.currentQuery;
      if (!query) return;

      if (!query.having) {
        query.having = { condition: 'AND', rules: [] };
      }

      this.qb.addFilter(query.id, query.having);
    }

    // ═══════════════════════════════════════════════════════════
    // Ordering & Limit Tab
    // ═══════════════════════════════════════════════════════════

    renderOrderingTab(container) {
      const query = this.qb.currentQuery;
      if (!query) {
        container.innerHTML = '<div class="alert alert-info">Please select a data source first</div>';
        return;
      }

      const orderBy = query.orderBy || [];

      container.innerHTML = `
        <div class="ordering-builder">
          <!-- Order By -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-sort"></i> Order By</h5>
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addOrderByField()">
                <i class="fas fa-plus"></i> Add Field
              </button>
            </div>
            <div class="order-by-fields">
              ${orderBy.length === 0
                ? '<div class="text-muted text-center p-3">No ordering configured</div>'
                : orderBy.map((order, idx) => this.renderOrderByField(order, idx)).join('')}
            </div>
          </div>

          <!-- Limit & Pagination -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-list-ol"></i> Limit & Pagination</h5>
            </div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Limit (Max Rows)</label>
                <input type="number" class="form-control" value="${query.limit || 100}"
                  min="1" max="10000"
                  onchange="window.queryBuilderUI.updateLimit(this.value)">
                <small class="form-text text-muted">Maximum number of rows to return</small>
              </div>
              <div class="col-md-6">
                <label class="form-label">Offset (Skip Rows)</label>
                <input type="number" class="form-control" value="${query.offset || 0}"
                  min="0"
                  onchange="window.queryBuilderUI.updateOffset(this.value)">
                <small class="form-text text-muted">Number of rows to skip</small>
              </div>
            </div>

            <div class="form-check mt-3">
              <input class="form-check-input" type="checkbox" id="enablePagination"
                ${query.enablePagination ? 'checked' : ''}
                onchange="window.queryBuilderUI.togglePagination(this.checked)">
              <label class="form-check-label" for="enablePagination">
                Enable Automatic Pagination
              </label>
            </div>

            ${query.enablePagination ? `
              <div class="mt-2">
                <label class="form-label">Page Size</label>
                <input type="number" class="form-control" value="${query.pageSize || 20}"
                  min="1" max="1000"
                  onchange="window.queryBuilderUI.updatePageSize(this.value)">
              </div>
            ` : ''}
          </div>

          <!-- Advanced Options -->
          <div class="section-card">
            <div class="section-header">
              <h5><i class="fas fa-cog"></i> Advanced Options</h5>
            </div>
            <div class="row g-3">
              <div class="col-md-6">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="distinctResults"
                    ${query.distinct ? 'checked' : ''}
                    onchange="window.queryBuilderUI.toggleDistinct(this.checked)">
                  <label class="form-check-label" for="distinctResults">
                    Return Distinct Rows Only
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="enableCache"
                    ${query.enableCache ? 'checked' : ''}
                    onchange="window.queryBuilderUI.toggleCache(this.checked)">
                  <label class="form-check-label" for="enableCache">
                    Enable Result Caching
                  </label>
                </div>
              </div>
            </div>

            ${query.enableCache ? `
              <div class="mt-2">
                <label class="form-label">Cache Duration (seconds)</label>
                <input type="number" class="form-control" value="${query.cacheDuration || 300}"
                  min="10" max="3600"
                  onchange="window.queryBuilderUI.updateCacheDuration(this.value)">
              </div>
            ` : ''}

            <div class="mt-2">
              <label class="form-label">Query Timeout (seconds)</label>
              <input type="number" class="form-control" value="${query.timeout || 30}"
                min="5" max="300"
                onchange="window.queryBuilderUI.updateTimeout(this.value)">
            </div>
          </div>
        </div>
      `;
    }

    renderOrderByField(order, index) {
      return `
        <div class="order-by-field-item">
          <div class="field-handle"><i class="fas fa-grip-vertical"></i></div>
          <select class="form-select" onchange="window.queryBuilderUI.updateOrderField(${index}, this.value)">
            <option value="">-- Select Field --</option>
            ${this.availableFields.map(f => `
              <option value="${f.name}" ${order.field === f.name ? 'selected' : ''}>${f.label || f.name}</option>
            `).join('')}
          </select>
          <select class="form-select" style="width: 120px;" onchange="window.queryBuilderUI.updateOrderDirection(${index}, this.value)">
            <option value="ASC" ${order.direction === 'ASC' ? 'selected' : ''}>Ascending</option>
            <option value="DESC" ${order.direction === 'DESC' ? 'selected' : ''}>Descending</option>
          </select>
          <button class="btn btn-sm btn-outline-danger" onclick="window.queryBuilderUI.removeOrderByField(${index})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }

    addOrderByField() {
      const query = this.qb.currentQuery;
      if (!query) return;

      if (!query.orderBy) {
        query.orderBy = [];
      }

      query.orderBy.push({ field: '', direction: 'ASC' });
      this.qb.updateQuery(query.id, {});
      this.renderOrderingTab(document.getElementById('queryTabContent'));
    }

    updateOrderField(index, field) {
      const query = this.qb.currentQuery;
      if (!query || !query.orderBy) return;

      query.orderBy[index].field = field;
      this.qb.updateQuery(query.id, {});
    }

    updateOrderDirection(index, direction) {
      const query = this.qb.currentQuery;
      if (!query || !query.orderBy) return;

      query.orderBy[index].direction = direction;
      this.qb.updateQuery(query.id, {});
    }

    removeOrderByField(index) {
      const query = this.qb.currentQuery;
      if (!query || !query.orderBy) return;

      query.orderBy.splice(index, 1);
      this.qb.updateQuery(query.id, {});
      this.renderOrderingTab(document.getElementById('queryTabContent'));
    }

    updateLimit(limit) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.limit = parseInt(limit) || 100;
      this.qb.updateQuery(query.id, {});
    }

    updateOffset(offset) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.offset = parseInt(offset) || 0;
      this.qb.updateQuery(query.id, {});
    }

    togglePagination(enabled) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.enablePagination = enabled;
      this.qb.updateQuery(query.id, {});
      this.renderOrderingTab(document.getElementById('queryTabContent'));
    }

    updatePageSize(pageSize) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.pageSize = parseInt(pageSize) || 20;
      this.qb.updateQuery(query.id, {});
    }

    toggleDistinct(enabled) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.distinct = enabled;
      this.qb.updateQuery(query.id, {});
    }

    toggleCache(enabled) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.enableCache = enabled;
      this.qb.updateQuery(query.id, {});
      this.renderOrderingTab(document.getElementById('queryTabContent'));
    }

    updateCacheDuration(duration) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.cacheDuration = parseInt(duration) || 300;
      this.qb.updateQuery(query.id, {});
    }

    updateTimeout(timeout) {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.timeout = parseInt(timeout) || 30;
      this.qb.updateQuery(query.id, {});
    }

    // ═══════════════════════════════════════════════════════════
    // Preview Tab
    // ═══════════════════════════════════════════════════════════

    renderPreviewTab(container) {
      const query = this.qb.currentQuery;
      if (!query) {
        container.innerHTML = '<div class="alert alert-info">Please select a data source first</div>';
        return;
      }

      const sql = this.qb.generateSQL(query);

      container.innerHTML = `
        <div class="query-preview">
          <!-- SQL Preview -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-database"></i> Generated SQL</h5>
              <div class="header-actions">
                <button class="btn btn-sm btn-outline-secondary" onclick="window.queryBuilderUI.copySQLToClipboard()">
                  <i class="fas fa-copy"></i> Copy
                </button>
                <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.formatSQL()">
                  <i class="fas fa-indent"></i> Format
                </button>
              </div>
            </div>
            <pre class="sql-preview"><code id="sqlPreviewCode">${this.escapeHtml(sql)}</code></pre>
          </div>

          <!-- Query Configuration Summary -->
          <div class="section-card mb-4">
            <div class="section-header">
              <h5><i class="fas fa-info-circle"></i> Query Summary</h5>
            </div>
            <div class="query-summary">
              <div class="summary-row">
                <strong>Data Source:</strong>
                <span>${window.DATASOURCE_TYPES[query.datasource.type]?.label || query.datasource.type}</span>
              </div>
              <div class="summary-row">
                <strong>Selected Fields:</strong>
                <span>${query.fields?.length || 'All (*)'} fields</span>
              </div>
              <div class="summary-row">
                <strong>Filters:</strong>
                <span>${this.countFilters(query.filters)} filter rules</span>
              </div>
              <div class="summary-row">
                <strong>Grouping:</strong>
                <span>${query.groupBy?.length || 0} fields</span>
              </div>
              <div class="summary-row">
                <strong>Aggregations:</strong>
                <span>${query.aggregations?.length || 0} functions</span>
              </div>
              <div class="summary-row">
                <strong>Ordering:</strong>
                <span>${query.orderBy?.length || 0} fields</span>
              </div>
              <div class="summary-row">
                <strong>Result Limit:</strong>
                <span>${query.limit || 'Unlimited'}</span>
              </div>
            </div>
          </div>

          <!-- Test Query -->
          <div class="section-card">
            <div class="section-header">
              <h5><i class="fas fa-vial"></i> Test Query</h5>
            </div>
            <div class="test-query-controls">
              <button class="btn btn-primary" onclick="window.queryBuilderUI.runTestQuery()">
                <i class="fas fa-play"></i> Run Test Query (Limit 10)
              </button>
              <button class="btn btn-success" onclick="window.queryBuilderUI.runFullQuery()">
                <i class="fas fa-play-circle"></i> Run Full Query
              </button>
            </div>
            <div id="testQueryResults" class="test-results mt-3" style="display: none;"></div>
          </div>
        </div>
      `;
    }

    countFilters(filterGroup) {
      if (!filterGroup || !filterGroup.rules) return 0;

      let count = 0;
      for (const rule of filterGroup.rules) {
        if (rule.type === 'group') {
          count += this.countFilters(rule);
        } else {
          count++;
        }
      }
      return count;
    }

    copySQLToClipboard() {
      const sql = document.getElementById('sqlPreviewCode').textContent;
      navigator.clipboard.writeText(sql).then(() => {
        alert('SQL copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }

    formatSQL() {
      // Simple SQL formatting
      const sql = this.qb.generateSQL(this.qb.currentQuery);
      document.getElementById('sqlPreviewCode').textContent = sql;
    }

    async runTestQuery() {
      const resultsDiv = document.getElementById('testQueryResults');
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Running query...</div>';

      try {
        const result = await this.qb.testQuery(this.qb.currentQuery.id);
        this.displayQueryResults(resultsDiv, result);
      } catch (error) {
        resultsDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
      }
    }

    async runFullQuery() {
      const resultsDiv = document.getElementById('testQueryResults');
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Running full query...</div>';

      try {
        const result = await this.qb.executeQuery(this.qb.currentQuery.id);
        this.displayQueryResults(resultsDiv, result);
      } catch (error) {
        resultsDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
      }
    }

    displayQueryResults(container, result) {
      if (!result || !result.rows || result.rows.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No results found</div>';
        return;
      }

      const columns = Object.keys(result.rows[0]);

      let html = `
        <div class="results-summary mb-2">
          <strong>${result.rowCount} rows</strong> returned in <strong>${result.executionTime}ms</strong>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-striped table-hover">
            <thead>
              <tr>
                ${columns.map(col => `<th>${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${result.rows.map(row => `
                <tr>
                  ${columns.map(col => `<td>${this.escapeHtml(String(row[col] ?? ''))}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.innerHTML = html;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════
    // Query Management Actions
    // ═══════════════════════════════════════════════════════════

    async testQuery() {
      await this.runTestQuery();
    }

    saveQuery() {
      if (!this.qb.currentQuery) {
        alert('No query to save');
        return;
      }

      const name = document.getElementById('queryName')?.value || 'Untitled Query';
      this.qb.currentQuery.name = name;
      this.qb.updateQuery(this.qb.currentQuery.id, {});

      alert('Query saved successfully!');
      console.log('[QueryBuilderUI] Query saved:', this.qb.currentQuery);
    }

    showQueryList() {
      // TODO: Implement query list modal
      alert('Query list feature coming soon');
    }

    closeResults() {
      document.getElementById('queryResults').style.display = 'none';
    }
  });

  console.log('[QueryBuilderUI-Advanced] Advanced tabs loaded');

})();
