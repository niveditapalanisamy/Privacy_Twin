"""Explain persisted scan evidence without inventing model predictions or risk scores."""
from collections import Counter
import json
from .engine import checklist


def build_insights(service, source_id=None, c=None):
    if c is None:
        with service.store.connection() as conn:
            return build_insights(service, source_id, conn)
    policy_id, config = service.store.config(c)
    sources = service.list_sources(c)
    if source_id and not any(s['id'] == source_id for s in sources):
        raise KeyError('Source not found')
    sources = [s for s in sources if not source_id or s['id'] == source_id]
    fields = [f for f in service.inventory(c, config) if not source_id or f['source_id'] == source_id]
    findings, families, gaps = [], Counter(), Counter()
    present = [f for f in fields if f['availability'] == 'present']
    ready = 0
    healthy_sources = {s['id'] for s in sources if s['last_scan'] and not s['error']}
    def add(f, kind, priority, title, observation, suggestion, action):
        findings.append(dict(id=f"{f['id']}:{kind}", field_id=f['id'], field=f['name'], source=f['source_name'],
                             snapshot_id=f['snapshot_id'], kind=kind, priority=priority, title=title,
                             observation=observation, suggestion=suggestion, action=action))
    for f in fields:
        p = service.snapshot(c, f['snapshot_id'])['payload']
        if f['availability'] != 'present':
            add(f, 'missing', 'high', 'Field no longer present', 'The latest successful source scan did not contain this field.', 'Check whether the field was removed or renamed before reusing its decisions.', 'changes')
            continue
        families[f['suggested'] or 'Unclassified'] += 1
        declaration = service.effective(c, f)
        missing = [x['key'] for x in checklist(declaration['payload'], config) if x['status'] != 'present']
        gaps.update(missing)
        reviews = f['reviews']
        ready += int(f['source_id'] in healthy_sources and not missing and not f['policy_stale'] and all(reviews.get(scope, {}).get('state') == 'current' and reviews[scope]['outcome'] == 'clear' for scope in ('classification', 'metadata')))
        if f['policy_stale']:
            add(f, 'stale', 'high', 'Scan uses an earlier policy', 'Detection rules or review requirements have changed since this snapshot.', 'Rescan this source with the active policy before making a decision.', 'changes')
        reopened = [scope for scope, r in reviews.items() if r['state'] == 'reopened']
        if reopened:
            add(f, 'reopened', 'high', 'Previous decision needs another review', f"Changed dependencies reopened: {', '.join(reopened)}.", 'Compare the recorded evidence changes and record a new decision.', 'review')
        patterns = [e for e in p['evidence'] if e['group'] == 'value_format' and e.get('matches', 0) > 0]
        evidence = '; '.join(f"{e['label']}: {e['matches']}/{e['sampled_non_null']} non-empty values" for e in sorted(patterns, key=lambda e: -e['matches']))
        if p['ambiguous'] or p['mixed']:
            candidates = ', '.join(x['label'] for x in p['candidates'])
            add(f, 'competing', 'high', 'Competing signals', evidence or f'Candidate classes: {candidates}.', 'Inspect the competing patterns and declare the intended meaning before classifying this field.', 'evidence')
        elif p['insufficient'] or not f['suggested']:
            add(f, 'unclassified', 'medium', 'No supported classification', evidence or f"{p['profile']['non_null']} non-empty values; no candidate meets the configured decision rules.", 'Check the field meaning and detection rules. An unclassified field is not evidence that it contains no personal data.', 'evidence')
        elif reviews.get('classification', {}).get('state') != 'current':
            add(f, 'candidate', 'medium', f"{f['suggested']} candidate awaiting review", evidence or f"The candidate is supported by header or declared context; {p['profile']['non_null']} non-empty values were scanned.", 'Validate the evidence and record a classification decision.', 'review')
        for scope, r in reviews.items():
            if r['state'] == 'current' and r['outcome'] != 'clear':
                add(f, 'unresolved-' + scope, 'medium', f'{scope.capitalize()} decision remains unresolved', f"Recorded outcome: {r['outcome']}.", 'Resolve the outstanding question before treating this field as ready.', 'review')
        profile = p['profile']
        if profile['null_count']:
            add(f, 'nulls', 'medium' if profile['null_rate'] >= .5 else 'low', 'Incomplete values', f"{profile['null_count']} of {profile['rows']} values are empty ({profile['null_rate']:.0%}). Pattern rates exclude empty values.", 'Confirm whether empty values are expected; assess completeness separately from detection rates.', 'evidence')
        if missing:
            add(f, 'metadata', 'medium', 'Missing usage details', 'Not declared: ' + ', '.join(x.replace('_', ' ') for x in missing) + '.', 'Add the missing details, preview their impact, then review metadata.', 'fix')
        elif reviews.get('metadata', {}).get('state') != 'current':
            add(f, 'metadata-review', 'medium', 'Usage details await review', 'All configured metadata requirements are present, but there is no current metadata decision.', 'Review the declared purpose, ownership, retention and provenance.', 'review')
        previous = c.execute('SELECT payload FROM snapshots WHERE field_id=? AND id!=? ORDER BY rowid DESC LIMIT 1', (f['id'], f['snapshot_id'])).fetchone()
        if previous:
            old = json.loads(previous[0])
            if old['suggested'] != p['suggested']:
                add(f, 'changed-class', 'high', 'Detected class changed', f"Previous: {old['suggested'] or 'Unclassified'}. Latest: {p['suggested'] or 'Unclassified'}.", 'Compare both snapshots to determine whether the data meaning or format changed.', 'evidence')
            old_evidence = {e['evidence_id']: e for e in old['evidence'] if e['group'] == 'value_format'}
            changes = []
            for e in p['evidence']:
                prior = old_evidence.get(e['evidence_id'])
                if prior and e.get('pass_rate') is not None and prior.get('pass_rate') is not None:
                    delta = e['pass_rate'] - prior['pass_rate']
                    if abs(delta) >= config['materiality']['rate_delta'] and delta != 0:
                        changes.append(f"{e['label']}: {prior['matches']}/{prior['sampled_non_null']} previously, {e['matches']}/{e['sampled_non_null']} now ({delta * 100:+.0f} percentage points)")
            if changes:
                add(f, 'changed-patterns', 'high', 'Pattern rates changed', '; '.join(changes) + '.', 'Compare sample sizes, rule versions and value formats before attributing the change to the data itself.', 'evidence')
    findings.sort(key=lambda x: ({'high': 0, 'medium': 1, 'low': 2}[x['priority']], x['source'], x['field'], x['kind']))
    issues = [dict(source=s['name'], status=s['status'], observation=s['error'] or 'No successful scan is available.', suggestion='Check the source file and run a successful scan.') for s in sources if s['error'] or not s['last_scan']]
    total = len(present)
    return dict(policy_id=policy_id, source_count=len(sources), field_count=total, ready=ready,
                candidate_count=sum(bool(f['suggested']) for f in present),
                reopened=sum(r['state'] == 'reopened' for f in present for r in f['reviews'].values()),
                gap_count=sum(gaps.values()), families=dict(families), missing_requirements=dict(gaps),
                summary=(f"Analyzed {total} present {'field' if total == 1 else 'fields'} across {len(sources)} {'source' if len(sources) == 1 else 'sources'}. Ready fields have two current, clear reviews, complete required metadata and a successful source scan under the active policy." if total else 'No scanned fields yet. Add a source and run a scan to generate findings.'),
                findings=findings, source_issues=issues,
                basis='Computed from the latest saved snapshot of every field, its previous snapshot, effective declarations, active policy and recorded reviews. Candidate classes are suggestions, not confirmed classifications. Readiness is a review status, not a compliance certification.')
