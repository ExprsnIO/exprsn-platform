#include "storage/record.h"

#include <cstring>

#include "common/error.h"
#include "common/varint.h"

namespace tdb {

namespace {
// Type codes stored in the record (independent of ValueType's numeric values
// so the on-disk format is stable even if the enum changes).
constexpr uint8_t kNull = 0;
constexpr uint8_t kInteger = 1;
constexpr uint8_t kReal = 2;
constexpr uint8_t kText = 3;
constexpr uint8_t kBlob = 4;
} // namespace

std::vector<uint8_t> encode_record(const Row &row) {
  std::vector<uint8_t> out;
  put_uvarint(out, row.size());
  for (const Value &v : row) {
    switch (v.type()) {
    case ValueType::Null:
      out.push_back(kNull);
      break;
    case ValueType::Integer:
      out.push_back(kInteger);
      put_svarint(out, v.as_int());
      break;
    case ValueType::Real: {
      out.push_back(kReal);
      double d = v.as_real();
      uint8_t bytes[8];
      std::memcpy(bytes, &d, 8);
      out.insert(out.end(), bytes, bytes + 8);
      break;
    }
    case ValueType::Text: {
      out.push_back(kText);
      const std::string &s = v.as_text();
      put_uvarint(out, s.size());
      out.insert(out.end(), s.begin(), s.end());
      break;
    }
    case ValueType::Blob: {
      out.push_back(kBlob);
      const Value::Blob &b = v.as_blob();
      put_uvarint(out, b.size());
      out.insert(out.end(), b.begin(), b.end());
      break;
    }
    }
  }
  return out;
}

Row decode_record(const uint8_t *buf, size_t size) {
  size_t pos = 0;
  uint64_t ncols = get_uvarint(buf, size, &pos);
  Row row;
  row.reserve(ncols);
  for (uint64_t i = 0; i < ncols; ++i) {
    if (pos >= size)
      throw TxnError("record: truncated (missing type code)");
    uint8_t code = buf[pos++];
    switch (code) {
    case kNull:
      row.push_back(Value::null());
      break;
    case kInteger:
      row.push_back(Value::integer(get_svarint(buf, size, &pos)));
      break;
    case kReal: {
      if (pos + 8 > size)
        throw TxnError("record: truncated REAL");
      double d;
      std::memcpy(&d, buf + pos, 8);
      pos += 8;
      row.push_back(Value::real(d));
      break;
    }
    case kText: {
      uint64_t len = get_uvarint(buf, size, &pos);
      if (pos + len > size)
        throw TxnError("record: truncated TEXT");
      row.push_back(Value::text(std::string(reinterpret_cast<const char *>(buf + pos), len)));
      pos += len;
      break;
    }
    case kBlob: {
      uint64_t len = get_uvarint(buf, size, &pos);
      if (pos + len > size)
        throw TxnError("record: truncated BLOB");
      row.push_back(Value::blob(Value::Blob(buf + pos, buf + pos + len)));
      pos += len;
      break;
    }
    default:
      throw TxnError("record: unknown type code");
    }
  }
  return row;
}

} // namespace tdb
