import json
import threading
import time
import uuid
import pytest
from core.ai_review import AIReview, RunOptions, ProviderError, MODEL
from core.service import Service, Conflict
from core.storage import Store
from core.report import final_report


class FakeGemini:
    def __init__(self):
        self.calls = []
        self.error = None
        self.wait = None
        self.started = threading.Event()
        self.confidence = .99

    def key(self):
        return 'test-credential-never-export'

    def generate(self, fields, scopes):
        self.calls.append(fields)
        self.started.set()
        if self.wait:
            self.wait.wait(5)
        if self.error:
            raise self.error
        decisions = []
        for f in fields:
            for scope in f['scopes']:
                decisions.append(dict(field_id=f['field_id'], scope=scope, outcome='clear', selected_class=f['suggested'] if scope == 'classification' else None,
                    confidence=self.confidence, rationale='The supplied aggregate pattern supports this proposed decision.', suggestion='Verify ownership and intended use with the data owner.', evidence_ids=[e['evidence_id'] for e in f['evidence']]))
        return dict(summary='Aggregate review completed for the supplied batch.', decisions=decisions), {'totalTokenCount': 42}


@pytest.fixture
def rig(tmp_path):
    service = Service(Store(tmp_path / 'workspace.sqlite3'))
    sid = service.register('User data', 'CSV', b'email\nprivate@example.test\nsecond@example.test\n')['id']
    service.scan(sid, str(uuid.uuid4()))
    provider = FakeGemini()
    ai = AIReview(service, provider)
    yield service, ai, provider, sid
    with service.store.connection(write=True) as c:
        c.execute("UPDATE ai_runs SET status='cancelled' WHERE status!='completed'")
    if provider.wait:
        provider.wait.set()
    for t in ai.threads.values():
        t.join(3)


def wait_for(ai, rid, statuses=('completed',)):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        r = ai.get(rid)
        if r['status'] in statuses:
            return r
        time.sleep(.05)
    pytest.fail('Worker did not finish: ' + str(ai.get(rid)))


def test_automatic_review_validates_and_exports_provenance(rig):
    service, ai, provider, sid = rig
    run = ai.start(RunOptions(mode='automatic'))
    r = wait_for(ai, run['id'])
    cls = next(p for p in r['proposals'] if p['scope'] == 'classification')
    meta = next(p for p in r['proposals'] if p['scope'] == 'metadata')
    assert cls['status'] == 'applied'
    assert meta['status'] == 'pending'
    assert meta['payload']['decision']['outcome'] == 'unresolved'
    assert meta['payload']['decision']['validation_notes']
    serialized = json.dumps(provider.calls)
    assert 'private@example.test' not in serialized and 'email' not in provider.calls[0][0]
    report = json.loads(final_report(service, 'json')[0])
    assert report['summary']['ready'] == 0
    assert report['fields'][0]['reviews']['classification']['reviewer'].startswith('AI automatic')
    assert 'test-credential-never-export' not in json.dumps(report)
    ai.decide(cls['id'], 'revoke')
    assert not service.state()['fields'][0]['reviews'].get('classification')
    assert ai.get(run['id'])['proposals'][0]['status'] == 'revoked'


@pytest.mark.parametrize('confidence,expected', [(.7, 'applied'), (.699, 'pending')])
def test_seventy_percent_threshold_is_inclusive_and_preserves_metadata_checks(rig, confidence, expected):
    _, ai, provider, _ = rig
    provider.confidence = confidence
    run = wait_for(ai, ai.start(RunOptions(mode='automatic', confidence_threshold=.7))['id'])
    classification = next(p for p in run['proposals'] if p['scope'] == 'classification')
    metadata = next(p for p in run['proposals'] if p['scope'] == 'metadata')
    assert run['options']['confidence_threshold'] == .7
    assert classification['status'] == expected
    assert metadata['status'] == 'pending'
    assert metadata['payload']['decision']['outcome'] == 'unresolved'
    assert metadata['payload']['decision']['validation_notes']


