// memory_store.h - In-memory TableStore backend (used for :memory: databases).
#ifndef TXNDB_STORAGE_MEMORY_STORE_H
#define TXNDB_STORAGE_MEMORY_STORE_H

#include <map>

#include "storage/table_store.h"

namespace tdb {

class MemoryStore : public TableStore {
public:
  std::unique_ptr<Cursor> scan() override;
  RowId insert(const Row &row) override;
  void update(RowId id, const Row &row) override;
  void erase(RowId id) override;

private:
  std::map<RowId, Row> rows_; // ordered by rowid for deterministic scans
  RowId next_id_ = 1;
};

} // namespace tdb

#endif // TXNDB_STORAGE_MEMORY_STORE_H
