CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  total_seats INTEGER NOT NULL,
  human_seats INTEGER NOT NULL,
  ai_seats INTEGER NOT NULL,
  werewolf_count INTEGER NOT NULL,
  villager_count INTEGER NOT NULL,
  seer_count INTEGER NOT NULL,
  witch_count INTEGER NOT NULL,
  hunter_count INTEGER NOT NULL,
  config_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner_user_id
  ON rooms(owner_user_id);

CREATE TABLE IF NOT EXISTS room_seats (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  seat_no INTEGER NOT NULL,
  occupant_type TEXT NOT NULL,
  user_id TEXT,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (room_id, seat_no)
);

CREATE INDEX IF NOT EXISTS idx_room_seats_room_id
  ON room_seats(room_id);
