"""Portable final report generated from one consistent database snapshot."""
import html
import json
from .insights import build_insights
from .storage import now, unpack


def final_report(service, format='html'):
    with service.store.connection() as c:
        policy, config = service.store.config(c)
        fields = service.inventory(c, config)
        for f in fields:
            f['reviews'] = {r['scope']: dict(r) for r in c.execute("SELECT id,scope,state,outcome,selected_class,reviewer,rationale,created_at FROM reviews WHERE field_id=? AND state!='superseded'", (f['id'],))}
        runs = []
        for row in c.execute('SELECT * FROM ai_runs ORDER BY rowid DESC'):
            r = unpack(row, ('payload',))
            payload = r.pop('payload')
            runs.append(r | dict(options=payload['options'], total=len(payload['fields']), summaries=payload['summaries'], usage=payload['usage'], prompt_version=payload['prompt_version']))
        proposals = [unpack(row, ('payload',)) for row in c.execute('SELECT * FROM ai_proposals ORDER BY rowid')]
        report = dict(title='PrivacyTwin final review report', generated_at=now(), workspace_id=service.store.workspace_id, policy_id=policy,
                      summary=build_insights(service, c=c), sources=service.list_sources(c), fields=fields, ai_runs=runs, ai_proposals=proposals,
                      limitations=['AI decisions are machine-generated, even when automatically applied. Confidence is model-reported, not calibrated accuracy.',
                                   'Ready means current clear reviews and complete required metadata under the active policy, not legal compliance.',
                                   'Missing business context must be supplied by the data owner. Raw source values are excluded from this report.',
                                   'AI batch summaries describe evidence at run time. Current field states below take precedence after subsequent changes.'])
    if format == 'json':
        return json.dumps(report, ensure_ascii=False, indent=2), 'application/json', '.json'
    if format != 'html':
        raise ValueError('Choose html or json')
    esc = lambda x: html.escape(str(x if x is not None else '—'), quote=True)
    s = report['summary']
    rows = []
    for f in fields:
        decisions = []
        for scope in ('classification', 'metadata'):
            r = f['reviews'].get(scope)
            decisions.append(f"<strong>{esc(r['state'])} / {esc(r['outcome'])}</strong><br>{esc(r['reviewer'])}<br><small>{esc(r['rationale'])}</small>" if r else 'Not reviewed')
        rows.append(f"<tr><td><strong>{esc(f['name'])}</strong><br>{esc(f['source_name'])}<br><small>{esc(f['snapshot_id'])}</small></td><td>{esc(f['suggested'] or 'Unclassified')}<br>{esc(f['availability'])}{'<br>Rescan required' if f['policy_stale'] else ''}</td><td>{decisions[0]}</td><td>{decisions[1]}</td><td>{f['gap_count']}</td></tr>")
    findings = ''.join(f"<article><b>{esc(f['priority'].upper())} · {esc(f['source'])} / {esc(f['field'])}</b><h3>{esc(f['title'])}</h3><p>{esc(f['observation'])}</p><p><strong>Next step:</strong> {esc(f['suggestion'])}</p></article>" for f in s['findings'])
    ai_sections = ''.join(f"<article><h3>Run {esc(r['id'][:8])} · {esc(r['status'])}</h3><p>{r['processed']} / {r['total']} fields analyzed · {esc(r['options']['mode'])} · {esc(r['created_at'])}</p><p>{esc(r['error'])}</p>{''.join('<p>'+esc(x)+'</p>' for x in r['summaries'])}</article>" for r in runs)
    proposed = ''.join(f"<tr><td>{esc(p['field_id'])}<br>{esc(p['scope'])}</td><td>{esc(p['status'])}</td><td>{esc(p['payload']['model'])}</td><td>{esc(p['payload']['decision']['rationale'])}<br><strong>Suggestion:</strong> {esc(p['payload']['decision']['suggestion'])}</td></tr>" for p in proposals)
    issues = ''.join(f"<article><strong>{esc(i['source'])}</strong><p>{esc(i['observation'])} {esc(i['suggestion'])}</p></article>" for i in s['source_issues'])
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PrivacyTwin final report</title>
<style>body{{font:15px/1.6 system-ui,sans-serif;color:#28223e;background:#f4f1fa;margin:0;padding:40px}}main{{max-width:1200px;margin:auto}}header{{background:#30264d;color:white;padding:36px;border-radius:20px}}h1{{font-size:36px;margin:0}}h2{{margin-top:36px}}.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}}.stats div,article{{background:white;border:1px solid #e4ddee;border-radius:14px;padding:20px;margin-bottom:14px}}.stats strong{{font-size:32px;display:block;color:#6850c1}}table{{width:100%;border-collapse:collapse;background:white;font-size:12px}}th,td{{padding:14px;text-align:left;vertical-align:top;border:1px solid #e4ddee;overflow-wrap:anywhere}}th{{background:#eee7fa}}small{{color:#746c83}}button{{padding:12px 20px;border:0;border-radius:10px;background:#6c51cb;color:white;cursor:pointer;margin:20px 0}}.table-wrap{{overflow:auto}}@media(max-width:650px){{body{{padding:16px}}.stats{{grid-template-columns:1fr 1fr}}}}@media print{{body{{background:white;padding:0}}button{{display:none}}header{{color:#28223e;background:#eee7fa}}article,tr{{break-inside:avoid}}.table-wrap{{overflow:visible}}}}</style></head><body><main>
<header><p>PRIVACYTWIN · FINAL REVIEW REPORT</p><h1>{s['ready']} of {s['field_count']} fields ready</h1><p>{esc(s['summary'])}</p><small style="color:inherit">Generated {esc(report['generated_at'])} · Policy {esc(policy[:12])}</small></header>
<button onclick="window.print()">Print / Save as PDF</button><div class="stats"><div><strong>{s['source_count']}</strong>Sources</div><div><strong>{s['candidate_count']}</strong>Classification candidates</div><div><strong>{s['reopened']}</strong>Reopened reviews</div><div><strong>{s['gap_count']}</strong>Missing metadata items</div></div>
{issues}<h2>Current field decisions</h2><div class="table-wrap"><table><thead><tr><th>Field / source / snapshot</th><th>Candidate / availability</th><th>Classification</th><th>Metadata</th><th>Gaps</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<h2>Findings and next steps</h2>{findings or '<p>No findings.</p>'}<h2>AI run history</h2>{ai_sections or '<p>No AI review has been run.</p>'}
<h2>AI proposals and actions</h2><div class="table-wrap"><table><thead><tr><th>Field / scope</th><th>Action status</th><th>Model</th><th>Explanation</th></tr></thead><tbody>{proposed}</tbody></table></div>
<h2>Report basis</h2><p>{esc(s['basis'])}</p><ul>{''.join('<li>'+esc(x)+'</li>' for x in report['limitations'])}</ul></main></body></html>'''
    return page, 'text/html', '.html'
