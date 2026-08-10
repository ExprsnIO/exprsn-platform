#include "sql/parser.h"

#include <optional>

#include "common/error.h"
#include "sql/lexer.h"

namespace tdb {

namespace {
struct Bp {
  int lbp;
  int rbp;
};

// Binding powers for infix operators (left-associative: rbp = lbp + 1).
std::optional<Bp> infix_bp(BinOp op) {
  switch (op) {
  case BinOp::Or:
    return Bp{10, 11};
  case BinOp::And:
    return Bp{20, 21};
  case BinOp::Eq:
  case BinOp::NotEq:
  case BinOp::Lt:
  case BinOp::LtEq:
  case BinOp::Gt:
  case BinOp::GtEq:
    return Bp{30, 31};
  case BinOp::Add:
  case BinOp::Sub:
    return Bp{40, 41};
  case BinOp::Mul:
  case BinOp::Div:
  case BinOp::Mod:
    return Bp{50, 51};
  }
  return std::nullopt;
}

std::optional<BinOp> token_to_binop(TokenType t) {
  switch (t) {
  case TokenType::Plus:
    return BinOp::Add;
  case TokenType::Minus:
    return BinOp::Sub;
  case TokenType::Star:
    return BinOp::Mul;
  case TokenType::Slash:
    return BinOp::Div;
  case TokenType::Percent:
    return BinOp::Mod;
  case TokenType::Eq:
    return BinOp::Eq;
  case TokenType::NotEq:
    return BinOp::NotEq;
  case TokenType::Lt:
    return BinOp::Lt;
  case TokenType::LtEq:
    return BinOp::LtEq;
  case TokenType::Gt:
    return BinOp::Gt;
  case TokenType::GtEq:
    return BinOp::GtEq;
  case TokenType::KwAnd:
    return BinOp::And;
  case TokenType::KwOr:
    return BinOp::Or;
  default:
    return std::nullopt;
  }
}

Value::Blob hex_to_bytes(const std::string &hex) {
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9')
      return c - '0';
    if (c >= 'a' && c <= 'f')
      return c - 'a' + 10;
    return c - 'A' + 10;
  };
  Value::Blob b;
  b.reserve(hex.size() / 2);
  for (size_t i = 0; i + 1 < hex.size(); i += 2)
    b.push_back(static_cast<uint8_t>((nibble(hex[i]) << 4) | nibble(hex[i + 1])));
  return b;
}
} // namespace

Parser::Parser(std::string sql) {
  Lexer lex(std::move(sql));
  tokens_ = lex.tokenize();
}

void Parser::fail(const std::string &msg) const {
  const Token &t = peek();
  throw TxnError("syntax error at line " + std::to_string(t.line) + ":" +
                 std::to_string(t.col) + ": " + msg +
                 (t.type == TokenType::EndOfInput ? " (at end of input)"
                                                  : " (near '" + t.text + "')"));
}

const Token &Parser::peek_next() const {
  size_t n = pos_ + 1 < tokens_.size() ? pos_ + 1 : tokens_.size() - 1;
  return tokens_[n];
}

bool Parser::match(TokenType t) {
  if (check(t)) {
    ++pos_;
    return true;
  }
  return false;
}

const Token &Parser::expect(TokenType t, const char *what) {
  if (!check(t))
    fail(std::string("expected ") + what);
  return advance();
}

std::string Parser::expect_identifier(const char *what) {
  if (!check(TokenType::Identifier))
    fail(std::string("expected ") + what);
  return advance().text;
}

std::vector<StmtPtr> Parser::parse_program() {
  std::vector<StmtPtr> stmts;
  while (!check(TokenType::EndOfInput)) {
    if (match(TokenType::Semicolon))
      continue;
    stmts.push_back(parse_statement());
    if (!check(TokenType::EndOfInput))
      expect(TokenType::Semicolon, "';' between statements");
  }
  return stmts;
}

StmtPtr Parser::parse_single() {
  StmtPtr s = parse_statement();
  match(TokenType::Semicolon);
  if (!check(TokenType::EndOfInput))
    fail("expected a single statement");
  return s;
}

StmtPtr Parser::parse_statement() {
  switch (peek().type) {
  case TokenType::KwCreate:
    return parse_create();
  case TokenType::KwDrop:
    return parse_drop();
  case TokenType::KwInsert:
    return parse_insert();
  case TokenType::KwSelect:
    return parse_select();
  case TokenType::KwUpdate:
    return parse_update();
  case TokenType::KwDelete:
    return parse_delete();
  default:
    fail("expected a statement (CREATE, DROP, INSERT, SELECT, UPDATE, DELETE)");
  }
}

StmtPtr Parser::parse_create() {
  expect(TokenType::KwCreate, "CREATE");
  expect(TokenType::KwTable, "TABLE");
  auto stmt = std::make_unique<CreateTableStmt>();
  if (match(TokenType::KwIf)) {
    expect(TokenType::KwNot, "NOT");
    expect(TokenType::KwExists, "EXISTS");
    stmt->if_not_exists = true;
  }
  stmt->table = expect_identifier("table name");
  expect(TokenType::LParen, "'(' before column list");
  do {
    ColumnSpec col;
    col.name = expect_identifier("column name");
    // Optional type name, possibly with (size) we accept and ignore.
    if (check(TokenType::Identifier)) {
      col.type_name = advance().text;
      if (match(TokenType::LParen)) {
        while (!check(TokenType::RParen) && !check(TokenType::EndOfInput))
          advance();
        expect(TokenType::RParen, "')' after type size");
      }
    }
    // Column constraints (v1: NOT NULL only).
    while (match(TokenType::KwNot)) {
      expect(TokenType::KwNull, "NULL after NOT");
      col.not_null = true;
    }
    stmt->columns.push_back(std::move(col));
  } while (match(TokenType::Comma));
  expect(TokenType::RParen, "')' after column list");
  if (stmt->columns.empty())
    fail("table must have at least one column");
  return stmt;
}

