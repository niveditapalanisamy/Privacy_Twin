import copy
import json
import sqlite3
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.adapters import read_source
from core.demo import customers, csv_bytes, fixtures
from core.engine import DEFAULT_CONFIG, analyze, checksum, compare, digest, projection, validate_config
from core.evaluation import evaluate
from core.service import Conflict, Service
from core.storage import Store
from main import create_app


@pytest.fixture
def service(tmp_path):
    return Service(Store(tmp_path / 'workspace.sqlite3'))


def source(service, data=None):
    sid = service.register('custom.csv', 'CSV', data or customers())['id']
    service.scan(sid, str(uuid.uuid4()))
    return sid


def field(service, name='loyalty_id'):
    return next(f for f in service.state()['fields'] if f['name'] == name)


def review(service, fid, scope='classification', **extra):
    d = service.detail(fid)
    return service.save_review(fid, dict(**d['token'], scope=scope, outcome='clear', selected_class=d['snapshots'][0]['payload']['suggested'],
                                       reviewer='Test reviewer', rationale='Reviewed the aggregate evidence and explicit context.', evidence_ids=[], **extra))


def declaration(service, fid, draft, target_type='field'):
    body = dict(**service.detail(fid)['token'], draft=draft, target_type=target_type)
    preview = service.preview_declaration(fid, body)
    return service.save_declaration(fid, body | {'preview_digest': preview['preview_digest']})


def states(service, fid):
    return {r['scope']:r['state'] for r in service.detail(fid)['reviews'] if r['state'] != 'superseded'}


def test_dynamic_scan_profiles_and_no_raw_records(service):
    source(service, b'employee_id,email,empty\nEMP-1234,first@example.test,\nEMP-4321,second@example.test,\n')
    assert service.state()['totals']['fields'] == 3
    detail = service.detail(field(service,'email')['id'])
    assert detail['snapshots'][0]['payload']['suggested'] == 'Contact'
    assert detail['snapshots'][0]['payload']['profile']['rows'] == 2
    assert 'first@example.test' not in json.dumps(detail)
    assert service.detail(field(service,'empty')['id'])['snapshots'][0]['payload']['insufficient']


def test_scoped_reopening_and_reversion(service):
    sid = source(service)
    fid = field(service)['id']
    review(service, fid)
    review(service, fid, 'metadata')
    original = service.detail(fid)['reviews'][-1]['snapshot_id']
    service.scan(sid, str(uuid.uuid4()), customers('v2'))
    assert states(service, fid) == {'classification':'reopened','metadata':'current'}
    events = service.detail(fid)['events']
    assert any(e['scope']=='classification' and e['comparisons'] for e in events)
    assert service.detail(fid)['reviews'][-1]['snapshot_id'] == original
    service.scan(sid, str(uuid.uuid4()), customers('v1'))
    assert states(service, fid)['classification'] == 'reopened'
    review(service, fid)
    assert states(service, fid)['classification'] == 'current'
    assert any(r['state']=='superseded' for r in service.detail(fid)['reviews'])


def test_timestamp_and_row_order_preserve(service):
    sid = source(service)
    fid = field(service)['id']
    review(service, fid)
    review(service, fid, 'metadata')
    service.scan(sid, str(uuid.uuid4()))
    assert set(states(service,fid).values()) == {'current'}
    lines = customers().splitlines()
    service.scan(sid, str(uuid.uuid4()), b'\n'.join([lines[0], *reversed(lines[1:])]))
    assert set(states(service,fid).values()) == {'current'}


def test_stale_review_is_rejected(service):
    sid = source(service)
    fid = field(service)['id']
    token = service.detail(fid)['token']
    service.scan(sid, str(uuid.uuid4()), customers('v2'))
    with pytest.raises(Conflict):
        service.save_review(fid, dict(**token,scope='classification',outcome='clear',selected_class='Identity',rationale='This is a rationale for the old snapshot.',reviewer='Reviewer'))
    assert not service.detail(fid)['reviews']


