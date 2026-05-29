#include "catalog/catalog.h"

#include <algorithm>
#include <cctype>

namespace tdb {

namespace {
std::string to_lower(const std::string &s) {
  std::string out = s;
  std::transform(out.begin(), out.end(), out.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return out;
}
bool iequals(const std::string &a, const std::string &b) {
  return to_lower(a) == to_lower(b);
}
} // namespace

int TableDef::column_index(const std::string &col) const {
  for (size_t i = 0; i < columns.size(); ++i)
    if (iequals(columns[i].name, col))
      return static_cast<int>(i);
  return -1;
}

bool Catalog::has_table(const std::string &name) const { return find(name) != nullptr; }

const TableDef *Catalog::find(const std::string &name) const {
  for (const TableDef &t : tables_)
    if (iequals(t.name, name))
      return &t;
  return nullptr;
}

TableDef *Catalog::find_mut(const std::string &name) {
  for (TableDef &t : tables_)
    if (iequals(t.name, name))
      return &t;
  return nullptr;
}

void Catalog::add(TableDef table) { tables_.push_back(std::move(table)); }

void Catalog::remove(const std::string &name) {
  tables_.erase(std::remove_if(tables_.begin(), tables_.end(),
                               [&](const TableDef &t) { return iequals(t.name, name); }),
                tables_.end());
}

ValueType affinity_from_typename(const std::string &type_name) {
  std::string t = to_lower(type_name);
  if (t.find("int") != std::string::npos)
    return ValueType::Integer;
  if (t.find("real") != std::string::npos || t.find("floa") != std::string::npos ||
      t.find("doub") != std::string::npos)
    return ValueType::Real;
  if (t.find("char") != std::string::npos || t.find("text") != std::string::npos ||
      t.find("clob") != std::string::npos)
    return ValueType::Text;
  if (t.find("blob") != std::string::npos || t.empty())
    return ValueType::Null; // no affinity / BLOB
  return ValueType::Text;
}

const char *typename_from_affinity(ValueType affinity) {
  switch (affinity) {
  case ValueType::Integer:
    return "INTEGER";
  case ValueType::Real:
    return "REAL";
  case ValueType::Text:
    return "TEXT";
  case ValueType::Blob:
  case ValueType::Null:
    return "BLOB";
  }
  return "BLOB";
}

} // namespace tdb
