#include "common/varint.h"
#include "storage/record.h"
#include "test_util.h"

using namespace tdb;

int main() {
  // Varint round-trips.
  for (uint64_t v : {0ull, 1ull, 127ull, 128ull, 300ull, 1ull << 40}) {
    std::vector<uint8_t> buf;
    put_uvarint(buf, v);
    size_t pos = 0;
    CHECK_EQ(get_uvarint(buf.data(), buf.size(), &pos), v);
    CHECK_EQ(pos, buf.size());
  }
  for (int64_t v : {0ll, 1ll, -1ll, 12345ll, -98765ll}) {
    std::vector<uint8_t> buf;
    put_svarint(buf, v);
    size_t pos = 0;
    CHECK_EQ(get_svarint(buf.data(), buf.size(), &pos), v);
  }

  // Record round-trip across all storage classes.
  Row row;
  row.push_back(Value::null());
  row.push_back(Value::integer(-42));
  row.push_back(Value::real(3.5));
  row.push_back(Value::text("hello"));
  row.push_back(Value::blob({0, 1, 2, 255}));

  auto bytes = encode_record(row);
  Row decoded = decode_record(bytes.data(), bytes.size());
  CHECK_EQ(decoded.size(), size_t(5));
  CHECK(decoded[0].is_null());
  CHECK_EQ(decoded[1].as_int(), int64_t(-42));
  CHECK(decoded[2].as_real() == 3.5);
  CHECK_EQ(decoded[3].as_text(), std::string("hello"));
  CHECK_EQ(decoded[4].as_blob().size(), size_t(4));
  CHECK_EQ(int(decoded[4].as_blob()[3]), 255);

  // Truncated input throws.
  CHECK_THROWS(decode_record(bytes.data(), 1));
  return tu::report();
}
