"use client";
import { useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  FileCheck2,
  FileJson,
  FileSpreadsheet,
  History,
  Play,
  Upload,
} from "lucide-react";
import type { Workspace } from "./types";
import type { View } from "./types";
import ScanInsights from "./scan-insights";
import AIReview from "./ai-review";
import type { Run } from "./page";
import {
  api,
  Badge,
  Button,
  DownloadLink,
  Empty,
  Hero,
  Panel,
  short,
  time,
} from "./ui";

export default function ExportsView({
  workspace,
  busy,
  run,
  inspect,
  navigate,
  onRefresh,
}: {
  workspace: Workspace;
  busy: string;
  run: Run;
  inspect: (id: string, view?: View) => void;
  navigate: (view: View) => unknown;
  onRefresh: () => Promise<unknown>;
}) {
  const [cases, setCases] = useState<unknown[] | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const report = workspace.evaluation;
  const downloads = [
    {
      kind: "bundle",
      title: "Reproducible evidence package",
      description:
        "Inventory, evidence, dependencies, policies and a standalone verifier. Recalculate scores from aggregates.",
      icon: FileCheck2,
      type: "ZIP",
    },
    {
      kind: "passport",
      title: "Privacy Passport",
      description:
        "Complete inventory, snapshots, policies, declarations, and review dependencies.",
      icon: FileJson,
      type: "JSON",
    },
    {
      kind: "inventory",
      title: "Field inventory",
      description:
        "One row per field, with separate classification and metadata review states.",
      icon: FileSpreadsheet,
      type: "CSV",
    },
    {
      kind: "gaps",
      title: "Metadata gap report",
      description:
        "Every missing requirement, its source, and effective declaration revision.",
      icon: FileCheck2,
      type: "CSV",
    },
    {
      kind: "history",
      title: "Review history",
      description:
        "Original decisions and the complete append-only transition history.",
      icon: History,
      type: "JSON",
    },
  ];
  return (
    <>
      <ScanInsights
        workspace={workspace}
        inspect={inspect}
        navigate={navigate}
      />
      <Hero title="Exports" />
      <div className="export-grid">
        {downloads.map((d) => (
          <Panel className="export-card" key={d.kind}>
            <div className="export-card-top">
              <span>
                <d.icon size={26} />
              </span>
              <Badge value="snapshot">{d.type}</Badge>
            </div>
            <h2>{d.title}</h2>
            <p>{d.description}</p>
            <DownloadLink kind={d.kind}>
              Download
              <ArrowDownToLine size={15} />
            </DownloadLink>
          </Panel>
        ))}
      </div>
      <Panel
        title="Measured evaluation"
        action={
          report ? (
            <DownloadLink kind="evaluation">Download results</DownloadLink>
          ) : (
            <Badge value="unreviewed">Not run</Badge>
          )
        }
      >
        <div className="evaluation-controls">
          <div>
            <h3>{filename || "Bundled synthetic regression set"}</h3>
            <p>
              Custom JSON format: an array of{" "}
              <code>{"{field, values, expected, stress?}"}</code>. Expected is a
              class name or null.
            </p>
            <input
              ref={input}
              type="file"
              accept=".json"
              className="visually-hidden"
              aria-label="Upload evaluation labels"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 1024 * 1024)
                    throw new Error("Evaluation file must be at most 1 MB");
                  const data = JSON.parse(await file.text());
                  if (!Array.isArray(data))
                    throw new Error("Expected a JSON array");
                  setCases(data);
                  setFilename(file.name);
                  setError("");
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Invalid labels",
                  );
                }
              }}
            />
            {error && <p className="source-error">{error}</p>}
          </div>
          <div className="actions">
            <Button onClick={() => input.current?.click()}>
              <Upload size={16} />
              Upload labels
            </Button>
            {cases && (
              <Button
                onClick={() => {
                  setCases(null);
                  setFilename("");
                }}
              >
                Use bundled cases
              </Button>
            )}
            <Button
              primary
              disabled={!!busy}
              onClick={() =>
                run(
                  "Running labeled evaluation",
                  () => api("/evaluation", { cases }),
                  "Evaluation completed against the frozen configuration.",
                )
              }
            >
              <Play size={16} />
              Run evaluation
            </Button>
          </div>
        </div>
        {report ? (
          <>
            <div className="evaluation-meta">
              <span>{report.suite}</span>
              <span>{time(report.created_at)}</span>
              <code>Policy {short(report.policy_id)}</code>
              {report.policy_id !== workspace.policy_id && (
                <Badge value="reopened">Previous configuration</Badge>
              )}
            </div>
            <div className="evaluation-stats">
              <div>
                <strong>
                  {report.macro_f1 === null ? "—" : report.macro_f1.toFixed(3)}
                </strong>
                <span>Macro F1 · supported classes</span>
              </div>
              <div>
                <strong>{report.cases}</strong>
                <span>Labeled benchmark cases</span>
              </div>
              <div>
                <strong>{report.abstentions}</strong>
                <span>Abstentions</span>
              </div>
              <div>
                <strong>
                  {report.stress_errors} / {report.stress_cases}
                </strong>
                <span>Stress-case errors</span>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CLASS</th>
                    <th>PRECISION</th>
                    <th>RECALL</th>
                    <th>F1</th>
                    <th>SUPPORT</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td>
                        {m.predicted ? m.precision.toFixed(3) : "No predictions"}
                      </td>
                      <td>{m.support ? m.recall.toFixed(3) : "No positives"}</td>
                      <td>{m.support || m.predicted ? m.f1.toFixed(3) : "—"}</td>
                      <td>{m.support}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="evaluation-limit">{report.limitations}</div>
            {!!report.baselines?.length && (
              <>
                <div className="panel-heading">
                  <h2>Does validation help?</h2>
                </div>
                <p className="proof-note">{report.baseline_method}</p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>METHOD</th>
                        <th>MACRO F1</th>
                        <th>CASES</th>
                        <th>ABSTENTIONS</th>
                        <th>STRESS ERRORS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.baselines.map((b) => (
                        <tr key={b.name}>
                          <td>{b.name}</td>
                          <td>
                            {b.macro_f1 === null
                              ? "No support"
                              : b.macro_f1.toFixed(3)}
                          </td>
                          <td>{b.cases}</td>
                          <td>{b.abstentions}</td>
                          <td>
                            {b.stress_errors} / {b.stress_cases}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="evaluation-cases">
                  <summary>
                    Compare precision and recall for every class
                  </summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>METHOD</th>
                          <th>CLASS</th>
                          <th>PRECISION</th>
                          <th>RECALL</th>
                          <th>SUPPORT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.baselines.flatMap((b) =>
                          b.metrics.map((m) => (
                            <tr key={`${b.name}-${m.label}`}>
                              <td>{b.name}</td>
                              <td>{m.label}</td>
                              <td>{m.precision.toFixed(3)}</td>
                              <td>{m.recall.toFixed(3)}</td>
                              <td>{m.support}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            <div className="panel-heading">
              <h2>ReviewGuard replay</h2>
              <span className="subtle-label">
                Measured under the selected policies
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>SCENARIO</th>
                    <th>SCOPE</th>
                    <th>EXPECTED</th>
                    <th>OBSERVED</th>
                    <th>RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {report.replay.map((r, i) => (
                    <tr key={i}>
                      <td>{r.case}</td>
                      <td>{r.scope}</td>
                      <td>{r.expected_reopen ? "Reopen" : "Preserve"}</td>
                      <td>{r.actual_reopen ? "Reopen" : "Preserve"}</td>
                      <td>
                        <Badge value={r.passed ? "passed" : "failed"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="scope-metrics">
              {report.scope_metrics.map((m) => (
                <div key={m.scope}>
                  <strong>{m.scope}</strong>
                  <span>
                    {m.correct} / {m.total} correct
                  </span>
                  <small>
                    {m.false_reopenings} false reopenings ·{" "}
                    {m.missed_reopenings} missed reopenings
                  </small>
                </div>
              ))}
            </div>
            <details className="evaluation-cases">
              <summary>Inspect individual classification results</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>FIELD</th>
                      <th>EXPECTED</th>
                      <th>PREDICTED</th>
                      <th>SET</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{r.field}</td>
                        <td>{r.expected || "Abstain"}</td>
                        <td>{r.predicted || "Abstain"}</td>
                        <td>{r.stress ? "Stress" : "Benchmark"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <Empty title="No evaluation results">
            Run the bundled regression set or upload your own labels. Scores
            appear only after the evaluation has executed.
          </Empty>
        )}
      </Panel>
      <AIReview workspace={workspace} inspect={inspect} onRefresh={onRefresh} />
    </>
  );
}
