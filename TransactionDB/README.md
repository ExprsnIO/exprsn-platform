# TransactionDB

A single-file, embeddable **SQL database engine** written in C++17 with a stable
C ABI — in the spirit of SQLite. It parses real SQL, executes it through a
Volcano (pull-based) operator pipeline, and persists data to one file on disk
through a paged storage engine.

> **Status:** v0.1 — a usable, tested foundation (Core CRUD + persistence).
> Transactions, B-tree indexes, joins and aggregates are on the
> [roadmap](docs/ROADMAP.md). "Full SQL compatibility" is the long-term goal,
> approached in milestones; see [docs/SQL_SUPPORT.md](docs/SQL_SUPPORT.md) for
> exactly what is supported today.

## Features (v0.1)

- **SQL**: `CREATE TABLE` / `DROP TABLE` (with `IF [NOT] EXISTS`), `INSERT`,
  `SELECT … WHERE`, `UPDATE … WHERE`, `DELETE … WHERE`.
- **Types**: `NULL`, `INTEGER`, `REAL`, `TEXT`, `BLOB` with SQLite-style flexible
  typing and per-column affinity; `NOT NULL` constraints.
- **Expressions**: arithmetic (`+ - * / %`), comparisons (`= <> < <= > >=`),
  `AND`/`OR`/`NOT`, `IS [NOT] NULL`, parentheses, with full three-valued (NULL)
  logic.
- **Storage**: durable single-file database via a 4 KiB paged storage engine with
  a slotted-page heap and a free-list; an in-memory backend for `:memory:`.
- **Interfaces**: a clean `extern "C"` API ([`include/txndb.h`](include/txndb.h))
  and an interactive CLI/REPL (`txndb`).

## Building

Requires CMake ≥ 3.16 and a C++17 compiler.

```sh
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

Useful options: `-DTXNDB_WERROR=ON` (warnings as errors),
`-DTXNDB_SANITIZE=ON` (ASan/UBSan), `-DTXNDB_BUILD_TESTS=OFF`.

## Using the CLI

```sh
./build/txndb mydata.tdb        # open/create a file database (":memory:" if omitted)
```
```sql
CREATE TABLE users(id INTEGER, name TEXT, score REAL);
INSERT INTO users VALUES (1,'ada',9.5),(2,'alan',8);
SELECT id, name FROM users WHERE id >= 2;
.tables          -- list tables
.schema          -- show CREATE TABLE statements
.exit
```

## Embedding (C API)

```c
#include "txndb.h"

txndb *db;
txndb_open("mydata.tdb", &db);
txndb_exec(db, "CREATE TABLE t(a INTEGER, b TEXT);", NULL, NULL);
txndb_exec(db, "INSERT INTO t VALUES (1,'hi');", NULL, NULL);

txndb_stmt *st;
txndb_prepare(db, "SELECT a, b FROM t;", &st);
while (txndb_step(st) == TXNDB_ROW) {
    printf("%lld %s\n", (long long)txndb_column_int64(st, 0),
           txndb_column_text(st, 1));
}
txndb_finalize(st);
txndb_close(db);
```

Link against the static library `txndb` produced by the build.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — the layered design.
- [Roadmap](docs/ROADMAP.md) — milestones M0–M7.
- [SQL support](docs/SQL_SUPPORT.md) — the supported surface and known limits.

## License

MIT — see [LICENSE](LICENSE).
