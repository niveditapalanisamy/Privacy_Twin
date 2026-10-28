import uuid
from fastapi.testclient import TestClient
from main import create_app


def test_insights_follow_uploaded_values_and_source_scope(tmp_path):
    app = create_app(tmp_path / 'insights.sqlite3')
    service = app.state.service
    client = TestClient(app)
    assert client.get('/api/insights').json()['field_count'] == 0
    a = service.register('Contacts', 'CSV', b'email\na@example.test\nb@example.test\n""\n')['id']
    service.scan(a, str(uuid.uuid4()))
    b = service.register('Empty values', 'CSV', b'unknown\n""\n')['id']
    service.scan(b, str(uuid.uuid4()))
    before = service.state()
    report = client.get('/api/insights', params={'source_id': a}).json()
    assert report['field_count'] == 1
    assert report['candidate_count'] == 1
    assert report['families'] == {'Contact': 1}
    assert report['ready'] == 0
    assert report['gap_count'] == len(before['config']['checklist'])
    assert any('2/2' in f['observation'] for f in report['findings'])
    assert any(f['kind'] == 'nulls' and '1 of 3' in f['observation'] for f in report['findings'])
    assert service.state() == before  # analysis never writes reviews, snapshots or declarations
    service.scan(a, str(uuid.uuid4()), b'email\ninvalid\ninvalid\n')
    after = client.get('/api/insights', params={'source_id': a}).json()
    assert after != report
    assert not any('2/2' in f['observation'] for f in after['findings'])
    assert client.get('/api/insights').json()['field_count'] == 2
    assert client.get('/api/insights?source_id=missing').status_code == 404


def test_unscanned_source_is_not_reported_as_ready(tmp_path):
    app = create_app(tmp_path / 'pending.sqlite3')
    app.state.service.register('Pending', 'CSV', b'email\na@example.test\n')
    report = TestClient(app).get('/api/insights').json()
    assert report['ready'] == report['field_count'] == 0
    assert report['source_issues'][0]['source'] == 'Pending'
