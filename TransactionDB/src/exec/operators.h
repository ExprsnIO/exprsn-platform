// operators.h - Volcano (pull-based) physical operators used by SELECT.
//
// Each operator exposes open()/next()/close() and reports its output column
// names via columns(). Operators are composed into a tree; calling next() on
// the root pulls one row through the pipeline. UPDATE/DELETE/INSERT are handled
// directly in the executor rather than as operators.
#ifndef TXNDB_EXEC_OPERATORS_H
#define TXNDB_EXEC_OPERATORS_H

#include <memory>
#include <string>
#include <vector>

#include "common/value.h"
#include "sql/ast.h"
#include "storage/table_store.h"

namespace tdb {

class Operator {
public:
  virtual ~Operator() = default;
  virtual void open() = 0;
  virtual bool next(Row &out) = 0;
  virtual void close() = 0;
  virtual const std::vector<std::string> &columns() const = 0;
};

// Sequentially scans a table, emitting full rows in the table's column order.
class SeqScanOp : public Operator {
public:
  SeqScanOp(TableStore *store, std::vector<std::string> columns)
      : store_(store), columns_(std::move(columns)) {}
  void open() override { cursor_ = store_->scan(); }
  bool next(Row &out) override {
    RowId id;
    return cursor_ && cursor_->next(out, id);
  }
  void close() override { cursor_.reset(); }
  const std::vector<std::string> &columns() const override { return columns_; }

private:
  TableStore *store_;
  std::vector<std::string> columns_;
  std::unique_ptr<Cursor> cursor_;
};

// Passes through only rows for which `predicate` is truthy.
class FilterOp : public Operator {
public:
  FilterOp(std::unique_ptr<Operator> child, const Expr *predicate)
      : child_(std::move(child)), predicate_(predicate) {}
  void open() override { child_->open(); }
  bool next(Row &out) override;
  void close() override { child_->close(); }
  const std::vector<std::string> &columns() const override { return child_->columns(); }

private:
  std::unique_ptr<Operator> child_;
  const Expr *predicate_;
};

// Computes a list of output expressions, producing renamed output columns.
class ProjectOp : public Operator {
public:
  ProjectOp(std::unique_ptr<Operator> child, std::vector<const Expr *> exprs,
            std::vector<std::string> out_names)
      : child_(std::move(child)), exprs_(std::move(exprs)),
        out_names_(std::move(out_names)) {}
  void open() override { child_->open(); }
  bool next(Row &out) override;
  void close() override { child_->close(); }
  const std::vector<std::string> &columns() const override { return out_names_; }

private:
  std::unique_ptr<Operator> child_;
  std::vector<const Expr *> exprs_;
  std::vector<std::string> out_names_;
};

} // namespace tdb

#endif // TXNDB_EXEC_OPERATORS_H
