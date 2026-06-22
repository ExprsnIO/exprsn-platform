-- Runs once, on first init of the postgres+postgis volume.
-- The postgis/postgis image already installs PostGIS into template1; this just
-- makes sure the extensions the platform relies on exist in the `exprsn` db.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
