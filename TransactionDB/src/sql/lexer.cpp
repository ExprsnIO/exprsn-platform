#include "sql/lexer.h"

#include <cctype>
#include <unordered_map>

#include "common/error.h"

namespace tdb {

namespace {
const std::unordered_map<std::string, TokenType> &keywords() {
  static const std::unordered_map<std::string, TokenType> kw = {
      {"create", TokenType::KwCreate}, {"table", TokenType::KwTable},
      {"drop", TokenType::KwDrop},     {"insert", TokenType::KwInsert},
      {"into", TokenType::KwInto},     {"values", TokenType::KwValues},
      {"select", TokenType::KwSelect}, {"from", TokenType::KwFrom},
      {"where", TokenType::KwWhere},   {"update", TokenType::KwUpdate},
      {"set", TokenType::KwSet},       {"delete", TokenType::KwDelete},
      {"and", TokenType::KwAnd},       {"or", TokenType::KwOr},
      {"not", TokenType::KwNot},       {"null", TokenType::KwNull},
      {"is", TokenType::KwIs},         {"if", TokenType::KwIf},
      {"exists", TokenType::KwExists},
  };
  return kw;
}

std::string to_lower(std::string s) {
  for (char &c : s)
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}
} // namespace

void Lexer::fail(const std::string &msg) const {
  throw TxnError("syntax error at line " + std::to_string(line_) + ":" +
                 std::to_string(col_) + ": " + msg);
}

char Lexer::advance() {
  char c = src_[pos_++];
  if (c == '\n') {
    ++line_;
    col_ = 1;
  } else {
    ++col_;
  }
  return c;
}

Token Lexer::make(TokenType t, std::string text) {
  Token tok;
  tok.type = t;
  tok.text = std::move(text);
  tok.line = line_;
  tok.col = col_;
  return tok;
}

void Lexer::skip_ws_and_comments() {
  while (pos_ < src_.size()) {
    char c = peek();
    if (std::isspace(static_cast<unsigned char>(c))) {
      advance();
    } else if (c == '-' && peek2() == '-') {
      // line comment
      while (pos_ < src_.size() && peek() != '\n')
        advance();
    } else if (c == '/' && peek2() == '*') {
      advance();
      advance();
      while (pos_ < src_.size() && !(peek() == '*' && peek2() == '/'))
        advance();
      if (pos_ < src_.size()) {
        advance();
        advance();
      }
    } else {
      break;
    }
  }
}

std::vector<Token> Lexer::tokenize() {
  std::vector<Token> tokens;
  while (true) {
    Token t = next();
    tokens.push_back(t);
    if (t.type == TokenType::EndOfInput)
      break;
  }
  return tokens;
}

Token Lexer::next() {
  skip_ws_and_comments();
  if (pos_ >= src_.size())
    return make(TokenType::EndOfInput, "");

  char c = peek();

  // Identifiers / keywords / blob literal x'..'
  if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') {
    // Blob literal: x'hex' or X'hex'
    if ((c == 'x' || c == 'X') && peek2() == '\'') {
      advance(); // x
      advance(); // '
      std::string hex;
      while (pos_ < src_.size() && peek() != '\'') {
        char h = advance();
        if (!std::isxdigit(static_cast<unsigned char>(h)))
          fail("invalid hex digit in blob literal");
        hex.push_back(h);
      }
      if (pos_ >= src_.size())
        fail("unterminated blob literal");
      advance(); // closing '
      if (hex.size() % 2 != 0)
        fail("blob literal must have an even number of hex digits");
      return make(TokenType::BlobLiteral, hex);
    }
    std::string ident;
    while (pos_ < src_.size() &&
           (std::isalnum(static_cast<unsigned char>(peek())) || peek() == '_'))
      ident.push_back(advance());
    auto it = keywords().find(to_lower(ident));
    if (it != keywords().end())
      return make(it->second, ident);
    return make(TokenType::Identifier, ident);
  }

  // Quoted identifier: "name"
  if (c == '"') {
    advance();
    std::string ident;
    while (pos_ < src_.size() && peek() != '"')
      ident.push_back(advance());
    if (pos_ >= src_.size())
      fail("unterminated quoted identifier");
    advance();
    return make(TokenType::Identifier, ident);
  }

  // String literal: '...'  ('' is an escaped quote)
  if (c == '\'') {
    advance();
    std::string str;
    while (pos_ < src_.size()) {
      char ch = advance();
      if (ch == '\'') {
        if (peek() == '\'') {
          str.push_back('\'');
          advance();
        } else {
          return make(TokenType::StringLiteral, str);
        }
      } else {
        str.push_back(ch);
      }
    }
    fail("unterminated string literal");
  }

  // Numbers
  if (std::isdigit(static_cast<unsigned char>(c)) ||
      (c == '.' && std::isdigit(static_cast<unsigned char>(peek2())))) {
    std::string num;
    bool is_real = false;
    while (pos_ < src_.size() && std::isdigit(static_cast<unsigned char>(peek())))
      num.push_back(advance());
    if (peek() == '.') {
      is_real = true;
      num.push_back(advance());
      while (pos_ < src_.size() && std::isdigit(static_cast<unsigned char>(peek())))
        num.push_back(advance());
    }
    if (peek() == 'e' || peek() == 'E') {
      is_real = true;
      num.push_back(advance());
      if (peek() == '+' || peek() == '-')
        num.push_back(advance());
      while (pos_ < src_.size() && std::isdigit(static_cast<unsigned char>(peek())))
        num.push_back(advance());
    }
    return make(is_real ? TokenType::RealLiteral : TokenType::IntLiteral, num);
  }

  // Operators / punctuation
  advance();
  switch (c) {
  case '(':
    return make(TokenType::LParen, "(");
  case ')':
    return make(TokenType::RParen, ")");
  case ',':
    return make(TokenType::Comma, ",");
  case ';':
    return make(TokenType::Semicolon, ";");
  case '*':
    return make(TokenType::Star, "*");
  case '.':
    return make(TokenType::Dot, ".");
  case '+':
    return make(TokenType::Plus, "+");
  case '-':
    return make(TokenType::Minus, "-");
  case '/':
    return make(TokenType::Slash, "/");
  case '%':
    return make(TokenType::Percent, "%");
  case '=':
    if (peek() == '=')
      advance();
    return make(TokenType::Eq, "=");
  case '<':
    if (peek() == '=') {
      advance();
      return make(TokenType::LtEq, "<=");
    }
    if (peek() == '>') {
      advance();
      return make(TokenType::NotEq, "<>");
    }
    return make(TokenType::Lt, "<");
  case '>':
    if (peek() == '=') {
      advance();
      return make(TokenType::GtEq, ">=");
    }
    return make(TokenType::Gt, ">");
  case '!':
    if (peek() == '=') {
      advance();
      return make(TokenType::NotEq, "!=");
    }
    fail("unexpected character '!'");
  }
  fail(std::string("unexpected character '") + c + "'");
}

} // namespace tdb
