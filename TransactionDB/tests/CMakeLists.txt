# Unit tests (one executable each).
set(UNIT_TESTS
  test_value
  test_lexer
  test_parser
  test_record
  test_pager
  test_storage
  test_endtoend)

foreach(t ${UNIT_TESTS})
  add_executable(${t} ${t}.cpp)
  target_link_libraries(${t} PRIVATE txndb txndb_flags)
  target_include_directories(${t} PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR})
  add_test(NAME ${t} COMMAND ${t})
endforeach()

# Golden SQL-logic tests: each sql/<case>.sql is run through the CLI against
# both an in-memory and a file-backed database; stdout is diffed against
# sql/<case>.expected. Adding a test is just adding the two files.
file(GLOB SQL_CASES ${CMAKE_CURRENT_SOURCE_DIR}/sql/*.sql)
foreach(sqlfile ${SQL_CASES})
  get_filename_component(case ${sqlfile} NAME_WE)
  set(expected ${CMAKE_CURRENT_SOURCE_DIR}/sql/${case}.expected)
  foreach(backend memory file)
    if(backend STREQUAL "memory")
      set(dbarg ":memory:")
    else()
      set(dbarg "${CMAKE_CURRENT_BINARY_DIR}/${case}_file.db")
    endif()
    add_test(NAME sql_${case}_${backend}
      COMMAND ${CMAKE_COMMAND}
        -DTXNDB_BIN=$<TARGET_FILE:txndb_cli>
        -DSQL_FILE=${sqlfile}
        -DEXPECTED_FILE=${expected}
        -DDB_ARG=${dbarg}
        -P ${CMAKE_CURRENT_SOURCE_DIR}/run_sql_tests.cmake)
  endforeach()
endforeach()
