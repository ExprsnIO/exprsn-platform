// txndb.cpp - Implementation of the public C API declared in include/txndb.h.
// This is the only translation unit that bridges the C ABI and the C++ engine;
// it catches all internal exceptions and converts them to status codes.
#include "txndb.h"

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "common/error.h"
#include "common/value.h"
#include "database.h"
#include "exec/executor.h"
#include "sql/parser.h"

using namespace tdb;

struct txndb {
  Database db;
  std::string errmsg;
  int changes = 0;
};

struct txndb_stmt {
  txndb *owner = nullptr;
  ExecResult result;
  long cur = -1; // index of current row; -1 before first step
  // Stable per-row buffers backing the column_* accessors.
  std::vector<std::string> text_buf;
  std::vector<bool> is_null;
};

namespace {
int storage_class(const Value &v) {
  switch (v.type()) {
  case ValueType::Null:
    return TXNDB_NULL;
  case ValueType::Integer:
    return TXNDB_INTEGER;
  case ValueType::Real:
    return TXNDB_REAL;
  case ValueType::Text:
    return TXNDB_TEXT;
  case ValueType::Blob:
    return TXNDB_BLOB;
  }
  return TXNDB_NULL;
}
} // namespace

extern "C" {

const char *txndb_libversion(void) { return "0.1.0"; }

int txndb_open(const char *filename, txndb **out_db) {
  if (!filename || !out_db)
    return TXNDB_MISUSE;
  auto *h = new (std::nothrow) txndb();
  if (!h)
    return TXNDB_ERROR;
  try {
    h->db.open(filename);
  } catch (const std::exception &e) {
    h->errmsg = e.what();
    *out_db = h; // keep handle so caller can read errmsg, then close
    return TXNDB_ERROR;
  }
  *out_db = h;
  return TXNDB_OK;
}

int txndb_close(txndb *db) {
  if (!db)
    return TXNDB_OK;
  try {
    db->db.flush();
  } catch (...) {
    // best-effort flush on close
  }
  delete db;
  return TXNDB_OK;
}

const char *txndb_errmsg(txndb *db) { return db ? db->errmsg.c_str() : "invalid handle"; }

int txndb_changes(txndb *db) { return db ? db->changes : 0; }

int txndb_exec(txndb *db, const char *sql, txndb_exec_cb cb, void *user) {
  if (!db || !sql)
    return TXNDB_MISUSE;
  try {
    Parser parser(sql);
    auto stmts = parser.parse_program();
    db->changes = 0;
    for (const auto &stmt : stmts) {
      ExecResult res = execute_statement(stmt.get(), db->db);
      db->db.flush();
      if (!res.is_query) {
        db->changes += res.changes;
        continue;
      }
      if (!cb)
        continue;
      // Prepare reusable column-name array.
      std::vector<std::string> names = res.columns;
      std::vector<char *> name_ptrs;
      for (auto &n : names)
        name_ptrs.push_back(const_cast<char *>(n.c_str()));
      for (const Row &row : res.rows) {
        std::vector<std::string> vals;
        vals.reserve(row.size());
        for (const Value &v : row)
          vals.push_back(v.to_display());
        std::vector<char *> val_ptrs;
        for (size_t i = 0; i < row.size(); ++i)
          val_ptrs.push_back(row[i].is_null() ? nullptr
                                              : const_cast<char *>(vals[i].c_str()));
        int rc = cb(user, static_cast<int>(row.size()), val_ptrs.data(),
                    name_ptrs.data());
        if (rc != 0)
          return TXNDB_OK; // caller requested abort
      }
    }
    return TXNDB_OK;
  } catch (const std::exception &e) {
    db->errmsg = e.what();
    return TXNDB_ERROR;
  }
}

int txndb_prepare(txndb *db, const char *sql, txndb_stmt **out_stmt) {
  if (!db || !sql || !out_stmt)
    return TXNDB_MISUSE;
  try {
    Parser parser(sql);
    StmtPtr stmt = parser.parse_single();
    auto *s = new txndb_stmt();
    s->owner = db;
    s->result = execute_statement(stmt.get(), db->db);
    db->db.flush();
    if (!s->result.is_query)
      db->changes = s->result.changes;
    *out_stmt = s;
    return TXNDB_OK;
  } catch (const std::exception &e) {
    db->errmsg = e.what();
    return TXNDB_ERROR;
  }
}

int txndb_step(txndb_stmt *stmt) {
  if (!stmt)
    return TXNDB_MISUSE;
  if (!stmt->result.is_query)
    return TXNDB_DONE;
  ++stmt->cur;
  if (stmt->cur < 0 || static_cast<size_t>(stmt->cur) >= stmt->result.rows.size())
    return TXNDB_DONE;
  const Row &row = stmt->result.rows[stmt->cur];
  stmt->text_buf.clear();
  stmt->is_null.clear();
  for (const Value &v : row) {
    stmt->is_null.push_back(v.is_null());
    stmt->text_buf.push_back(v.to_display());
  }
  return TXNDB_ROW;
}

int txndb_column_count(txndb_stmt *stmt) {
  return stmt ? static_cast<int>(stmt->result.columns.size()) : 0;
}

const char *txndb_column_name(txndb_stmt *stmt, int i) {
  if (!stmt || i < 0 || static_cast<size_t>(i) >= stmt->result.columns.size())
    return nullptr;
  return stmt->result.columns[i].c_str();
}

static const Value *current_value(txndb_stmt *stmt, int i) {
  if (!stmt || stmt->cur < 0)
    return nullptr;
  size_t r = static_cast<size_t>(stmt->cur);
  if (r >= stmt->result.rows.size())
    return nullptr;
  const Row &row = stmt->result.rows[r];
  if (i < 0 || static_cast<size_t>(i) >= row.size())
    return nullptr;
  return &row[i];
}

int txndb_column_type(txndb_stmt *stmt, int i) {
  const Value *v = current_value(stmt, i);
  return v ? storage_class(*v) : TXNDB_NULL;
}

int64_t txndb_column_int64(txndb_stmt *stmt, int i) {
  const Value *v = current_value(stmt, i);
  if (!v || v->is_null())
    return 0;
  if (v->is_integer())
    return v->as_int();
  if (v->is_real())
    return static_cast<int64_t>(v->as_real());
  if (v->is_text()) {
    try {
      return std::stoll(v->as_text());
    } catch (...) {
      return 0;
    }
  }
  return 0;
}

double txndb_column_double(txndb_stmt *stmt, int i) {
  const Value *v = current_value(stmt, i);
  if (!v || v->is_null())
    return 0.0;
  if (v->is_numeric())
    return v->numeric();
  if (v->is_text()) {
    try {
      return std::stod(v->as_text());
    } catch (...) {
      return 0.0;
    }
  }
  return 0.0;
}

const char *txndb_column_text(txndb_stmt *stmt, int i) {
  if (!stmt || stmt->cur < 0)
    return nullptr;
  if (i < 0 || static_cast<size_t>(i) >= stmt->text_buf.size())
    return nullptr;
  if (stmt->is_null[i])
    return nullptr;
  return stmt->text_buf[i].c_str();
}

const void *txndb_column_blob(txndb_stmt *stmt, int i, int *out_len) {
  const Value *v = current_value(stmt, i);
  if (!v || !v->is_blob()) {
    if (out_len)
      *out_len = 0;
    return nullptr;
  }
  const Value::Blob &b = v->as_blob();
  if (out_len)
    *out_len = static_cast<int>(b.size());
  return b.data();
}

int txndb_finalize(txndb_stmt *stmt) {
  delete stmt;
  return TXNDB_OK;
}

} // extern "C"
