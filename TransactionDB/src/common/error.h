// error.h - Internal error type. The engine throws TxnError on any failure;
// the public C API boundary (src/api/txndb.cpp) catches it and converts it into
// a status code plus an error message string.
#ifndef TXNDB_COMMON_ERROR_H
#define TXNDB_COMMON_ERROR_H

#include <stdexcept>
#include <string>

namespace tdb {

class TxnError : public std::runtime_error {
public:
  explicit TxnError(const std::string &msg) : std::runtime_error(msg) {}
};

} // namespace tdb

#endif // TXNDB_COMMON_ERROR_H
