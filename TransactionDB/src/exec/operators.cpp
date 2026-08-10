#include "exec/operators.h"

#include "exec/evaluator.h"

namespace tdb {

bool FilterOp::next(Row &out) {
  Row row;
  while (child_->next(row)) {
    Value v = evaluate(predicate_, row, child_->columns());
    if (is_truthy(v)) {
      out = std::move(row);
      return true;
    }
  }
  return false;
}

bool ProjectOp::next(Row &out) {
  Row row;
  if (!child_->next(row))
    return false;
  Row result;
  result.reserve(exprs_.size());
  for (const Expr *e : exprs_)
    result.push_back(evaluate(e, row, child_->columns()));
  out = std::move(result);
  return true;
}

} // namespace tdb