def test_pure_preview_and_scoped_declaration_save(service):
    source(service)
    fid = field(service)['id']
    draft = dict(purpose='Customer operations',retention_duration=3,retention_unit='years',owner='Operations',provenance='Owner declaration')
    declaration(service,fid,draft)
    review(service,fid)
    review(service,fid,'metadata')
    before = service.export('passport')[0]
    body = dict(**service.detail(fid)['token'],draft=draft|{'retention_start_trigger':'Account closure'})
    preview = service.preview_declaration(fid,body)
    # generated_at is intentionally not part of the persisted database comparison.
    a,b = json.loads(before),json.loads(service.export('passport')[0])
    a.pop('generated_at');b.pop('generated_at')
    assert a == b
    assert sum(c['status']=='missing' for c in preview['before_checklist']) == 1
    assert sum(c['status']=='missing' for c in preview['after_checklist']) == 0
    assert preview['affected'][0]['scopes'] == ['metadata']
    service.save_declaration(fid,body|{'preview_digest':preview['preview_digest']})
    assert states(service,fid) == {'classification':'current','metadata':'reopened'}
    with pytest.raises(Conflict):
        service.save_declaration(fid,body|{'preview_digest':preview['preview_digest']})


def test_changed_preview_draft_cannot_save(service):
    source(service)
    fid = field(service)['id']
    body = dict(**service.detail(fid)['token'],draft={'purpose':'Original purpose'})
    preview = service.preview_declaration(fid,body)
    with pytest.raises(Conflict):
        service.save_declaration(fid,body|{'draft':{'purpose':'Different purpose'},'preview_digest':preview['preview_digest']})
    assert service.detail(fid)['declaration']['revision'] == 0


def test_table_fallback_and_complete_field_override(service):
    source(service)
    fid = field(service)['id']
    declaration(service,fid,dict(purpose='Table purpose',owner='Table owner'),target_type='table')
    other = field(service,'contact_value')['id']
    assert service.detail(other)['declaration']['origin'] == 'table'
    declaration(service,other,dict(purpose='Explicit field purpose'))
    assert service.detail(other)['declaration']['payload']['owner'] == ''
    declaration(service,fid,dict(purpose='Changed table purpose',owner='New owner'),target_type='table')
    assert service.detail(other)['declaration']['payload']['purpose'] == 'Explicit field purpose'


def test_missing_rename_and_return(service):
    sid = source(service)
    fid = field(service)['id']
    review(service,fid)
    review(service,fid,'metadata')
    service.scan(sid,str(uuid.uuid4()),customers('renamed'))
    assert set(states(service,fid).values()) == {'missing'}
    new = field(service,'member_reference')
    assert new['id'] != fid and not new['reviews']
    service.scan(sid,str(uuid.uuid4()),customers())
    assert set(states(service,fid).values()) == {'reopened'}


def test_failed_source_preserves_fields_and_reviews(service):
    sid = source(service)
    fid = field(service)['id']
    review(service,fid)
    previous = service.state()['fields']
    with pytest.raises(ValueError,match='Duplicate'):
        service.scan(sid,str(uuid.uuid4()),b'a,a\n1,2\n')
    assert service.state()['fields'] == previous
    assert service.state()['sources'][0]['status'] == 'failed'
    assert states(service,fid)['classification'] == 'current'


def test_scan_idempotency(service):
    sid = service.register('data.csv','CSV',customers())['id']
    request = str(uuid.uuid4())
    first = service.scan(sid,request)
    second = service.scan(sid,request)
    assert second['idempotent'] and first['id']==second['id']
    assert len(service.state()['scans']) == 1


def test_relevant_and_unrelated_rule_changes(service):
    sid = source(service)
    fid = field(service)['id']
    review(service,fid)
    review(service,fid,'metadata')
    s = service.state(); config = copy.deepcopy(s['config'])
    next(r for r in config['rules'] if r['id']=='birth_date')['pattern'] = r'19\d{2}-\d{2}-\d{2}'
    service.save_config(config,s['policy_id'])
    assert set(states(service,fid).values()) == {'current'}
    service.scan(sid,str(uuid.uuid4()))
    assert states(service,fid)['classification'] == 'current'
    s = service.state();config = copy.deepcopy(s['config'])
    next(r for r in config['rules'] if r['id']=='internal_id')['pattern'] = r'LOY-\d{6}'
    service.save_config(config,s['policy_id'])
    assert states(service,fid) == {'classification':'reopened','metadata':'current'}


