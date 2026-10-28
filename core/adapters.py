"""Bounded local adapters. Source databases are opened read-only."""
import csv
import io
import sqlite3
from contextlib import closing
from pathlib import Path

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 20000
MAX_COLUMNS = 100
MAX_CELLS = 250000


def read_source(path: Path, kind: str) -> dict[str, tuple[list[str], list[list]]]:
    try:
        return _read_source(path, kind)
    except (csv.Error, UnicodeError, sqlite3.Error, OSError) as exc:
        raise ValueError(f"Cannot read {kind} source: {exc}") from exc


def _read_source(path: Path, kind: str) -> dict[str, tuple[list[str], list[list]]]:
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("File exceeds the 10 MB upload limit")
    if kind == "CSV":
        text = path.read_text(encoding="utf-8-sig")
        reader = csv.reader(io.StringIO(text), strict=True)
        headers = next(reader, [])
        validate_headers(headers)
        rows = []
        for i, row in enumerate(reader):
            if not row:
                continue
            if len(row) != len(headers):
                raise ValueError(f"CSV row {i+2} has {len(row)} values; expected {len(headers)}")
            rows.append(row)
            check_limits(len(rows), len(headers))
        return {"csv": (headers, rows)}
    if kind != "SQLite":
        raise ValueError("Only CSV and SQLite are supported")
    uri = path.resolve().as_uri() + "?mode=ro"
    result, cells = {}, 0
    with closing(sqlite3.connect(uri, uri=True)) as c:
        c.execute("PRAGMA query_only=ON")
        c.execute("PRAGMA trusted_schema=OFF")
        tables = [row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name")]
        if not tables or len(tables) > 25:
            raise ValueError("SQLite must contain between 1 and 25 ordinary tables")
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            cursor = c.execute(f"SELECT * FROM {quoted} LIMIT {MAX_ROWS+1}")
            headers = [x[0] for x in cursor.description]
            validate_headers(headers)
            rows = [list(row) for row in cursor]
            check_limits(len(rows), len(headers))
            cells += len(rows) * len(headers)
            if cells > MAX_CELLS:
                raise ValueError("Source exceeds the 250,000 cell limit")
            if any(isinstance(v, bytes) for row in rows for v in row):
                raise ValueError("SQLite BLOB fields are not supported")
            result[table] = (headers, rows)
    return result


def validate_headers(headers):
    if not headers or len(headers) > MAX_COLUMNS:
        raise ValueError("A table must have between 1 and 100 columns")
    if any(not h.strip() or len(h) > 200 for h in headers):
        raise ValueError("Column names must be nonempty and at most 200 characters")
    if len(set(headers)) != len(headers):
        raise ValueError("Duplicate column names are not allowed")


def check_limits(rows, columns):
    if rows > MAX_ROWS or rows * columns > MAX_CELLS:
        raise ValueError("Source exceeds 20,000 rows or 250,000 cells; reduce the file size")
