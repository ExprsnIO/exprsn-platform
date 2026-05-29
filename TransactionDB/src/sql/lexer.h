// lexer.h - Hand-written scanner turning SQL text into a token stream.
#ifndef TXNDB_SQL_LEXER_H
#define TXNDB_SQL_LEXER_H

#include <string>
#include <vector>

#include "sql/token.h"

namespace tdb {

class Lexer {
public:
  explicit Lexer(std::string src) : src_(std::move(src)) {}

  // Tokenize the entire input, terminated by an EndOfInput token.
  // Throws TxnError on an invalid character / unterminated literal.
  std::vector<Token> tokenize();

private:
  Token next();
  char peek() const { return pos_ < src_.size() ? src_[pos_] : '\0'; }
  char peek2() const { return pos_ + 1 < src_.size() ? src_[pos_ + 1] : '\0'; }
  char advance();
  void skip_ws_and_comments();
  Token make(TokenType t, std::string text);
  [[noreturn]] void fail(const std::string &msg) const;

  std::string src_;
  size_t pos_ = 0;
  int line_ = 1;
  int col_ = 1;
};

} // namespace tdb

#endif // TXNDB_SQL_LEXER_H