def test_new_competing_rule_caught_on_scan(service):
    sid = source(service)
    fid = field(service)['id'];review(service,fid)
    state = service.state();config = copy.deepcopy(state['config'])
    new = copy.deepcopy(config['rules'][0]);new.update(id='competing_location',family='Location',pattern=r'LOY-\d{6}',headers='')
    config['rules'].append(new)
    service.save_config(config,state['policy_id'])
    service.scan(sid,str(uuid.uuid4()))
    assert states(service,fid)['classification'] == 'reopened'


def test_declared_meaning_dependency(service):
    sid = source(service)
    fid = field(service)['id']
    declaration(service,fid,{'meaning':'Identity'})
    service.scan(sid,str(uuid.uuid4()))
    review(service,fid,relies_on_meaning=True)
    declaration(service,fid,{'meaning':'Contact'})
    assert states(service,fid)['classification'] == 'reopened'
    with pytest.raises(Conflict,match='meaning changed'):
        review(service,fid)


def test_sqlite_read_only_and_quoted_identifiers(service,tmp_path):
    path = tmp_path/'source.db'
    with sqlite3.connect(path) as c:
        c.execute('CREATE TABLE "odd""table"("email" TEXT, "leading_id" TEXT)')
        c.execute('INSERT INTO "odd""table" VALUES(?,?)',('local@example.test','00123'))
    before = path.read_bytes()
    tables = read_source(path,'SQLite')
    assert tables['odd"table'][1][0][1] == '00123'
    assert path.read_bytes() == before
    sid = service.register('sqlite source','SQLite',before)['id']
    result = service.scan(sid,str(uuid.uuid4()))
    assert result['field_count']==2 and result['row_count']==1


def test_csv_leading_zero_null_and_duplicate_headers(tmp_path):
    path=tmp_path/'test.csv';path.write_text('code,value\n00123,NA\n00001,\n')
    data=read_source(path,'CSV')
    assert data['csv'][1][0] == ['00123','NA']
    path.write_text('name,name\na,b\n')
    with pytest.raises(ValueError,match='Duplicate'):
        read_source(path,'CSV')


def test_correlated_group_cap_and_abstention():
    config=copy.deepcopy(DEFAULT_CONFIG)
    initial=analyze('contact',['one@example.test']*20,config)
    duplicate=copy.deepcopy(config['rules'][0]);duplicate['id']='email_duplicate'
    config['rules'].append(duplicate)
    assert analyze('contact',['one@example.test']*20,config)['candidates'][0]['score']==initial['candidates'][0]['score']
    assert analyze('name',['','',None],config)['suggested'] is None
    assert analyze('loyalty_id',['9876543210']*20,config)['suggested']=='Contact'
    assert analyze('branch_ifsc',['SBIN0001234'],config)['suggested'] is None
    assert analyze('phone',['x9876543210x'],config)['suggested'] is None


def test_checksums_and_context():
    assert checksum('27AAPFU0939F1ZV','gstin')
    assert not checksum('27AAPFU0939F1Z0','gstin')
    assert checksum('2363','verhoeff')
    assert not checksum('2364','verhoeff')
    assert not checksum('letters','verhoeff')
    assert analyze('age',['24','36'],DEFAULT_CONFIG)['suggested']=='Demographic'
    assert analyze('quantity',['24','36'],DEFAULT_CONFIG)['suggested'] is None


def test_materiality_tolerance_and_small_samples():
    config=copy.deepcopy(DEFAULT_CONFIG)
    a=analyze('contact',['one@example.test']*50,config)
    b=analyze('contact',['one@example.test']*49+['other'],config)
    assert not compare(projection(a,{},config,'classification'),projection(b,{},config,'classification'),'classification')
    b=analyze('contact',['one@example.test']*40+['other']*10,config)
    assert compare(projection(a,{},config,'classification'),projection(b,{},config,'classification'),'classification')


