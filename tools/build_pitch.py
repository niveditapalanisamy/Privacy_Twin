"""Build presentation artifacts from a fresh synthetic workspace, never the user's database."""
import html
import json
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.challenge import run_challenge
from core.demo import fixtures
from core.evaluation import evaluate
from core.service import Service
from core.storage import Store
from tools.verify_evidence import verify


def build():
    output = ROOT / "docs" / "submission"
    output.mkdir(parents=True, exist_ok=True)
    challenge = run_challenge()
    with tempfile.TemporaryDirectory(prefix="privacytwin-pitch-") as directory:
        service = Service(Store(Path(directory) / "workspace.sqlite3"))
        for key, name, kind, data in fixtures():
            sid = service.register(name, kind, data, demo_key=key)["id"]
            service.scan(sid, str(uuid.uuid4()))
        evaluation = evaluate(service)
        package, _, _ = service.export("bundle")
        (output / "synthetic-evidence.zip").write_bytes(package)
        verification = verify(output / "synthetic-evidence.zip")
        state = service.state()
    for name, report in (("challenge-results", challenge), ("evaluation-results", evaluation), ("package-verification", verification)):
        (output / (name + ".json")).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    esc = html.escape
    metrics = "".join(f"<tr><td>{esc(m['label'])}</td><td>{m['precision']:.3f}</td><td>{m['recall']:.3f}</td><td>{m['support']}</td></tr>" for m in evaluation["metrics"])
    baselines = "".join(f"<tr><td>{esc(b['name'])}</td><td>{b['macro_f1']:.3f}</td><td>{b['stress_errors']} / {b['stress_cases']}</td></tr>" for b in evaluation["baselines"])
    slides = [
        ("01 · THE QUESTION", "Can we still rely on<br>yesterday’s review?", """
          <p class="lead">The column name stayed the same.<br>The values changed. The old approval survived.</p>
          <div class="callout"><b>PrivacyTwin</b><span>Find personal data. Keep its evidence current.</span></div>
          <p class="note">PS-019 · Personal-Data Discovery and Privacy Evidence Inventory</p>"""),
        ("02 · WHAT WE BUILD", "Find it. Explain it. Review it.", f"""
          <div class="cards"><article><b>01</b><h3>Find candidate data</h3><p>CSV and SQLite inspection with configurable detectors across five classes.</p></article>
          <article><b>02</b><h3>Explain the evidence</h3><p>Actual detector counts, competing interpretations and temporary sensitivity experiments.</p></article>
          <article><b>03</b><h3>Keep reviews current</h3><p>Purpose and retention declarations, gap previews and separate review dependencies.</p></article></div>
          <p class="lead small">The generated demo scans {state['totals']['sources']} sources and {state['totals']['fields']} fields. Every count comes from a scan.</p>"""),
        ("03 · THE SIGNATURE MOMENT", "One change. The affected review reopens.", """
          <div class="comparison"><article><span>BEFORE</span><h3>loyalty_id</h3><p>Internal identifier patterns</p><div class="pill green">Classification · current</div><div class="pill green">Metadata · current</div></article>
          <div class="arrow">→</div><article><span>AFTER VALUES CHANGE</span><h3>loyalty_id</h3><p>Mobile-shaped values</p><div class="pill amber">Classification · reopened</div><div class="pill green">Metadata · current</div></article></div>
          <p class="lead small">Unrelated email reviews remain current. Expand the dependency comparison to see why.</p>
          <p class="note">Live challenge: scripted synthetic reviews, real Service lifecycle, disposable database.</p>"""),
        ("04 · LET THE JUDGE CHALLENGE IT", "Choose the change. Inspect the result.", f"""
          <div class="cards"><article><b>{challenge['correct']} / {challenge['total']}</b><h3>Expected states matched</h3><p>Eight executable scenarios, including metadata, rule changes, renames and reversion.</p></article>
          <article><b>{challenge['false_reopenings']}</b><h3>False reopenings</h3><p>Measured across these scripted checks, including unrelated changes.</p></article>
          <article><b>{challenge['missed_reopenings']}</b><h3>Missed reopenings</h3><p>Measured against explicit per-scope expectations.</p></article></div>
          <p class="lead small">Then remove header hints or value evidence. Does the candidate survive—or does the scanner abstain?</p>
          <p class="note">Regression evidence from the reference policy; not a claim about all real-world changes.</p>"""),
        ("05 · MEASURE WHAT WE CLAIM", "Results with denominators—and limits.", f"""
          <div class="metric-tables"><div><h3>Full system · {evaluation['cases']} benchmark fields</h3><table><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>Support</th></tr></thead><tbody>{metrics}</tbody></table></div>
          <div><h3>Same inputs · {evaluation['stress_cases']} separate stress fields</h3><table><thead><tr><th>Method</th><th>Macro F1</th><th>Stress errors</th></tr></thead><tbody>{baselines}</tbody></table><p class="note">Header-only uses weight 1 for headers. Pattern baseline removes Aadhaar/GSTIN checksums. See the exported method for details.</p></div></div>
          <p class="warning">Developer-authored synthetic regression set. Independent human-labelled validation remains required. No general accuracy claim.</p>"""),
        ("06 · SIMPLE ARCHITECTURE, REVIEWABLE EVIDENCE", "Every decision has dependencies.", """
          <div class="pipeline"><div>CSV / SQLite<br><small>Controlled local inputs</small></div><span>→</span><div>Python core<br><small>Profile · detect · score</small></div><span>→</span><div>SQLite evidence<br><small>Snapshots · declarations · reviews</small></div></div>
          <div class="cards compact"><article><h3>Next.js + FastAPI</h3><p>One local workflow. The deterministic core runs without a model API.</p></article><article><h3>Scoped dependencies</h3><p>Compare classification evidence separately from declared purpose and retention.</p></article><article><h3>Portable verification</h3><p>Export evidence and recalculate aggregate scores with the included Python verifier.</p></article></div>
          <p class="note">Optional Gemini assistance calls an external provider. Package hashes establish consistency, not authenticity.</p>"""),
        ("07 · THE TAKEAWAY", "What we observed.<br>Why we concluded it.<br>When to review it again.", """
          <div class="callout"><b>PrivacyTwin</b><span>A living privacy evidence inventory for human review.</span></div>
          <p class="lead small">Discover candidate fields · document purpose and retention · expose gaps · keep decisions attached to their evidence.</p>
          <p class="note">Technical evidence, not a legal compliance determination. Submission report and repository workflow follow the organizer’s requirements.</p>"""),
    ]
    sections = "".join(f'<section class="slide"><header><span>PRIVACYTWIN</span><span>{esc(eyebrow)}</span></header><h1>{title}</h1>{body}<footer><span>Find personal data. Keep its evidence current.</span><span>{i+1} / {len(slides)}</span></footer></section>' for i, (eyebrow, title, body) in enumerate(slides))
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PrivacyTwin · PS-019 pitch</title><style>
      *{box-sizing:border-box}body{margin:0;background:#dcdbe6;color:#25223d;font:18px/1.5 'Segoe UI',Arial,sans-serif}.slide{width:1280px;height:720px;padding:40px 60px;background:radial-gradient(ellipse at 100% 0,#dcf4ee,transparent 55%),#f8f7fc;margin:24px auto;position:relative;overflow:hidden;break-after:page}header,footer{display:flex;justify-content:space-between;gap:20px;font-size:12px;letter-spacing:1.5px;color:#686278}header span:first-child{font-weight:800;color:#6550c7}h1{font-size:48px;line-height:1.12;letter-spacing:-1.8px;max-width:1050px;margin:32px 0 24px}h3{font-size:21px;line-height:1.3;margin:12px 0}p{margin:12px 0}.lead{font-size:26px;line-height:1.55;color:#55516c}.lead.small{font-size:21px}.note{font-size:13px;line-height:1.65;color:#6b657d}.callout{display:flex;align-items:center;gap:26px;background:#30284c;color:white;padding:23px 28px;border-radius:16px;margin:26px 0}.callout b{font-size:28px}.callout span{font-size:21px;color:#d8f3e9}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.cards article{background:white;border:1px solid #e2ddec;border-radius:16px;padding:24px}.cards article>b{font-size:40px;color:#6650cc}.cards p{font-size:17px;color:#625b74}.compact article{padding:18px}.compact p{font-size:16px}.comparison{display:grid;grid-template-columns:1fr 70px 1fr;gap:20px;align-items:center}.comparison article{background:white;border:1px solid #ddd7ed;border-radius:18px;padding:24px}.comparison article>span{font-size:12px;letter-spacing:1px;color:#80798d}.comparison h3{font:32px Consolas,monospace}.comparison p{font-size:17px;color:#6a6278}.arrow{text-align:center;font-size:46px;color:#7562be}.pill{padding:9px 14px;border-radius:9px;font-size:16px;margin:8px 0}.green{background:#e3f6ef;color:#256e57}.amber{background:#fff0d3;color:#91621a}.metric-tables{display:grid;grid-template-columns:1fr 1fr;gap:30px}table{width:100%;border-collapse:collapse;font-size:16px;background:white}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e4dfec}th{font-size:12px;color:#756b89;background:#eee9f8}.metric-tables h3{font-size:19px}.warning{background:#fff0d6;padding:14px 18px;font-size:15px;color:#77521b;border-radius:10px}.pipeline{display:flex;gap:15px;align-items:center;margin:35px 0}.pipeline>div{flex:1;background:#eee8fa;border-radius:12px;padding:20px;font-weight:700}.pipeline small{font-size:13px;font-weight:400}.pipeline>span{font-size:26px;color:#806db8}footer{position:absolute;bottom:27px;left:60px;right:60px;font-size:11px;letter-spacing:0}
      @page{size:13.333333in 7.5in;margin:0}@media print{body{background:white}.slide{margin:0;break-after:page;print-color-adjust:exact;-webkit-print-color-adjust:exact}.slide:last-child{break-after:auto}}@media screen and (max-width:1300px){.slide{margin:12px;transform-origin:top left}}
      </style></head><body>""" + sections + "</body></html>"
    (output / "PrivacyTwin-Pitch.html").write_text(page, encoding="utf-8")
    scenario_rows = "".join(f"<tr><td>{esc(s['title'])}</td><td>{sum(c['passed'] for c in s['checks'])} / {len(s['checks'])}</td><td>{esc(s['expected'])}</td></tr>" for s in challenge["scenarios"])
    source_rows = "".join(f"<tr><td>{esc(s['name'])}</td><td>{esc(s['kind'])}</td><td>{s['field_count']}</td><td>{s['row_count']}</td></tr>" for s in state["sources"])
    technical = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PrivacyTwin technical report draft</title><style>
      @page{{size:A4;margin:18mm}}body{{font:11pt/1.6 'Segoe UI',Arial,sans-serif;color:#28233c;margin:0}}h1{{font-size:27pt;line-height:1.2;color:#503aa2}}h2{{font-size:17pt;color:#503aa2;margin-top:25px}}h3{{font-size:12pt}}table{{border-collapse:collapse;width:100%;font-size:9pt;margin:15px 0}}td,th{{border:1px solid #ded8ea;padding:8px;text-align:left;vertical-align:top}}th{{background:#f0ebf8}}.notice{{background:#fff1d8;padding:15px;border-left:4px solid #c99835}}.small{{font-size:9pt;color:#686077}}pre{{white-space:pre-wrap;font-size:9pt;background:#f4f1f9;padding:14px}}tr,pre{{break-inside:avoid}}h2,h3{{break-after:avoid}}
      </style></head><body>
      <p class="small">PS-019 · Personal-Data Discovery and Privacy Evidence Inventory</p><h1>PrivacyTwin<br>Technical report draft</h1>
      <p><b>Find personal data. Keep its evidence current.</b></p>
      <p class="notice">This draft documents the implemented prototype and a fresh synthetic run. Apply the organizer's Proposed-structure-hackathon.pdf before submission. Team details and independently human-labelled evaluation remain to be supplied.</p>
      <p class="small">Measured run: {esc(evaluation['created_at'])}<br>Frozen detector policy: {esc(evaluation['policy_id'])}<br>Evaluation input digest: {esc(evaluation['fixture_digest'])}</p>
      <h2>1. Problem and implemented scope</h2><p>Structured files and tables can contain candidate personal-data fields with incomplete purpose and retention documentation. A saved human decision can become unreliable after evidence changes. PrivacyTwin inspects synthetic CSV and SQLite data, produces aggregate technical evidence, links explicit declarations, and records classification and metadata reviews with separate dependencies.</p>
      <p>The configured classes are Identity, Contact, Location, Official ID and Demographic. PS-019.pdf requests five predefined classes without enumerating them; the team should confirm this taxonomy with the mentor. The tool makes no automatic lawful-basis determination or universal data-flow inference.</p>
      <h2>2. Architecture and data handling</h2><p>Next.js presents Sources → Rules → Inventory → Reviews → Metadata → Changes → Results. FastAPI coordinates a modular Python core. SQLite stores versioned detector policies, immutable aggregate snapshots, explicit declarations, human reviews and append-only events. Sources are controlled local copies; the SQLite adapter reads source tables with read-only access.</p>
      <p>Within configured limits, each admitted field is scanned in full. Limits are 10 MB per upload, 20,000 rows per table, 100 columns, 25 SQLite tables and 250,000 cells per source. Exact source/table/column keys determine identity. A rename without a mapping creates a new identity. A failed scan preserves committed evidence.</p>
      <p>Raw uploaded files remain in the local source-copy directory; they are not included in aggregate evidence exports. Field names, declarations and reviewer text remain visible in evidence packages. Optional Gemini assistance sends selected aggregate evidence to an external provider; the deterministic scanner, challenge, evaluation and verifier require no model API.</p>
      <h2>3. Detection and evidence</h2><p>Configurable rules combine header hints, full-value patterns, normalization and structural validation. Aadhaar-shaped values use Verhoeff validation; GSTIN-shaped values use a check digit. Format/checksum matches are candidates and do not establish issuance, ownership or personal/business status. Declared field meaning is explicit owner context.</p>
      <p>Within a class and signal group, only the strongest contribution counts, limiting duplicate-rule inflation. Group contributions are weighted and compared to a configured acceptance threshold. Candidate scores, competing interpretations, mixed evidence and unknown states remain visible. These scores are heuristic evidence weights, not calibrated probabilities.</p>
      <p>The sensitivity workbench removes selected signal groups or checksum validation using stored aggregates and the snapshot's frozen scoring policy. Removed weights are not redistributed. Rejected-format counts are retained so checksum ablations can be calculated without rereading raw values. Older snapshots require rescanning for complete validation detail.</p>
      <h2>4. Metadata and ReviewGuard</h2><p>Field declarations completely override table defaults; missing properties stay gaps. The configurable checklist covers declared purpose, retention duration/unit, start trigger, owner and provenance. A draft preview calculates gaps and affected review scopes without a write. Saving requires the matching preview and current revisions.</p>
      <p>Classification reviews depend on candidate evidence, relevant detector revisions and scoring/materiality policies. Metadata reviews depend on explicit declarations and checklist/resolver policies. Reviews reopen only after the corresponding dependency comparison indicates a material change. Reversion never silently reapproves an already reopened decision.</p>
      <pre>for each exact source / table / column:
    resolve explicit declaration and provenance
    profile values and run configured detectors
    group evidence, calculate candidates and retain uncertainty
    save immutable aggregate snapshot
    for each saved review scope:
        compare original dependencies with current dependencies
        preserve / reopen / mark missing, recording the reason
show missing metadata, require human review, export evidence</pre>
      <h2>5. Reproducible synthetic demonstration</h2><p>The artifact builder creates a disposable workspace, scans actual generated files and leaves the user's workspace untouched. The measured run contains {state['totals']['sources']} sources and {state['totals']['fields']} fields. No human approvals are preloaded into this evidence package.</p>
      <table><thead><tr><th>Source</th><th>Format</th><th>Fields</th><th>Rows across tables</th></tr></thead><tbody>{source_rows}</tbody></table>
      <p>The interactive challenge separately creates scripted synthetic reviews through the ordinary Service methods and applies eight controlled changes. Expected review states are specified before observing the result. It checks affected and unrelated reviews, plus the new unreviewed identity after a rename.</p>
      <table><thead><tr><th>Scenario</th><th>Matched checks</th><th>Expected behavior</th></tr></thead><tbody>{scenario_rows}</tbody></table>
      <p><b>{challenge['correct']} / {challenge['total']} states matched; {challenge['false_reopenings']} false reopenings and {challenge['missed_reopenings']} missed reopenings.</b> These are scripted regression results under the reference configuration, not estimates across real-world change distributions.</p>
      <h2>6. Classification evaluation and baselines</h2><p>The developer-authored synthetic set has {evaluation['cases']} benchmark fields and {evaluation['stress_cases']} separate stress fields. Each positive class has support 2 in the benchmark. Precision is TP/(TP+FP); recall is TP/(TP+FN). A positive field with no predicted class counts as a false negative. Macro F1 averages supported classes. This is single-class field evaluation; inherently multi-class fields require separate annotation and evaluation.</p>
      <table><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>Support</th></tr></thead><tbody>{metrics}</tbody></table>
      <table><thead><tr><th>Method</th><th>Benchmark macro F1</th><th>Stress errors / cases</th></tr></thead><tbody>{baselines}</tbody></table>
      <p>{esc(evaluation['baseline_method'])}</p><p class="notice">The small, developer-authored fixtures are insufficient to establish general detection accuracy. They are not independently held-out manual annotation. Follow docs/EVALUATION_PROTOCOL.md to obtain the manually labelled evaluation required by PS-019; retain annotation provenance and freeze rules before testing.</p>
      <h2>7. Portable evidence and verification</h2><p>The evidence ZIP is produced from one database read transaction. It contains the passport, inventory, gaps, history, current configuration, latest evaluation when available, a file manifest and a standalone standard-library Python verifier. The verifier checks SHA-256 file consistency, policy content identifiers, scan/review references and independent aggregate candidate-score replay.</p>
      <p>This generated package replayed {verification['snapshots_replayed']} snapshots across {verification['files']} manifest-listed files. Run <code>python verify_evidence.py synthetic-evidence.zip</code> using the included script. Hashes without an external trusted signature do not establish authenticity, correctness of observations or legal validity.</p>
      <h2>8. Validation, limitations and submission work</h2><p>Backend and browser suites cover adapters, scoped reviews, stale saves, preview purity, exports, responsive navigation, sensitivity, challenge isolation and package alteration detection. The current test run is recorded separately in VERIFICATION.md to distinguish software regression checks from detection evaluation.</p>
      <p>Limits: single-user local deployment; bounded structured input; hand-configured scoring; uncertain person/business linkage; no independent accuracy estimate yet. Optional AI output is explicitly attributed and cannot supply missing owner declarations. The default demo requires no provider availability.</p>
      <p>Before submission: complete independent manual annotation; confirm the taxonomy; add team identities; adapt this report to the official template; complete the required private GitHub collaboration/ownership process; rehearse the five-minute script and record a backup demonstration. This draft does not perform external repository administration.</p>
      <p class="small">Supporting repository artifacts: docs/PITCH.md; docs/EVALUATION_PROTOCOL.md; core/engine.py; core/service.py; core/challenge.py; core/evaluation.py; tools/verify_evidence.py; tests/test_proof.py; web/tests/proof.spec.ts.</p>
      </body></html>"""
    (output / "PrivacyTwin-Technical-Report-Draft.html").write_text(technical, encoding="utf-8")
    print(json.dumps(dict(output=str(output), challenge_checks=challenge["total"], challenge_correct=challenge["correct"],
                          benchmark_fields=evaluation["cases"], stress_fields=evaluation["stress_cases"], verification=verification), indent=2))


if __name__ == "__main__":
    build()
