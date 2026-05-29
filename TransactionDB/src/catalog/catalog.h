// catalog.h - In-memory schema cache.
//
// The catalog maps table names to their column definitions and (for file-backed
// databases) the root page of their heap storage. For file databases the whole
// catalog is serialized into a page chain on disk (see database.cpp); for
// :memory: databases it lives only here.
#ifndef TXNDB_CATALOG_CATALOG_H
#define TXNDB_CATALOG_CATALOG_H

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include "common/value.h"

namespace tdb {

// Declared column type affinity. ValueType::Null is used to mean "no declared
// type" (BLOB/ANY affinity).
struct ColumnDef {
  std::string name;
  ValueType affinity = ValueType::Null;
  bool not_null = false;
};

struct TableDef {
  std::string name;
  std::vector<ColumnDef> columns;
  uint32_t root_page = 0; // heap root page (file DBs); 0 for in-memory.

  // Index of a column by name, or -1 if absent. Case-insensitive.
  int column_index(const std::string &col) const;
};

class Catalog {
public:
  bool has_table(const std::string &name) const;
  const TableDef *find(const std::string &name) const; // nullptr if absent
  TableDef *find_mut(const std::string &name);

  void add(TableDef table);
  void remove(const std::string &name);

  const std::vector<TableDef> &tables() const { return tables_; }
  void clear() { tables_.clear(); }

private:
  std::vector<TableDef> tables_; // small; linear scan is fine
};

// Parse a textual type name (INTEGER/INT, REAL/FLOAT/DOUBLE, TEXT/VARCHAR/CHAR,
// BLOB) to an affinity. Unknown names default to TEXT affinity (SQLite-ish).
ValueType affinity_from_typename(const std::string &type_name);
const char *typename_from_affinity(ValueType affinity);

} // namespace tdb

#endif // TXNDB_CATALOG_CATALOG_H
