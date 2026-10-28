# PrivacyTwin — Same UI + Local Backend

This version uses your uploaded `PrivacyTwin_Frontend_Screens.html` as the frontend, preserving its visual design and eight screens. A local FastAPI backend provides a SQLite event store and CSV demo scanning. It does **not** import Pandas, so the backend's demo scanner avoids the Pandas DLL issue.

## Run on Windows

Open PowerShell in this folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

If PowerShell blocks virtual-environment activation, skip activation and use:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

## API endpoints

- `GET /api/health` — backend health
- `GET /api/state` — local persisted state
- `POST /api/demo/load` — register synthetic demo sources
- `POST /api/demo/scan-v1` — scan synthetic CSV V1
- `POST /api/demo/rescan-v2` — scan changed synthetic CSV V2 and reopen classification reviews
- `POST /api/reviews` — save a scoped review with a rationale
- `POST /api/declaration` — save a declaration revision
- `GET /api/export/passport` — export persisted demo review data as JSON

## Notes

- The uploaded HTML UI design is preserved. Its screen copy and visual layout are unchanged except the small status line that now says it is connected to a local backend.
- Data are synthetic and stored locally in `data/privacytwin.sqlite3`.
- This is a hackathon MVP, not a legal compliance certification or production-ready privacy scanner.
- Detection is heuristic; it does not prove identity, ownership, or legal status.
- The demo CSV scanner uses Python's standard `csv` module and `sqlite3`; it does not require Pandas.
