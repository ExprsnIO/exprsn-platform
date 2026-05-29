// evaluator.h - Scalar expression evaluation against a single row.
//
// Implements SQL three-valued (NULL) logic for comparisons and AND/OR/NOT.
#ifndef TXNDB_EXEC_EVALUATOR_H
#define TXNDB_EXEC_EVALUATOR_H

#include <string>
#include <vector>

#include "common/value.h"
#include "sql/ast.h"

namespace tdb {

// Evaluate `expr` against `row`, where `columns` names each row slot (used to
// resolve column references, case-insensitively). Throws TxnError on an unknown
// column or a type error.
Value evaluate(const Expr *expr, const Row &row, const std::vector<std::string> &columns);

// Truth value of `v` in a boolean context: NULL -> false, numeric nonzero ->
// true, everything else -> false. Used for WHERE filtering.
bool is_truthy(const Value &v);

} // namespace tdb

#endif // TXNDB_EXEC_EVALUATOR_H
