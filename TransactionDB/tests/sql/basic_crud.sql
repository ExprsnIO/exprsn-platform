CREATE TABLE users (id INTEGER, name TEXT, score REAL);
INSERT INTO users VALUES (1, 'ada', 9.5);
INSERT INTO users VALUES (2, 'alan', 8);
INSERT INTO users VALUES (3, 'grace', 7.5);
SELECT id, name FROM users WHERE id >= 2;
UPDATE users SET score = score + 1 WHERE id = 1;
DELETE FROM users WHERE name = 'alan';
SELECT id, name, score FROM users;
