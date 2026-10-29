"""Deterministic, configurable field analysis. No records are persisted here."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import date
from typing import Any

import regex as re

CLASSES = ["Identity", "Contact", "Location", "Official ID", "Demographic"]
SAMPLING = {"id": "full-scan-v1", "null_policy": "empty or whitespace only", "order_independent": True}
LIMITATIONS = [
    "Format and checksum matches do not establish issuance, identity or ownership.",
    "Scores are weighted evidence, not probabilities.",
    "Metadata completeness is not a legal compliance verdict.",
]


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def rule(id, label, family, pattern="", headers="", normalizer="trim", check="", note="Format evidence only"):
    return dict(id=id, label=label, family=family, pattern=pattern, headers=headers,
                normalizer=normalizer, check=check, enabled=True, note=note)


DEFAULT_CONFIG = {
    "rules": [
        rule("email", "Email address", "Contact", r"[^@\s]+@[^@\s]+\.[^@\s]+", r"email|contact"),
        rule("phone_in", "Indian mobile number", "Contact", r"(?:\+?91)?[6-9]\d{9}", r"phone|mobile|contact", "phone"),
        rule("internal_id", "Internal identifier", "Identity", r"[A-Z]{2,5}[-_]\d{4,12}", r"(^|_)(id|ref)(_|$)|loyalty", note="Internal IDs require person or account context"),
        rule("person_name", "Person-name context", "Identity", headers=r"(^|_)(name|customer_name|employee_name|full_name)(_|$)", note="Header context alone; confirm the field meaning"),
        rule("postal_in", "Indian postal code", "Location", r"[1-9]\d{5}", r"pin_code|postal|postcode|pincode", note="Six digits can also represent an internal code"),
        rule("address", "Address context", "Location", headers=r"address|street|city"),
        rule("aadhaar", "Aadhaar format + checksum", "Official ID", r"[2-9]\d{11}", r"aadhaar|aadhar", "digits", "verhoeff", "Checksum validity does not prove issuance"),
        rule("pan", "PAN format", "Official ID", r"[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]", r"pan", "upper", note="Holder type and person/entity linkage require context"),
        rule("gstin", "GSTIN format + checksum", "Official ID", r"[0-3]\d[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", r"gstin|gst_number", "upper", "gstin", "Business registration may link to a sole proprietor"),
        rule("birth_date", "Date of birth", "Demographic", r"\d{4}-\d{2}-\d{2}", r"(^|_)(dob|birth_date|date_of_birth)(_|$)", "trim", "birth_date", "Only explicit birth-date context supports this interpretation"),
        rule("age", "Age", "Demographic", r"\d{1,3}", r"(^|_)age(_|$)", "trim", "age", "Requires explicit age context"),
    ],
    "weights": {"name_hint": 0.20, "value_format": 0.50, "declared_context": 0.30},
    "acceptance": 0.25,
    "near_tie": 0.12,
    "materiality": {"rate_delta": 0.10, "minimum_denominator": 10},
    "checklist": ["purpose", "retention", "retention_start_trigger", "owner", "provenance"],
}


def validate_config(config: dict) -> dict:
    if not isinstance(config, dict) or set(config) != set(DEFAULT_CONFIG):
        raise ValueError("Configuration must include rules, weights, acceptance, near_tie, materiality and checklist")
    if not isinstance(config["rules"], list) or not 1 <= len(config["rules"]) <= 60:
        raise ValueError("Use between 1 and 60 detection rules")
    ids = set()
    for r in config["rules"]:
        if not isinstance(r, dict) or set(r) != set(DEFAULT_CONFIG["rules"][0]):
            raise ValueError("Each rule must contain id, label, family, pattern, headers, normalizer, check, enabled and note")
        if any(not isinstance(r[k], str) for k in ("id", "label", "family", "pattern", "headers", "normalizer", "check", "note")):
            raise ValueError("Rule properties must be text, except for the enabled flag")
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,49}", r["id"]) or r["id"] in ids:
            raise ValueError("Rule IDs must be unique lowercase identifiers")
        ids.add(r["id"])
        if r["family"] not in CLASSES or r["normalizer"] not in ("trim", "upper", "phone", "digits"):
            raise ValueError("Invalid rule family or normalization")
        if r["check"] not in ("", "verhoeff", "gstin", "age", "birth_date") or type(r["enabled"]) is not bool:
            raise ValueError("Invalid rule check or enabled flag")
        for key in ("label", "note", "pattern", "headers"):
            if not isinstance(r[key], str) or len(r[key]) > 500:
                raise ValueError("Rule text must be at most 500 characters")
        if not r["pattern"] and not r["headers"]:
            raise ValueError("A rule needs a value pattern or header pattern")
        try:
            re.compile(r["pattern"])
            re.compile(r["headers"])
        except re.error as exc:
            raise ValueError(f"Invalid expression in rule {r['id']}: {exc}") from exc
    weights = config["weights"]
    if not isinstance(weights, dict) or set(weights) != set(DEFAULT_CONFIG["weights"]) or any(type(x) not in (float, int) or not 0 <= x <= 1 for x in weights.values()):
        raise ValueError("All three group weights must be between 0 and 1")
    if abs(sum(weights.values()) - 1) > 0.00001:
        raise ValueError("Group weights must add up to 1")
    for key in ("acceptance", "near_tie"):
        if type(config[key]) not in (float, int) or not 0 < config[key] <= 1:
            raise ValueError(f"{key} must be greater than 0 and at most 1")
    m = config["materiality"]
    if not isinstance(m, dict) or set(m) != {"rate_delta", "minimum_denominator"} or type(m["rate_delta"]) not in (int, float) or not 0 < m["rate_delta"] <= 1 or type(m["minimum_denominator"]) is not int or not 1 <= m["minimum_denominator"] <= 1000:
        raise ValueError("Invalid materiality policy")
    if not isinstance(config["checklist"], list) or not config["checklist"] or any(not isinstance(k, str) for k in config["checklist"]) or len(set(config["checklist"])) != len(config["checklist"]) or any(k not in DEFAULT_CONFIG["checklist"] for k in config["checklist"]):
        raise ValueError("Checklist must contain unique supported requirement keys")
    return config


def verhoeff(value: str) -> bool:
    d = ((0,1,2,3,4,5,6,7,8,9),(1,2,3,4,0,6,7,8,9,5),(2,3,4,0,1,7,8,9,5,6),(3,4,0,1,2,8,9,5,6,7),(4,0,1,2,3,9,5,6,7,8),(5,9,8,7,6,0,4,3,2,1),(6,5,9,8,7,1,0,4,3,2),(7,6,5,9,8,2,1,0,4,3),(8,7,6,5,9,3,2,1,0,4),(9,8,7,6,5,4,3,2,1,0))
    p = ((0,1,2,3,4,5,6,7,8,9),(1,5,7,6,2,8,3,0,9,4),(5,8,0,3,7,9,6,1,4,2),(8,9,1,6,0,4,3,5,2,7),(9,4,5,3,1,2,6,8,7,0),(4,2,8,6,5,7,3,9,0,1),(2,7,9,3,8,0,6,4,1,5),(7,0,4,6,9,1,3,2,5,8))
    c = 0
    for i, n in enumerate(reversed(value)):
        c = d[c][p[i % 8][int(n)]]
    return c == 0


def checksum(value: str, kind: str) -> bool:
    if kind == "verhoeff":
        return bool(re.fullmatch(r"[0-9]+", value)) and verhoeff(value)
    if kind == "gstin":
        alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        if len(value) != 15 or any(ch not in alphabet for ch in value):
            return False
        total, factor = 0, 2
        for ch in reversed(value[:-1]):
            product = alphabet.index(ch) * factor
            total += product // 36 + product % 36
            factor = 1 if factor == 2 else 2
        return alphabet[(36 - total % 36) % 36] == value[-1]
    if kind == "age":
        return bool(re.fullmatch(r"[0-9]{1,3}", value)) and 0 <= int(value) <= 120
    if kind == "birth_date":
        try:
            date.fromisoformat(value)
            return True
        except ValueError:
            return False
    return True


def score_evidence(evidence: list[dict], scoring: dict) -> dict:
    """One scoring path for scans, baselines and read-only sensitivity experiments."""
    candidates = []
    for family in CLASSES:
        grouped = {g: max([e["strength"] for e in evidence if e["candidate_class"] == family and e["group"] == g] or [0]) for g in scoring["weights"]}
        contributions = {g: round(v * scoring["weights"][g], 6) for g, v in grouped.items()}
        score = round(sum(contributions.values()), 6)
        if score:
            candidates.append(dict(label=family, score=score, contributions=contributions))
    candidates.sort(key=lambda c: (-c["score"], c["label"]))
    suggested = candidates[0]["label"] if candidates and candidates[0]["score"] >= scoring["acceptance"] else None
    ambiguous = len(candidates) > 1 and candidates[0]["score"] - candidates[1]["score"] <= scoring["near_tie"]
    return dict(candidates=candidates, suggested=suggested, ambiguous=ambiguous)


def sensitivity(snapshot: dict, disabled_groups: list[str], without_checksums=False) -> dict:
    """Recalculate a frozen snapshot using aggregates; never read source values or write state."""
    if set(disabled_groups) - {"name_hint", "value_format", "declared_context"}:
        raise ValueError("Unknown evidence group")
    evidence = []
    for original in snapshot["evidence"]:
        if original["group"] in disabled_groups:
            continue
        item = dict(original)
        if without_checksums and item.get("validation_check") in ("verhoeff", "gstin"):
            n = item["sampled_non_null"]
            item.update(matches=item["format_matches"], pass_rate=item["format_matches"] / n if n else 0,
                        strength=item["format_matches"] / n if n else 0)
        evidence.append(item)
    before = score_evidence(snapshot["evidence"], snapshot["scoring"])
    after = score_evidence(evidence, snapshot["scoring"])
    scores = lambda result: {c["label"]: c["score"] for c in result["candidates"]}
    a, b = scores(before), scores(after)
    return dict(before=before, after=after, disabled_groups=sorted(set(disabled_groups)), without_checksums=without_checksums,
                changed=before != after, deltas=[dict(label=label, before=a.get(label, 0), after=b.get(label, 0),
                    delta=round(b.get(label, 0)-a.get(label, 0), 6)) for label in CLASSES if label in a or label in b],
                complete_validation_evidence=all("validation_check" in e for e in snapshot["evidence"] if e["group"] == "value_format"),
                explanation="Weights and thresholds stay frozen; removed signals are not redistributed. This experiment changes no saved findings or reviews.")


def analyze(name: str, values: list[Any], config: dict, declaration: dict | None = None) -> dict:
    nonnull = [str(v).strip() for v in values if v is not None and str(v).strip()]
    n = len(nonnull)
    evidence, relevant = [], {}
    for r in config["rules"]:
        if not r["enabled"]:
            continue
        header = bool(r["headers"] and re.search(r["headers"], name, re.I, timeout=0.05))
        counts, format_count = 0, 0
        # Demographic rules must have explicit header context.
        applicable = r["family"] != "Demographic" or header
        if r["pattern"] and applicable:
            pattern = re.compile(r["pattern"], re.I)
            for value in nonnull:
                normalized = value.upper() if r["normalizer"] == "upper" else value
                if r["normalizer"] in ("phone", "digits"):
                    normalized = re.sub(r"[ ()-]", "", normalized)
                if pattern.fullmatch(normalized, timeout=0.02):
                    format_count += 1
                    counts += int(checksum(normalized, r["check"]))
        semantic_rule = {k: v for k, v in r.items() if k not in ("label", "note")}
        revision = digest(semantic_rule)
        if counts or header:
            relevant[r["id"]] = revision
        if counts or format_count:
            evidence.append(dict(evidence_id=f"ev:value:{r['id']}", detector_id=r["id"], detector_revision=revision,
                                 label=r["label"], candidate_class=r["family"], group="value_format", matches=counts,
                                 format_matches=format_count, sampled_non_null=n, pass_rate=round(counts/n, 6),
                                 strength=round(counts/n, 6), normalization_policy=r["normalizer"], validation_check=r["check"], notes=[r["note"]]))
        if header and n:
            evidence.append(dict(evidence_id=f"ev:header:{r['id']}", detector_id=r["id"], detector_revision=revision,
                                 label=r["label"], candidate_class=r["family"], group="name_hint", strength=1.0,
                                 notes=["Header context; no value-match denominator"]))
    meaning = (declaration or {}).get("meaning", "")
    if meaning in CLASSES and n:
        evidence.append(dict(evidence_id="ev:declared:meaning", detector_id="declared_meaning", detector_revision=digest(meaning),
                             label="Declared field meaning", candidate_class=meaning, group="declared_context", strength=1.0,
                             notes=["Explicit human declaration"]))
    scored = score_evidence(evidence, config)
    suggested, ambiguous, candidates = scored["suggested"], scored["ambiguous"], scored["candidates"]
    value_evidence = [e for e in evidence if e["group"] == "value_format" and e["matches"]]
    mixed = len([e for e in value_evidence if e["matches"] < n]) > 1
    shapes = Counter("numeric" if re.fullmatch(r"\d+", v) else "alphabetic" if re.fullmatch(r"[\p{L} ]+", v) else "mixed" for v in nonnull)
    lengths = [len(v) for v in nonnull]
    return dict(profile=dict(rows=len(values), non_null=n, null_count=len(values)-n, null_rate=round((len(values)-n)/len(values), 6) if values else 0,
                             distinct_count=len(set(nonnull)), min_length=min(lengths, default=0), max_length=max(lengths, default=0), shapes=dict(shapes)),
                evidence=evidence, candidates=candidates, suggested=suggested, ambiguous=ambiguous, mixed=mixed,
                interpretation="candidate" if suggested else "unknown", insufficient=not n, sampling=SAMPLING,
                relevant_rules=relevant, scoring={k:config[k] for k in ("weights", "acceptance", "near_tie")},
                declared_meaning=meaning, limitations=LIMITATIONS)


DECLARATION_KEYS = ("purpose", "retention_duration", "retention_unit", "retention_start_trigger", "owner", "provenance", "meaning")


def clean_declaration(draft: dict) -> dict:
    if set(draft) - set(DECLARATION_KEYS):
        raise ValueError("Unknown declaration property")
    result = {k: draft.get(k, "") for k in DECLARATION_KEYS}
    for key, value in result.items():
        if key == "retention_duration":
            if value in ("", None):
                result[key] = None
            elif type(value) not in (int, float) or not 0 < value <= 10000:
                raise ValueError("Retention duration must be a positive number")
        elif not isinstance(value, str) or len(value) > 2000:
            raise ValueError(f"Invalid {key}")
        else:
            result[key] = value.strip()
    if result["retention_unit"] not in ("", "days", "months", "years"):
        raise ValueError("Choose days, months or years")
    if result["meaning"] not in ("", *CLASSES):
        raise ValueError("Unknown declared meaning")
    return result


def checklist(declaration: dict, config: dict, revision=0) -> list[dict]:
    results = []
    for key in config["checklist"]:
        value = declaration.get(key)
        if key == "retention":
            value = declaration.get("retention_duration") and declaration.get("retention_unit") in ("days", "months", "years")
        present = bool(value)
        results.append(dict(key=key, status="present" if present else "missing", reason="Declared" if present else "Not declared", revision=revision))
    return results


def projection(snapshot: dict, declaration: dict, config: dict, scope: str, relies_on_meaning=False) -> dict:
    if scope == "metadata":
        return dict(declaration=declaration, checklist=sorted(config["checklist"]), resolver="field-complete-override-v1")
    return dict(suggested=snapshot["suggested"], candidates=sorted(c["label"] for c in snapshot["candidates"]),
                ambiguous=snapshot["ambiguous"], mixed=snapshot["mixed"], insufficient=snapshot["insufficient"],
                sampling=snapshot["sampling"], rules=snapshot["relevant_rules"], scoring=snapshot["scoring"],
                evidence={e["evidence_id"]: {k:e[k] for k in ("pass_rate", "sampled_non_null", "matches") if k in e} for e in snapshot["evidence"] if e["group"] == "value_format"},
                meaning=declaration.get("meaning", "") if relies_on_meaning else None,
                materiality=config["materiality"])


def compare(old: dict, new: dict, scope: str) -> list[dict]:
    changes = []
    def add(key, before, after, reason):
        changes.append(dict(dependency=key, before=before, after=after, reason=reason, material=True))
    if scope == "metadata":
        for key in sorted(set(old.get("declaration", {})) | set(new.get("declaration", {}))):
            a, b = old.get("declaration", {}).get(key), new.get("declaration", {}).get(key)
            if a != b:
                add(key, a, b, f"Declared {key.replace('_', ' ')} changed")
        for key in ("checklist", "resolver"):
            if old.get(key) != new.get(key):
                add(key, old.get(key), new.get(key), f"Metadata {key} policy changed")
        return changes
    for key in ("suggested", "candidates", "ambiguous", "mixed", "insufficient", "sampling", "rules", "scoring", "meaning", "materiality"):
        if old.get(key) != new.get(key):
            add(key, old.get(key), new.get(key), f"{key.replace('_', ' ').capitalize()} changed")
    policy = new["materiality"]
    for key in sorted(set(old["evidence"]) | set(new["evidence"])):
        a, b = old["evidence"].get(key), new["evidence"].get(key)
        if a == b:
            continue
        if not a or not b:
            add(key, a, b, "Value-pattern evidence appeared or disappeared")
        elif min(a["sampled_non_null"], b["sampled_non_null"]) < policy["minimum_denominator"]:
            add(key, a, b, "Small-sample evidence changed; human review required")
        elif abs(a["pass_rate"] - b["pass_rate"]) + 1e-9 >= policy["rate_delta"]:
            add(key, a, b, "Pattern rate moved beyond the configured tolerance")
    return changes
