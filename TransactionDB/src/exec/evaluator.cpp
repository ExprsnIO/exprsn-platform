#include "exec/evaluator.h"

#include <cctype>
#include <cmath>

#include "common/error.h"

namespace tdb {

namespace {
enum class Tri { False, True, Unknown };

Tri tri(const Value &v) {
  if (v.is_null())
    return Tri::Unknown;
  if (v.is_numeric())
    return v.numeric() != 0 ? Tri::True : Tri::False;
  return Tri::False; // text / blob are not true in a boolean context
}

bool iequals(const std::string &a, const std::string &b) {
  if (a.size() != b.size())
    return false;
  for (size_t i = 0; i < a.size(); ++i)
    if (std::tolower((unsigned char)a[i]) != std::tolower((unsigned char)b[i]))
      return false;
  return true;
}

Value eval_arith(BinOp op, const Value &l, const Value &r) {
  if (l.is_null() || r.is_null())
    return Value::null();
  if (!l.is_numeric() || !r.is_numeric())
    throw TxnError("arithmetic on non-numeric value");
  bool both_int = l.is_integer() && r.is_integer();
  switch (op) {
  case BinOp::Add:
    return both_int ? Value::integer(l.as_int() + r.as_int())
                    : Value::real(l.numeric() + r.numeric());
  case BinOp::Sub:
    return both_int ? Value::integer(l.as_int() - r.as_int())
                    : Value::real(l.numeric() - r.numeric());
  case BinOp::Mul:
    return both_int ? Value::integer(l.as_int() * r.as_int())
                    : Value::real(l.numeric() * r.numeric());
  case BinOp::Div:
    if (both_int) {
      if (r.as_int() == 0)
        return Value::null(); // division by zero -> NULL (SQLite-style)
      return Value::integer(l.as_int() / r.as_int());
    }
    if (r.numeric() == 0)
      return Value::null();
    return Value::real(l.numeric() / r.numeric());
  case BinOp::Mod:
    if (r.numeric() == 0)
      return Value::null();
    if (both_int)
      return Value::integer(l.as_int() % r.as_int());
    return Value::real(std::fmod(l.numeric(), r.numeric()));
  default:
    throw TxnError("internal: not an arithmetic op");
  }
}

Value eval_compare(BinOp op, const Value &l, const Value &r) {
  auto c = l.compare(r); // nullopt if either is NULL
  if (!c)
    return Value::null();
  bool result = false;
  switch (op) {
  case BinOp::Eq:
    result = (*c == 0);
    break;
  case BinOp::NotEq:
    result = (*c != 0);
    break;
  case BinOp::Lt:
    result = (*c < 0);
    break;
  case BinOp::LtEq:
    result = (*c <= 0);
    break;
  case BinOp::Gt:
    result = (*c > 0);
    break;
  case BinOp::GtEq:
    result = (*c >= 0);
    break;
  default:
    throw TxnError("internal: not a comparison op");
  }
  return Value::integer(result ? 1 : 0);
}
} // namespace

bool is_truthy(const Value &v) { return tri(v) == Tri::True; }

Value evaluate(const Expr *expr, const Row &row, const std::vector<std::string> &columns) {
  if (auto *lit = dynamic_cast<const LiteralExpr *>(expr))
    return lit->value;

  if (auto *col = dynamic_cast<const ColumnRefExpr *>(expr)) {
    for (size_t i = 0; i < columns.size(); ++i)
      if (iequals(columns[i], col->name))
        return i < row.size() ? row[i] : Value::null();
    throw TxnError("no such column: " + col->name);
  }

  if (auto *u = dynamic_cast<const UnaryExpr *>(expr)) {
    Value v = evaluate(u->operand.get(), row, columns);
    switch (u->op) {
    case UnaryOp::Negate:
      if (v.is_null())
        return Value::null();
      if (v.is_integer())
        return Value::integer(-v.as_int());
      if (v.is_real())
        return Value::real(-v.as_real());
      throw TxnError("cannot negate a non-numeric value");
    case UnaryOp::Not: {
      Tri t = tri(v);
      if (t == Tri::Unknown)
        return Value::null();
      return Value::integer(t == Tri::True ? 0 : 1);
    }
    }
  }

  if (auto *isn = dynamic_cast<const IsNullExpr *>(expr)) {
    Value v = evaluate(isn->operand.get(), row, columns);
    bool is_null = v.is_null();
    bool result = isn->negated ? !is_null : is_null;
    return Value::integer(result ? 1 : 0);
  }

  if (auto *bin = dynamic_cast<const BinaryExpr *>(expr)) {
    switch (bin->op) {
    case BinOp::And: {
      Tri a = tri(evaluate(bin->left.get(), row, columns));
      if (a == Tri::False)
        return Value::integer(0);
      Tri b = tri(evaluate(bin->right.get(), row, columns));
      if (b == Tri::False)
        return Value::integer(0);
      if (a == Tri::Unknown || b == Tri::Unknown)
        return Value::null();
      return Value::integer(1);
    }
    case BinOp::Or: {
      Tri a = tri(evaluate(bin->left.get(), row, columns));
      if (a == Tri::True)
        return Value::integer(1);
      Tri b = tri(evaluate(bin->right.get(), row, columns));
      if (b == Tri::True)
        return Value::integer(1);
      if (a == Tri::Unknown || b == Tri::Unknown)
        return Value::null();
      return Value::integer(0);
    }
    default:
      break;
    }
    Value l = evaluate(bin->left.get(), row, columns);
    Value r = evaluate(bin->right.get(), row, columns);
    switch (bin->op) {
    case BinOp::Add:
    case BinOp::Sub:
    case BinOp::Mul:
    case BinOp::Div:
    case BinOp::Mod:
      return eval_arith(bin->op, l, r);
    case BinOp::Eq:
    case BinOp::NotEq:
    case BinOp::Lt:
    case BinOp::LtEq:
    case BinOp::Gt:
    case BinOp::GtEq:
      return eval_compare(bin->op, l, r);
    default:
      throw TxnError("internal: unhandled binary op");
    }
  }

  throw TxnError("internal: unknown expression node");
}

} // namespace tdb
