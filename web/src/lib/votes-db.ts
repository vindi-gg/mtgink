import Database from "better-sqlite3";
import path from "path";

const VOTES_DB_PATH = path.join(process.cwd(), "..", "data", "mtgink_votes.db");

let db: Database.Database | null = null;

function initSchema(database: Database.Database) {
  database.exec(`
    -- Migrate: add user_id column if missing
    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  `);

  const applied = database
    .prepare("SELECT name FROM _migrations WHERE name = ?")
    .get("add_votes_user_id");

  if (!applied) {
    // Check if votes table exists and lacks user_id
    const col = database
      .prepare("SELECT * FROM pragma_table_info('votes') WHERE name = 'user_id'")
      .get();
    if (!col) {
      try {
        database.exec("ALTER TABLE votes ADD COLUMN user_id TEXT");
        database.exec("CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id)");
      } catch {
        // Table might not exist yet — will be created below
      }
    }
    database.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run("add_votes_user_id");
  }

  // Migration: create favorites table
  const hasFavorites = database
    .prepare("SELECT name FROM _migrations WHERE name = ?")
    .get("create_favorites");

  if (!hasFavorites) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        user_id TEXT NOT NULL,
        illustration_id TEXT NOT NULL,
        oracle_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, illustration_id)
      );
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    `);
    database.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run("create_favorites");
  }

  // Migration: add vote_source column to votes
  const hasVoteSource = database
    .prepare("SELECT name FROM _migrations WHERE name = ?")
    .get("add_vote_source");

  if (!hasVoteSource) {
    const col = database
      .prepare("SELECT * FROM pragma_table_info('votes') WHERE name = 'vote_source'")
      .get();
    if (!col) {
      try {
        database.exec("ALTER TABLE votes ADD COLUMN vote_source TEXT");
        database.exec("CREATE INDEX IF NOT EXISTS idx_votes_source ON votes(vote_source)");
      } catch {
        // Table might not exist yet
      }
    }
    database.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run("add_vote_source");
  }

  // Migration: create decks table
  const hasDecks = database
    .prepare("SELECT name FROM _migrations WHERE name = ?")
    .get("create_decks");

  if (!hasDecks) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        format TEXT,
        source_url TEXT,
        is_public INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
    `);
    database.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run("create_decks");
  }

  // Migration: create deck_cards table
  const hasDeckCards = database
    .prepare("SELECT name FROM _migrations WHERE name = ?")
    .get("create_deck_cards");

  if (!hasDeckCards) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS deck_cards (
        deck_id TEXT NOT NULL,
        oracle_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        section TEXT NOT NULL DEFAULT 'Mainboard',
        selected_illustration_id TEXT,
        to_buy INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (deck_id, oracle_id),
        FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
    `);
    database.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run("create_deck_cards");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS art_ratings (
      illustration_id TEXT PRIMARY KEY,
      oracle_id TEXT NOT NULL,
      elo_rating REAL NOT NULL DEFAULT 1500,
      vote_count INTEGER NOT NULL DEFAULT 0,
      win_count INTEGER NOT NULL DEFAULT 0,
      loss_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_art_ratings_oracle_id ON art_ratings(oracle_id);
    CREATE INDEX IF NOT EXISTS idx_art_ratings_elo ON art_ratings(elo_rating DESC);

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oracle_id TEXT NOT NULL,
      winner_illustration_id TEXT NOT NULL,
      loser_illustration_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT,
      voted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_votes_oracle_id ON votes(oracle_id);
    CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
    CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);

    CREATE TABLE IF NOT EXISTS popularity_signals (
      illustration_id TEXT NOT NULL,
      source TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (illustration_id, source, signal_type)
    );
  `);
}

export function getVotesDb(): Database.Database {
  if (!db) {
    db = new Database(VOTES_DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}
