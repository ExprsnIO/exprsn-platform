#include "sql/lexer.h"
#include "test_util.h"

using namespace tdb;

int main() {
  {
    Lexer lex("SELECT * FROM users WHERE id >= 10;");
    auto toks = lex.tokenize();
    CHECK_EQ(toks[0].type == TokenType::KwSelect, true);
    CHECK_EQ(toks[1].type == TokenType::Star, true);
    CHECK_EQ(toks[2].type == TokenType::KwFrom, true);
    CHECK_EQ(toks[3].type == TokenType::Identifier, true);
    CHECK_EQ(toks[3].text, std::string("users"));
    CHECK_EQ(toks[4].type == TokenType::KwWhere, true);
    CHECK_EQ(toks[6].type == TokenType::GtEq, true);
    CHECK_EQ(toks[7].type == TokenType::IntLiteral, true);
    CHECK_EQ(toks[7].text, std::string("10"));
    CHECK(toks.back().type == TokenType::EndOfInput);
  }
  {
    // String literal with escaped quote, real number, comments.
    Lexer lex("INSERT /* c */ -- line\n VALUES ('it''s', 3.14)");
    auto toks = lex.tokenize();
    CHECK(toks[0].type == TokenType::KwInsert);
    CHECK(toks[1].type == TokenType::KwValues);
    CHECK(toks[2].type == TokenType::LParen);
    CHECK(toks[3].type == TokenType::StringLiteral);
    CHECK_EQ(toks[3].text, std::string("it's"));
    CHECK(toks[5].type == TokenType::RealLiteral);
    CHECK_EQ(toks[5].text, std::string("3.14"));
  }
  {
    // Blob literal and operators.
    Lexer lex("x'00ff' <> !=");
    auto toks = lex.tokenize();
    CHECK(toks[0].type == TokenType::BlobLiteral);
    CHECK_EQ(toks[0].text, std::string("00ff"));
    CHECK(toks[1].type == TokenType::NotEq);
    CHECK(toks[2].type == TokenType::NotEq);
  }
  // Unterminated string should throw.
  CHECK_THROWS(Lexer("'abc").tokenize());
  return tu::report();
}
