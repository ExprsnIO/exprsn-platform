// varint.h - LEB128-style variable-length integer encoding, used by the record
// codec to keep on-disk rows compact.
#ifndef TXNDB_COMMON_VARINT_H
#define TXNDB_COMMON_VARINT_H

#include <cstdint>
#include <vector>

namespace tdb {

// Append an unsigned varint to `out`.
void put_uvarint(std::vector<uint8_t> &out, uint64_t value);

// Read an unsigned varint starting at *pos in `buf`, advancing *pos.
// Throws TxnError on truncated / malformed input.
uint64_t get_uvarint(const uint8_t *buf, size_t size, size_t *pos);

// Signed varint via zig-zag encoding.
void put_svarint(std::vector<uint8_t> &out, int64_t value);
int64_t get_svarint(const uint8_t *buf, size_t size, size_t *pos);

} // namespace tdb

#endif // TXNDB_COMMON_VARINT_H
