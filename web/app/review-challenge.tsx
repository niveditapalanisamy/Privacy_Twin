"use client";
import { useEffect, useState } from "react";
import { Play, Download, ShieldCheck } from "lucide-react";
import { api, Badge, Button, Panel } from "./ui";

type Scenario = {
  id: string;
  title: string;
  description: string;
  expected: string;
};
type Result = {
  created_at: string;
  policy_id: string;
  correct: number;
  total: number;
  preserved: number;
  false_reopenings: number;
  missed_reopenings: number;
  basis: string;
  scenarios: (Scenario & {
    passed: boolean;
    checks: {
      field: string;
      scope: string;
      expected: string;
      observed: string;
      passed: boolean;
      reason: string;
      dependencies: {
        dependency: string;
        before: unknown;
        after: unknown;
        reason: string;
      }[];
    }[];
  })[];
};

export default function ReviewChallenge() {
  const [options, setOptions] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("all");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ scenarios: Scenario[] }>("/challenge")
      .then((r) => {
        if (active) setOptions(r.scenarios);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const choice = options.find((s) => s.id === scenario);
  return (
    <Panel
      title="Challenge ReviewGuard"
      subtitle="Choose a change. See exactly which decisions need another look."
      className="challenge-panel"
    >
      <div className="proof-intro">
        <ShieldCheck size={30} aria-hidden="true" />
        <p>
          A review answers two questions: <strong>What is this field?</strong>{" "}
          and <strong>Is its declared purpose and retention documented?</strong>{" "}
          Changing one answer should reopen the review that depends on it.
        </p>
      </div>
      <div className="proof-controls">
        <label>
          Challenge scenario
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            disabled={busy}
          >
            <option value="all">
              Run all {options.length || "available"} scenarios
            </option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <Button
          primary
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setResult(null);
            try {
              setResult(await api<Result>("/challenge", { scenario }));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Challenge failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Play size={16} />
          Run challenge
        </Button>
      </div>
      {choice && (
        <p className="proof-note">
          {choice.description} <strong>Expected: {choice.expected}</strong>
        </p>
      )}
      <p className="proof-note">
        Synthetic sandbox · real scans and saved scripted reviews · separate
        disposable database · frozen reference rules.
      </p>
      {error && (
        <p role="alert" className="source-error">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite" className="challenge-results">
          <div className="proof-stats">
            <div>
              <strong>
                {result.correct} / {result.total}
              </strong>
              <span>Review states matched expectations</span>
            </div>
            <div>
              <strong>{result.preserved}</strong>
              <span>Reviews stayed current</span>
            </div>
            <div>
              <strong>{result.false_reopenings}</strong>
              <span>False reopenings</span>
            </div>
            <div>
              <strong>{result.missed_reopenings}</strong>
              <span>Missed reopenings</span>
            </div>
          </div>
          {result.scenarios.map((s) => (
            <details
              className="challenge-case"
              key={s.id}
              open={result.scenarios.length === 1}
            >
              <summary>
                <span>{s.title}</span>
                <Badge value={s.passed ? "passed" : "failed"} />
              </summary>
              <p>
                {s.description} {s.expected}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>FIELD</th>
                      <th>REVIEW</th>
                      <th>EXPECTED</th>
                      <th>OBSERVED</th>
                      <th>WHY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.checks.map((c, i) => (
                      <tr key={i}>
                        <td>{c.field}</td>
                        <td>{c.scope}</td>
                        <td>{c.expected}</td>
                        <td>
                          <Badge value={c.observed} />
                        </td>
                        <td>
                          {c.reason}
                          {!!c.dependencies.length && (
                            <details>
                              <summary>Inspect dependencies</summary>
                              <pre className="proof-json">
                                {JSON.stringify(c.dependencies, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <p className="proof-note">{result.basis}</p>
          <Button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "privacytwin-challenge.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={16} />
            Download challenge results
          </Button>
        </div>
      )}
    </Panel>
  );
}
