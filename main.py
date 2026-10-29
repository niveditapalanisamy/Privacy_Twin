from __future__ import annotations

import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from core.adapters import MAX_BYTES
from core.demo import customers, fixtures
from core.evaluation import evaluate
from core.service import Conflict, Service
from core.storage import Store
from core.ai_review import AIReview, RunOptions
from core.report import final_report

BASE = Path(__file__).resolve().parent


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Token(StrictModel):
    expected_snapshot_id: str
    expected_declaration_id: str | None
    expected_policy_id: str


class ReviewIn(Token):
    scope: str
    outcome: str
    selected_class: str | None = None
    rationale: str = Field(min_length=20, max_length=2000)
    reviewer: str = Field(min_length=1, max_length=100)
    relies_on_meaning: bool = False
    evidence_ids: list[str] = Field(default_factory=list, max_length=120)


class DeclarationIn(Token):
    draft: dict[str, Any]
    target_type: str = "field"
    preview_digest: str | None = None


class ConfigIn(StrictModel):
    config: dict[str, Any]
    expected_policy_id: str


class DemoScan(StrictModel):
    version: str = "v1"
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class EvaluationIn(StrictModel):
    cases: list[dict] | None = None


class AIAction(StrictModel):
    action: str


class SensitivityIn(StrictModel):
    snapshot_id: str
    disabled_groups: list[str] = Field(default_factory=list, max_length=3)
    without_checksums: bool = False


class ChallengeIn(StrictModel):
    scenario: str = "all"


def create_app(db_path=None):
    @asynccontextmanager
    async def lifespan(application):
        application.state.ai.recover()
        yield

    app = FastAPI(title="PrivacyTwin", version="2.0.0", lifespan=lifespan)
    service = Service(Store(Path(db_path or os.environ.get("PRIVACYTWIN_DB", BASE / "data" / "workspace.sqlite3"))))
    app.state.service = service
    ai = AIReview(service)
    app.state.ai = ai

    @app.get("/api/ai")
    def ai_status():
        return ai.status()

    @app.post("/api/ai/runs")
    def ai_start(body: RunOptions):
        return ai.start(body)

    @app.get("/api/ai/runs/{run_id}")
    def ai_run(run_id: str):
        return ai.get(run_id)

    @app.post("/api/ai/runs/{run_id}/control")
    def ai_control(run_id: str, body: AIAction):
        return ai.control(run_id, body.action)

    @app.post("/api/ai/proposals/{proposal_id}")
    def ai_proposal(proposal_id: str, body: AIAction):
        return ai.decide(proposal_id, body.action)

    @app.get("/api/final-report")
    def report(format: str = 'html'):
        payload, media, extension = final_report(service, format)
        return Response(payload, media_type=media, headers={"Content-Disposition": f'attachment; filename="privacytwin-final-report{extension}"', "Cache-Control": "no-store"})

    @app.exception_handler(Conflict)
    async def conflict_handler(request, exc):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def missing_handler(request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc).strip("'")})

    @app.exception_handler(ValueError)
    async def invalid_handler(request, exc):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(sqlite3.DatabaseError)
    async def database_handler(request, exc):
        return JSONResponse(status_code=400, content={"detail": "Database operation failed. Check the source format and try again."})

    @app.exception_handler(TimeoutError)
    async def pattern_handler(request, exc):
        return JSONResponse(status_code=400, content={"detail": "A detection pattern exceeded the time limit. Simplify the rule."})

    @app.get("/")
    def home():
        return RedirectResponse("http://127.0.0.1:3000")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "2.0.0", "workspace_id": service.store.workspace_id}

    @app.get("/api/state")
    def state():
        return service.state()

    @app.get("/api/insights")
    def insights(source_id: str | None = None):
        from core.insights import build_insights
        return build_insights(service, source_id)

    @app.get("/api/fields/{field_id}")
    def detail(field_id: str):
        return service.detail(field_id)

    @app.post("/api/fields/{field_id}/sensitivity")
    def experiment(field_id: str, body: SensitivityIn):
        from core.engine import sensitivity
        detail = service.detail(field_id)
        snapshot = next((s for s in detail["snapshots"] if s["id"] == body.snapshot_id), None)
        if snapshot is None:
            raise ValueError("Select an available snapshot for this field")
        return sensitivity(snapshot["payload"], body.disabled_groups, body.without_checksums) | {"snapshot_id": snapshot["id"]}

    @app.get("/api/challenge")
    def challenge_options():
        from core.challenge import SCENARIOS
        return {"scenarios": SCENARIOS}

    @app.post("/api/challenge")
    def challenge(body: ChallengeIn):
        from core.challenge import run_challenge
        return run_challenge(body.scenario)

    @app.post("/api/sources")
    def register(name: str = Form(...), kind: str = Form(...), file: UploadFile = File(...)):
        return service.register(name, kind, file.file.read(MAX_BYTES + 1))

    @app.post("/api/sources/{source_id}/scan")
    def scan(source_id: str, request_id: str = Form(...), file: UploadFile | None = File(None)):
        return service.scan(source_id, request_id, file.file.read(MAX_BYTES + 1) if file else None)

    @app.post("/api/demo/load")
    def load_demo():
        results = []
        for key, name, kind, data in fixtures():
            source = service.register(name, kind, data, demo_key=key)
            if not source["existing"]:
                service.scan(source["id"], str(uuid.uuid4()))
            results.append(source)
        return {"sources": results}

    @app.post("/api/sources/{source_id}/demo-scan")
    def demo_scan(source_id: str, body: DemoScan):
        with service.store.connection() as c:
            source = c.execute("SELECT demo_key FROM sources WHERE id=?", (source_id,)).fetchone()
        if not source or source[0] != "customers":
            raise ValueError("Scenario files are available only for the registered customers demo")
        if body.version not in ("v1", "v2", "renamed"):
            raise ValueError("Unknown scenario")
        return service.scan(source_id, body.request_id, customers(body.version))

    @app.post("/api/fields/{field_id}/reviews")
    def review(field_id: str, body: ReviewIn):
        return service.save_review(field_id, body.model_dump())

    @app.post("/api/fields/{field_id}/declaration/preview")
    def preview(field_id: str, body: DeclarationIn):
        return service.preview_declaration(field_id, body.model_dump())

    @app.post("/api/fields/{field_id}/declaration")
    def declaration(field_id: str, body: DeclarationIn):
        return service.save_declaration(field_id, body.model_dump())

    @app.put("/api/config")
    def configuration(body: ConfigIn):
        return service.save_config(body.config, body.expected_policy_id)

    @app.post("/api/evaluation")
    def evaluation(body: EvaluationIn):
        return evaluate(service, body.cases)

    @app.get("/api/export/{kind}")
    def export(kind: str):
        payload, media, extension = service.export(kind)
        return Response(payload, media_type=media, headers={"Content-Disposition": f'attachment; filename="privacytwin-{kind}{extension}"', "Cache-Control": "no-store"})

    return app


app = create_app()
