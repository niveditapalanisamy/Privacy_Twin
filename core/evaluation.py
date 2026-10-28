"""Reproducible local evaluation. Labels are fixtures, never invented metrics."""
import copy
import json
import uuid
from pathlib import Path

from .engine import CLASSES, analyze, canonical, compare, digest, projection
from .storage import now

CASES = Path(__file__).resolve().parent.parent / "evaluation" / "cases.json"


def evaluate(service, cases=None):
    with service.store.connection() as c:
        policy_id, config = service.store.config(c)
    # Freeze configuration before loading labels. Custom labels must follow the same schema.
    config = json.loads(canonical(config))
    supplied = cases is not None
    cases = cases if supplied else json.loads(CASES.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not 1 <= len(cases) <= 500:
        raise ValueError("Evaluation requires between 1 and 500 labeled field cases")
    results = []
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("field"), str) or len(case["field"]) > 200 or not isinstance(case.get("values"), list) or len(case["values"]) > 1000 or case.get("expected") not in [None, *CLASSES]:
            raise ValueError("Each case needs field, values (at most 1,000), and expected class or null")
        if any(v is not None and (not isinstance(v, (str, int, float)) or len(str(v)) > 2000) for v in case["values"]):
            raise ValueError("Evaluation values must be short scalar values")
        result = analyze(case["field"], case["values"], config)
        results.append(dict(field=case["field"], expected=case["expected"], predicted=result["suggested"], ambiguous=result["ambiguous"], mixed=result["mixed"], stress=bool(case.get("stress"))))
    headline = [r for r in results if not r["stress"]]
    metrics = []
    for family in CLASSES:
        tp = sum(r["predicted"] == family and r["expected"] == family for r in headline)
        fp = sum(r["predicted"] == family and r["expected"] != family for r in headline)
        fn = sum(r["predicted"] != family and r["expected"] == family for r in headline)
        support = sum(r["expected"] == family for r in headline)
        precision = tp/(tp+fp) if tp+fp else 0
        recall = tp/(tp+fn) if tp+fn else 0
        f1 = 2*precision*recall/(precision+recall) if precision+recall else 0
        metrics.append(dict(label=family, precision=precision, recall=recall, f1=f1, support=support, predicted=tp+fp))
    declaration = dict(purpose="Synthetic account operations", retention_duration=3, retention_unit="years", retention_start_trigger="", owner="Demo owner", provenance="Synthetic fixture", meaning="")
    base = analyze("loyalty_id", [f"LOY-{1000+i}" for i in range(50)], config)
    changed = analyze("loyalty_id", [f"910000{i:04d}" if i < 40 else f"LOY-{1000+i}" for i in range(50)], config)
    metadata_changed = declaration | {"retention_start_trigger": "Account closure"}
    replay = []
    for label, snapshot, dec, expected in [
        ("Value-pattern change", changed, declaration, {"classification": True, "metadata": False}),
        ("Metadata-only change", base, metadata_changed, {"classification": False, "metadata": True}),
        ("Identical rescan", base, declaration, {"classification": False, "metadata": False}),
    ]:
        for scope in ("classification", "metadata"):
            changes = compare(projection(base, declaration, config, scope), projection(snapshot, dec, config, scope), scope)
            replay.append(dict(case=label, scope=scope, expected_reopen=expected[scope], actual_reopen=bool(changes), passed=bool(changes)==expected[scope]))
    supported = [m for m in metrics if m["support"]]
    report = dict(id=str(uuid.uuid4()), created_at=now(), policy_id=policy_id, fixture_digest=digest(cases),
                  suite="User-supplied labels" if supplied else "Bundled synthetic regression set", independent_heldout=False,
                  limitations="This is a reproducible regression benchmark, not an independent held-out accuracy claim. Abstentions count as false negatives for supported classes; stress cases are separate.",
                  metrics=metrics, macro_f1=sum(m["f1"] for m in supported)/len(supported) if supported else None,
                  cases=len(headline), abstentions=sum(r["predicted"] is None for r in headline),
                  stress_cases=sum(r["stress"] for r in results), stress_errors=sum(r["predicted"] != r["expected"] for r in results if r["stress"]),
                  results=results, replay=replay,
                  scope_metrics=[dict(scope=s, correct=sum(r["passed"] for r in replay if r["scope"]==s), total=sum(r["scope"]==s for r in replay),
                                      false_reopenings=sum(r["actual_reopen"] and not r["expected_reopen"] for r in replay if r["scope"]==s),
                                      missed_reopenings=sum(not r["actual_reopen"] and r["expected_reopen"] for r in replay if r["scope"]==s)) for s in ("classification", "metadata")])
    with service.store.connection(write=True) as c:
        c.execute("INSERT INTO evaluations VALUES(?,?,?)", (report["id"], canonical(report), now()))
    return report
