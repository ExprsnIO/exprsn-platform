cmake_minimum_required(VERSION 3.16)
project(TransactionDB VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Debug CACHE STRING "" FORCE)
endif()

option(TXNDB_WERROR "Treat warnings as errors" OFF)
option(TXNDB_SANITIZE "Enable Address/UndefinedBehavior sanitizers" OFF)
option(TXNDB_BUILD_TESTS "Build the test suite" ON)

# --- Warnings / sanitizers -------------------------------------------------
add_library(txndb_flags INTERFACE)
if(MSVC)
  target_compile_options(txndb_flags INTERFACE /W4)
  if(TXNDB_WERROR)
    target_compile_options(txndb_flags INTERFACE /WX)
  endif()
else()
  target_compile_options(txndb_flags INTERFACE -Wall -Wextra -Wpedantic)
  if(TXNDB_WERROR)
    target_compile_options(txndb_flags INTERFACE -Werror)
  endif()
  if(TXNDB_SANITIZE)
    target_compile_options(txndb_flags INTERFACE -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(txndb_flags INTERFACE -fsanitize=address,undefined)
  endif()
endif()

# --- Core library ----------------------------------------------------------
add_library(txndb STATIC
  src/common/value.cpp
  src/common/varint.cpp
  src/sql/lexer.cpp
  src/sql/parser.cpp
  src/catalog/catalog.cpp
  src/storage/record.cpp
  src/storage/pager.cpp
  src/storage/memory_store.cpp
  src/storage/heap_store.cpp
  src/exec/evaluator.cpp
  src/exec/operators.cpp
  src/exec/executor.cpp
  src/database.cpp
  src/api/txndb.cpp
)
target_include_directories(txndb
  PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(txndb PRIVATE txndb_flags)

# --- CLI shell -------------------------------------------------------------
add_executable(txndb_cli cli/shell.cpp)
set_target_properties(txndb_cli PROPERTIES OUTPUT_NAME txndb)
target_include_directories(txndb_cli PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(txndb_cli PRIVATE txndb txndb_flags)

# --- Tests -----------------------------------------------------------------
if(TXNDB_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