StmtPtr Parser::parse_drop() {
  expect(TokenType::KwDrop, "DROP");
  expect(TokenType::KwTable, "TABLE");
  auto stmt = std::make_unique<DropTableStmt>();
  if (match(TokenType::KwIf)) {
    expect(TokenType::KwExists, "EXISTS");
    stmt->if_exists = true;
  }
  stmt->table = expect_identifier("table name");
  return stmt;
}

StmtPtr Parser::parse_insert() {
  expect(TokenType::KwInsert, "INSERT");
  expect(TokenType::KwInto, "INTO");
  auto stmt = std::make_unique<InsertStmt>();
  stmt->table = expect_identifier("table name");
  if (match(TokenType::LParen)) {
    do {
      stmt->columns.push_back(expect_identifier("column name"));
    } while (match(TokenType::Comma));
    expect(TokenType::RParen, "')' after column list");
  }
  expect(TokenType::KwValues, "VALUES");
  do {
    expect(TokenType::LParen, "'(' before value tuple");
    std::vector<ExprPtr> tuple;
    do {
      tuple.push_back(parse_expr());
    } while (match(TokenType::Comma));
    expect(TokenType::RParen, "')' after value tuple");
    stmt->rows.push_back(std::move(tuple));
  } while (match(TokenType::Comma));
  return stmt;
}

StmtPtr Parser::parse_select() {
  expect(TokenType::KwSelect, "SELECT");
  auto stmt = std::make_unique<SelectStmt>();
  do {
    SelectItem item;
    if (match(TokenType::Star)) {
      item.star = true;
    } else {
      item.expr = parse_expr();
    }
    stmt->items.push_back(std::move(item));
  } while (match(TokenType::Comma));
  if (match(TokenType::KwFrom))
    stmt->from = expect_identifier("table name");
  if (match(TokenType::KwWhere))
    stmt->where = parse_expr();
  return stmt;
}

StmtPtr Parser::parse_update() {
  expect(TokenType::KwUpdate, "UPDATE");
  auto stmt = std::make_unique<UpdateStmt>();
  stmt->table = expect_identifier("table name");
  expect(TokenType::KwSet, "SET");
  do {
    Assignment a;
    a.column = expect_identifier("column name");
    expect(TokenType::Eq, "'=' in assignment");
    a.value = parse_expr();
    stmt->assignments.push_back(std::move(a));
  } while (match(TokenType::Comma));
  if (match(TokenType::KwWhere))
    stmt->where = parse_expr();
  return stmt;
}

StmtPtr Parser::parse_delete() {
  expect(TokenType::KwDelete, "DELETE");
  expect(TokenType::KwFrom, "FROM");
  auto stmt = std::make_unique<DeleteStmt>();
  stmt->table = expect_identifier("table name");
  if (match(TokenType::KwWhere))
    stmt->where = parse_expr();
  return stmt;
}

// ----------------------------- Expressions -----------------------------
ExprPtr Parser::parse_expr(int min_bp) {
  ExprPtr left = parse_prefix();
  while (true) {
    // Postfix: IS [NOT] NULL
    if (check(TokenType::KwIs)) {
      const int is_lbp = 30;
      if (is_lbp < min_bp)
        break;
      advance(); // IS
      bool negated = match(TokenType::KwNot);
      expect(TokenType::KwNull, "NULL after IS");
      left = std::make_unique<IsNullExpr>(std::move(left), negated);
      continue;
    }
    auto op = token_to_binop(peek().type);
    if (!op)
      break;
    auto bp = infix_bp(*op);
    if (!bp || bp->lbp < min_bp)
      break;
    advance();
    ExprPtr right = parse_expr(bp->rbp);
    left = std::make_unique<BinaryExpr>(*op, std::move(left), std::move(right));
  }
  return left;
}

ExprPtr Parser::parse_prefix() {
  if (match(TokenType::KwNot))
    return std::make_unique<UnaryExpr>(UnaryOp::Not, parse_expr(25));
  if (match(TokenType::Minus))
    return std::make_unique<UnaryExpr>(UnaryOp::Negate, parse_expr(55));
  if (match(TokenType::Plus))
    return parse_expr(55); // unary plus is a no-op
  return parse_primary();
}

ExprPtr Parser::parse_primary() {
  const Token &t = peek();
  switch (t.type) {
  case TokenType::IntLiteral:
    advance();
    return std::make_unique<LiteralExpr>(Value::integer(std::stoll(t.text)));
  case TokenType::RealLiteral:
    advance();
    return std::make_unique<LiteralExpr>(Value::real(std::stod(t.text)));
  case TokenType::StringLiteral:
    advance();
    return std::make_unique<LiteralExpr>(Value::text(t.text));
  case TokenType::BlobLiteral:
    advance();
    return std::make_unique<LiteralExpr>(Value::blob(hex_to_bytes(t.text)));
  case TokenType::KwNull:
    advance();
    return std::make_unique<LiteralExpr>(Value::null());
  case TokenType::Identifier: {
    std::string name = advance().text;
    // Optional qualifier: table.column -> keep the column part.
    if (match(TokenType::Dot))
      name = expect_identifier("column name after '.'");
    return std::make_unique<ColumnRefExpr>(std::move(name));
  }
  case TokenType::LParen: {
    advance();
    ExprPtr e = parse_expr();
    expect(TokenType::RParen, "')'");
    return e;
  }
  default:
    fail("expected an expression");
  }
}

} // namespace tdb
