// value.h - The dynamic Value type and Row.
//
// A Value is one of five SQL storage classes: NULL, INTEGER (int64), REAL
// (double), TEXT (utf-8 string) or BLOB (byte vector), held in a std::variant.
// TransactionDB uses SQLite-style flexible typing: values carry their own
// storage class and a column only has a type *affinity* (see catalog).
#ifndef TXNDB_COMMON_VALUE_H
#define TXNDB_COMMON_VALUE_H

#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace tdb {

enum class ValueType { Null, Integer, Real, Text, Blob };

class Value {
public:
  using Blob = std::vector<uint8_t>;

  Value() : data_(std::monostate{}) {}                          // NULL
  explicit Value(int64_t v) : data_(v) {}
  explicit Value(double v) : data_(v) {}
  explicit Value(std::string v) : data_(std::move(v)) {}
  explicit Value(Blob v) : data_(std::move(v)) {}

  static Value null() { return Value(); }
  static Value integer(int64_t v) { return Value(v); }
  static Value real(double v) { return Value(v); }
  static Value text(std::string v) { return Value(std::move(v)); }
  static Value blob(Blob v) { return Value(std::move(v)); }

  ValueType type() const { return static_cast<ValueType>(data_.index()); }
  bool is_null() const { return type() == ValueType::Null; }
  bool is_integer() const { return type() == ValueType::Integer; }
  bool is_real() const { return type() == ValueType::Real; }
  bool is_text() const { return type() == ValueType::Text; }
  bool is_blob() const { return type() == ValueType::Blob; }
  bool is_numeric() const { return is_integer() || is_real(); }

  int64_t as_int() const { return std::get<int64_t>(data_); }
  double as_real() const { return std::get<double>(data_); }
  const std::string &as_text() const { return std::get<std::string>(data_); }
  const Blob &as_blob() const { return std::get<Blob>(data_); }

  // Numeric value as double regardless of INTEGER/REAL (undefined if not numeric).
  double numeric() const { return is_integer() ? static_cast<double>(as_int()) : as_real(); }

  // Render for display / text export. NULL renders as "NULL".
  std::string to_display() const;

  // Three-valued comparison. Returns nullopt if either operand is NULL,
  // otherwise -1 / 0 / +1. Numbers compare numerically; text lexically;
  // blobs byte-wise. Mixed numeric/text orders by storage class.
  std::optional<int> compare(const Value &other) const;

  // Total order used for deterministic sorting (NULLs sort first). Never NULL.
  bool order_less(const Value &other) const;

  bool operator==(const Value &o) const { return data_ == o.data_; }
  bool operator!=(const Value &o) const { return !(*this == o); }

private:
  // Variant order MUST match ValueType: Null, Integer, Real, Text, Blob.
  std::variant<std::monostate, int64_t, double, std::string, Blob> data_;
};

using Row = std::vector<Value>;

} // namespace tdb

#endif // TXNDB_COMMON_VALUE_H
