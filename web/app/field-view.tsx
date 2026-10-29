"use client";
import { useState } from "react";
import EvidenceExperiment from "./evidence-experiment";
import { useDraftGuard } from "./use-draft-guard";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Fingerprint,
  GitCompareArrows,
  History,
  Layers3,
  ListChecks,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { Detail, Draft, Preview, Scope, Token, View } from "./types";
import type { Run } from "./page";
import {
  api,
  Badge,
  Button,
  Checklist,
  colors,
  Family,
  families,
  formatValue,
  Hero,
  labels,
  Panel,
  short,
  time,
  Timeline,
} from "./ui";

export default function DetailView({
  detail,
  view,
  setView,
  busy,
  run,
  refresh,
}: {
  detail: Detail;
  view: View;
  setView: (v: View) => void;
  busy: string;
  run: Run;
  refresh: () => Promise<unknown>;
}) {
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const current = detail.snapshots[0];
  const snapshot = detail.snapshots[snapshotIndex] || current;
  const previous = detail.snapshots[snapshotIndex + 1];
  const result = snapshot.payload;
  const activeReviews = detail.reviews.filter((r) => r.state !== "superseded");
  return (
    <>
      <button className="back-link" onClick={() => setView("inventory")}>
        <ArrowLeft size={15} />
        Back to inventory
      </button>
      <Hero
        eyebrow={`${detail.field.source_name} / ${detail.field.table_key}`}
        title={detail.field.name}
        actions={
          <>
            <Badge value={detail.field.availability} />
            <span className="id-label">Field {short(detail.field.id)}</span>
          </>
        }
      />
      <div className="field-tabs">
        <button
          onClick={() => setView("evidence")}
          className={view === "evidence" ? "selected" : ""}
        >
          <Fingerprint size={17} />
          Evidence
        </button>
        <button
          onClick={() => setView("review")}
          className={view === "review" ? "selected" : ""}
        >
          <ShieldCheck size={17} />
          Review decision
        </button>
        <button
          onClick={() => setView("fix")}
          className={view === "fix" ? "selected" : ""}
        >
          <Layers3 size={17} />
          Declaration & preview
        </button>
      </div>
      <div className="field-scope-bar">
        {(["classification", "metadata"] as Scope[]).map((scope) => {
          const review = activeReviews.find((r) => r.scope === scope);
          return (
            <div key={scope}>
              <span>{scope}</span>
              <Badge value={review?.state || "unreviewed"} />
              {review && (
                <small>
                  {review.outcome} · {review.reviewer}
                </small>
              )}
            </div>
          );
        })}
        <button className="text-button" disabled={!!busy} onClick={refresh}>
          <RefreshCw size={14} />
          Reload evidence
        </button>
      </div>
      {detail.policy_stale && (
        <div className="warning-banner">
          Configuration has changed since this scan. Rescan the source before
          saving a new review.
        </div>
      )}
      {view === "evidence" && (
        <>
          <div className="evidence-toolbar">
            <h2>Field evidence</h2>
            <label>
              Snapshot
              <select
                aria-label="Evidence snapshot"
                value={snapshotIndex}
                onChange={(e) => setSnapshotIndex(Number(e.target.value))}
              >
                {detail.snapshots.map((s, i) => (
                  <option key={s.id} value={i}>
                    {i === 0 ? "Latest · " : ""}
                    {time(s.created_at)} · {short(s.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="evidence-summary">
            <div className="evidence-main">
              <span className="eyebrow">SUGGESTED INTERPRETATION</span>
              <div className="candidate-title">
                <span
                  className="candidate-symbol"
                  style={{ color: colors[result.suggested || "Identity"] }}
                >
                  <Fingerprint size={32} />
                </span>
                <h2>{result.suggested || "Insufficient support"}</h2>
              </div>
              <p>
                {result.insufficient
                  ? "No non-null values were available for analysis."
                  : result.ambiguous
                    ? "Competing class evidence is close under the configured near-tie threshold."
                    : result.mixed
                      ? "Multiple value patterns coexist in this field. Inspect their counts below."
                      : "Inspect the supporting patterns and context before recording a decision."}
              </p>
              <div className="evidence-flags">
                {result.ambiguous && <Badge value="ambiguous" />}
                {result.mixed && <Badge value="mixed" />}
                <Badge value="snapshot">Snapshot {short(snapshot.id)}</Badge>
              </div>
            </div>
            <div className="profile-grid">
              {[
                ["Rows", result.profile.rows],
                ["Non-null", result.profile.non_null],
                ["Distinct", result.profile.distinct_count],
                ["Null values", result.profile.null_count],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="two-columns">
            <Panel title="Typed evidence">
              {result.evidence.length ? (
                <div className="evidence-list">
                  {result.evidence.map((e) => (
                    <div className="evidence-item" key={e.evidence_id}>
                      <div className="evidence-item-top">
                        <span
                          className="evidence-dot"
                          style={{ background: colors[e.candidate_class] }}
                        />
                        <strong>{e.label}</strong>
                        <span className="subtle-label">
                          {e.group.replaceAll("_", " ")}
                        </span>
                      </div>
                      {e.matches !== undefined ? (
                        <>
                          <div className="evidence-count">
                            <strong>{e.matches}</strong>
                            <span>/ {e.sampled_non_null} non-null values</span>
                          </div>
                          <div className="meter">
                            <span
                              style={{
                                width: `${(e.pass_rate || 0) * 100}%`,
                                background: colors[e.candidate_class],
                              }}
                            />
                          </div>
                          {e.format_matches !== e.matches && (
                            <p className="form-note">
                              {e.format_matches} format matches; {e.matches}{" "}
                              passed the configured checksum.
                            </p>
                          )}
                        </>
                      ) : null}
                      <p>{e.notes.join(" · ")}</p>
                      <code>{e.evidence_id}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="quiet">
                  No configured detector found supporting evidence.
                </div>
              )}
            </Panel>
            <Panel title="Candidate scores">
              <div className="candidate-scores">
                {result.candidates.map((c) => (
                  <div key={c.label}>
                    <div className="candidate-score-label">
                      <Family name={c.label} />
                      <strong>{c.score.toFixed(3)}</strong>
                    </div>
                    <div className="contribution-bar">
                      {Object.entries(c.contributions).map(
                        ([group, value], i) => (
                          <span
                            key={group}
                            style={{
                              width: `${value * 100}%`,
                              background: colors[c.label],
                              opacity: 1 - i * 0.23,
                            }}
                            title={`${group}: ${value.toFixed(3)}`}
                          />
                        ),
                      )}
                    </div>
                    <div className="contribution-labels">
                      {Object.entries(c.contributions)
                        .filter(([, v]) => v > 0)
                        .map(([group, value]) => (
                          <span key={group}>
                            {group.replaceAll("_", " ")}{" "}
                            <b>{value.toFixed(3)}</b>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
                {!result.candidates.length && (
                  <p className="quiet">
                    The scanner abstained from assigning a candidate.
                  </p>
                )}
              </div>
              <div className="profile-details">
                <h3>Profile & sampling</h3>
                <dl>
                  <dt>Sampling policy</dt>
                  <dd>{result.sampling.id}</dd>
                  <dt>Null policy</dt>
                  <dd>{result.sampling.null_policy}</dd>
                  <dt>Value length</dt>
                  <dd>
                    {result.profile.min_length}–{result.profile.max_length}{" "}
                    characters
                  </dd>
                  <dt>Shapes</dt>
                  <dd>
                    {Object.entries(result.profile.shapes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ") || "No values"}
                  </dd>
                  <dt>Raw records in evidence</dt>
                  <dd>None</dd>
                </dl>
              </div>
            </Panel>
          </div>
          <EvidenceExperiment
            key={snapshot.id}
            fieldId={detail.field.id}
            snapshotId={snapshot.id}
          />
          <Panel
            title="Snapshot comparison"
            action={<GitCompareArrows size={20} />}
          >
            <div className="snapshot-compare">
              <div>
                <span className="eyebrow">
                  {previous ? "PREVIOUS SNAPSHOT" : "NO PREVIOUS SNAPSHOT"}
                </span>
                <h3>{previous?.payload.suggested || "—"}</h3>
                <p>
                  {previous
                    ? `${previous.payload.profile.non_null} non-null values · ${time(previous.created_at)}`
                    : "A second scan will create a before/after comparison."}
                </p>
                {previous?.payload.evidence
                  .filter((e) => e.matches !== undefined)
                  .map((e) => (
                    <span className="comparison-evidence" key={e.evidence_id}>
                      {e.label}
                      <strong>
                        {e.matches} / {e.sampled_non_null}
                      </strong>
                    </span>
                  ))}
              </div>
              <span className="compare-arrow">
                <ArrowRight size={23} />
              </span>
              <div className="new-snapshot">
                <span className="eyebrow">SELECTED SNAPSHOT</span>
                <h3>{result.suggested || "Abstained"}</h3>
                <p>
                  {result.profile.non_null} non-null values ·{" "}
                  {time(snapshot.created_at)}
                </p>
                {result.evidence
                  .filter((e) => e.matches !== undefined)
                  .map((e) => (
                    <span className="comparison-evidence" key={e.evidence_id}>
                      {e.label}
                      <strong>
                        {e.matches} / {e.sampled_non_null}
                      </strong>
                    </span>
                  ))}
              </div>
            </div>
          </Panel>
          <div className="evidence-footnote">
            {result.limitations.join(" ")}
          </div>
        </>
      )}
      {view === "review" && (
        <ReviewForm
          key={detail.field.id}
          detail={detail}
          busy={busy}
          run={run}
        />
      )}
      {view === "fix" && (
        <DeclarationForm
          key={detail.field.id}
          detail={detail}
          busy={busy}
          run={run}
        />
      )}
      <Panel title="Field history" action={<History size={19} />}>
        <Timeline events={detail.events} />
      </Panel>
    </>
  );
}

function ReviewForm({
  detail,
  busy,
  run,
}: {
  detail: Detail;
  busy: string;
  run: Run;
}) {
  const [scope, setScope] = useState<Scope>("classification");
  const [outcome, setOutcome] = useState("clear");
  const [selectedClass, setSelectedClass] = useState(
    detail.snapshots[0].payload.suggested || "",
  );
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [relies, setRelies] = useState(false);
  const [evidence, setEvidence] = useState<string[]>(
    detail.snapshots[0].payload.evidence.map((e) => e.evidence_id),
  );
  const [token, setToken] = useState<Token>(detail.token);
  const stale = JSON.stringify(token) !== JSON.stringify(detail.token);
  const payload = detail.snapshots[0].payload;
  useDraftGuard(rationale.trim().length > 0);
  async function save() {
    const saved = await run(
      "Saving scoped review",
      () =>
        api(`/fields/${detail.field.id}/reviews`, {
          ...token,
          scope,
          outcome,
          selected_class: selectedClass || null,
          reviewer,
          rationale,
          relies_on_meaning: relies,
          evidence_ids: evidence,
        }),
      `${scope === "classification" ? "Classification" : "Metadata"} review saved against its evidence.`,
    );
    if (saved) setRationale("");
  }
  return (
    <div className="two-columns">
      <Panel title="Record a decision">
        <div className="form-body">
          <div className="scope-selector">
            {(["classification", "metadata"] as Scope[]).map((s) => (
              <button
                key={s}
                className={scope === s ? "selected" : ""}
                onClick={() => setScope(s)}
              >
                {s === "classification" ? (
                  <Fingerprint size={21} />
                ) : (
                  <ListChecks size={21} />
                )}
                <strong>{s}</strong>
                <small>
                  {s === "classification"
                    ? "Interpret the field evidence"
                    : "Review declared context"}
                </small>
                {scope === s && <Check size={16} />}
              </button>
            ))}
          </div>
          <label>
            Review outcome
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="clear">Clear · reviewed and accepted</option>
              <option value="unresolved">
                Unresolved · clarification needed
              </option>
              <option value="none">None · no supported conclusion</option>
            </select>
          </label>
          {scope === "classification" && outcome === "clear" && (
            <label>
              Accepted class
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">Select an evidenced candidate</option>
                {payload.candidates.map((c) => (
                  <option key={c.label}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Reviewer name
            <input
              value={reviewer}
              maxLength={100}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <label>
            Decision rationale
            <textarea
              rows={5}
              value={rationale}
              maxLength={2000}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Describe the evidence and context you relied on."
            />
          </label>
          <div className="textarea-count">
            {rationale.trim().length} / 2,000 · minimum 20 characters
          </div>
          {scope === "classification" && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={relies}
                onChange={(e) => setRelies(e.target.checked)}
              />
              This decision relies on the declared field meaning
            </label>
          )}
          {stale && (
            <div className="warning-banner">
              The field changed while this form was open. Your rationale is
              retained.
              <Button
                onClick={() => {
                  setToken(detail.token);
                  setEvidence(payload.evidence.map((e) => e.evidence_id));
                  setSelectedClass(payload.suggested || "");
                }}
              >
                Use latest evidence
              </Button>
            </div>
          )}
          <Button
            primary
            disabled={
              !!busy ||
              stale ||
              detail.policy_stale ||
              detail.field.availability === "missing" ||
              rationale.trim().length < 20 ||
              !reviewer.trim() ||
              (scope === "classification" &&
                outcome === "clear" &&
                !selectedClass)
            }
            onClick={save}
          >
            <ShieldCheck size={17} />
            Save {scope} review
          </Button>
        </div>
      </Panel>
      <div className="stack">
        <Panel title="Review dependencies">
          <div className="dependency-summary">
            <dl>
              <dt>Snapshot</dt>
              <dd className="mono">{short(token.expected_snapshot_id)}</dd>
              <dt>Declaration</dt>
              <dd>
                {token.expected_declaration_id
                  ? short(token.expected_declaration_id)
                  : "No declaration"}
              </dd>
              <dt>Policy</dt>
              <dd className="mono">{short(token.expected_policy_id)}</dd>
            </dl>
            {scope === "classification" ? (
              <div className="evidence-choices">
                {payload.evidence.map((e) => (
                  <label className="inline-check" key={e.evidence_id}>
                    <input
                      type="checkbox"
                      checked={evidence.includes(e.evidence_id)}
                      onChange={(event) =>
                        setEvidence(
                          event.target.checked
                            ? [...evidence, e.evidence_id]
                            : evidence.filter((id) => id !== e.evidence_id),
                        )
                      }
                    />
                    <span>
                      {e.label}
                      <small>
                        {e.matches !== undefined
                          ? `${e.matches} / ${e.sampled_non_null} non-null values`
                          : "Header / declared context"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <Checklist items={detail.checklist} />
            )}
          </div>
        </Panel>
        <Panel title="Previous decisions">
          <div className="review-history">
            {detail.reviews.length ? (
              detail.reviews.map((r) => (
                <div key={r.id}>
                  <div>
                    <strong>{r.reviewer}</strong>
                    <Badge value={r.state} />
                  </div>
                  <small>
                    {r.scope} · {r.outcome} · {time(r.created_at)}
                  </small>
                  <p>{r.rationale}</p>
                  <code>snapshot {short(r.snapshot_id)}</code>
                </div>
              ))
            ) : (
              <p className="quiet">
                No human decisions have been recorded for this field.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DeclarationForm({
  detail,
  busy,
  run,
}: {
  detail: Detail;
  busy: string;
  run: Run;
}) {
  const [draft, setDraft] = useState<Draft>({ ...detail.declaration.payload });
  const [target, setTarget] = useState("field");
  const [token, setToken] = useState<Token>(detail.token);
  const [preview, setPreview] = useState<Preview | null>(null);
  const stale = JSON.stringify(token) !== JSON.stringify(detail.token);
  useDraftGuard(
    (Object.keys(draft) as (keyof Draft)[]).some(
      (key) => draft[key] !== detail.declaration.payload[key],
    ),
  );
  function update(key: keyof Draft, value: string | number | null) {
    setDraft({ ...draft, [key]: value });
    setPreview(null);
  }
  async function calculate() {
    await run(
      "Calculating declaration preview",
      async () => {
        const p = await api<Preview>(
          `/fields/${detail.field.id}/declaration/preview`,
          { ...token, draft, target_type: target },
        );
        setPreview(p);
      },
      "Preview calculated. No declaration or review was changed.",
    );
  }
  async function save() {
    if (!preview) return;
    const saved = await run(
      "Saving declaration",
      () =>
        api(`/fields/${detail.field.id}/declaration`, {
          ...token,
          draft,
          target_type: target,
          preview_digest: preview.preview_digest,
        }),
      "Declaration version saved. Affected reviews were reassessed.",
    );
    if (saved) setPreview(null);
  }
  const before = preview?.before_checklist || detail.checklist;
  const after = preview?.after_checklist;
  return (
    <div className="two-columns declaration-layout">
      <Panel
        title="Declaration draft"
        subtitle={`Effective ${detail.declaration.origin === "none" ? "declaration: not set" : `${detail.declaration.origin} declaration · revision ${detail.declaration.revision}`}`}
      >
        <div className="form-body">
          <label>
            Apply declaration to
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setPreview(null);
              }}
            >
              <option value="field">This field only</option>
              <option value="table">
                Entire table ({detail.field.table_key})
              </option>
            </select>
          </label>
          <label>
            Purpose
            <textarea
              rows={2}
              value={draft.purpose}
              onChange={(e) => update("purpose", e.target.value)}
              placeholder="Why is this data processed?"
            />
          </label>
          <div className="form-row">
            <label>
              Retention duration
              <input
                type="number"
                min="0.01"
                step="any"
                max="10000"
                value={draft.retention_duration ?? ""}
                onChange={(e) =>
                  update(
                    "retention_duration",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                placeholder="Duration"
              />
            </label>
            <label>
              Unit
              <select
                value={draft.retention_unit}
                onChange={(e) => update("retention_unit", e.target.value)}
              >
                <option value="">Select unit</option>
                <option>days</option>
                <option>months</option>
                <option>years</option>
              </select>
            </label>
          </div>
          <label>
            Retention start trigger
            <input
              value={draft.retention_start_trigger}
              onChange={(e) =>
                update("retention_start_trigger", e.target.value)
              }
              placeholder="e.g. Account closure"
            />
          </label>
          <label>
            Owner / data fiduciary
            <input
              value={draft.owner}
              onChange={(e) => update("owner", e.target.value)}
              placeholder="Responsible team or person"
            />
          </label>
          <label>
            Provenance
            <input
              value={draft.provenance}
              onChange={(e) => update("provenance", e.target.value)}
              placeholder="Policy, source document, or owner attestation"
            />
          </label>
          <label>
            Declared meaning <span className="muted">(optional)</span>
            <select
              value={draft.meaning}
              onChange={(e) => update("meaning", e.target.value)}
            >
              <option value="">No explicit class declaration</option>
              {families.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          {stale && (
            <div className="warning-banner">
              Evidence or declaration changed. Reload the version before
              previewing. Your draft will be retained.
              <Button
                onClick={() => {
                  setToken(detail.token);
                  setPreview(null);
                }}
              >
                Use latest version
              </Button>
            </div>
          )}
          <Button
            primary
            onClick={calculate}
            disabled={
              !!busy || stale || detail.field.availability === "missing"
            }
          >
            <GitCompareArrows size={16} />
            Preview effect
          </Button>
        </div>
      </Panel>
      <div className="stack">
        <Panel title="Before / after">
          <div className="preview-summary">
            <div>
              <span>SAVED REVISION {detail.declaration.revision}</span>
              <strong>
                {before.filter((c) => c.status !== "present").length}
              </strong>
              <small>open requirements</small>
            </div>
            <ArrowRight size={22} />
            <div className={preview ? "preview-ready" : ""}>
              <span>DRAFT PROJECTION</span>
              <strong>
                {after
                  ? after.filter((c) => c.status !== "present").length
                  : "—"}
              </strong>
              <small>
                {preview ? "open requirements" : "awaiting preview"}
              </small>
            </div>
          </div>
          {preview ? (
            <>
              <div className="declaration-diff">
                {Object.keys(preview.after)
                  .filter(
                    (k) =>
                      preview.before[k as keyof Draft] !==
                      preview.after[k as keyof Draft],
                  )
                  .map((key) => (
                    <div key={key}>
                      <strong>{labels[key] || key}</strong>
                      <span>
                        {formatValue(preview.before[key as keyof Draft])}
                        <ArrowRight size={13} />
                        {formatValue(preview.after[key as keyof Draft])}
                      </span>
                    </div>
                  ))}
                {JSON.stringify(preview.before) ===
                  JSON.stringify(preview.after) && (
                  <p>No effective property changes for this field.</p>
                )}
              </div>
              <div className="affected-scopes">
                <h3>Review impact</h3>
                {preview.affected.length ? (
                  preview.affected.map((f) => (
                    <div key={f.field_id}>
                      <code>{f.name}</code>
                      {f.scopes.length ? (
                        f.scopes.map((s) => (
                          <Badge key={s} value="reopened">
                            {s} reopens
                          </Badge>
                        ))
                      ) : (
                        <Badge value="preserved">
                          No current review affected
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p>
                    Explicit field overrides preserve their own declarations.
                  </p>
                )}
              </div>
              <div className="panel-actions">
                <Button primary onClick={save} disabled={!!busy || stale}>
                  <Save size={16} />
                  Save declaration
                </Button>
              </div>
            </>
          ) : (
            <div className="preview-placeholder">
              <GitCompareArrows size={32} />
              <h3>No preview</h3>
              <p>
                Edit the draft and preview its checklist changes and affected
                reviews.
              </p>
            </div>
          )}
        </Panel>
        <Panel title={preview ? "Projected checklist" : "Current checklist"}>
          <Checklist items={after || detail.checklist} />
        </Panel>
      </div>
    </div>
  );
}
