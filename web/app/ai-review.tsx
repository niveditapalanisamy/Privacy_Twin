"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Download,
  Pause,
  Play,
  Square,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { api, Button, Badge } from "./ui";
import type { View, Workspace } from "./types";

type Options = {
  mode: "draft" | "automatic";
  source_id: string | null;
  scopes: string[];
  confidence_threshold: number;
  max_fields: number;
  share_field_names: boolean;
};
type Proposal = {
  id: string;
  field_id: string;
  field: string;
  scope: string;
  status: string;
  review_state?: string;
  payload: {
    model: string;
    decision: {
      outcome: string;
      selected_class: string | null;
      confidence: number;
      rationale: string;
      suggestion: string;
      validation_notes: string[];
    };
  };
};
type AIRun = {
  id: string;
  status: string;
  processed: number;
  total: number;
  error: string;
  options: Options;
  created_at: string;
  summaries: string[];
  usage: { totalTokenCount?: number };
  proposals?: Proposal[];
};
type Status = { configured: boolean; model: string; runs: AIRun[] };

export default function AIReview({
  workspace,
  inspect,
  onRefresh,
}: {
  workspace: Workspace;
  inspect: (id: string, view?: View) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState("");
  const [run, setRun] = useState<AIRun | null>(null);
  const [options, setOptions] = useState<Options>({
    mode: "automatic",
    source_id: null,
    scopes: ["classification", "metadata"],
    confidence_threshold: 0.95,
    max_fields: 100,
    share_field_names: false,
  });
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const signature = useRef("");
  useEffect(() => {
    let active = true;
    api<Status>("/ai")
      .then((data) => {
        if (active) {
          setStatus(data);
          setSelected(data.runs[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setRun(null);
    async function poll() {
      try {
        const data = await api<AIRun>(`/ai/runs/${selected}`);
        if (!active) return;
        setRun(data);
        setStatus((previous) =>
          previous
            ? {
                ...previous,
                runs: previous.runs.map((r) => (r.id === data.id ? data : r)),
              }
            : previous,
        );
        const next = `${data.id}:${data.status}:${data.processed}:${data.proposals?.map((p) => p.status).join(",")}`;
        if (signature.current && signature.current !== next)
          await refreshRef.current();
        signature.current = next;
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load run");
      }
      if (active) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selected]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const data = await api<AIRun>(path, body);
      setRun(data);
      setSelected(data.id);
      setStatus(await api<Status>("/ai"));
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const activeRun = status?.runs.find((r) =>
    ["running", "paused", "quota", "failed"].includes(r.status),
  );
  const running = run?.status === "running";
  const proposals = run?.proposals || [];
  const visible = proposals.filter(
    (p) => filter === "all" || p.status === filter,
  );
  const actionable = proposals.filter((p) => p.status === "pending").length;
  return (
    <section className="automation-panel" aria-label="AI review controls">
      <div className="automation-heading">
        <div className="automation-title">
          <span className="automation-icon">
            <Bot size={25} />
          </span>
          <div>
            <span className="section-kicker">GEMINI REVIEW</span>
            <h2>Review automation</h2>
          </div>
        </div>
        <Badge value={status?.configured ? "current" : "missing"}>
          {status?.configured ? "Key configured" : "Key not configured"}
        </Badge>
      </div>
      <div className="automation-model">
        <strong>{status?.model || "Gemini"}</strong>
        <span>Free-tier model · no fallback · no paid tools</span>
      </div>
      <div className="automation-settings">
        <label>
          Review mode
          <select
            value={options.mode}
            onChange={(e) =>
              setOptions({
                ...options,
                mode: e.target.value as Options["mode"],
              })
            }
          >
            <option value="automatic">
              Apply eligible decisions automatically
            </option>
            <option value="draft">Draft proposals for my approval</option>
          </select>
        </label>
        <label>
          Source
          <select
            value={options.source_id || ""}
            onChange={(e) =>
              setOptions({ ...options, source_id: e.target.value || null })
            }
          >
            <option value="">All sources</option>
            {workspace.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum model confidence
          <select
            value={options.confidence_threshold}
            onChange={(e) =>
              setOptions({
                ...options,
                confidence_threshold: Number(e.target.value),
              })
            }
          >
            <option value={0.7}>70%</option>
            <option value={0.8}>80%</option>
            <option value={0.9}>90%</option>
            <option value={0.95}>95%</option>
            <option value={1}>100%</option>
          </select>
        </label>
        <label>
          Maximum fields per run
          <input
            type="number"
            min={1}
            max={250}
            value={options.max_fields}
            onChange={(e) =>
              setOptions({ ...options, max_fields: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <div className="automation-checks">
        {["classification", "metadata"].map((scope) => (
          <label key={scope}>
            <input
              type="checkbox"
              checked={options.scopes.includes(scope)}
              onChange={(e) =>
                setOptions({
                  ...options,
                  scopes: e.target.checked
                    ? [...options.scopes, scope]
                    : options.scopes.filter((s) => s !== scope),
                })
              }
            />
            {scope === "classification"
              ? "Classification review"
              : "Metadata completeness review"}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={options.share_field_names}
            onChange={(e) =>
              setOptions({ ...options, share_field_names: e.target.checked })
            }
          />
          Share field names with Gemini
        </label>
      </div>
      <p className="automation-note">
        Sends aggregate patterns, counts and metadata completeness to Google.
        Raw rows and declaration text stay local. Current decisions are
        protected. Confidence is the model’s estimate; local evidence checks
        also apply.
      </p>
      <details className="analysis-basis">
        <summary>Free-tier usage</summary>
        <p>
          Only the configured free-tier-eligible model is used. Quota errors
          pause the run; there are no automatic retries or model switches.
          Google controls the project’s billing tier; keep this key on a
          free-tier project. Google’s free-tier terms may allow submitted data
          to improve its products.
        </p>
        <a
          href="https://ai.google.dev/gemini-api/docs/pricing"
          target="_blank"
          rel="noreferrer"
        >
          Google pricing and data terms ↗
        </a>
      </details>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="automation-actions">
        <Button
          primary
          disabled={
            busy ||
            !status?.configured ||
            !!activeRun ||
            !options.scopes.length ||
            !Number.isInteger(options.max_fields) ||
            options.max_fields < 1 ||
            options.max_fields > 250
          }
          onClick={() => act("/ai/runs", options)}
        >
          <Play size={15} />
          Start review
        </Button>
        {activeRun && activeRun.id !== selected && (
          <Button onClick={() => setSelected(activeRun.id)}>
            Open active run
          </Button>
        )}
        <a className="button" href="/api/final-report">
          <Download size={15} />
          Final report · HTML / PDF
        </a>
        <a className="button" href="/api/final-report?format=json">
          <Download size={15} />
          Report JSON
        </a>
      </div>
      {status?.runs.length ? (
        <label className="run-picker">
          Run history
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {status.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString()} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {run && (
        <div className="automation-run">
          <div className="automation-run-head">
            <div>
              <h3>Review {run.id.slice(0, 8)}</h3>
              <p>
                {run.processed} / {run.total} fields analyzed ·{" "}
                {run.options.mode} · {run.status}
              </p>
            </div>
            <div className="actions">
              {running && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(`/ai/runs/${run.id}/control`, { action: "pause" })
                  }
                >
                  <Pause size={14} />
                  Pause
                </Button>
              )}
              {["paused", "quota", "failed"].includes(run.status) && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(`/ai/runs/${run.id}/control`, { action: "resume" })
                  }
                >
                  <Play size={14} />
                  Resume
                </Button>
              )}
              {["running", "paused", "quota", "failed"].includes(
                run.status,
              ) && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(`/ai/runs/${run.id}/control`, { action: "cancel" })
                  }
                >
                  <Square size={14} />
                  Cancel
                </Button>
              )}
            </div>
          </div>
          <progress
            aria-label="AI review progress"
            value={run.processed}
            max={Math.max(run.total, 1)}
          />
          {run.error && (
            <p className="source-warning" role="status">
              {run.error}
            </p>
          )}
          <p className="automation-note">
            Pause stops new calls and automatic applications; an in-flight
            response may finish as drafts. Cancel keeps completed work and
            discards the in-flight response. Revoke an applied decision to
            require a new review.
          </p>
          <div className="automation-stats">
            <span>
              <strong>
                {proposals.filter((p) => p.status === "applied").length}
              </strong>{" "}
              Applied
            </span>
            <span>
              <strong>{actionable}</strong> Awaiting action
            </span>
            <span>
              <strong>
                {
                  proposals.filter(
                    (p) => p.payload.decision.outcome === "unresolved",
                  ).length
                }
              </strong>{" "}
              Unresolved
            </span>
            <span>
              <strong>{run.usage.totalTokenCount || 0}</strong> Tokens used
            </span>
          </div>
          {run.summaries.length > 0 && (
            <details className="analysis-basis">
              <summary>Model findings by batch</summary>
              {run.summaries.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
          )}
          <label className="run-picker">
            Show proposals
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {[
                "all",
                "pending",
                "applied",
                "rejected",
                "revoked",
                "stale",
              ].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <div className="ai-proposals">
            {visible.map((p) => (
              <article className="ai-proposal" key={p.id}>
                <div className="finding-top">
                  <strong>
                    {p.field} · {p.scope}
                  </strong>
                  <Badge value={p.status}>
                    {p.status}
                    {p.review_state ? ` / ${p.review_state}` : ""}
                  </Badge>
                </div>
                <h3>
                  {p.payload.decision.selected_class ||
                    p.payload.decision.outcome}{" "}
                  <span className="confidence-value">
                    {Math.round(p.payload.decision.confidence * 100)}% model
                    confidence
                  </span>
                </h3>
                <p>{p.payload.decision.rationale}</p>
                <div className="suggestion">
                  <strong>Suggested next step</strong>
                  <p>{p.payload.decision.suggestion}</p>
                </div>
                {p.payload.decision.validation_notes.map((n) => (
                  <p className="validation-note" key={n}>
                    {n}
                  </p>
                ))}
                <div className="actions">
                  {p.status === "pending" && (
                    <>
                      <Button
                        disabled={busy}
                        primary
                        onClick={() =>
                          act(`/ai/proposals/${p.id}`, { action: "accept" })
                        }
                      >
                        Accept{" "}
                        {p.payload.decision.outcome === "unresolved"
                          ? "as unresolved"
                          : "decision"}
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(`/ai/proposals/${p.id}`, { action: "reject" })
                        }
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {p.status === "applied" &&
                    p.review_state !== "superseded" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(`/ai/proposals/${p.id}`, { action: "revoke" })
                        }
                      >
                        <RotateCcw size={14} />
                        Revoke
                      </Button>
                    )}
                  <Button onClick={() => inspect(p.field_id, "review")}>
                    Inspect field <ArrowUpRight size={14} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!visible.length && (
            <p className="automation-note">
              {running
                ? "Waiting for the next batch of reviews…"
                : "No proposals in this filter."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
