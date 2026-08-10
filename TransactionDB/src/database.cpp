#include "database.h"

#include <algorithm>
#include <cctype>
#include <cstring>

#include "common/error.h"
#include "common/varint.h"
#include "storage/heap_store.h"
#include "storage/memory_store.h"

namespace tdb {

namespace {
std::string to_lower(std::string s) {
  for (char &c : s)
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}

uint32_t rd32(const uint8_t *p) {
  uint32_t v;
  std::memcpy(&v, p, 4);
  return v;
}
void wr32(uint8_t *p, uint32_t v) { std::memcpy(p, &v, 4); }

// Blob chain page layout: next_page:u32, used_len:u32, then payload.
constexpr size_t kChainHeader = 8;

std::vector<uint8_t> serialize_catalog(const Catalog &cat) {
  std::vector<uint8_t> blob;
  put_uvarint(blob, cat.tables().size());
  for (const TableDef &t : cat.tables()) {
    put_uvarint(blob, t.name.size());
    blob.insert(blob.end(), t.name.begin(), t.name.end());
    put_uvarint(blob, t.root_page);
    put_uvarint(blob, t.columns.size());
    for (const ColumnDef &c : t.columns) {
      put_uvarint(blob, c.name.size());
      blob.insert(blob.end(), c.name.begin(), c.name.end());
      blob.push_back(static_cast<uint8_t>(c.affinity));
      blob.push_back(c.not_null ? 1 : 0);
    }
  }
  return blob;
}

void deserialize_catalog(const std::vector<uint8_t> &blob, Catalog &cat) {
  cat.clear();
  const uint8_t *buf = blob.data();
  size_t size = blob.size();
  size_t pos = 0;
  uint64_t ntables = get_uvarint(buf, size, &pos);
  for (uint64_t i = 0; i < ntables; ++i) {
    TableDef t;
    uint64_t nlen = get_uvarint(buf, size, &pos);
    if (pos + nlen > size)
      throw TxnError("catalog: corrupt table name");
    t.name.assign(reinterpret_cast<const char *>(buf + pos), nlen);
    pos += nlen;
    t.root_page = static_cast<uint32_t>(get_uvarint(buf, size, &pos));
    uint64_t ncols = get_uvarint(buf, size, &pos);
    for (uint64_t j = 0; j < ncols; ++j) {
      ColumnDef c;
      uint64_t cl = get_uvarint(buf, size, &pos);
      if (pos + cl > size)
        throw TxnError("catalog: corrupt column name");
      c.name.assign(reinterpret_cast<const char *>(buf + pos), cl);
      pos += cl;
      if (pos + 2 > size)
        throw TxnError("catalog: corrupt column flags");
      c.affinity = static_cast<ValueType>(buf[pos++]);
      c.not_null = buf[pos++] != 0;
      t.columns.push_back(std::move(c));
    }
    cat.add(std::move(t));
  }
}
} // namespace

void Database::open(const std::string &path) {
  if (path == ":memory:") {
    pager_.reset(); // in-memory: no backing file
    return;
  }
  pager_ = std::make_unique<Pager>();
  pager_->open(path);
  load_catalog();
}

void Database::load_catalog() {
  if (is_memory())
    return;
  uint32_t root = pager_->catalog_root();
  if (root == 0)
    return; // freshly created, no tables yet
  std::vector<uint8_t> blob;
  uint32_t pg = root;
  while (pg != 0) {
    uint8_t *p = pager_->get_page(pg);
    uint32_t next = rd32(p);
    uint32_t used = rd32(p + 4);
    blob.insert(blob.end(), p + kChainHeader, p + kChainHeader + used);
    pg = next;
  }
  deserialize_catalog(blob, catalog_);
}

void Database::persist_catalog() {
  if (is_memory())
    return;
  // Free the existing catalog chain.
  std::vector<uint32_t> old_pages;
  uint32_t pg = pager_->catalog_root();
  while (pg != 0) {
    uint8_t *p = pager_->get_page(pg);
    old_pages.push_back(pg);
    pg = rd32(p);
  }
  for (uint32_t old : old_pages)
    pager_->free_page(old);

  // Write the fresh chain.
  std::vector<uint8_t> blob = serialize_catalog(catalog_);
  const size_t capacity = Pager::kPageSize - kChainHeader;
  uint32_t first = 0, prev = 0;
  size_t off = 0;
  do {
    uint32_t cur = pager_->alloc_page();
    size_t chunk = std::min(capacity, blob.size() - off);
    uint8_t *p = pager_->get_page(cur);
    wr32(p, 0);
    wr32(p + 4, static_cast<uint32_t>(chunk));
    if (chunk)
      std::memcpy(p + kChainHeader, blob.data() + off, chunk);
    pager_->mark_dirty(cur);
    if (first == 0)
      first = cur;
    if (prev != 0) {
      uint8_t *pp = pager_->get_page(prev);
      wr32(pp, cur);
      pager_->mark_dirty(prev);
    }
    prev = cur;
    off += chunk;
  } while (off < blob.size());
  pager_->set_catalog_root(first);
}

TableStore *Database::store_for(const std::string &name) {
  std::string key = to_lower(name);
  auto it = stores_.find(key);
  if (it != stores_.end())
    return it->second.get();

  const TableDef *def = catalog_.find(name);
  if (!def)
    throw TxnError("no such table: " + name);

  std::unique_ptr<TableStore> store;
  if (is_memory())
    store = std::make_unique<MemoryStore>();
  else
    store = std::make_unique<HeapStore>(pager_.get(), def->root_page);
  TableStore *raw = store.get();
  stores_[key] = std::move(store);
  return raw;
}

void Database::create_table(const TableDef &def) {
  TableDef d = def;
  if (!is_memory()) {
    uint32_t root = pager_->alloc_page();
    HeapStore::init_page(pager_->get_page(root));
    pager_->mark_dirty(root);
    d.root_page = root;
  }
  catalog_.add(d);
  if (is_memory())
    stores_[to_lower(d.name)] = std::make_unique<MemoryStore>();
  else
    persist_catalog();
}

void Database::drop_table(const std::string &name) {
  const TableDef *def = catalog_.find(name);
  if (!def)
    throw TxnError("no such table: " + name);
  if (!is_memory()) {
    // Free the table's heap page chain.
    std::vector<uint32_t> pages;
    uint32_t pg = def->root_page;
    while (pg != 0) {
      uint8_t *p = pager_->get_page(pg);
      pages.push_back(pg);
      pg = rd32(p);
    }
    for (uint32_t f : pages)
      pager_->free_page(f);
  }
  stores_.erase(to_lower(name));
  catalog_.remove(name);
  if (!is_memory())
    persist_catalog();
}

void Database::flush() {
  if (pager_)
    pager_->flush();
}

} // namespace tdb
