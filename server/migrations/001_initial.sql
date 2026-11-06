CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  wechat_openid TEXT NOT NULL UNIQUE,
  wechat_unionid TEXT,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
  ON user_sessions(expires_at);
