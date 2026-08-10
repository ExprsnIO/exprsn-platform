// shell.cpp - Interactive REPL / script runner for TransactionDB.
//
// Usage: txndb [database-file]   (defaults to :memory:)
// Reads SQL from stdin. Statements are terminated by ';'. Lines beginning with
// '.' are meta-commands (.tables, .schema, .help, .exit). SELECT results are
// printed as pipe-separated rows with a header line; NULLs render as "NULL".
// In non-interactive (piped) mode, prompts and DML notices are suppressed so
// output is stable for golden tests; errors always go to stderr.
#include <iostream>
#include <string>
#include <vector>

#include <unistd.h>

#include "common/error.h"
#include "database.h"
#include "exec/executor.h"
#include "sql/parser.h"

using namespace tdb;

namespace {
bool g_interactive = false;

void print_result(const ExecResult &r) {
  if (!r.is_query)
    return;
  for (size_t i = 0; i < r.columns.size(); ++i) {
    if (i)
      std::cout << '|';
    std::cout << r.columns[i];
  }
  std::cout << '\n';
  for (const Row &row : r.rows) {
    for (size_t i = 0; i < row.size(); ++i) {
      if (i)
        std::cout << '|';
      std::cout << (row[i].is_null() ? "NULL" : row[i].to_display());
    }
    std::cout << '\n';
  }
}

// Find the index of the statement-terminating ';' in `buf` that lies outside
// string literals and comments, or std::string::npos if none is complete.
size_t find_stmt_end(const std::string &buf) {
  bool in_str = false, line_comment = false, block_comment = false;
  for (size_t i = 0; i < buf.size(); ++i) {
    char c = buf[i];
    char n = (i + 1 < buf.size()) ? buf[i + 1] : '\0';
    if (line_comment) {
      if (c == '\n')
        line_comment = false;
      continue;
    }
    if (block_comment) {
      if (c == '*' && n == '/') {
        block_comment = false;
        ++i;
      }
      continue;
    }
    if (in_str) {
      if (c == '\'') {
        if (n == '\'')
          ++i; // escaped quote
        else
          in_str = false;
      }
      continue;
    }
    if (c == '\'') {
      in_str = true;
    } else if (c == '-' && n == '-') {
      line_comment = true;
      ++i;
    } else if (c == '/' && n == '*') {
      block_comment = true;
      ++i;
    } else if (c == ';') {
      return i;
    }
  }
  return std::string::npos;
}

bool is_blank(const std::string &s) {
  for (char c : s)
    if (!std::isspace(static_cast<unsigned char>(c)))
      return false;
  return true;
}

void run_sql(Database &db, const std::string &sql) {
  try {
    Parser parser(sql);
    auto stmts = parser.parse_program();
    for (const auto &stmt : stmts) {
      ExecResult res = execute_statement(stmt.get(), db);
      db.flush();
      print_result(res);
      if (g_interactive && !res.is_query)
        std::cerr << res.changes << " row(s) affected\n";
    }
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << "\n";
  }
}

void meta_command(Database &db, const std::string &line) {
  std::string cmd = line;
  // strip trailing whitespace
  while (!cmd.empty() && std::isspace(static_cast<unsigned char>(cmd.back())))
    cmd.pop_back();
  if (cmd == ".exit" || cmd == ".quit") {
    db.flush();
    std::exit(0);
  } else if (cmd == ".tables") {
    for (const TableDef &t : db.catalog().tables())
      std::cout << t.name << "\n";
  } else if (cmd == ".schema") {
    for (const TableDef &t : db.catalog().tables()) {
      std::cout << "CREATE TABLE " << t.name << " (";
      for (size_t i = 0; i < t.columns.size(); ++i) {
        if (i)
          std::cout << ", ";
        std::cout << t.columns[i].name << " " << typename_from_affinity(t.columns[i].affinity);
        if (t.columns[i].not_null)
          std::cout << " NOT NULL";
      }
      std::cout << ");\n";
    }
  } else if (cmd == ".help") {
    std::cerr << ".tables          List tables\n"
                 ".schema          Show CREATE TABLE statements\n"
                 ".exit / .quit    Exit\n";
  } else {
    std::cerr << "Error: unknown command: " << cmd << "\n";
  }
}
} // namespace

int main(int argc, char **argv) {
  std::string path = (argc > 1) ? argv[1] : ":memory:";
  g_interactive = isatty(STDIN_FILENO);

  Database db;
  try {
    db.open(path);
  } catch (const std::exception &e) {
    std::cerr << "Error: cannot open '" << path << "': " << e.what() << "\n";
    return 1;
  }

  if (g_interactive)
    std::cerr << "TransactionDB shell. Enter SQL terminated by ';'. .help for commands.\n";

  std::string buffer;
  std::string line;
  if (g_interactive)
    std::cerr << "txndb> ";
  while (std::getline(std::cin, line)) {
    if (buffer.empty() && !line.empty() && line[0] == '.') {
      meta_command(db, line);
      if (g_interactive)
        std::cerr << "txndb> ";
      continue;
    }
    buffer += line;
    buffer += '\n';
    size_t end;
    while ((end = find_stmt_end(buffer)) != std::string::npos) {
      std::string stmt = buffer.substr(0, end + 1);
      buffer.erase(0, end + 1);
      if (!is_blank(stmt))
        run_sql(db, stmt);
    }
    if (g_interactive)
      std::cerr << "txndb> ";
  }
  // Execute any trailing statement that lacked a final ';'.
  if (!is_blank(buffer))
    run_sql(db, buffer);

  db.flush();
  return 0;
}
