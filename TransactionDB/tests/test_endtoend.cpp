// End-to-end tests driving the public C API, including persistence across
// reopen and the prepare/step/column workflow.
#include "txndb.h"
#include "test_util.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {
// Collect SELECT output rendered as "c0|c1|..." strings via txndb_exec.
struct Collector {
  std::vector<std::string> rows;
};
int collect_cb(void *user, int ncols, char **vals, char ** /*names*/) {
  auto *c = static_cast<Collector *>(user);
  std::string line;
  for (int i = 0; i < ncols; ++i) {
    if (i)
      line += "|";
    line += vals[i] ? vals[i] : "NULL";
  }
  c->rows.push_back(line);
  return 0;
}

bool exec_ok(txndb *db, const char *sql) {
  return txndb_exec(db, sql, nullptr, nullptr) == TXNDB_OK;
}
} // namespace

int main() {
  // ---- In-memory: full CRUD round-trip via the C API ----
  {
    txndb *db = nullptr;
    CHECK_EQ(txndb_open(":memory:", &db), TXNDB_OK);
    CHECK(exec_ok(db, "CREATE TABLE users(id INTEGER NOT NULL, name TEXT, score REAL);"));
    CHECK(exec_ok(db, "INSERT INTO users VALUES (1,'ada',9.5),(2,'alan',8),(3,'grace',NULL);"));

    Collector c;
    CHECK_EQ(txndb_exec(db, "SELECT id, name FROM users WHERE id >= 2;", collect_cb, &c),
             TXNDB_OK);
    CHECK_EQ(c.rows.size(), size_t(2));
    CHECK_EQ(c.rows[0], std::string("2|alan"));
    CHECK_EQ(c.rows[1], std::string("3|grace"));

    CHECK(exec_ok(db, "UPDATE users SET score = 10 WHERE id = 2;"));
    CHECK_EQ(txndb_changes(db), 1);
    CHECK(exec_ok(db, "DELETE FROM users WHERE id = 1;"));
    CHECK_EQ(txndb_changes(db), 1);

    Collector c2;
    CHECK_EQ(txndb_exec(db, "SELECT id FROM users WHERE score IS NOT NULL;", collect_cb, &c2),
             TXNDB_OK);
    CHECK_EQ(c2.rows.size(), size_t(1));
    CHECK_EQ(c2.rows[0], std::string("2"));

    // NOT NULL violation is rejected.
    CHECK(txndb_exec(db, "INSERT INTO users(name) VALUES ('x');", nullptr, nullptr) ==
          TXNDB_ERROR);

    // Error message is populated; syntax errors are reported.
    CHECK(txndb_exec(db, "SELCT bad;", nullptr, nullptr) == TXNDB_ERROR);
    CHECK(std::strlen(txndb_errmsg(db)) > 0);

    txndb_close(db);
  }

  // ---- prepare/step/column accessors ----
  {
    txndb *db = nullptr;
    CHECK_EQ(txndb_open(":memory:", &db), TXNDB_OK);
    exec_ok(db, "CREATE TABLE t(a INTEGER, b TEXT);");
    exec_ok(db, "INSERT INTO t VALUES (7, 'seven');");
    txndb_stmt *st = nullptr;
    CHECK_EQ(txndb_prepare(db, "SELECT a, b FROM t;", &st), TXNDB_OK);
    CHECK_EQ(txndb_column_count(st), 2);
    CHECK_EQ(std::string(txndb_column_name(st, 0)), std::string("a"));
    CHECK_EQ(txndb_step(st), TXNDB_ROW);
    CHECK_EQ(txndb_column_int64(st, 0), int64_t(7));
    CHECK_EQ(std::string(txndb_column_text(st, 1)), std::string("seven"));
    CHECK_EQ(txndb_column_type(st, 0), TXNDB_INTEGER);
    CHECK_EQ(txndb_step(st), TXNDB_DONE);
    txndb_finalize(st);
    txndb_close(db);
  }

  // ---- Persistence across reopen (file-backed) ----
  {
    const char *path = "test_e2e.tdb";
    std::remove(path);
    txndb *db = nullptr;
    CHECK_EQ(txndb_open(path, &db), TXNDB_OK);
    exec_ok(db, "CREATE TABLE kv(k INTEGER, v TEXT);");
    exec_ok(db, "INSERT INTO kv VALUES (1,'one'),(2,'two'),(3,'three');");
    exec_ok(db, "DELETE FROM kv WHERE k = 2;");
    txndb_close(db);

    // Reopen: schema and data must survive.
    txndb *db2 = nullptr;
    CHECK_EQ(txndb_open(path, &db2), TXNDB_OK);
    Collector c;
    CHECK_EQ(txndb_exec(db2, "SELECT k, v FROM kv WHERE k > 0;", collect_cb, &c), TXNDB_OK);
    CHECK_EQ(c.rows.size(), size_t(2));
    CHECK_EQ(c.rows[0], std::string("1|one"));
    CHECK_EQ(c.rows[1], std::string("3|three"));
    txndb_close(db2);
    std::remove(path);
  }

  return tu::report();
}
