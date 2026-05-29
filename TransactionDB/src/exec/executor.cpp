#include "exec/executor.h"

#include <cmath>
#include <memory>

#include "catalog/catalog.h"
#include "common/error.h"
#include "database.h"
#include "exec/evaluator.h"
#include "exec/operators.h"

namespace tdb {

namespace {

bool try_parse_int(const std::string &s, int64_t &out) {
  try {
    size_t idx = 0;
    long long v = std::stoll(s, &idx);
    if (idx == s.size()) {
      out = v;
      return true;
    }
  } catch (...) {
  }
  return false;
}

bool try_parse_double(const std::string &s, double &out) {
  try {
    size_t idx = 0;
    double v = std::stod(s, &idx);
    if (idx == s.size()) {
      out = v;
      return true;
    }
  } catch (...) {
  }
  return false;
}

// Apply a column's type affinity to a value (SQLite-style, simplified).
Value coerce(Value v, ValueType affinity) {
  if (v.is_null())
    return v;
  switch (affinity) {
  case ValueType::Integer:
    if (v.is_real()) {
      double d = v.as_real();
      if (std::isfinite(d) && d == std::floor(d))
        return Value::integer(static_cast<int64_t>(d));
    } else if (v.is_text()) {
      int64_t i;
      if (try_parse_int(v.as_text(), i))
        return Value::integer(i);
    }
    return v;
  case ValueType::Real:
    if (v.is_integer())
      return Value::real(static_cast<double>(v.as_int()));
    if (v.is_text()) {
      double d;
      if (try_parse_double(v.as_text(), d))
        return Value::real(d);
    }
    return v;
  case ValueType::Text:
    if (v.is_numeric())
      return Value::text(v.to_display());
    return v;
  default:
    return v; // Null / Blob affinity: store as-is
  }
}

std::vector<std::string> column_names(const TableDef &def) {
  std::vector<std::string> names;
  names.reserve(def.columns.size());
  for (const ColumnDef &c : def.columns)
    names.push_back(c.name);
  return names;
}

void check_not_null(const TableDef &def, const Row &row) {
  for (size_t i = 0; i < def.columns.size(); ++i)
    if (def.columns[i].not_null && i < row.size() && row[i].is_null())
      throw TxnError("NOT NULL constraint failed: " + def.name + "." + def.columns[i].name);
}

std::string derived_name(const Expr *e, size_t ordinal) {
  if (auto *c = dynamic_cast<const ColumnRefExpr *>(e))
    return c->name;
  return "column" + std::to_string(ordinal + 1);
}

// ----------------------------- Statements -----------------------------
ExecResult exec_create(const CreateTableStmt *s, Database &db) {
  if (db.catalog().has_table(s->table)) {
    if (s->if_not_exists)
      return {};
    throw TxnError("table already exists: " + s->table);
  }
  TableDef def;
  def.name = s->table;
  for (const ColumnSpec &cs : s->columns) {
    if (def.column_index(cs.name) >= 0)
      throw TxnError("duplicate column name: " + cs.name);
    ColumnDef c;
    c.name = cs.name;
    c.affinity = affinity_from_typename(cs.type_name);
    c.not_null = cs.not_null;
    def.columns.push_back(std::move(c));
  }
  db.create_table(def);
  return {};
}

ExecResult exec_drop(const DropTableStmt *s, Database &db) {
  if (!db.catalog().has_table(s->table)) {
    if (s->if_exists)
      return {};
    throw TxnError("no such table: " + s->table);
  }
  db.drop_table(s->table);
  return {};
}

ExecResult exec_insert(const InsertStmt *s, Database &db) {
  const TableDef *def = db.catalog().find(s->table);
  if (!def)
    throw TxnError("no such table: " + s->table);
  TableStore *store = db.store_for(s->table);

  // Resolve target column order.
  std::vector<int> targets;
  if (s->columns.empty()) {
    for (size_t i = 0; i < def->columns.size(); ++i)
      targets.push_back(static_cast<int>(i));
  } else {
    for (const std::string &col : s->columns) {
      int idx = def->column_index(col);
      if (idx < 0)
        throw TxnError("no such column: " + col);
      targets.push_back(idx);
    }
  }

  ExecResult res;
  const std::vector<std::string> no_cols;
  const Row no_row;
  for (const auto &tuple : s->rows) {
    if (tuple.size() != targets.size())
      throw TxnError("INSERT has " + std::to_string(tuple.size()) + " values but " +
                     std::to_string(targets.size()) + " columns");
    Row row(def->columns.size(), Value::null());
    for (size_t k = 0; k < tuple.size(); ++k) {
      Value v = evaluate(tuple[k].get(), no_row, no_cols);
      int idx = targets[k];
      row[idx] = coerce(std::move(v), def->columns[idx].affinity);
    }
    check_not_null(*def, row);
    store->insert(row);
    ++res.changes;
  }
  return res;
}

ExecResult exec_select(const SelectStmt *s, Database &db) {
  ExecResult res;
  res.is_query = true;

  // Constant SELECT (no FROM): produces exactly one row.
  if (s->from.empty()) {
    Row out;
    const std::vector<std::string> none;
    const Row empty;
    for (size_t i = 0; i < s->items.size(); ++i) {
      const SelectItem &item = s->items[i];
      if (item.star)
        throw TxnError("SELECT *: no table specified");
      out.push_back(evaluate(item.expr.get(), empty, none));
      res.columns.push_back(derived_name(item.expr.get(), i));
    }
    res.rows.push_back(std::move(out));
    return res;
  }

  const TableDef *def = db.catalog().find(s->from);
  if (!def)
    throw TxnError("no such table: " + s->from);
  TableStore *store = db.store_for(s->from);
  std::vector<std::string> tbl_cols = column_names(*def);

  // Build the projection list, synthesizing column refs for `*`.
  std::vector<std::unique_ptr<Expr>> synth; // owns expanded `*` refs
  std::vector<const Expr *> proj;
  std::vector<std::string> out_names;
  for (size_t i = 0; i < s->items.size(); ++i) {
    const SelectItem &item = s->items[i];
    if (item.star) {
      for (const std::string &col : tbl_cols) {
        synth.push_back(std::make_unique<ColumnRefExpr>(col));
        proj.push_back(synth.back().get());
        out_names.push_back(col);
      }
    } else {
      proj.push_back(item.expr.get());
      out_names.push_back(derived_name(item.expr.get(), i));
    }
  }
  res.columns = out_names;

  std::unique_ptr<Operator> op = std::make_unique<SeqScanOp>(store, tbl_cols);
  if (s->where)
    op = std::make_unique<FilterOp>(std::move(op), s->where.get());
  op = std::make_unique<ProjectOp>(std::move(op), proj, out_names);

  op->open();
  Row row;
  while (op->next(row))
    res.rows.push_back(row);
  op->close();
  return res;
}

ExecResult exec_update(const UpdateStmt *s, Database &db) {
  const TableDef *def = db.catalog().find(s->table);
  if (!def)
    throw TxnError("no such table: " + s->table);
  TableStore *store = db.store_for(s->table);
  std::vector<std::string> cols = column_names(*def);

  // Validate assignment targets up front.
  std::vector<int> assign_idx;
  for (const Assignment &a : s->assignments) {
    int idx = def->column_index(a.column);
    if (idx < 0)
      throw TxnError("no such column: " + a.column);
    assign_idx.push_back(idx);
  }

  // Collect matches first (snapshot), then apply, to avoid mutating mid-scan.
  std::vector<std::pair<RowId, Row>> matches;
  {
    auto cur = store->scan();
    Row row;
    RowId id;
    while (cur->next(row, id)) {
      if (!s->where || is_truthy(evaluate(s->where.get(), row, cols)))
        matches.emplace_back(id, row);
    }
  }

  ExecResult res;
  for (auto &m : matches) {
    Row newrow = m.second;
    for (size_t k = 0; k < s->assignments.size(); ++k) {
      Value v = evaluate(s->assignments[k].value.get(), m.second, cols);
      int idx = assign_idx[k];
      newrow[idx] = coerce(std::move(v), def->columns[idx].affinity);
    }
    check_not_null(*def, newrow);
    store->update(m.first, newrow);
    ++res.changes;
  }
  return res;
}

ExecResult exec_delete(const DeleteStmt *s, Database &db) {
  const TableDef *def = db.catalog().find(s->table);
  if (!def)
    throw TxnError("no such table: " + s->table);
  TableStore *store = db.store_for(s->table);
  std::vector<std::string> cols = column_names(*def);

  std::vector<RowId> victims;
  {
    auto cur = store->scan();
    Row row;
    RowId id;
    while (cur->next(row, id)) {
      if (!s->where || is_truthy(evaluate(s->where.get(), row, cols)))
        victims.push_back(id);
    }
  }

  ExecResult res;
  for (RowId id : victims) {
    store->erase(id);
    ++res.changes;
  }
  return res;
}

} // namespace

ExecResult execute_statement(const Statement *stmt, Database &db) {
  if (auto *s = dynamic_cast<const CreateTableStmt *>(stmt))
    return exec_create(s, db);
  if (auto *s = dynamic_cast<const DropTableStmt *>(stmt))
    return exec_drop(s, db);
  if (auto *s = dynamic_cast<const InsertStmt *>(stmt))
    return exec_insert(s, db);
  if (auto *s = dynamic_cast<const SelectStmt *>(stmt))
    return exec_select(s, db);
  if (auto *s = dynamic_cast<const UpdateStmt *>(stmt))
    return exec_update(s, db);
  if (auto *s = dynamic_cast<const DeleteStmt *>(stmt))
    return exec_delete(s, db);
  throw TxnError("internal: unknown statement type");
}

} // namespace tdb
