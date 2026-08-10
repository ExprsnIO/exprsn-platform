#include "common/varint.h"

#include "common/error.h"

namespace tdb {

void put_uvarint(std::vector<uint8_t> &out, uint64_t value) {
  while (value >= 0x80) {
    out.push_back(static_cast<uint8_t>(value) | 0x80);
    value >>= 7;
  }
  out.push_back(static_cast<uint8_t>(value));
}

uint64_t get_uvarint(const uint8_t *buf, size_t size, size_t *pos) {
  uint64_t result = 0;
  int shift = 0;
  while (true) {
    if (*pos >= size)
      throw TxnError("varint: truncated input");
    uint8_t byte = buf[(*pos)++];
    result |= static_cast<uint64_t>(byte & 0x7f) << shift;
    if ((byte & 0x80) == 0)
      break;
    shift += 7;
    if (shift >= 64)
      throw TxnError("varint: value too large");
  }
  return result;
}

void put_svarint(std::vector<uint8_t> &out, int64_t value) {
  // Zig-zag: map signed to unsigned so small magnitudes stay small.
  uint64_t zz = (static_cast<uint64_t>(value) << 1) ^ static_cast<uint64_t>(value >> 63);
  put_uvarint(out, zz);
}

int64_t get_svarint(const uint8_t *buf, size_t size, size_t *pos) {
  uint64_t zz = get_uvarint(buf, size, pos);
  return static_cast<int64_t>((zz >> 1) ^ (~(zz & 1) + 1));
}

} // namespace tdb
