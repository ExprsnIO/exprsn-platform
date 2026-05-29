// record.h - On-disk row serialization.
//
// A record is encoded as: uvarint(column_count) followed by, for each column,
// a uvarint type code and the value's payload:
//   NULL    -> no payload
//   INTEGER -> svarint
//   REAL    -> 8 raw IEEE-754 bytes (little-endian)
//   TEXT    -> uvarint(length) + bytes
//   BLOB    -> uvarint(length) + bytes
// The format is self-describing and forward-compatible (versioned by the DB
// header).
#ifndef TXNDB_STORAGE_RECORD_H
#define TXNDB_STORAGE_RECORD_H

#include <cstdint>
#include <vector>

#include "common/value.h"

namespace tdb {

// Serialize a row into a fresh byte buffer.
std::vector<uint8_t> encode_record(const Row &row);

// Deserialize a row from `buf` (exactly `size` bytes). Throws on malformed data.
Row decode_record(const uint8_t *buf, size_t size);

} // namespace tdb

#endif // TXNDB_STORAGE_RECORD_H