def test_threshold_below_seventy_percent_is_rejected():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        RunOptions(confidence_threshold=.699)


def test_draft_reject_and_changed_snapshot_block_application(rig):
    service, ai, _, sid = rig
    r = wait_for(ai, ai.start(RunOptions())['id'])
    assert not service.state()['fields'][0]['reviews']
    ai.decide(r['proposals'][1]['id'], 'reject')
    service.scan(sid, str(uuid.uuid4()), b'email\nchanged@example.test\n')
    updated = ai.decide(r['proposals'][0]['id'], 'accept')
    assert updated['proposals'][0]['status'] == 'stale'
    assert not service.state()['fields'][0]['reviews']


def test_concurrent_human_decision_is_never_overwritten(rig):
    service, ai, provider, _ = rig
    provider.wait = threading.Event()
    r = ai.start(RunOptions(mode='automatic'))
    assert provider.started.wait(2)
    f = service.state()['fields'][0]
    d = service.detail(f['id'])
    saved = service.save_review(f['id'], d['token'] | dict(scope='classification', outcome='unresolved', selected_class=None, reviewer='Human', rationale='Need to confirm the business context before classifying.', evidence_ids=[]))
    provider.wait.set()
    r = wait_for(ai, r['id'])
    assert r['proposals'][0]['status'] == 'stale'
    assert service.state()['fields'][0]['reviews']['classification']['id'] == saved['id']


def test_pause_retains_drafts_cancel_discards_inflight(rig):
    service, ai, provider, _ = rig
    provider.wait = threading.Event()
    r = ai.start(RunOptions(mode='automatic'))
    assert provider.started.wait(2)
    ai.control(r['id'], 'pause')
    provider.wait.set()
    deadline = time.monotonic() + 3
    while ai.get(r['id'])['processed'] == 0 and time.monotonic() < deadline:
        time.sleep(.05)
    assert all(p['status'] == 'pending' for p in ai.get(r['id'])['proposals'])
    assert not service.state()['fields'][0]['reviews']
    ai.control(r['id'], 'cancel')
    provider.wait = threading.Event()
    provider.started.clear()
    r2 = ai.start(RunOptions(mode='automatic'))
    assert provider.started.wait(2)
    ai.control(r2['id'], 'cancel')
    provider.wait.set()
    ai.threads[r2['id']].join(3)
    assert not ai.get(r2['id'])['proposals']


def test_quota_stops_without_fallback_and_can_resume(rig):
    _, ai, provider, _ = rig
    provider.error = ProviderError('Free quota exhausted', quota=True)
    r = wait_for(ai, ai.start(RunOptions())['id'], ('quota',))
    time.sleep(.6)
    assert len(provider.calls) == 1
    assert r['processed'] == 0
    provider.error = None
    ai.control(r['id'], 'resume')
    assert wait_for(ai, r['id'])['processed'] == 1
    assert len(provider.calls) == 2
    assert ai.status()['model'] == MODEL


def test_missing_or_invented_decisions_rejected(rig):
    _, ai, provider, _ = rig
    r = ai.start(RunOptions(), launch=False)
    with ai.store.connection() as c:
        payload = json.loads(c.execute('SELECT payload FROM ai_runs WHERE id=?', (r['id'],)).fetchone()[0])
    batch = payload['fields']
    response, _ = provider.generate([f['input'] for f in batch], ['classification', 'metadata'])
    response['decisions'][0]['evidence_ids'] = ['invented']
    with pytest.raises(ProviderError):
        ai.validate_batch(response, batch)
    response['decisions'] = response['decisions'][1:]
    with pytest.raises(ProviderError):
        ai.validate_batch(response, batch)


def test_report_escapes_untrusted_names(rig):
    service, _, _, _ = rig
    service.register('<script>alert(1)</script>', 'CSV', b'value\n123\n')
    page = final_report(service)[0]
    assert '<script>alert(1)</script>' not in page
    assert '&lt;script&gt;' in page
