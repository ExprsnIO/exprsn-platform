#include "storage/heap_store.h"

#include <cstring>

#include "common/error.h"
#include "storage/record.h"

namespace tdb {

namespace {
// Page header layout.
constexpr size_t kOffNext = 0;       // u32 next page in chain
constexpr size_t kOffSlotCount = 4;  // u16 number of slots
constexpr size_t kOffCellTop = 6;    // u16 offset where cell payloads begin
constexpr size_t kHeaderSize = 8;
constexpr size_t kSlotSize = 4; // u16 cell_offset + u16 cell_len

uint16_t rd16(const uint8_t *p) {
  uint16_t v;
  std::memcpy(&v, p, 2);
  return v;
}
uint32_t rd32(const uint8_t *p) {
  uint32_t v;
  std::memcpy(&v, p, 4);
  return v;
}
void wr16(uint8_t *p, uint16_t v) { std::memcpy(p, &v, 2); }
void wr32(uint8_t *p, uint32_t v) { std::memcpy(p, &v, 4); }

RowId make_rowid(uint32_t page, uint16_t slot) {
  return (static_cast<RowId>(page) << 16) | slot;
}
uint32_t rowid_page(RowId id) { return static_cast<uint32_t>(id >> 16); }
uint16_t rowid_slot(RowId id) { return static_cast<uint16_t>(id & 0xffff); }
} // namespace

void HeapStore::init_page(uint8_t *page) {
  std::memset(page, 0, Pager::kPageSize);
  wr32(page + kOffNext, 0);
  wr16(page + kOffSlotCount, 0);
  wr16(page + kOffCellTop, static_cast<uint16_t>(Pager::kPageSize));
}

uint32_t HeapStore::max_payload() {
  return Pager::kPageSize - kHeaderSize - kSlotSize;
}

namespace {
class HeapCursor : public Cursor {
public:
  HeapCursor(Pager *pager, uint32_t page) : pager_(pager), page_(page) {}

  bool next(Row &out_row, RowId &out_rowid) override {
    while (page_ != 0) {
      uint8_t *p = pager_->get_page(page_);
      uint16_t slot_count = rd16(p + kOffSlotCount);
      while (slot_ < slot_count) {
        const uint8_t *slot = p + kHeaderSize + slot_ * kSlotSize;
        uint16_t off = rd16(slot);
        uint16_t len = rd16(slot + 2);
        uint16_t idx = slot_;
        ++slot_;
        if (len == 0)
          continue; // tombstone
        out_row = decode_record(p + off, len);
        out_rowid = make_rowid(page_, idx);
        return true;
      }
      page_ = rd32(p + kOffNext);
      slot_ = 0;
    }
    return false;
  }

private:
  Pager *pager_;
  uint32_t page_;
  uint16_t slot_ = 0;
};
} // namespace

std::unique_ptr<Cursor> HeapStore::scan() {
  return std::make_unique<HeapCursor>(pager_, root_page_);
}

RowId HeapStore::place(uint32_t page, const std::vector<uint8_t> &rec) {
  uint8_t *p = pager_->get_page(page);
  uint16_t slot_count = rd16(p + kOffSlotCount);
  uint16_t cell_top = rd16(p + kOffCellTop);
  uint16_t len = static_cast<uint16_t>(rec.size());
  uint16_t new_top = static_cast<uint16_t>(cell_top - len);
  std::memcpy(p + new_top, rec.data(), len);
  uint8_t *slot = p + kHeaderSize + slot_count * kSlotSize;
  wr16(slot, new_top);
  wr16(slot + 2, len);
  wr16(p + kOffSlotCount, static_cast<uint16_t>(slot_count + 1));
  wr16(p + kOffCellTop, new_top);
  pager_->mark_dirty(page);
  return make_rowid(page, slot_count);
}

RowId HeapStore::insert(const Row &row) {
  std::vector<uint8_t> rec = encode_record(row);
  if (rec.size() > max_payload())
    throw TxnError("row too large for a single page (overflow pages not yet supported)");
  uint32_t needed = static_cast<uint32_t>(rec.size()) + kSlotSize;

  uint32_t page = root_page_;
  uint32_t last = 0;
  while (page != 0) {
    uint8_t *p = pager_->get_page(page);
    uint16_t slot_count = rd16(p + kOffSlotCount);
    uint16_t cell_top = rd16(p + kOffCellTop);
    uint32_t free = cell_top - (kHeaderSize + slot_count * kSlotSize);
    if (free >= needed)
      return place(page, rec);
    last = page;
    page = rd32(p + kOffNext);
  }

  // No room anywhere: append a fresh page to the end of the chain.
  uint32_t newpg = pager_->alloc_page();
  init_page(pager_->get_page(newpg));
  pager_->mark_dirty(newpg);
  uint8_t *plast = pager_->get_page(last);
  wr32(plast + kOffNext, newpg);
  pager_->mark_dirty(last);
  return place(newpg, rec);
}

void HeapStore::update(RowId id, const Row &row) {
  std::vector<uint8_t> rec = encode_record(row);
  if (rec.size() > max_payload())
    throw TxnError("row too large for a single page (overflow pages not yet supported)");

  uint32_t page = rowid_page(id);
  uint16_t slot = rowid_slot(id);
  uint8_t *p = pager_->get_page(page);
  uint8_t *slotp = p + kHeaderSize + slot * kSlotSize;
  uint16_t old_off = rd16(slotp);
  uint16_t old_len = rd16(slotp + 2);
  (void)old_off;

  if (rec.size() <= old_len) {
    // Fits in place.
    std::memcpy(p + old_off, rec.data(), rec.size());
    wr16(slotp + 2, static_cast<uint16_t>(rec.size()));
    pager_->mark_dirty(page);
    return;
  }

  uint16_t slot_count = rd16(p + kOffSlotCount);
  uint16_t cell_top = rd16(p + kOffCellTop);
  uint32_t free = cell_top - (kHeaderSize + slot_count * kSlotSize);
  if (free >= rec.size()) {
    uint16_t new_top = static_cast<uint16_t>(cell_top - rec.size());
    std::memcpy(p + new_top, rec.data(), rec.size());
    wr16(slotp, new_top);
    wr16(slotp + 2, static_cast<uint16_t>(rec.size()));
    wr16(p + kOffCellTop, new_top);
    pager_->mark_dirty(page);
    return;
  }

  // Cannot grow in place: tombstone and reinsert (rowid changes; safe because
  // the executor applies a pre-collected snapshot of rowids).
  wr16(slotp + 2, 0);
  pager_->mark_dirty(page);
  insert(row);
}

void HeapStore::erase(RowId id) {
  uint32_t page = rowid_page(id);
  uint16_t slot = rowid_slot(id);
  uint8_t *p = pager_->get_page(page);
  uint8_t *slotp = p + kHeaderSize + slot * kSlotSize;
  wr16(slotp + 2, 0); // tombstone
  pager_->mark_dirty(page);
}

} // namespace tdb
