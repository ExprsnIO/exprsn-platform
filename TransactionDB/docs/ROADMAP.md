# Roadmap

TransactionDB is built in independently shippable milestones. The guiding
principle is **end-to-end at every step**: the SQL frontend stays stable while
the storage backend is upgraded beneath it (enabled by the `table_store`
abstraction).

| Milestone | Status | Deliverables |
|-----------|--------|--------------|
| **M0** Scaffolding | ✅ done | CMake build, library + CLI + CTest, warning/sanitizer options. |
| **M1** SQL pipeline | ✅ done | Lexer, Pratt/recursive-descent parser, AST, binder, Volcano executor over the `table_store` interface; in-memory backend (`:memory:`). |
| **M2** Persistence | ✅ done | Pager (paged single file), slotted-page heap store, free-list, on-disk record codec, persistent catalog. Data survives reopen. |
| **M3** B-tree | ▢ planned | Clustered B+-tree table storage with ordered cursors and overflow pages, replacing the heap; logarithmic point lookups. |
| **M4** Transactions / durability | ▢ planned | Rollback journal (then WAL), `BEGIN`/`COMMIT`/`ROLLBACK`, crash recovery, ACID, file locking. (The project's namesake.) |
| **M5** Indexes | ▢ planned | `CREATE INDEX`, secondary B-tree indexes, `UNIQUE`/`PRIMARY KEY`, index-driven `WHERE`, basic `EXPLAIN`. |
| **M6** Joins & aggregates | ▢ planned | `INNER`/`LEFT JOIN`, `GROUP BY`/`HAVING`, `COUNT/SUM/AVG/MIN/MAX`, `ORDER BY`, `LIMIT`/`OFFSET`, `DISTINCT`. |
| **M7** SQL breadth | ▢ planned | Subqueries (`IN`/`EXISTS`/scalar), `CASE`, more functions, `ALTER TABLE`, views, foreign keys, prepared-statement parameters, cost-based optimizer. |

## On "full SQL compatibility"

Full ANSI/ISO SQL — or even SQLite parity — is a multi-year, multi-person effort
(SQLite is ~150k lines and explicitly documents the standard features it omits).
TransactionDB therefore targets a **pragmatic, growing subset** rather than the
full standard, using **SQLite as the compatibility north star** (a well-documented
"reasonable subset" with a reusable test corpus). v0.1 (M1–M2) is a genuinely
useful database for embedded CRUD workloads; later milestones broaden the surface
in value order.

### Current v1 limitations

- No transactions yet — each statement auto-commits and `fsync`s (durable, but no
  multi-statement atomicity or rollback). Arriving in M4.
- Heap storage: a single row must fit in one page (no overflow pages yet); freed
  cell space within a page is not compacted. Resolved by M3.
- No secondary indexes — all lookups are sequential scans. Arriving in M5.
- No joins, aggregates, `ORDER BY`, `GROUP BY`, or subqueries. Arriving in M6.
- The C API buffers a statement's full result set in `prepare` (no streaming yet).
