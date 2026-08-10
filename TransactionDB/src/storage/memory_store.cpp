#include "storage/memory_store.h"

#include "common/error.h"

namespace tdb {

namespace {
class MemoryCursor : public Cursor {
public:
  explicit MemoryCursor(const std::map<RowId, Row> &rows)
      : it_(rows.begin()), end_(rows.end()) {}

  bool next(Row &out_row, RowId &out_rowid) override {
    if (it_ == end_)
      return false;
    out_rowid = it_->first;
    out_row = it_->second;
    ++it_;
    return true;
  }

private:
  std::map<RowId, Row>::const_iterator it_;
  std::map<RowId, Row>::const_iterator end_;
};
} // namespace

std::unique_ptr<Cursor> MemoryStore::scan() {
  return std::make_unique<MemoryCursor>(rows_);
}

RowId MemoryStore::insert(const Row &row) {
  RowId id = next_id_++;
  rows_[id] = row;
  return id;
}

void MemoryStore::update(RowId id, const Row &row) {
  auto it = rows_.find(id);
  if (it == rows_.end())
    throw TxnError("update: row not found");
  it->second = row;
}

void MemoryStore::erase(RowId id) { rows_.erase(id); }

} // namespace tdb
