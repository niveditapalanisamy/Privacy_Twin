"""Turn actual browser captures into a self-contained learning guide. No source scanning here."""
import base64
import html
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "walkthrough"


def build():
    manifest = json.loads((OUTPUT / "steps.json").read_text(encoding="utf-8"))
    steps = manifest["steps"]
    if len(steps) != 42 or len({s["id"] for s in steps}) != 42:
        raise ValueError("Expected all 42 distinct screenshot steps; finish the isolated capture first")
    esc = html.escape
    captured = datetime.fromisoformat(manifest["generated_at"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %B %Y, %H:%M IST")
    glossary = [
        ("Source", "One registered CSV file or SQLite database. The app keeps a controlled local copy."),
        ("Field", "One column in one exact source/table identity. A row is one record, not a field."),
        ("Candidate", "A supported scanner interpretation that still needs context and human review."),
        ("Evidence / score", "Detector observations and their weighted contributions. A score is not a probability."),
        ("Snapshot", "An immutable record of aggregate evidence from a committed scan."),
        ("Declaration", "Purpose, retention and other business context explicitly supplied by an owner."),
        ("Classification review", "A human decision about what the field represents."),
        ("Metadata review", "A separate human decision about the declared documentation."),
        ("Current", "The saved decision's dependencies have not materially changed. Its outcome can still be unresolved."),
        ("Clear / unresolved / none", "The review outcome: accepted, needs clarification, or no supported conclusion."),
        ("Reopened", "Dependencies changed and the prior decision needs another look. This does not itself establish a violation."),
        ("Missing / unreviewed", "The old field disappeared, or no human decision exists for the field/scope."),
        ("Ready", "A present field with current clear reviews, complete configured metadata and current scan policy. A technical workflow status."),
        ("Gap", "One missing configured documentation requirement. Multiple gaps can belong to one field."),
        ("Precision / recall / support", "How many predicted positives were correct / how many labelled positives were found / how many positive labels were tested."),
    ]
    glossary_rows = "".join(f"<tr><th>{esc(term)}</th><td>{esc(meaning)}</td></tr>" for term, meaning in glossary)
    scenario_summary = [
        ("21-challenge-values", "Change values", "Reopened", "Current", "Current"),
        ("22-challenge-purpose", "Remove purpose", "Current", "Reopened", "Current"),
        ("23-challenge-relevant_rule", "Change relevant rule", "Reopened", "Current", "Current"),
        ("24-challenge-unrelated_rule", "Change unrelated rule", "Current", "Current", "Current"),
        ("25-challenge-identical", "Identical rescan", "Current", "Current", "Current"),
        ("26-challenge-rename", "Rename without mapping", "Missing", "Missing", "Current; new field unreviewed"),
        ("27-challenge-reversion", "Restore original values", "Still reopened", "Current", "Current"),
        ("28-challenge-small_change", "Rate change below tolerance", "Current", "Current", "Current"),
    ]
    scenarios = "".join(f'<tr><td><a href="#{id}">{esc(title)}</a></td><td>{esc(classification)}</td><td>{esc(metadata)}</td><td>{esc(other)}</td></tr>' for id, title, classification, metadata, other in scenario_summary)
    groups = list(dict.fromkeys(s["group"] for s in steps))
    toc_parts = []
    for group in groups:
        items = "".join(f'<li><a href="#{s["id"]}">{esc(s["title"])}</a></li>' for s in steps if s["group"] == group)
        toc_parts.append(f"<section><h3>{esc(group)}</h3><ol>{items}</ol></section>")
    toc = "".join(toc_parts)
    cards = []
    markdown = ["# PrivacyTwin — full screenshot walkthrough", "", f"Captured {captured}. All screenshots use an isolated synthetic workspace.", "", "Open PrivacyTwin-Full-Walkthrough.html for the self-contained, clickable guide, or the PDF for a printable copy.", ""]
    for number, step in enumerate(steps, 1):
        data = base64.b64encode((OUTPUT / step["screenshot"]).read_bytes()).decode()
        cards.append(f'''<section class="step" id="{step['id']}"><div class="step-heading"><span class="step-number">{number:02d}</span><div><p class="eyebrow">{esc(step['group'])}</p><h2>{esc(step['title'])}</h2></div></div>
          <p class="clicks"><b>What to click:</b> {esc(step['clicks'])}</p><p class="explanation">{esc(step['explanation'])}</p>
          <figure><img src="data:image/png;base64,{data}" alt="Actual application screenshot: {esc(step['title'])}" onclick="openImage(this)" loading="eager"><figcaption>Screenshot {number:02d} · Click the image to enlarge it in the HTML guide.</figcaption></figure>
          <p class="observed"><b>What happened:</b> {esc(step['observed'])}</p><a class="back" href="#contents">Back to contents ↑</a></section>''')
        markdown.extend([f"## {number:02d}. {step['title']}", "", f"**What to click:** {step['clicks']}", "", step["explanation"], "", f"![{step['title']}]({step['screenshot']})", "", f"**Observed:** {step['observed']}", ""])
    page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PrivacyTwin · Full screenshot walkthrough</title><style>
      *{box-sizing:border-box}html{scroll-behavior:smooth}body{font:16px/1.7 'Segoe UI',Arial,sans-serif;color:#29243f;background:#f0eef7;margin:0}main{max-width:1250px;margin:auto;padding:30px}.cover,.intro,.step{background:white;border:1px solid #dfd9ed;border-radius:20px;padding:35px;margin-bottom:24px}.cover{background:linear-gradient(120deg,#30264b,#514083);color:white}.cover h1{font-size:46px;line-height:1.16;letter-spacing:-1.5px;margin:15px 0}.cover p{color:#ebe4ff}.eyebrow{text-transform:uppercase;letter-spacing:1.7px;font-size:11px;color:#766791;margin:0 0 6px}.cover .eyebrow{color:#cfc1ee}.lead{font-size:23px}.flow{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:20px 0}.flow span{border:1px solid #ddd5ec;border-radius:9px;padding:9px 13px;background:#f4f0fc;font-size:14px;font-weight:600}.flow i{font-style:normal;color:#9788ad}h2{font-size:27px;line-height:1.25;margin:0 0 14px;color:#473568}h3{font-size:19px;color:#5c477e}p{margin:12px 0}.toc{display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px}.toc ol{padding-left:24px}.toc li{margin:9px 0;font-size:14px}a{color:#6244b5;text-decoration:none}a:hover{text-decoration:underline}table{width:100%;border-collapse:collapse;font-size:14px;margin-top:15px}th,td{padding:10px 12px;border:1px solid #e4deed;text-align:left;vertical-align:top}th{background:#f3eefb;color:#594375}th:first-child{width:24%}.notice{padding:17px 20px;background:#fff4df;border-left:4px solid #d6a743;border-radius:8px;font-size:14px}.step{scroll-margin-top:20px}.step-heading{display:flex;gap:18px;align-items:flex-start}.step-number{display:grid;place-items:center;min-width:48px;height:48px;border-radius:12px;background:#eee7fb;color:#6648af;font-weight:800;font-size:20px}.clicks{font-size:14px;background:#f6f3fc;padding:12px 16px;border-radius:9px}.explanation{font-size:16px;line-height:1.75}.observed{padding:13px 18px;border-left:4px solid #51a384;background:#edf8f2;border-radius:8px;font-size:15px}figure{margin:20px 0;text-align:center;border:1px solid #e2dcec;border-radius:12px;padding:10px;background:#f8f7fc}figure img{display:block;width:auto;max-width:100%;max-height:950px;margin:auto;cursor:zoom-in}figcaption{font-size:11px;color:#7d738e;margin-top:8px}.back{font-size:12px}.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}button,.toolbar a{font:inherit;padding:11px 17px;border:0;border-radius:9px;background:#6a4cb5;color:white;cursor:pointer}dialog{border:0;border-radius:12px;width:96vw;max-width:1800px;max-height:96vh;padding:16px;background:#f8f7fc}dialog::backdrop{background:#171024dd}dialog img{display:block;max-width:100%;height:auto;margin:10px auto}dialog .close{position:sticky;top:0;float:right;background:#312344}.small{font-size:13px;color:#786c89}
      @media(max-width:800px){main{padding:12px}.cover,.intro,.step{padding:20px;border-radius:14px}.cover h1{font-size:32px}.toc{grid-template-columns:1fr}h2{font-size:23px}.table-wrap{overflow:auto}.step-heading{gap:12px}.explanation{font-size:15px}}
      @page{size:A4 landscape;margin:10mm 13mm}@media print{body{background:white;font-size:10pt}main{max-width:none;padding:0}.cover,.intro,.step{border:0;border-radius:0;margin:0;padding:0;break-after:page}.cover{background:white;color:#29243f}.cover p,.cover .eyebrow{color:#56446e}.cover h1{font-size:30pt}.cover .lead{font-size:17pt}.cover{padding-top:15mm}.intro h2{font-size:19pt}.intro p{font-size:10pt}.intro table{font-size:8pt}.intro th,.intro td{padding:5px 8px}.toc{grid-template-columns:1fr 1fr 1fr;gap:15px}.toc h3{font-size:12pt}.toc li{font-size:8pt;margin:3px 0}.step h2{font-size:17pt;margin:0}.step-heading{gap:10px;align-items:center}.step-number{min-width:32px;height:32px;font-size:13pt}.eyebrow{font-size:7pt;margin-bottom:3px}.clicks{font-size:8.5pt;padding:6px 10px;margin:7px 0}.explanation{font-size:9pt;line-height:1.5;margin:7px 0}.observed{font-size:9pt;padding:7px 11px;margin:7px 0}figure{border:1px solid #e2dcec;padding:3px;margin:8px 0}figure img{max-height:111mm;width:auto;max-width:100%;object-fit:contain}figcaption{font-size:6.5pt;margin-top:3px}.toolbar,.back,dialog{display:none!important}.notice{font-size:9pt;padding:10px 13px}.small{font-size:8pt}.step:last-of-type{break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><main>'''
    page += f'''<section class="cover"><p class="eyebrow">PrivacyTwin · learn by following real screens</p><h1>The full end-to-end<br>screenshot walkthrough</h1><p class="lead">42 actual screenshots. Every ReviewGuard scenario.<br>What to click, what it means, and what happened.</p><p>Start here if you want to understand the project before presenting it.</p><p class="small" style="color:#dfd2f6">Captured {esc(captured)} · separate synthetic workspace · no provider requests</p><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><a href="#contents">Browse the flow</a><a href="#glossary">Learn the terms</a></div></section>
      <section class="intro"><h2>What the project does</h2><p>PrivacyTwin inspects columns in structured files, finds candidate personal data, links explicit purpose and retention declarations, and records human reviews. ReviewGuard checks whether the evidence behind an existing decision is still current after a change.</p><div class="flow"><span>1. Upload</span><i>→</i><span>2. Scan</span><i>→</i><span>3. Inspect evidence</span><i>→</i><span>4. Review</span><i>→</i><span>5. Document</span><i>→</i><span>6. Rescan</span><i>→</i><span>7. Export</span></div>
      <h3>Two questions, two reviews</h3><p><b>Classification:</b> “What does this field represent?”<br><b>Metadata:</b> “What purpose, retention and owner context has been declared and reviewed?”</p><p>A change to values may affect the first answer. A change to a declared purpose may affect the second. Keeping these dependencies separate is the signature behavior.</p><div class="notice">All source values and reviewer actions shown here are synthetic demonstration data. Screenshots show actual calculated UI results. Persistent navigation and transient notifications are hidden only during focused captures to keep them from covering the evidence. No business results are edited. Optional AI controls are documented but no external-provider run is performed.</div>
      <h3>The main example</h3><p>walkthrough_v1.csv has 20 records and four fields. walkthrough_v2.csv keeps the same headers and changes only employee_id to phone-shaped values. Both files are included in the walkthrough download. The later built-in CSV/SQLite examples add more sources; those totals are explained separately.</p></section>
      <section class="intro" id="contents"><h2>Contents</h2><p>Follow A from top to bottom. Then use B to understand every change rule and C for evaluation, exports and error handling. Click a screenshot to inspect it at full resolution.</p><div class="toc">{toc}</div></section>
      <section class="intro" id="glossary"><h2>The words on the screen</h2><div class="table-wrap"><table><tbody>{glossary_rows}</tbody></table></div><p class="notice"><b>Most important distinction:</b> current is freshness; clear is an outcome; complete is documentation; ready combines technical workflow conditions. None is a legal compliance certificate.</p></section>
      <section class="intro"><h2>All eight ReviewGuard scenarios at a glance</h2><p>The challenge starts with two fields and two saved reviews per field. A renamed field adds a fifth identity check. Each scenario runs independently in a disposable database.</p><div class="table-wrap"><table><thead><tr><th>Change</th><th>Classification</th><th>Metadata</th><th>Unrelated email reviews</th></tr></thead><tbody>{scenarios}</tbody></table></div><p>Combined result on the reference policy: <b>33/33 expected states matched, 26 current states preserved, 0 false reopenings and 0 missed reopenings.</b> This is a scripted regression demonstration, not a measurement across all possible changes.</p></section>'''
    page += "".join(cards)
    page += '''<section class="intro"><h2>How to explain it in one minute</h2><p>“First we upload a file or database. PrivacyTwin inspects each field and shows evidence for candidate classes. A human reviews the classification and the owner's declared metadata separately. We preview missing documentation before saving. When the data or rules change, ReviewGuard compares the new dependencies with the original decision. It reopens affected reviews, gives a reason and preserves unrelated decisions. We export the inventory, gaps and original evidence so the result can be inspected later.”</p><p class="notice">For submission, independently human-labelled evaluation and the organizer's report/repository requirements still matter. Perfect scores on the small bundled synthetic set do not establish general accuracy. Complete metadata is technical documentation, not a legal determination.</p></section></main>
      <dialog id="image-viewer"><button class="close" onclick="this.parentElement.close()">Close image ×</button><img alt="Full-resolution walkthrough screenshot"></dialog><script>
      function openImage(image){const d=document.getElementById('image-viewer');d.querySelector('img').src=image.src;d.querySelector('img').alt=image.alt;d.showModal();}document.getElementById('image-viewer').addEventListener('click',function(event){if(event.target===this)this.close();});
      </script></body></html>'''
    (OUTPUT / "PrivacyTwin-Full-Walkthrough.html").write_text(page, encoding="utf-8")
    (OUTPUT / "WALKTHROUGH.md").write_text("\n".join(markdown), encoding="utf-8")
    print(json.dumps(dict(screenshots=len(steps), html=str(OUTPUT / "PrivacyTwin-Full-Walkthrough.html"), captured_at=captured), indent=2))


if __name__ == "__main__":
    build()
