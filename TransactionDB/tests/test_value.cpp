#include "common/value.h"
#include "test_util.h"

using namespace tdb;

int main() {
  // Type tags.
  CHECK(Value::null().is_null());
  CHECK(Value::integer(5).is_integer());
  CHECK(Value::real(1.5).is_real());
  CHECK(Value::text("hi").is_text());
  CHECK(Value::integer(5).is_numeric());

  // Display.
  CHECK_EQ(Value::integer(42).to_display(), std::string("42"));
  CHECK_EQ(Value::null().to_display(), std::string("NULL"));
  CHECK_EQ(Value::text("abc").to_display(), std::string("abc"));

  // Numeric comparison (int vs real interoperate).
  CHECK(*Value::integer(1).compare(Value::integer(2)) < 0);
  CHECK(*Value::real(2.0).compare(Value::integer(2)) == 0);
  CHECK(*Value::integer(3).compare(Value::real(2.5)) > 0);

  // NULL comparison yields no value (three-valued logic).
  CHECK(!Value::null().compare(Value::integer(1)).has_value());
  CHECK(!Value::integer(1).compare(Value::null()).has_value());

  // Text comparison.
  CHECK(*Value::text("a").compare(Value::text("b")) < 0);
  CHECK(*Value::text("b").compare(Value::text("b")) == 0);

  // order_less: NULLs sort first.
  CHECK(Value::null().order_less(Value::integer(0)));
  CHECK(!Value::integer(0).order_less(Value::null()));

  return tu::report();
}
