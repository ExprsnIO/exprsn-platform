// test_util.h - Minimal assert harness for the unit tests (no external deps).
// Each test executable includes this, runs checks via CHECK*/, and returns
// tu::report() from main(); CTest treats a non-zero exit as failure.
#ifndef TXNDB_TEST_UTIL_H
#define TXNDB_TEST_UTIL_H

#include <iostream>
#include <string>

namespace tu {
inline int failures = 0;
inline int checks = 0;
inline int report() {
  if (failures) {
    std::cerr << failures << " FAILED of " << checks << " checks\n";
    return 1;
  }
  std::cout << "OK (" << checks << " checks)\n";
  return 0;
}
} // namespace tu

#define CHECK(cond)                                                                      \
  do {                                                                                   \
    ++tu::checks;                                                                        \
    if (!(cond)) {                                                                       \
      ++tu::failures;                                                                    \
      std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << ": CHECK(" << #cond ")\n";  \
    }                                                                                    \
  } while (0)

#define CHECK_EQ(a, b)                                                                   \
  do {                                                                                   \
    ++tu::checks;                                                                        \
    auto _a = (a);                                                                       \
    auto _b = (b);                                                                       \
    if (!(_a == _b)) {                                                                   \
      ++tu::failures;                                                                    \
      std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << ": " << #a << " == " << #b  \
                << " (" << _a << " vs " << _b << ")\n";                                  \
    }                                                                                    \
  } while (0)

#define CHECK_THROWS(expr)                                                               \
  do {                                                                                   \
    ++tu::checks;                                                                        \
    bool _threw = false;                                                                 \
    try {                                                                                \
      expr;                                                                              \
    } catch (...) {                                                                      \
      _threw = true;                                                                     \
    }                                                                                    \
    if (!_threw) {                                                                       \
      ++tu::failures;                                                                    \
      std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << ": expected throw: " << #expr \
                << "\n";                                                                 \
    }                                                                                    \
  } while (0)

#endif // TXNDB_TEST_UTIL_H
