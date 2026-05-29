// ast.h - Abstract syntax tree produced by the parser.
//
// Expressions use a small polymorphic hierarchy (the evaluator dispatches via
// dynamic_cast); statements likewise. Ownership is via unique_ptr.
#ifndef TXNDB_SQL_AST_H
#define TXNDB_SQL_AST_H

#include <memory>
#include <string>
#include <vector>

#include "common/value.h"

namespace tdb {

// ----------------------------- Expressions -----------------------------
struct Expr {
  virtual ~Expr() = default;
};
using ExprPtr = std::unique_ptr<Expr>;

struct LiteralExpr : Expr {
  Value value;
  explicit LiteralExpr(Value v) : value(std::move(v)) {}
};

struct ColumnRefExpr : Expr {
  std::string name;
  explicit ColumnRefExpr(std::string n) : name(std::move(n)) {}
};

enum class BinOp { Add, Sub, Mul, Div, Mod, Eq, NotEq, Lt, LtEq, Gt, GtEq, And, Or };

struct BinaryExpr : Expr {
  BinOp op;
  ExprPtr left, right;
  BinaryExpr(BinOp o, ExprPtr l, ExprPtr r)
      : op(o), left(std::move(l)), right(std::move(r)) {}
};

enum class UnaryOp { Negate, Not };

struct UnaryExpr : Expr {
  UnaryOp op;
  ExprPtr operand;
  UnaryExpr(UnaryOp o, ExprPtr e) : op(o), operand(std::move(e)) {}
};

// expr IS [NOT] NULL
struct IsNullExpr : Expr {
  ExprPtr operand;
  bool negated; // true => IS NOT NULL
  IsNullExpr(ExprPtr e, bool neg) : operand(std::move(e)), negated(neg) {}
};

// ----------------------------- Statements -----------------------------
struct Statement {
  virtual ~Statement() = default;
};
using StmtPtr = std::unique_ptr<Statement>;

struct ColumnSpec {
  std::string name;
  std::string type_name; // raw type text (may be empty)
  bool not_null = false;
};

struct CreateTableStmt : Statement {
  std::string table;
  bool if_not_exists = false;
  std::vector<ColumnSpec> columns;
};

struct DropTableStmt : Statement {
  std::string table;
  bool if_exists = false;
};

struct InsertStmt : Statement {
  std::string table;
  std::vector<std::string> columns;        // empty => all columns in order
  std::vector<std::vector<ExprPtr>> rows;  // one inner vector per VALUES tuple
};

// A single output item of a SELECT.
struct SelectItem {
  ExprPtr expr;       // null when `star` is true
  std::string alias;  // optional AS alias / derived name
  bool star = false;  // SELECT *
};

struct SelectStmt : Statement {
  std::vector<SelectItem> items;
  std::string from;   // table name (empty allowed only for constant SELECT)
  ExprPtr where;      // optional
};

struct Assignment {
  std::string column;
  ExprPtr value;
};

struct UpdateStmt : Statement {
  std::string table;
  std::vector<Assignment> assignments;
  ExprPtr where; // optional
};

struct DeleteStmt : Statement {
  std::string table;
  ExprPtr where; // optional
};

} // namespace tdb

#endif // TXNDB_SQL_AST_H
