#include "common/value.h"

#include <cmath>
#include <cstdio>

namespace tdb {

std::string Value::to_display() const {
  switch (type()) {
  case ValueType::Null:
    return "NULL";
  case ValueType::Integer:
    return std::to_string(as_int());
  case ValueType::Real: {
    // %g gives a compact, round-trippable rendering for typical values.
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%g", as_real());
    return std::string(buf);
  }
  case ValueType::Text:
    return as_text();
  case ValueType::Blob: {
    // Render blobs as a hex literal: x'..'.
    static const char *hex = "0123456789abcdef";
    std::string out = "x'";
    for (uint8_t b : as_blob()) {
      out.push_back(hex[b >> 4]);
      out.push_back(hex[b & 0x0f]);
    }
    out.push_back('\'');
    return out;
  }
  }
  return "";
}

std::optional<int> Value::compare(const Value &other) const {
  if (is_null() || other.is_null())
    return std::nullopt;

  // Both numeric: compare as doubles (int/real interoperate).
  if (is_numeric() && other.is_numeric()) {
    double a = numeric(), b = other.numeric();
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  }

  // Both text.
  if (is_text() && other.is_text()) {
    int c = as_text().compare(other.as_text());
    return c < 0 ? -1 : (c > 0 ? 1 : 0);
  }

  // Both blob: byte-wise.
  if (is_blob() && other.is_blob()) {
    const Blob &a = as_blob();
    const Blob &b = other.as_blob();
    size_t n = std::min(a.size(), b.size());
    for (size_t i = 0; i < n; ++i) {
      if (a[i] != b[i])
        return a[i] < b[i] ? -1 : 1;
    }
    if (a.size() == b.size())
      return 0;
    return a.size() < b.size() ? -1 : 1;
  }

  // Mixed storage classes: order by class rank (numeric < text < blob),
  // matching SQLite's class ordering.
  auto rank = [](const Value &v) -> int {
    if (v.is_numeric())
      return 0;
    if (v.is_text())
      return 1;
    return 2; // blob
  };
  int ra = rank(*this), rb = rank(other);
  return ra < rb ? -1 : (ra > rb ? 1 : 0);
}

bool Value::order_less(const Value &other) const {
  // Deterministic total order with NULLs first.
  if (is_null())
    return !other.is_null();
  if (other.is_null())
    return false;
  auto c = compare(other);
  return c.has_value() && *c < 0;
}

} // namespace tdb
