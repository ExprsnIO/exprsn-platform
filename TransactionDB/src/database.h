// database.h - A database connection: owns the catalog, the pager (for file
// databases), and the per-table storage bindings, and persists schema changes.
#ifndef TXNDB_DATABASE_H
#define TXNDB_DATABASE_H

#include <memory>
#include <string>
#include <unordered_map>

#include "catalog/catalog.h"
#include "storage/pager.h"
#include "storage/table_store.h"

namespace tdb {

class Database {
public:
  // Open (creating if needed) the database at `path`. ":memory:" => transient.
  void open(const std::string &path);

  bool is_memory() const { return !pager_; }
  Catalog &catalog() { return catalog_; }

  // Get (lazily binding) the storage for a table. Throws if the table is absent.
  TableStore *store_for(const std::string &name);

  // DDL: create/drop a table, allocating/freeing storage and persisting schema.
  void create_table(const TableDef &def);
  void drop_table(const std::string &name);

  // Persist all buffered changes (data + schema) to disk.
  void flush();

private:
  void load_catalog();  // read persistent catalog (file DBs)
  void persist_catalog(); // rewrite the catalog page chain (file DBs)

  std::unique_ptr<Pager> pager_; // null for :memory:
  Catalog catalog_;
  std::unordered_map<std::string, std::unique_ptr<TableStore>> stores_;
};

} // namespace tdb

#endif // TXNDB_DATABASE_H
