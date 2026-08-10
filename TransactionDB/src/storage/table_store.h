// table_store.h - The narrow cursor interface between the execution engine and
// the physical storage. This is the load-bearing abstraction of the project:
// the executor depends only on this, so storage backends (in-memory heap, paged
// heap file, and later a B-tree) are interchangeable without touching the SQL
// layers.
#ifndef TXNDB_STORAGE_TABLE_STORE_H
#define TXNDB_STORAGE_TABLE_STORE_H

#include <cstdint>
#include <memory>

#include "common/value.h"

namespace tdb {

// A stable identifier for a stored row. Opaque to the executor.
using RowId = uint64_t;

// Forward-only scan over a table's rows.
class Cursor {
public:
  virtual ~Cursor() = default;
  // Advance to the next row. Returns false when exhausted; otherwise fills
  // `out_row` and `out_rowid`.
  virtual bool next(Row &out_row, RowId &out_rowid) = 0;
};

class TableStore {
public:
  virtual ~TableStore() = default;
  virtual std::unique_ptr<Cursor> scan() = 0;
  virtual RowId insert(const Row &row) = 0;
  virtual void update(RowId id, const Row &row) = 0;
  virtual void erase(RowId id) = 0;
  // Flush any buffered state to durable storage (no-op for in-memory).
  virtual void flush() {}
};

} // namespace tdb

#endif // TXNDB_STORAGE_TABLE_STORE_H
