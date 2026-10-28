from __future__ import annotations
import csv
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "privacytwin.sqlite3"
DEMO = BASE / "demo"
app = FastAPI(title="PrivacyTwin Local Backend", version="1.0.0")
app.mount("/demo", StaticFiles(directory=str(DEMO)), name="demo")

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sources(
      source_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, kind TEXT NOT NULL,
      created_at TEXT NOT NULL, synthetic INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS scans(
      scan_id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
      version TEXT NOT NULL, rows_scanned INTEGER NOT NULL,
      fields_scanned INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES sources(source_id)
    );
    CREATE TABLE IF NOT EXISTS field_snapshots(
      scan_id INTEGER NOT NULL, field_name TEXT NOT NULL, profile_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL, PRIMARY KEY(scan_id, field_name),
      FOREIGN KEY(scan_id) REFERENCES scans(scan_id)
    );
    CREATE TABLE IF NOT EXISTS reviews(
      review_id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL,
      outcome TEXT NOT NULL, rationale TEXT NOT NULL, snapshot TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'current', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS declarations(
      revision INTEGER PRIMARY KEY AUTOINCREMENT, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events(
      event_id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    """)
    return c

def read_csv(name: str):
    path = DEMO / name
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError(f"{name} contains no data rows.")
    return rows

def profile_field(field: str, values: list[str]) -> dict[str, Any]:
    nonempty = [str(v).strip() for v in values if str(v).strip()]
    n = len(nonempty)
    email = sum(bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v)) for v in nonempty)
    phone = sum(bool(re.fullmatch(r"(?:\+?91[- ]?)?[6-9]\d{9}", re.sub(r"[ ()]", "", v))) for v in nonempty)
    internal = sum(bool(re.fullmatch(r"[A-Z]{2,5}[-_]?\d{4,12}", v, re.I)) for v in nonempty)
    candidates = []
    for cls, count, evidence in [
        ("Contact", email + phone, "email_or_phone_format"),
        ("Identity", internal, "internal_id_format")
    ]:
        if count:
            candidates.append({"class": cls, "matches": count, "sampled_non_null": n,
                               "score": round(count / n, 4) if n else 0, "evidence": evidence})
    # Header context is a candidate hint only, not a proof.
    if not candidates and any(k in field.lower() for k in ("id", "name", "ref")):
        candidates.append({"class": "Identity", "matches": n, "sampled_non_null": n,
                           "score": 0.3, "evidence": "header_context_only"})
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return {"rows": len(values), "non_null": n, "null_count": len(values)-n,
            "distinct_count": len(set(nonempty)), "candidates": candidates,
            "limitations": ["Heuristic candidate detection only; scores are not probabilities."]}

def scan(version: str):
    filename = "customers_v1.csv" if version == "v1" else "customers_v2.csv"
    rows = read_csv(filename)
    fields = list(rows[0].keys())
    with connect() as c:
        c.execute("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?)",
                  ("demo-customers", "customers.csv", "CSV", now(), 1))
        c.execute("INSERT INTO scans(source_id,version,rows_scanned,fields_scanned,created_at) VALUES(?,?,?,?,?)",
                  ("demo-customers", version, len(rows), len(fields), now()))
        scan_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        for field in fields:
            profile = profile_field(field, [r.get(field, "") for r in rows])
            c.execute("INSERT INTO field_snapshots VALUES(?,?,?,?)",
                      (scan_id, field, json.dumps({k:v for k,v in profile.items() if k not in ("candidates","limitations")}),
                       json.dumps(profile["candidates"])))
        c.execute("INSERT INTO events(event_type,payload_json,created_at) VALUES(?,?,?)",
                  ("scan_committed", json.dumps({"version":version,"scan_id":scan_id}), now()))
    return {"status":"saved locally","scan_id":scan_id,"version":version,
            "rows_scanned":len(rows),"fields_scanned":len(fields),
            "fields":[{"name":f, **profile_field(f,[r.get(f,"") for r in rows])} for f in fields]}

class ReviewIn(BaseModel):
    scope: str
    outcome: str = "clear"
    rationale: str = Field(min_length=20, max_length=2000)
    snapshot: str = "v1"

class DeclarationIn(BaseModel):
    purpose: str
    retention_duration: int
    retention_unit: str
    retention_start_trigger: str
    owner: str
    provenance: str

@app.get("/")
def home():
    return FileResponse(BASE / "index.html")

@app.get("/api/health")
def health():
    return {"status":"ok","database":str(DB),"pandas_required":False}

@app.get("/api/state")
def state():
    with connect() as c:
        return {
            "sources":[dict(r) for r in c.execute("SELECT * FROM sources ORDER BY created_at DESC")],
            "scans":[dict(r) for r in c.execute("SELECT * FROM scans ORDER BY scan_id DESC")],
            "review_count":c.execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
            "declaration_revision":c.execute("SELECT COALESCE(MAX(revision),0) FROM declarations").fetchone()[0]
        }

@app.post("/api/demo/load")
def load_demo():
    with connect() as c:
        c.execute("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?)",
                  ("demo-customers","customers.csv","CSV",now(),1))
        c.execute("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?)",
                  ("demo-accounts","accounts.csv","CSV",now(),1))
        c.execute("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?)",
                  ("demo-employees","employees.csv","CSV",now(),1))
        c.execute("INSERT OR IGNORE INTO sources VALUES(?,?,?,?,?)",
                  ("demo-sqlite","paisakart.db","SQLite",now(),1))
        c.execute("INSERT INTO events(event_type,payload_json,created_at) VALUES(?,?,?)",
                  ("demo_sources_loaded", "{}", now()))
    return {"status":"loaded locally","sources":4}

@app.post("/api/demo/scan-v1")
def scan_v1():
    try:
        return scan("v1")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/demo/rescan-v2")
def scan_v2():
    try:
        result = scan("v2")
        with connect() as c:
            # Only classification reviews are reopened by this material demo change.
            c.execute("UPDATE reviews SET state='reopened' WHERE scope='classification' AND state='current'")
            c.execute("INSERT INTO events(event_type,payload_json,created_at) VALUES(?,?,?)",
                      ("reviewguard_reopened", json.dumps({"reason":"synthetic value-pattern change","scope":"classification"}), now()))
        result["classification_review"] = "reopened if an active classification review existed"
        result["metadata_review"] = "preserved"
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/reviews")
def save_review(body: ReviewIn):
    with connect() as c:
        c.execute("INSERT INTO reviews(scope,outcome,rationale,snapshot,state,created_at) VALUES(?,?,?,?,?,?)",
                  (body.scope, body.outcome, body.rationale, body.snapshot, "current", now()))
        rid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.execute("INSERT INTO events(event_type,payload_json,created_at) VALUES(?,?,?)",
                  ("review_saved", json.dumps({"review_id":rid,"scope":body.scope,"snapshot":body.snapshot}), now()))
    return {"status":"saved","review_id":rid,"scope":body.scope}

@app.post("/api/declaration")
def save_declaration(body: DeclarationIn):
    payload = body.model_dump()
    with connect() as c:
        c.execute("INSERT INTO declarations(payload_json,created_at) VALUES(?,?)",
                  (json.dumps(payload,sort_keys=True),now()))
        revision = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.execute("UPDATE reviews SET state='reopened' WHERE scope='metadata' AND state='current'")
        c.execute("INSERT INTO events(event_type,payload_json,created_at) VALUES(?,?,?)",
                  ("declaration_saved",json.dumps({"revision":revision}),now()))
    return {"status":"saved","revision":revision,"metadata_review":"reopened"}

@app.get("/api/export/passport")
def export_passport():
    with connect() as c:
        scans=[dict(r) for r in c.execute("SELECT * FROM scans ORDER BY scan_id")]
        reviews=[dict(r) for r in c.execute("SELECT * FROM reviews ORDER BY review_id")]
        declarations=[dict(r) for r in c.execute("SELECT * FROM declarations ORDER BY revision")]
    return {"artifact_type":"PrivacyTwin local demo export","synthetic":True,
            "scans":scans,"reviews":reviews,
            "declarations":[{"revision":r["revision"],"payload":json.loads(r["payload_json"])} for r in declarations]}
