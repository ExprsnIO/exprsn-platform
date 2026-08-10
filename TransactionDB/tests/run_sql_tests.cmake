# Golden SQL-logic test driver (invoked via `cmake -P`).
# Required -D variables: TXNDB_BIN, SQL_FILE, EXPECTED_FILE, DB_ARG.
# Runs:  TXNDB_BIN DB_ARG < SQL_FILE  and compares stdout to EXPECTED_FILE
# (trailing whitespace ignored on both sides).

if(NOT DB_ARG STREQUAL ":memory:")
  file(REMOVE "${DB_ARG}")            # start each file-backed run fresh
endif()

execute_process(
  COMMAND "${TXNDB_BIN}" "${DB_ARG}"
  INPUT_FILE "${SQL_FILE}"
  OUTPUT_VARIABLE actual
  ERROR_VARIABLE errout
  RESULT_VARIABLE rc
)

if(NOT DB_ARG STREQUAL ":memory:")
  file(REMOVE "${DB_ARG}")
endif()

if(NOT rc EQUAL 0)
  message(FATAL_ERROR "CLI exited with code ${rc}\nstderr:\n${errout}")
endif()

file(READ "${EXPECTED_FILE}" expected)
# Normalize trailing whitespace so a stray final newline doesn't fail the test.
string(REGEX REPLACE "[ \t\r\n]+$" "" actual "${actual}")
string(REGEX REPLACE "[ \t\r\n]+$" "" expected "${expected}")

if(NOT actual STREQUAL expected)
  message(FATAL_ERROR
    "Output mismatch for ${SQL_FILE} (db=${DB_ARG})\n"
    "--- expected ---\n${expected}\n"
    "--- actual ---\n${actual}\n"
    "--- stderr ---\n${errout}")
endif()
