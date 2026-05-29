// token.h - Lexical tokens produced by the lexer.
#ifndef TXNDB_SQL_TOKEN_H
#define TXNDB_SQL_TOKEN_H

#include <string>

namespace tdb {

enum class TokenType {
  // Literals / identifiers
  Identifier,
  IntLiteral,
  RealLiteral,
  StringLiteral,
  BlobLiteral, // x'..' hex blob

  // Keywords
  KwCreate,
  KwTable,
  KwDrop,
  KwInsert,
  KwInto,
  KwValues,
  KwSelect,
  KwFrom,
  KwWhere,
  KwUpdate,
  KwSet,
  KwDelete,
  KwAnd,
  KwOr,
  KwNot,
  KwNull,
  KwIs,
  KwIf,
  KwExists,

  // Punctuation / operators
  LParen,
  RParen,
  Comma,
  Semicolon,
  Star,
  Dot,
  Plus,
  Minus,
  Slash,
  Percent,
  Eq,
  NotEq,
  Lt,
  LtEq,
  Gt,
  GtEq,

  EndOfInput,
};

struct Token {
  TokenType type;
  std::string text; // literal text / identifier name / raw string contents
  int line = 1;
  int col = 1;
};

} // namespace tdb

#endif // TXNDB_SQL_TOKEN_H
