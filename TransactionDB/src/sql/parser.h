// parser.h - Recursive-descent statement parser with a Pratt (precedence-
// climbing) sub-parser for expressions.
#ifndef TXNDB_SQL_PARSER_H
#define TXNDB_SQL_PARSER_H

#include <string>
#include <vector>

#include "sql/ast.h"
#include "sql/token.h"

namespace tdb {

class Parser {
public:
  explicit Parser(std::string sql);

  // Parse all statements in the input. Throws TxnError on a syntax error.
  std::vector<StmtPtr> parse_program();

  // Parse exactly one statement (errors if there is trailing input besides ';').
  StmtPtr parse_single();

private:
  // Statement parsers
  StmtPtr parse_statement();
  StmtPtr parse_create();
  StmtPtr parse_drop();
  StmtPtr parse_insert();
  StmtPtr parse_select();
  StmtPtr parse_update();
  StmtPtr parse_delete();

  // Expression parsers (Pratt)
  ExprPtr parse_expr(int min_bp = 0);
  ExprPtr parse_prefix();
  ExprPtr parse_primary();

  // Token helpers
  const Token &peek() const { return tokens_[pos_]; }
  const Token &peek_next() const;
  bool check(TokenType t) const { return peek().type == t; }
  bool match(TokenType t);
  const Token &advance() { return tokens_[pos_++]; }
  const Token &expect(TokenType t, const char *what);
  std::string expect_identifier(const char *what);
  [[noreturn]] void fail(const std::string &msg) const;

  std::vector<Token> tokens_;
  size_t pos_ = 0;
};

} // namespace tdb

#endif // TXNDB_SQL_PARSER_H
