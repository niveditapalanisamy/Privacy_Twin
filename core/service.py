from __future__ import annotations
import csv
import io
import json
import sqlite3
import uuid
from contextlib import nullcontext
from pathlib import Path

from .adapters import MAX_BYTES, read_source
from .engine import analyze, canonical, checklist, clean_declaration, compare, digest, projection, validate_config, LIMITATIONS
from .storage import Store, event, now, unpack


class Conflict(Exception):
    pass


class Service:
    def __init__(self, store: Store):
        self.store = store

    def field(self, c, field_id):
        row = c.execute("SELECT f.*, s.name source_name, s.kind source_kind, s.synthetic FROM fields f JOIN sources s ON s.id=f.source_id WHERE f.id=?", (field_id,)).fetchone()
        if not row:
            raise KeyError("Field not found")
        return dict(row)

    def effective(self, c, field):
        targets = ["field:" + field["id"], "table:" + field["source_id"] + ":" + field["table_key"]]
        for target in targets:
            row = c.execute("SELECT * FROM declarations WHERE target=? ORDER BY revision DESC LIMIT 1", (target,)).fetchone()
            if row:
                return unpack(row, ("payload",)) | {"origin": "field" if target == targets[0] else "table"}
        return dict(id=None, target=targets[0], revision=0, payload=clean_declaration({}), origin="none")

    def snapshot(self, c, snapshot_id):
        return unpack(c.execute("SELECT * FROM snapshots WHERE id=?", (snapshot_id,)).fetchone(), ("payload",))

    def list_sources(self, c):
        return [dict(r) for r in c.execute("SELECT s.id,s.name,s.kind,s.synthetic,s.demo_key,s.revision,s.status,s.error,s.created_at,(SELECT COUNT(*) FROM fields f WHERE f.source_id=s.id AND f.availability='present') field_count,(SELECT row_count FROM scans WHERE source_id=s.id ORDER BY rowid DESC LIMIT 1) row_count,(SELECT created_at FROM scans WHERE source_id=s.id ORDER BY rowid DESC LIMIT 1) last_scan FROM sources s ORDER BY s.created_at")]

    def register(self, name: str, kind: str, data: bytes, demo_key=None):
        if not name.strip() or len(name) > 150:
            raise ValueError("Source name must contain 1–150 characters")
        if len(data) > MAX_BYTES:
            raise ValueError("Upload exceeds 10 MB")
        if kind not in ("CSV", "SQLite"):
            raise ValueError("Choose CSV or SQLite")
        source_id = str(uuid.uuid4())
        path = self.store.uploads / (str(uuid.uuid4()) + ".source")
        path.write_bytes(data)
        try:
            read_source(path, kind)
            with self.store.connection(write=True) as c:
                if demo_key:
                    existing = c.execute("SELECT id FROM sources WHERE demo_key=?", (demo_key,)).fetchone()
                    if existing:
                        path.unlink()
                        return {"id": existing[0], "existing": True}
                c.execute("INSERT INTO sources(id,name,kind,path,synthetic,demo_key,created_at) VALUES(?,?,?,?,?,?,?)",
                          (source_id, name.strip(), kind, str(path), int(bool(demo_key)), demo_key, now()))
            return {"id": source_id, "existing": False}
        except Exception:
            path.unlink(missing_ok=True)
            raise

    def scan(self, source_id: str, request_id: str, replacement: bytes | None = None):
        if not request_id or len(request_id) > 100:
            raise ValueError("A scan request ID is required")
        with self.store.connection() as c:
            previous = c.execute("SELECT * FROM scans WHERE request_id=?", (request_id,)).fetchone()
            if previous:
                if previous["source_id"] != source_id:
                    raise Conflict("Request ID already used for another source")
                return dict(previous) | {"idempotent": True}
            source = unpack(c.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone())
            if not source:
                raise KeyError("Source not found")
            policy_id, config = self.store.config(c)
            prior_scan = c.execute("SELECT id FROM scans WHERE source_id=? ORDER BY rowid DESC LIMIT 1", (source_id,)).fetchone()
            prior_scan_id = prior_scan[0] if prior_scan else None
            # Capture declarations as well: reject concurrent changes before committing analysis.
            declaration_manifest = [tuple(r) for r in c.execute("SELECT id,target FROM declarations ORDER BY rowid")]
        path = Path(source["path"])
        temporary = None
        if replacement is not None:
            if len(replacement) > MAX_BYTES:
                raise ValueError("Upload exceeds 10 MB")
            temporary = self.store.uploads / (str(uuid.uuid4()) + ".source")
            temporary.write_bytes(replacement)
            path = temporary
        try:
            tables = read_source(path, source["kind"])
            analyzed = []
            with self.store.connection() as c:
                for table, (headers, rows) in tables.items():
                    for column, name in enumerate(headers):
                        field_id = str(uuid.uuid5(uuid.UUID(self.store.workspace_id), canonical([source_id, table, name])))
                        field = dict(id=field_id, source_id=source_id, table_key=table, name=name)
                        declaration = self.effective(c, field)
                        result = analyze(name, [row[column] for row in rows], config, declaration["payload"])
                        analyzed.append((field, declaration, result))
            scan_id = str(uuid.uuid4())
            with self.store.connection(write=True) as c:
                existing = c.execute("SELECT * FROM scans WHERE request_id=?", (request_id,)).fetchone()
                if existing:
                    if temporary:
                        temporary.unlink(missing_ok=True)
                    return dict(existing) | {"idempotent": True}
                active_id, _ = self.store.config(c)
                current_source = c.execute("SELECT revision FROM sources WHERE id=?", (source_id,)).fetchone()
                latest_scan = c.execute("SELECT id FROM scans WHERE source_id=? ORDER BY rowid DESC LIMIT 1", (source_id,)).fetchone()
                latest_scan_id = latest_scan[0] if latest_scan else None
                if active_id != policy_id or current_source[0] != source["revision"] or latest_scan_id != prior_scan_id or declaration_manifest != [tuple(r) for r in c.execute("SELECT id,target FROM declarations ORDER BY rowid")]:
                    raise Conflict("Source, declarations or policies changed during analysis. Run the scan again.")
                revision = source["revision"] + int(replacement is not None)
                row_count = sum(len(rows) for _, rows in tables.values())
                c.execute("INSERT INTO scans VALUES(?,?,?,?,?,?,?,?)", (scan_id, source_id, request_id, policy_id, revision, row_count, len(analyzed), now()))
                seen = set()
                for field, declaration, result in analyzed:
                    fid = field["id"]
                    seen.add(fid)
                    snapshot_id = str(uuid.uuid4())
                    c.execute("INSERT OR IGNORE INTO fields(id,source_id,table_key,name) VALUES(?,?,?,?)", (fid, source_id, field["table_key"], field["name"]))
                    c.execute("INSERT INTO snapshots VALUES(?,?,?,?,?,?,?)", (snapshot_id, fid, scan_id, canonical(result), declaration["id"], declaration["revision"], now()))
                    c.execute("UPDATE fields SET latest_snapshot=?, availability='present' WHERE id=?", (snapshot_id, fid))
                    self.reassess(c, field, result, declaration["payload"], config, scan_id)
                for field in c.execute("SELECT * FROM fields WHERE source_id=?", (source_id,)).fetchall():
                    if field["id"] not in seen:
                        c.execute("UPDATE fields SET availability='missing' WHERE id=?", (field["id"],))
                        for review in c.execute("SELECT * FROM reviews WHERE field_id=? AND state IN ('current','reopened')", (field["id"],)).fetchall():
                            c.execute("UPDATE reviews SET state='missing' WHERE id=?", (review["id"],))
                            event(c, field["id"], "missing", "Field absent after a successful source scan", review["scope"], review["id"], scan_id, review["state"], "missing")
                c.execute("UPDATE sources SET path=?,revision=?,status='ready',error=NULL WHERE id=?", (str(path), revision, source_id))
                event(c, None, "scan_committed", f"Scanned {row_count} rows and {len(analyzed)} fields", scan_id=scan_id)
            return dict(id=scan_id, source_id=source_id, row_count=row_count, field_count=len(analyzed), policy_id=policy_id)
        except Exception as exc:
            if temporary:
                temporary.unlink(missing_ok=True)
            if not isinstance(exc, Conflict):
                with self.store.connection(write=True) as c:
                    c.execute("UPDATE sources SET status='failed',error=? WHERE id=?", (str(exc)[:500], source_id))
            raise

    def reassess(self, c, field, result, declaration, config, scan_id=None):
        for row in c.execute("SELECT * FROM reviews WHERE field_id=? AND state!='superseded'", (field["id"],)).fetchall():
            review = unpack(row, ("dependencies",))
            current = projection(result, declaration, config, review["scope"], bool(review["relies_on_meaning"]))
            changes = compare(review["dependencies"], current, review["scope"])
            state = review["state"]
            if changes or state == "missing":
                state = "reopened"
            # A reversion never restores an approval.
            reason = "; ".join(x["reason"] for x in changes) if changes else ("Field returned; a fresh review is required" if review["state"] == "missing" else "Review dependencies unchanged" if state == "current" else "Awaiting a new human review")
            c.execute("UPDATE reviews SET state=? WHERE id=?", (state, review["id"]))
            event(c, field["id"], "preserved" if state == "current" else "reopened", reason, review["scope"], review["id"], scan_id, review["state"], state, changes)

    def inventory(self, c, config):
        items = []
        policy_id, _ = self.store.config(c)
        for row in c.execute("SELECT f.*, s.name source_name, s.kind source_kind FROM fields f JOIN sources s ON s.id=f.source_id ORDER BY s.name,f.table_key,f.name"):
            field = dict(row)
            snapshot = self.snapshot(c, field["latest_snapshot"])
            if not snapshot:
                continue
            declaration = self.effective(c, field)
            reviews = {r["scope"]: dict(r) for r in c.execute("SELECT id,scope,state,outcome,selected_class FROM reviews WHERE field_id=? AND state!='superseded'", (field["id"],))}
            checks = checklist(declaration["payload"], config, declaration["revision"])
            scan_policy = c.execute("SELECT policy_id FROM scans WHERE id=?", (snapshot["scan_id"],)).fetchone()[0]
            items.append(field | {"snapshot_id": snapshot["id"], "scan_id": snapshot["scan_id"], "suggested": snapshot["payload"]["suggested"],
                                  "ambiguous": snapshot["payload"]["ambiguous"], "mixed": snapshot["payload"]["mixed"], "profile": snapshot["payload"]["profile"],
                                  "candidates": snapshot["payload"]["candidates"], "reviews": reviews, "gap_count": sum(x["status"] != "present" for x in checks),
                                  "declaration_revision": declaration["revision"], "policy_stale": scan_policy != policy_id})
        return items

    def state(self):
        with self.store.connection() as c:
            policy_id, config = self.store.config(c)
            items = self.inventory(c, config)
            scans = [dict(r) for r in c.execute("SELECT sc.*, s.name source_name FROM scans sc JOIN sources s ON s.id=sc.source_id ORDER BY sc.rowid DESC LIMIT 30")]
            events = [unpack(r, ("comparisons",)) for r in c.execute("SELECT e.*,f.name field_name,s.name source_name FROM events e LEFT JOIN fields f ON f.id=e.field_id LEFT JOIN sources s ON s.id=f.source_id ORDER BY e.id DESC LIMIT 200")]
            evaluation = c.execute("SELECT payload FROM evaluations ORDER BY rowid DESC LIMIT 1").fetchone()
            return dict(workspace_id=self.store.workspace_id, sources=self.list_sources(c), fields=items, scans=scans, events=events,
                        policy_id=policy_id, config=config, evaluation=json.loads(evaluation[0]) if evaluation else None,
                        totals=dict(fields=len(items), sources=len(self.list_sources(c)), reopened=sum(r["state"] == "reopened" for f in items for r in f["reviews"].values()),
                                    current=sum(r["state"] == "current" for f in items for r in f["reviews"].values()), gaps=sum(f["gap_count"] for f in items)))

    def detail(self, field_id):
        with self.store.connection() as c:
            field = self.field(c, field_id)
            policy_id, config = self.store.config(c)
            snapshots = [unpack(r, ("payload",)) for r in c.execute("SELECT * FROM snapshots WHERE field_id=? ORDER BY rowid DESC LIMIT 50", (field_id,))]
            declaration = self.effective(c, field)
            scan_policy = c.execute("SELECT policy_id FROM scans WHERE id=?", (snapshots[0]["scan_id"],)).fetchone()[0]
            return dict(field=field, snapshots=snapshots, declaration=declaration, checklist=checklist(declaration["payload"], config, declaration["revision"]),
                        reviews=[unpack(r, ("dependencies",)) for r in c.execute("SELECT * FROM reviews WHERE field_id=? ORDER BY rowid DESC", (field_id,))],
                        events=[unpack(r, ("comparisons",)) for r in c.execute("SELECT * FROM events WHERE field_id=? ORDER BY id DESC", (field_id,))],
                        policy_id=policy_id, policy_stale=scan_policy != policy_id,
                        token=dict(expected_snapshot_id=field["latest_snapshot"], expected_declaration_id=declaration["id"], expected_policy_id=policy_id))

    def check_token(self, c, field, token, require_scanned=True):
        policy_id, config = self.store.config(c)
        declaration = self.effective(c, field)
        if token.get("expected_snapshot_id") != field["latest_snapshot"] or token.get("expected_declaration_id") != declaration["id"] or token.get("expected_policy_id") != policy_id:
            raise Conflict("Evidence, declaration or policy changed. Reload the field before saving; your draft is retained.")
        snapshot = self.snapshot(c, field["latest_snapshot"])
        if field["availability"] == "missing":
            raise Conflict("This field is missing from its source")
        scan_policy = c.execute("SELECT policy_id FROM scans WHERE id=?", (snapshot["scan_id"],)).fetchone()[0]
        if require_scanned and scan_policy != policy_id:
            raise Conflict("Configuration changed. Rescan this source before reviewing its evidence.")
        if require_scanned and snapshot["payload"].get("declared_meaning", "") != declaration["payload"].get("meaning", ""):
            raise Conflict("Declared meaning changed. Rescan this source to refresh its candidate evidence.")
        return snapshot, declaration, config

    def save_review(self, field_id, body, c=None):
        if c is None:
            with self.store.connection(write=True) as conn:
                return self.save_review(field_id, body, conn)
        scope, outcome = body["scope"], body["outcome"]
        if scope not in ("classification", "metadata") or outcome not in ("clear", "unresolved", "none"):
            raise ValueError("Invalid scope or outcome")
        rationale, reviewer = body["rationale"].strip(), body["reviewer"].strip()
        if not 20 <= len(rationale) <= 2000 or not 1 <= len(reviewer) <= 100:
            raise ValueError("Enter a reviewer and a rationale of 20–2,000 characters")
        field = self.field(c, field_id)
        snapshot, declaration, config = self.check_token(c, field, body)
        evidence_ids = {e["evidence_id"] for e in snapshot["payload"]["evidence"]}
        selected_evidence = body.get("evidence_ids", [])
        if not set(selected_evidence) <= evidence_ids:
            raise ValueError("Unknown evidence reference")
        selected = body.get("selected_class")
        if scope == "classification" and outcome == "clear" and selected not in [r["label"] for r in snapshot["payload"]["candidates"]]:
            raise ValueError("Choose an evidenced candidate or record an unresolved/none outcome")
        relies = bool(body.get("relies_on_meaning")) or "ev:declared:meaning" in evidence_ids
        deps = projection(snapshot["payload"], declaration["payload"], config, scope, relies)
        deps["selected_evidence"] = selected_evidence
        for old in c.execute("SELECT id,state FROM reviews WHERE field_id=? AND scope=? AND state!='superseded'", (field_id, scope)).fetchall():
            c.execute("UPDATE reviews SET state='superseded' WHERE id=?", (old["id"],))
            event(c, field_id, "superseded", "Replaced by a new review decision", scope, old["id"], before=old["state"], after="superseded")
        review_id = str(uuid.uuid4())
        c.execute("INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (review_id, field_id, scope, outcome, selected if scope == "classification" and outcome == "clear" else None, rationale, reviewer, snapshot["id"], declaration["id"], canonical(deps), int(relies), "current", now()))
        event(c, field_id, "review_saved", rationale, scope, review_id, snapshot["scan_id"], after="current")
        return {"id": review_id}

    def preview_declaration(self, field_id, body, c=None):
        if c is None:
            with self.store.connection() as conn:
                return self.preview_declaration(field_id, body, conn)
        field = self.field(c, field_id)
        snapshot, old, config = self.check_token(c, field, body, require_scanned=False)
        draft = clean_declaration(body["draft"])
        target_type = body.get("target_type", "field")
        if target_type not in ("field", "table"):
            raise ValueError("Choose field or table declaration")
        target = "field:" + field_id if target_type == "field" else "table:" + field["source_id"] + ":" + field["table_key"]
        current = c.execute("SELECT * FROM declarations WHERE target=? ORDER BY revision DESC LIMIT 1", (target,)).fetchone()
        target_revision = current["revision"] if current else 0
        affected = []
        fields = [field] if target_type == "field" else [dict(r) for r in c.execute("SELECT * FROM fields WHERE source_id=? AND table_key=? AND availability='present'", (field["source_id"], field["table_key"]))]
        for f in fields:
            effective = self.effective(c, f)
            if target_type == "table" and effective["origin"] == "field":
                continue
            result = self.snapshot(c, f["latest_snapshot"])["payload"]
            scopes = []
            for review in c.execute("SELECT * FROM reviews WHERE field_id=? AND state='current'", (f["id"],)):
                differences = compare(json.loads(review["dependencies"]), projection(result, draft, config, review["scope"], bool(review["relies_on_meaning"])), review["scope"])
                if differences:
                    scopes.append(review["scope"])
            affected.append(dict(field_id=f["id"], name=f["name"], scopes=scopes))
        token = {k:body.get(k) for k in ("expected_snapshot_id", "expected_declaration_id", "expected_policy_id")}
        preview_digest = digest(dict(draft=draft, target=target, target_revision=target_revision, token=token, affected=affected))
        effective_after = old["payload"] if target_type == "table" and old["origin"] == "field" else draft
        return dict(before=old["payload"], after=effective_after, before_checklist=checklist(old["payload"], config, old["revision"]),
                    after_checklist=checklist(effective_after, config, target_revision+1), affected=affected,
                    target=target, target_revision=target_revision, preview_digest=preview_digest, draft=draft)

    def save_declaration(self, field_id, body):
        with self.store.connection(write=True) as c:
            preview = self.preview_declaration(field_id, body, c)
            if body.get("preview_digest") != preview["preview_digest"]:
                raise Conflict("Draft or affected reviews changed since Preview. Preview again before saving.")
            declaration_id = str(uuid.uuid4())
            revision = preview["target_revision"] + 1
            c.execute("INSERT INTO declarations VALUES(?,?,?,?,?)", (declaration_id, preview["target"], revision, canonical(preview["draft"]), now()))
            _, config = self.store.config(c)
            for affected in preview["affected"]:
                field = self.field(c, affected["field_id"])
                snapshot = self.snapshot(c, field["latest_snapshot"])
                self.reassess(c, field, snapshot["payload"], preview["draft"], config)
            event(c, field_id, "declaration_saved", f"Saved {body.get('target_type', 'field')} declaration revision {revision}")
        return dict(id=declaration_id, revision=revision)

    def save_config(self, config, expected_policy_id):
        validate_config(config)
        policy_id = digest(config)
        with self.store.connection(write=True) as c:
            current, old_config = self.store.config(c)
            if current != expected_policy_id:
                raise Conflict("Configuration changed. Reload settings before saving.")
            c.execute("INSERT OR IGNORE INTO policies VALUES(?,?,?)", (policy_id, canonical(config), now()))
            c.execute("UPDATE settings SET value=? WHERE key='active_policy'", (policy_id,))
            for row in c.execute("SELECT * FROM fields WHERE availability='present'").fetchall():
                field = dict(row)
                snapshot = self.snapshot(c, field["latest_snapshot"])
                if not snapshot:
                    continue
                result = json.loads(canonical(snapshot["payload"]))
                for rid in list(result["relevant_rules"]):
                    r = next((r for r in config["rules"] if r["id"] == rid and r["enabled"]), None)
                    result["relevant_rules"][rid] = digest({k:v for k,v in r.items() if k not in ("label", "note")}) if r else "removed"
                result["scoring"] = {k:config[k] for k in ("weights", "acceptance", "near_tie")}
                self.reassess(c, field, result, self.effective(c, field)["payload"], config)
            event(c, None, "policy_saved", "Updated configuration. Rescan sources to apply detection changes.")
        return {"policy_id": policy_id}

    def export(self, kind, c=None):
        with self.store.connection() if c is None else nullcontext(c) as c:
            if kind == "bundle":
                from .package import evidence_package
                return evidence_package(self, c)
            policy_id, config = self.store.config(c)
            inventory = self.inventory(c, config)
            if kind in ("inventory", "gaps"):
                rows = []
                if kind == "inventory":
                    headers = ["field_id", "source", "table", "field", "suggested", "ambiguous", "availability", "classification", "metadata", "gaps"]
                    for f in inventory:
                        rows.append([f["id"], f["source_name"], f["table_key"], f["name"], f["suggested"], f["ambiguous"], f["availability"], f["reviews"].get("classification", {}).get("state", "unreviewed"), f["reviews"].get("metadata", {}).get("state", "unreviewed"), f["gap_count"]])
                else:
                    headers = ["field_id", "source", "table", "field", "requirement", "status", "reason", "declaration_revision"]
                    for f in inventory:
                        d = self.effective(c, f)
                        for check in checklist(d["payload"], config, d["revision"]):
                            if check["status"] != "present":
                                rows.append([f["id"], f["source_name"], f["table_key"], f["name"], check["key"], check["status"], check["reason"], d["revision"]])
                out = io.StringIO()
                writer = csv.writer(out)
                writer.writerow(headers)
                # Prevent spreadsheet formula execution from uploaded names/declarations.
                writer.writerows([["'"+v if isinstance(v,str) and v.startswith(("=","+","-","@","\t","\r")) else v for v in row] for row in rows])
                return out.getvalue(), "text/csv", ".csv"
            if kind == "evaluation":
                latest = c.execute("SELECT payload FROM evaluations ORDER BY rowid DESC LIMIT 1").fetchone()
                if not latest:
                    raise ValueError("Run an evaluation first")
                return latest[0], "application/json", ".json"
            reviews = [unpack(r, ("dependencies",)) for r in c.execute("SELECT * FROM reviews ORDER BY rowid")]
            events = [unpack(r, ("comparisons",)) for r in c.execute("SELECT * FROM events ORDER BY id")]
            result = dict(format_version="2.0", generated_at=now(), workspace_id=self.store.workspace_id, reviews=reviews, events=events)
            if kind == "passport":
                result.update(sources=self.list_sources(c), inventory=inventory, scans=[dict(r) for r in c.execute("SELECT * FROM scans")],
                              snapshots=[unpack(r, ("payload",)) for r in c.execute("SELECT * FROM snapshots")],
                              declarations=[unpack(r, ("payload",)) for r in c.execute("SELECT * FROM declarations")],
                              policies=[unpack(r, ("content",)) for r in c.execute("SELECT * FROM policies")], active_policy=policy_id,
                              resolver="An explicit field record completely overrides the table record; missing properties stay missing.", limitations=LIMITATIONS)
            elif kind != "history":
                raise KeyError("Unknown export")
            return json.dumps(result, indent=2, ensure_ascii=False), "application/json", ".json"
