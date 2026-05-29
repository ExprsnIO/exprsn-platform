// heap_store.h - Pager-backed slotted-page heap implementing TableStore.
//
// A table is a singly-linked chain of data pages starting at `root_page`. Each
// page has an 8-byte header (next_page:u32, slot_count:u16, cell_top:u16), a
// forward-growing slot array (cell_offset:u16, cell_len:u16 per slot; len 0 =
// tombstone) and backward-growing cell payloads. RowId encodes (page<<16|slot).
//
// v1 limitations (documented in docs/ROADMAP.md): no overflow pages (a single
// row must fit in one page), and freed cell space within a page is not
// compacted.
#ifndef TXNDB_STORAGE_HEAP_STORE_H
#define TXNDB_STORAGE_HEAP_STORE_H

#include <cstdint>

#include "storage/pager.h"
#include "storage/table_store.h"

namespace tdb {

class HeapStore : public TableStore {
public:
  HeapStore(Pager *pager, uint32_t root_page) : pager_(pager), root_page_(root_page) {}

  std::unique_ptr<Cursor> scan() override;
  RowId insert(const Row &row) override;
  void update(RowId id, const Row &row) override;
  void erase(RowId id) override;
  void flush() override { pager_->flush(); }

  // Initialize a freshly allocated page as an empty heap data page.
  static void init_page(uint8_t *page);

  // Maximum record payload that fits in a single page.
  static uint32_t max_payload();

private:
  RowId place(uint32_t page, const std::vector<uint8_t> &rec);

  Pager *pager_;
  uint32_t root_page_;
};

} // namespace tdb

#endif // TXNDB_STORAGE_HEAP_STORE_H
