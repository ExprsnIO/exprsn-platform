# Architecture

TransactionDB is a top-down pipeline split into a **SQL processor** (upper half)
and a **storage engine** (lower half). They communicate only through a narrow
cursor interface, so each half can evolve and be tested independently.

```
            +-----------------------------+
   CLI <--> |  Public C API (txndb.h)     |   extern "C", opaque handles
            +--------------+--------------+
                           |
            +--------------v--------------+
            |  SQL frontend               |   lexer -> Pratt/recursive-descent
            |  (lexer, parser, AST)       |   parser -> AST
            +--------------+--------------+
                           |
            +--------------v--------------+
            |  Executor                   |   Volcano pull operators:
            |  (planner + operators)      |   SeqScan / Filter / Project; DML
            +--------------+--------------+
                           |
            +--------------v--------------+
            |  Catalog                    |   schema (in-memory + persisted)
            +--------------+--------------+
                           |
            +--------------v--------------+   <-- table_store cursor interface
            |  Storage engine             |   MemoryStore | HeapStore (paged)
            |  (pager, heap, record)      |
            +--------------+--------------+
                           |
                       OS file I/O (single file, fsync)
```

## Components

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Public API | `include/txndb.h`, `src/api/txndb.cpp` | Stable C ABI; catches engine exceptions and maps them to status codes. |
| SQL frontend | `src/sql/{lexer,parser}.{h,cpp}`, `ast.h`, `token.h` | Hand-written scanner + recursive-descent parser with a Pratt expression sub-parser, producing an AST. |
| Executor | `src/exec/{executor,operators,evaluator}.{h,cpp}` | Builds and runs a Volcano operator tree for `SELECT`; applies DML directly. Three-valued expression evaluation. |
| Catalog | `src/catalog/catalog.{h,cpp}` | Table/column metadata; the schema cache. |
| Database | `src/database.{h,cpp}` | Connection object; owns the pager, catalog and per-table stores; persists schema. |
| Storage | `src/storage/{pager,heap_store,memory_store,record,table_store}.{h,cpp}` | Paged single-file I/O, slotted-page heap, in-memory backend, and on-disk record codec. |
| Common | `src/common/{value,varint,error}.*` | The dynamic `Value` type, varint codec, error type. |

## Key design seams

- **`table_store` cursor interface** (`storage/table_store.h`) is the load-bearing
  abstraction. The executor depends only on `scan()/insert/update/erase`, so the
  in-memory and paged backends are interchangeable, and a future B-tree backend
  drops in without touching the SQL layers.
- **Volcano operators** (`open/next/close`) compose cleanly toward joins and
  aggregates in later milestones.
- **Schema as data** — for file databases the catalog is serialized into a page
  chain referenced from the database header, so there is no separate schema file.

## On-disk format

- **Page 1** is the header: magic `TXNDB01`, page size, format version, page
  count, free-list head, catalog root page.
- **Heap pages** use an 8-byte header (`next_page`, `slot_count`, `cell_top`), a
  forward-growing slot array and backward-growing cell payloads. Rows are encoded
  by the self-describing record codec (`storage/record.cpp`).
- Freed pages are recycled via an intrusive free-list rooted in the header.

See [ROADMAP.md](ROADMAP.md) for what each milestone adds (B-tree, WAL/journaling
transactions, indexes, joins).
