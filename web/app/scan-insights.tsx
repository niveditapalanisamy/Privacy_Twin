"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Database,
  ScanLine,
  ShieldCheck,
  Tags,
} from "lucide-react";
import type { View, Workspace } from "./types";
import { api, Button, colors, labels } from "./ui";

type Finding = {
  id: string;
  field_id: string;
  field: string;
  source: string;
  snapshot_id: string;
  priority: string;
  title: string;
  observation: string;
  suggestion: string;
  action: View;
};
type Report = {
  summary: string;
  basis: string;
  source_count: number;
  field_count: number;
  candidate_count: number;
  ready: number;
  reopened: number;
  gap_count: number;
  families: Record<string, number>;
  missing_requirements: Record<string, number>;
  findings: Finding[];
  source_issues: { source: string; observation: string; suggestion: string }[];
};
export default function ScanInsights({
  workspace,
  inspect,
  navigate,
}: {
  workspace: Workspace;
  inspect: (id: string, view?: View) => void;
  navigate: (view: View) => unknown;
}) {
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("all");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(12);
  useEffect(() => {
    let active = true;
    setReport(null);
    setError("");
    setLimit(12);
    api<Report>(
      `/insights${source ? `?source_id=${encodeURIComponent(source)}` : ""}`,
    )
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspace, source]);
  const shown =
    report?.findings.filter(
      (f) => priority === "all" || f.priority === priority,
    ) || [];
  const percentage = report?.field_count
    ? Math.round((report.ready / report.field_count) * 100)
    : 0;
  return (
    <section className="scan-results" aria-label="Scan insights">
      <div className="results-heading">
        <div>
          <span className="section-kicker">SCAN REPORT</span>
          <h1>What your data reveals</h1>
        </div>
        <label>
          Source
          <select
            aria-label="Insights source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">All sources</option>
            {workspace.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">Analyzing saved scan evidence…</p>}
      {report && (
        <>
          <div className="result-hero">
            <div>
              <span className="section-kicker">REVIEW READINESS</span>
              <h2>
                {report.ready}
                <span> / {report.field_count} fields ready</span>
              </h2>
              <p>{report.summary}</p>
              <div className="hero-tags">
                <span>{report.reopened} reopened decisions</span>
                <span>{report.gap_count} missing metadata items</span>
              </div>
            </div>
            <div
              className="readiness-ring"
              style={{
                background: `conic-gradient(#83f4da ${percentage}%, #ffffff20 0)`,
              }}
              role="img"
              aria-label={`${percentage}% of present fields ready`}
            >
              <div>
                <strong>{percentage}%</strong>
                <span>reviewed & complete</span>
              </div>
            </div>
          </div>
          <div className="result-flow">
            {[
              {
                icon: Database,
                value: report.source_count,
                label: "Data sources",
                note: "Selected scope",
              },
              {
                icon: ScanLine,
                value: report.field_count,
                label: "Fields scanned",
                note: "Present in latest scans",
              },
              {
                icon: Tags,
                value: report.candidate_count,
                label: "Class candidates",
                note: "Require human validation",
              },
              {
                icon: ShieldCheck,
                value: report.ready,
                label: "Ready fields",
                note: "Both reviews clear",
              },
            ].map((item, i) => (
              <div className="flow-node" key={item.label}>
                <span className="flow-icon">
                  <item.icon size={23} />
                </span>
                <span className="flow-index">0{i + 1}</span>
                <strong>{item.value}</strong>
                <h3>{item.label}</h3>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
          {report.source_issues.map((s) => (
            <div className="source-warning" key={s.source}>
              <strong>{s.source}</strong>
              <p>
                {s.observation} {s.suggestion}
              </p>
              <Button onClick={() => navigate("sources")}>
                Open sources <ArrowUpRight size={15} />
              </Button>
            </div>
          ))}
          <div className="result-charts">
            <article className="insight-panel">
              <h2>Detected categories</h2>
              <p className="chart-caption">Suggested class per present field</p>
              {Object.entries(report.families).map(([name, count]) => (
                <div className="result-bar" key={name}>
                  <div>
                    <span>{name}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${(count / Math.max(1, report.field_count)) * 100}%`,
                        background: colors[name] || "#8891a7",
                      }}
                    />
                  </div>
                </div>
              ))}
              {!report.field_count && <p>No classification evidence yet.</p>}
            </article>
            <article className="insight-panel">
              <h2>Missing usage details</h2>
              <p className="chart-caption">
                Fields missing each configured requirement
              </p>
              {Object.entries(report.missing_requirements).map(
                ([name, count]) => (
                  <div className="result-bar" key={name}>
                    <div>
                      <span>{labels[name] || name}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width: `${(count / Math.max(1, report.field_count)) * 100}%`,
                          background: "#ed9774",
                        }}
                      />
                    </div>
                  </div>
                ),
              )}
              {!report.gap_count && (
                <p>
                  {report.field_count
                    ? "All required details are declared. Metadata reviews remain separate."
                    : "No scanned fields to assess."}
                </p>
              )}
            </article>
          </div>
          <div className="results-heading findings-heading">
            <div>
              <span className="section-kicker">FINDINGS & NEXT STEPS</span>
              <h2>
                Where to focus{" "}
                <span className="finding-count">{shown.length}</span>
              </h2>
            </div>
            <label>
              Priority
              <select
                aria-label="Insight priority"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setLimit(12);
                }}
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <div className="findings-grid">
            {shown.slice(0, limit).map((f) => (
              <article
                className={`finding-card priority-${f.priority}`}
                key={f.id}
              >
                <div className="finding-top">
                  <span className="priority-label">{f.priority}</span>
                  <span title={f.snapshot_id}>
                    Snapshot {f.snapshot_id.slice(0, 8)}
                  </span>
                </div>
                <h3>{f.title}</h3>
                <p className="finding-field">
                  {f.source} / {f.field}
                </p>
                <p>{f.observation}</p>
                <div className="suggestion">
                  <strong>Suggested action</strong>
                  <p>{f.suggestion}</p>
                </div>
                <Button
                  onClick={() =>
                    f.action === "changes"
                      ? navigate("changes")
                      : inspect(f.field_id, f.action)
                  }
                >
                  Open {f.action === "fix" ? "metadata" : f.action}{" "}
                  <ArrowUpRight size={15} />
                </Button>
              </article>
            ))}
          </div>
          {!shown.length && (
            <div className="insight-panel">
              {report.field_count
                ? "No findings match this priority."
                : "Findings will appear after your first scan."}
            </div>
          )}
          {shown.length > limit && (
            <Button onClick={() => setLimit((n) => n + 12)}>
              Show more ({shown.length - limit} remaining)
            </Button>
          )}
          <details className="analysis-basis">
            <summary>How this report is calculated</summary>
            <p>{report.basis}</p>
          </details>
        </>
      )}
    </section>
  );
}
