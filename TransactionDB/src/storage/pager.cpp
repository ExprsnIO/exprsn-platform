#include "storage/pager.h"

#include <cstring>

#include <fcntl.h>
#include <unistd.h>

#include "common/error.h"

namespace tdb {

namespace {
constexpr char kMagic[8] = {'T', 'X', 'N', 'D', 'B', '0', '1', '\0'};

// Header field byte offsets within page 1.
constexpr size_t kOffMagic = 0;
constexpr size_t kOffPageSize = 8;
constexpr size_t kOffFormatVersion = 12;
constexpr size_t kOffPageCount = 16;
constexpr size_t kOffFreelistHead = 20;
constexpr size_t kOffCatalogRoot = 24;

uint32_t read_u32(const uint8_t *p) {
  uint32_t v;
  std::memcpy(&v, p, 4);
  return v;
}
void write_u32(uint8_t *p, uint32_t v) { std::memcpy(p, &v, 4); }
} // namespace

Pager::~Pager() { close(); }

void Pager::open(const std::string &path) {
  fd_ = ::open(path.c_str(), O_RDWR | O_CREAT, 0644);
  if (fd_ < 0)
    throw TxnError("pager: cannot open file '" + path + "': " + std::strerror(errno));

  off_t size = ::lseek(fd_, 0, SEEK_END);
  if (size < 0)
    throw TxnError("pager: lseek failed");

  if (size == 0) {
    init_header();
  } else {
    read_header();
  }
}

void Pager::close() {
  if (fd_ >= 0) {
    ::close(fd_);
    fd_ = -1;
  }
  cache_.clear();
  dirty_.clear();
}

void Pager::init_header() {
  page_count_ = 1; // header page
  freelist_head_ = 0;
  catalog_root_ = 0;
  // Create the header page in cache.
  cache_[1] = std::vector<uint8_t>(kPageSize, 0);
  uint8_t *h = cache_[1].data();
  std::memcpy(h + kOffMagic, kMagic, sizeof(kMagic));
  write_u32(h + kOffPageSize, kPageSize);
  write_u32(h + kOffFormatVersion, kFormatVersion);
  sync_header();
  flush();
}

void Pager::read_header() {
  std::vector<uint8_t> buf(kPageSize, 0);
  ssize_t n = ::pread(fd_, buf.data(), kPageSize, 0);
  if (n < static_cast<ssize_t>(kOffCatalogRoot + 4))
    throw TxnError("pager: file too small / corrupt header");
  if (std::memcmp(buf.data() + kOffMagic, kMagic, sizeof(kMagic)) != 0)
    throw TxnError("pager: bad magic (not a TransactionDB file)");
  uint32_t ps = read_u32(buf.data() + kOffPageSize);
  if (ps != kPageSize)
    throw TxnError("pager: unsupported page size");
  uint32_t fmt = read_u32(buf.data() + kOffFormatVersion);
  if (fmt != kFormatVersion)
    throw TxnError("pager: unsupported format version");
  page_count_ = read_u32(buf.data() + kOffPageCount);
  freelist_head_ = read_u32(buf.data() + kOffFreelistHead);
  catalog_root_ = read_u32(buf.data() + kOffCatalogRoot);
  cache_[1] = std::move(buf);
}

void Pager::sync_header() {
  uint8_t *h = cache_.at(1).data();
  write_u32(h + kOffPageCount, page_count_);
  write_u32(h + kOffFreelistHead, freelist_head_);
  write_u32(h + kOffCatalogRoot, catalog_root_);
  dirty_.insert(1);
}

uint8_t *Pager::load(uint32_t n) {
  auto it = cache_.find(n);
  if (it != cache_.end())
    return it->second.data();
  std::vector<uint8_t> buf(kPageSize, 0);
  if (n <= page_count_) {
    off_t off = static_cast<off_t>(n - 1) * kPageSize;
    ssize_t got = ::pread(fd_, buf.data(), kPageSize, off);
    if (got < 0)
      throw TxnError("pager: read error");
    // Short reads (page not yet written to disk) leave the tail zeroed.
  }
  auto res = cache_.emplace(n, std::move(buf));
  return res.first->second.data();
}

uint8_t *Pager::get_page(uint32_t n) {
  if (n == 0 || n > page_count_)
    throw TxnError("pager: page number out of range");
  return load(n);
}

void Pager::mark_dirty(uint32_t n) { dirty_.insert(n); }

uint32_t Pager::alloc_page() {
  uint32_t n;
  if (freelist_head_ != 0) {
    n = freelist_head_;
    uint8_t *p = load(n);
    freelist_head_ = read_u32(p); // next free page stored at offset 0
    std::memset(p, 0, kPageSize);
  } else {
    n = page_count_ + 1;
    page_count_ = n;
    std::vector<uint8_t> buf(kPageSize, 0);
    cache_[n] = std::move(buf);
  }
  dirty_.insert(n);
  sync_header();
  return n;
}

void Pager::free_page(uint32_t n) {
  if (n == 0 || n > page_count_)
    throw TxnError("pager: free of invalid page");
  uint8_t *p = load(n);
  std::memset(p, 0, kPageSize);
  write_u32(p, freelist_head_); // link old head
  freelist_head_ = n;
  dirty_.insert(n);
  sync_header();
}

void Pager::set_catalog_root(uint32_t n) {
  catalog_root_ = n;
  sync_header();
}

void Pager::flush() {
  for (uint32_t n : dirty_) {
    auto it = cache_.find(n);
    if (it == cache_.end())
      continue;
    off_t off = static_cast<off_t>(n - 1) * kPageSize;
    ssize_t wrote = ::pwrite(fd_, it->second.data(), kPageSize, off);
    if (wrote != static_cast<ssize_t>(kPageSize))
      throw TxnError("pager: write error");
  }
  dirty_.clear();
  if (fd_ >= 0 && ::fsync(fd_) != 0)
    throw TxnError("pager: fsync failed");
}

} // namespace tdb
