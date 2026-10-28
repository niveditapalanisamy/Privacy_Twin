from __future__ import annotations
import json
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .engine import DEFAULT_CONFIG, canonical, digest


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


SCHEMA = """
CREATE TABLE IF NOT EXISTS workspace(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS policies(id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL,
 synthetic INTEGER NOT NULL DEFAULT 0, demo_key TEXT UNIQUE, revision INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'registered', error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans(
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), request_id TEXT NOT NULL UNIQUE,
 policy_id TEXT NOT NULL REFERENCES policies(id), source_revision INTEGER NOT NULL, row_count INTEGER NOT NULL,
 field_count INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fields(
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), table_key TEXT NOT NULL, name TEXT NOT NULL,
 availability TEXT NOT NULL DEFAULT 'present', latest_snapshot TEXT, UNIQUE(source_id, table_key, name)
);
CREATE TABLE IF NOT EXISTS snapshots(
 id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), scan_id TEXT NOT NULL REFERENCES scans(id),
 payload TEXT NOT NULL, declaration_id TEXT, declaration_revision INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS declarations(
 id TEXT PRIMARY KEY, target TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(target, revision)
);
CREATE TABLE IF NOT EXISTS reviews(
 id TEXT PRIMARY KEY, field_id TEXT NOT NULL REFERENCES fields(id), scope TEXT NOT NULL,
 outcome TEXT NOT NULL, selected_class TEXT, rationale TEXT NOT NULL, reviewer TEXT NOT NULL,
 snapshot_id TEXT NOT NULL REFERENCES snapshots(id), declaration_id TEXT REFERENCES declarations(id),
 dependencies TEXT NOT NULL, relies_on_meaning INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_review ON reviews(field_id, scope) WHERE state IN ('current','reopened','missing');
CREATE TABLE IF NOT EXISTS events(
 id INTEGER PRIMARY KEY AUTOINCREMENT, field_id TEXT REFERENCES fields(id), review_id TEXT REFERENCES reviews(id),
 scan_id TEXT REFERENCES scans(id), type TEXT NOT NULL, scope TEXT, before_state TEXT, after_state TEXT,
 reason TEXT NOT NULL, comparisons TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evaluations(id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_runs(id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_ai ON ai_runs((1)) WHERE status IN ('running','paused','quota');
CREATE TABLE IF NOT EXISTS ai_proposals(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES ai_runs(id), field_id TEXT NOT NULL REFERENCES fields(id), scope TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, review_id TEXT REFERENCES reviews(id), created_at TEXT NOT NULL, UNIQUE(run_id,field_id,scope));
CREATE TRIGGER IF NOT EXISTS immutable_snapshot_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'Snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_snapshot_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT, 'Snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_declaration_update BEFORE UPDATE ON declarations BEGIN SELECT RAISE(ABORT, 'Declarations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_declaration_delete BEFORE DELETE ON declarations BEGIN SELECT RAISE(ABORT, 'Declarations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_event_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_policy_update BEFORE UPDATE ON policies BEGIN SELECT RAISE(ABORT, 'Policies are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_policy_delete BEFORE DELETE ON policies BEGIN SELECT RAISE(ABORT, 'Policies are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_scan_update BEFORE UPDATE ON scans BEGIN SELECT RAISE(ABORT, 'Scans are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_review_content BEFORE UPDATE OF field_id,scope,outcome,selected_class,rationale,reviewer,snapshot_id,declaration_id,dependencies,relies_on_meaning,created_at ON reviews BEGIN SELECT RAISE(ABORT, 'Review content is immutable'); END;
"""


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.uploads = self.path.parent / "uploads"
        self.uploads.mkdir(exist_ok=True)
        with closing(sqlite3.connect(self.path)) as initial:
            initial.execute("PRAGMA journal_mode=WAL")
            initial.executescript(SCHEMA)
        with self.connection() as c:
            if not c.execute("SELECT id FROM workspace").fetchone():
                c.execute("INSERT INTO workspace VALUES(?)", (str(uuid.uuid4()),))
            policy_id = digest(DEFAULT_CONFIG)
            c.execute("INSERT OR IGNORE INTO policies VALUES(?,?,?)", (policy_id, canonical(DEFAULT_CONFIG), now()))
            c.execute("INSERT OR IGNORE INTO settings VALUES('active_policy',?)", (policy_id,))
        with self.connection() as c:
            self.workspace_id = c.execute("SELECT id FROM workspace").fetchone()[0]

    @contextmanager
    def connection(self, write=False):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=15000")
        try:
            c.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def config(self, c):
        row = c.execute("SELECT p.* FROM policies p JOIN settings s ON s.value=p.id WHERE s.key='active_policy'").fetchone()
        return row["id"], json.loads(row["content"])


def unpack(row, keys=()):
    if row is None:
        return None
    value = dict(row)
    for key in keys:
        value[key] = json.loads(value[key])
    return value


def event(c, field_id, kind, reason, scope=None, review_id=None, scan_id=None, before=None, after=None, comparisons=None):
    c.execute("INSERT INTO events(field_id,review_id,scan_id,type,scope,before_state,after_state,reason,comparisons,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
              (field_id, review_id, scan_id, kind, scope, before, after, reason, canonical(comparisons or []), now()))
