/*
 * txndb.h - Public C API for TransactionDB.
 *
 * TransactionDB is a single-file, embeddable SQL database engine. This header
 * is the only public interface; everything under src/ is private. The API is a
 * stable C ABI (usable from C, C++, and via FFI from other languages) and is
 * intentionally modeled on the familiar SQLite prepare/step/column workflow.
 */
#ifndef TXNDB_H
#define TXNDB_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Result / status codes returned by the API. */
#define TXNDB_OK 0    /* Operation succeeded. */
#define TXNDB_ERROR 1 /* Generic error; call txndb_errmsg() for details. */
#define TXNDB_MISUSE 2 /* API used incorrectly (e.g. NULL handle). */
#define TXNDB_ROW 100  /* txndb_step(): a new result row is available. */
#define TXNDB_DONE 101 /* txndb_step(): statement finished, no more rows. */

/* Column / value storage classes. */
#define TXNDB_NULL 0
#define TXNDB_INTEGER 1
#define TXNDB_REAL 2
#define TXNDB_TEXT 3
#define TXNDB_BLOB 4

/* Opaque handles. */
typedef struct txndb txndb;           /* A database connection. */
typedef struct txndb_stmt txndb_stmt; /* A prepared statement / result set. */

/*
 * Open (creating if necessary) the database at `filename`. Use the special
 * name ":memory:" for a transient in-memory database. On success *out_db is set
 * and TXNDB_OK returned; otherwise an error code is returned and *out_db is NULL.
 */
int txndb_open(const char *filename, txndb **out_db);

/* Close a connection and release all resources. Safe to call with NULL. */
int txndb_close(txndb *db);

/*
 * Row callback used by txndb_exec(). `ncols` is the column count, `values` the
 * text rendering of each column (NULL for SQL NULL), and `names` the column
 * names. Return non-zero to abort execution. May be NULL if results are unused.
 */
typedef int (*txndb_exec_cb)(void *user, int ncols, char **values, char **names);

/*
 * Compile and run one or more semicolon-separated SQL statements. For each
 * result row of a SELECT, `cb` is invoked (if non-NULL). Returns TXNDB_OK on
 * success or an error code; on error use txndb_errmsg(db) for the message.
 */
int txndb_exec(txndb *db, const char *sql, txndb_exec_cb cb, void *user);

/*
 * Compile a single SQL statement and execute it, buffering any result rows.
 * Iterate the rows with txndb_step()/txndb_column_*; release with
 * txndb_finalize(). (v1 buffers the full result set internally.)
 */
int txndb_prepare(txndb *db, const char *sql, txndb_stmt **out_stmt);

/* Advance to the next row. Returns TXNDB_ROW, TXNDB_DONE, or an error code. */
int txndb_step(txndb_stmt *stmt);

/* Number of result columns for the current statement. */
int txndb_column_count(txndb_stmt *stmt);

/* Name of column `i` (0-based), or NULL if out of range. */
const char *txndb_column_name(txndb_stmt *stmt, int i);

/* Storage class (TXNDB_NULL/INTEGER/REAL/TEXT/BLOB) of column `i` in the row. */
int txndb_column_type(txndb_stmt *stmt, int i);

/* Typed accessors for the current row's column `i`. */
int64_t txndb_column_int64(txndb_stmt *stmt, int i);
double txndb_column_double(txndb_stmt *stmt, int i);
const char *txndb_column_text(txndb_stmt *stmt, int i);
const void *txndb_column_blob(txndb_stmt *stmt, int i, int *out_len);

/* Release a prepared statement. Safe to call with NULL. */
int txndb_finalize(txndb_stmt *stmt);

/* Rows changed by the most recent INSERT/UPDATE/DELETE on this connection. */
int txndb_changes(txndb *db);

/* Most recent human-readable error message for `db` (never NULL). */
const char *txndb_errmsg(txndb *db);

/* Library version string, e.g. "0.1.0". */
const char *txndb_libversion(void);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* TXNDB_H */
