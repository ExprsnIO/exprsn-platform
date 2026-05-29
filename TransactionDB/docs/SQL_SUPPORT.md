# SQL support

This page tracks the SQL surface supported by the **current** release (v0.1).
Anything not listed is not yet implemented; see [ROADMAP.md](ROADMAP.md).

## Statements

| Statement | Supported | Notes |
|-----------|-----------|-------|
| `CREATE TABLE name (col TYPE [NOT NULL], …)` | ✅ | `IF NOT EXISTS` supported. Type names map to affinity. |
| `DROP TABLE name` | ✅ | `IF EXISTS` supported. |
| `INSERT INTO t [(cols)] VALUES (…)[, (…)]` | ✅ | Multi-row inserts; omitted columns default to `NULL`. |
| `SELECT cols\|* FROM t [WHERE expr]` | ✅ | Single table. Computed expressions in the select list are allowed. |
| `SELECT <const-expr>` | ✅ | Constant select with no `FROM` (one row). |
| `UPDATE t SET c = expr, … [WHERE expr]` | ✅ | |
| `DELETE FROM t [WHERE expr]` | ✅ | |
| `BEGIN` / `COMMIT` / `ROLLBACK` | ▢ | Planned (M4). |
| `CREATE INDEX`, `JOIN`, `GROUP BY`, `ORDER BY`, subqueries | ▢ | Planned (M5–M7). |

## Data types

`NULL`, `INTEGER` (64-bit), `REAL` (double), `TEXT` (UTF-8), `BLOB`
(`x'..'` hex literals). Typing is flexible (SQLite-style): values carry their own
storage class and a column has a type **affinity** that lightly coerces inserted
values (`INTEGER`/`REAL`/`TEXT`).

## Expressions

- Literals: integer, real, string (`'…'`, `''` escapes a quote), `x'..'` blob, `NULL`.
- Column references (optionally qualified `table.col`).
- Arithmetic: `+ - * / %` (integer `/` truncates; divide-by-zero yields `NULL`).
- Comparisons: `= <> (!=) < <= > >=`.
- Logical: `AND`, `OR`, `NOT` with **three-valued logic** (NULL = unknown).
- `IS NULL`, `IS NOT NULL`.
- Unary `-` / `+`, parentheses.

Operator precedence (high → low): unary `- +` · `* / %` · `+ -` · comparisons /
`IS NULL` · `NOT` · `AND` · `OR`.

## Constraints

- `NOT NULL` is enforced on `INSERT` and `UPDATE`.
- `PRIMARY KEY`, `UNIQUE`, `CHECK`, `FOREIGN KEY` are not yet enforced (M5/M7).

## Comments

`-- line comments` and `/* block comments */` are supported.

## Known limitations

See the [current v1 limitations](ROADMAP.md#current-v1-limitations) section of the
roadmap (no transactions/rollback yet, single-page row size limit, sequential
scans only, no joins/aggregates, buffered result sets).
