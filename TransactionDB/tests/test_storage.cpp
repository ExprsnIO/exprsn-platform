#include "storage/heap_store.h"
#include "storage/memory_store.h"
#include "storage/pager.h"
#include "test_util.h"

#include <cstdio>

using namespace tdb;

namespace {
size_t scan_count(TableStore &store) {
  auto cur = store.scan();
  Row row;
  RowId id;
  size_t n = 0;
  while (cur->next(row, id))
    ++n;
  return n;
}

Row make_row(int64_t id, const std::string &name) {
  Row r;
  r.push_back(Value::integer(id));
  r.push_back(Value::text(name));
  return r;
}
} // namespace

int main() {
  // ---- MemoryStore ----
  {
    MemoryStore m;
    RowId a = m.insert(make_row(1, "a"));
    m.insert(make_row(2, "b"));
    RowId c = m.insert(make_row(3, "c"));
    CHECK_EQ(scan_count(m), size_t(3));
    m.update(a, make_row(1, "AA"));
    m.erase(c);
    CHECK_EQ(scan_count(m), size_t(2));
    // Verify update took effect.
    auto cur = m.scan();
    Row row;
    RowId id;
    bool found = false;
    while (cur->next(row, id))
      if (row[0].as_int() == 1 && row[1].as_text() == "AA")
        found = true;
    CHECK(found);
  }

  // ---- HeapStore (paged, persistent) ----
  const char *path = "test_storage.tdb";
  std::remove(path);
  uint32_t root;
  const int kRows = 250; // enough to spill across multiple pages
  {
    Pager pager;
    pager.open(path);
    root = pager.alloc_page();
    HeapStore::init_page(pager.get_page(root));
    pager.mark_dirty(root);
    HeapStore store(&pager, root);
    // Use a sizeable text payload so the rows span several pages, exercising
    // the page-chain linking.
    for (int i = 0; i < kRows; ++i)
      store.insert(make_row(i, std::string(60, 'x') + std::to_string(i)));
    CHECK(pager.page_count() > 2); // spilled beyond the single root page
    CHECK_EQ(scan_count(store), size_t(kRows));
    pager.flush();
  }
  // Reopen and verify all rows persisted.
  {
    Pager pager;
    pager.open(path);
    HeapStore store(&pager, root);
    CHECK_EQ(scan_count(store), size_t(kRows));

    // Update a row to a larger value (forces relocation) and delete two.
    auto cur = store.scan();
    Row row;
    RowId id;
    RowId to_update = 0, to_erase = 0;
    int seen = 0;
    while (cur->next(row, id)) {
      if (row[0].as_int() == 10)
        to_update = id;
      if (row[0].as_int() == 20)
        to_erase = id;
      ++seen;
    }
    store.update(to_update, make_row(10, std::string(200, 'x')));
    store.erase(to_erase);
    CHECK_EQ(scan_count(store), size_t(kRows - 1));
    pager.flush();
  }

  std::remove(path);
  return tu::report();
}
