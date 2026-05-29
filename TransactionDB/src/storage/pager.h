// pager.h - Fixed-size page manager over a single database file.
//
// Page numbers are 1-based; page 1 is the database header. Higher layers address
// storage purely by page number and never touch the file descriptor. A simple
// in-memory cache holds page images; flush() writes dirty pages and fsync()s.
// Freed pages are tracked on an intrusive free-list rooted in the header.
#ifndef TXNDB_STORAGE_PAGER_H
#define TXNDB_STORAGE_PAGER_H

#include <cstdint>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

namespace tdb {

class Pager {
public:
  static constexpr uint32_t kPageSize = 4096;
  static constexpr uint32_t kFormatVersion = 1;

  Pager() = default;
  ~Pager();
  Pager(const Pager &) = delete;
  Pager &operator=(const Pager &) = delete;

  // Open (creating & initializing if empty) the database file.
  void open(const std::string &path);
  void close();

  uint32_t page_count() const { return page_count_; }

  // Return a pointer to page `n`'s cached image (kPageSize bytes). The pointer
  // is valid until the next alloc_page()/get_page() that may rehash the cache;
  // copy out what you need or re-fetch.
  uint8_t *get_page(uint32_t n);

  // Mark page `n` as modified so flush() persists it.
  void mark_dirty(uint32_t n);

  // Allocate a fresh, zeroed page (reusing the free-list when possible).
  uint32_t alloc_page();

  // Return page `n` to the free-list for reuse.
  void free_page(uint32_t n);

  // Persist all dirty pages and fsync the file.
  void flush();

  uint32_t catalog_root() const { return catalog_root_; }
  void set_catalog_root(uint32_t n);

private:
  uint8_t *load(uint32_t n);
  void init_header();
  void read_header();
  void sync_header(); // write members into the header page buffer + mark dirty

  int fd_ = -1;
  std::unordered_map<uint32_t, std::vector<uint8_t>> cache_;
  std::set<uint32_t> dirty_;
  uint32_t page_count_ = 0;
  uint32_t freelist_head_ = 0;
  uint32_t catalog_root_ = 0;
};

} // namespace tdb

#endif // TXNDB_STORAGE_PAGER_H
