#include "sql/parser.h"
#include "test_util.h"

using namespace tdb;

int main() {
  // CREATE TABLE with types and NOT NULL.
  {
    Parser p("CREATE TABLE t (id INTEGER NOT NULL, name TEXT, score REAL);");
    auto s = p.parse_single();
    auto *c = dynamic_cast<CreateTableStmt *>(s.get());
    CHECK(c != nullptr);
    CHECK_EQ(c->table, std::string("t"));
    CHECK_EQ(c->columns.size(), size_t(3));
    CHECK_EQ(c->columns[0].name, std::string("id"));
    CHECK(c->columns[0].not_null);
    CHECK(!c->columns[1].not_null);
  }
  // INSERT multiple tuples.
  {
    Parser p("INSERT INTO t (id, name) VALUES (1, 'a'), (2, 'b');");
    auto s = p.parse_single();
    auto *ins = dynamic_cast<InsertStmt *>(s.get());
    CHECK(ins != nullptr);
    CHECK_EQ(ins->columns.size(), size_t(2));
    CHECK_EQ(ins->rows.size(), size_t(2));
    CHECK_EQ(ins->rows[1].size(), size_t(2));
  }
  // SELECT with WHERE.
  {
    Parser p("SELECT id, name FROM t WHERE id >= 2 AND name <> 'x';");
    auto s = p.parse_single();
    auto *sel = dynamic_cast<SelectStmt *>(s.get());
    CHECK(sel != nullptr);
    CHECK_EQ(sel->items.size(), size_t(2));
    CHECK_EQ(sel->from, std::string("t"));
    CHECK(sel->where != nullptr);
    // Top of WHERE should be AND.
    auto *top = dynamic_cast<BinaryExpr *>(sel->where.get());
    CHECK(top != nullptr && top->op == BinOp::And);
  }
  // Expression precedence: 1 + 2 * 3 -> + at top, * on the right.
  {
    Parser p("SELECT 1 + 2 * 3;");
    auto s = p.parse_single();
    auto *sel = dynamic_cast<SelectStmt *>(s.get());
    auto *add = dynamic_cast<BinaryExpr *>(sel->items[0].expr.get());
    CHECK(add != nullptr && add->op == BinOp::Add);
    auto *mul = dynamic_cast<BinaryExpr *>(add->right.get());
    CHECK(mul != nullptr && mul->op == BinOp::Mul);
  }
  // IS NULL / IS NOT NULL.
  {
    Parser p("SELECT 1 FROM t WHERE name IS NOT NULL;");
    auto s = p.parse_single();
    auto *sel = dynamic_cast<SelectStmt *>(s.get());
    auto *isn = dynamic_cast<IsNullExpr *>(sel->where.get());
    CHECK(isn != nullptr && isn->negated);
  }
  // UPDATE / DELETE.
  {
    Parser p("UPDATE t SET score = score + 1 WHERE id = 1;");
    auto s = p.parse_single();
    auto *u = dynamic_cast<UpdateStmt *>(s.get());
    CHECK(u != nullptr);
    CHECK_EQ(u->assignments.size(), size_t(1));
  }
  {
    Parser p("DELETE FROM t WHERE id = 5;");
    auto s = p.parse_single();
    auto *d = dynamic_cast<DeleteStmt *>(s.get());
    CHECK(d != nullptr);
  }
  // Program with multiple statements.
  {
    Parser p("CREATE TABLE a (x INT); INSERT INTO a VALUES (1);");
    auto prog = p.parse_program();
    CHECK_EQ(prog.size(), size_t(2));
  }
  // Syntax errors.
  CHECK_THROWS(Parser("SELECT FROM;").parse_single());
  CHECK_THROWS(Parser("CREATE TABLE t ();").parse_single());
  return tu::report();
}
