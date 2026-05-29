// executor.h - Turns a parsed statement into actions against a Database and
// returns a result (rows for SELECT, change counts for DML).
#ifndef TXNDB_EXEC_EXECUTOR_H
#define TXNDB_EXEC_EXECUTOR_H

#include <string>
#include <vector>

#include "common/value.h"
#include "sql/ast.h"

namespace tdb {

class Database;

struct ExecResult {
  bool is_query = false;          // true for SELECT
  std::vector<std::string> columns; // result column names (queries)
  std::vector<Row> rows;          // result rows (queries)
  int changes = 0;                // rows affected (INSERT/UPDATE/DELETE)
};

// Execute one statement. Throws TxnError on any error.
ExecResult execute_statement(const Statement *stmt, Database &db);

} // namespace tdb

#endif // TXNDB_EXEC_EXECUTOR_H
