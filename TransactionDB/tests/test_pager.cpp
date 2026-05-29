#include "storage/pager.h"
#include "test_util.h"

#include <cstdio>
#include <cstring>

using namespace tdb;

int main() {
  const char *path = "test_pager.tdb";
  std::remove(path);

  uint32_t p2, p3;
  {
    Pager pager;
    pager.open(path);
    CHECK_EQ(pager.page_count(), uint32_t(1)); // header only

    p2 = pager.alloc_page();
    CHECK_EQ(p2, uint32_t(2));
    std::memset(pager.get_page(p2), 0xAB, Pager::kPageSize);
    pager.mark_dirty(p2);

    p3 = pager.alloc_page();
    CHECK_EQ(p3, uint32_t(3));
    std::memset(pager.get_page(p3), 0xCD, Pager::kPageSize);
    pager.mark_dirty(p3);

    pager.set_catalog_root(p3);
    pager.flush();
  }

  // Reopen: contents and header must persist.
  {
    Pager pager;
    pager.open(path);
    CHECK_EQ(pager.page_count(), uint32_t(3));
    CHECK_EQ(pager.catalog_root(), uint32_t(3));
    CHECK_EQ(int(pager.get_page(p2)[0]), 0xAB);
    CHECK_EQ(int(pager.get_page(p3)[100]), 0xCD);

    // Free p2 then allocate: the free page should be reused.
    pager.free_page(p2);
    uint32_t reused = pager.alloc_page();
    CHECK_EQ(reused, p2);
    pager.flush();
  }

  std::remove(path);
  return tu::report();
}