def test_config_validation_and_custom_results(service):
    sid=source(service,b'code\nZX:1234\nZX:5678\n')
    fid=field(service,'code')['id']
    assert service.detail(fid)['snapshots'][0]['payload']['suggested'] is None
    state=service.state();config=copy.deepcopy(state['config'])
    custom=copy.deepcopy(config['rules'][0]);custom.update(id='custom_code',label='Custom code',family='Identity',pattern=r'ZX:\d{4}',headers='code')
    config['rules'].append(custom)
    service.save_config(config,state['policy_id']);service.scan(sid,str(uuid.uuid4()))
    assert service.detail(fid)['snapshots'][0]['payload']['suggested']=='Identity'
    config['weights']['value_format']=1
    with pytest.raises(ValueError,match='add up'):
        validate_config(config)


def test_export_references_and_immutability(service):
    sid=source(service);fid=field(service)['id'];declaration(service,fid,{'purpose':'Test'});review(service,fid)
    service.scan(sid,str(uuid.uuid4()),customers('v2'))
    passport=json.loads(service.export('passport')[0])
    snapshots={s['id'] for s in passport['snapshots']}
    scans={s['id'] for s in passport['scans']}
    declarations={d['id'] for d in passport['declarations']}
    policies={p['id'] for p in passport['policies']}
    assert all(r['snapshot_id'] in snapshots for r in passport['reviews'])
    assert all(s['scan_id'] in scans for s in passport['snapshots'])
    assert all(not r['declaration_id'] or r['declaration_id'] in declarations for r in passport['reviews'])
    assert all(s['policy_id'] in policies for s in passport['scans'])
    assert 'classification,metadata' in service.export('inventory')[0]
    assert 'retention_start_trigger' in service.export('gaps')[0]
    with pytest.raises(sqlite3.IntegrityError,match='immutable'):
        with service.store.connection(write=True) as c:
            c.execute("UPDATE snapshots SET payload='{}'")


def test_measured_evaluation_and_custom_labels(service):
    assert service.state()['evaluation'] is None
    report=evaluate(service)
    assert report['cases']==12 and report['stress_cases']==7
    assert all(r['passed'] for r in report['replay'])
    assert report['independent_heldout'] is False
    custom=evaluate(service,[{'field':'email','values':['one@example.test'],'expected':'Identity'}])
    assert custom['metrics'][0]['recall']==0
    assert custom['macro_f1']==0


def test_api_custom_upload_and_validation(tmp_path):
    with TestClient(create_app(tmp_path/'api.db')) as client:
        registered=client.post('/api/sources',data={'name':'Custom upload','kind':'CSV'},files={'file':('custom.csv',b'email\nunique@example.test\n')})
        assert registered.status_code==200
        sid=registered.json()['id']
        assert client.post(f'/api/sources/{sid}/scan',data={'request_id':'custom-upload'}).status_code==200
        state=client.get('/api/state').json()
        assert state['fields'][0]['suggested']=='Contact'
        assert state['fields'][0]['profile']['rows']==1
        assert client.post('/api/sources',data={'name':'Bad','kind':'CSV'},files={'file':('bad.csv',b'a,a\n1,2')}).status_code==400
        assert client.get('/api/export/passport').status_code==200
        assert client.get('/api/fields/unknown').status_code==404


def test_demo_registration_is_real_and_repeatable(service):
    for key,name,kind,data in fixtures():
        registered=service.register(name,kind,data,demo_key=key)
        service.scan(registered['id'],str(uuid.uuid4()))
        assert service.register(name,kind,data,demo_key=key)['existing']
    state=service.state()
    assert len(state['sources'])==4
    assert len(state['fields'])==22
    assert not any(f['reviews'] for f in state['fields'])
    contact=next(f for f in state['fields'] if f['name']=='contact_value')
    evidence=service.detail(contact['id'])['snapshots'][0]['payload']['evidence']
    matches={e['detector_id']:e['matches'] for e in evidence if 'matches' in e}
    assert matches=={'email':32,'phone_in':18}


def test_invalid_regex_and_malformed_csv_are_user_errors(tmp_path):
    config=copy.deepcopy(DEFAULT_CONFIG);config['rules'][0]['pattern']='['
    with pytest.raises(ValueError,match='Invalid expression'):
        validate_config(config)
    path=tmp_path/'bad.csv';path.write_text('name\n"unclosed\n')
    with pytest.raises(ValueError,match='Cannot read CSV'):
        read_source(path,'CSV')
