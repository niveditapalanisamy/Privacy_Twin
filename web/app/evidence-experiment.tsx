"use client";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { Candidate } from "./types";
import { api, Badge, Button, Panel } from "./ui";

type Result = {
  snapshot_id: string;
  before: {
    suggested: string | null;
    ambiguous: boolean;
    candidates: Candidate[];
  };
  after: {
    suggested: string | null;
    ambiguous: boolean;
    candidates: Candidate[];
  };
  changed: boolean;
  deltas: { label: string; before: number; after: number; delta: number }[];
  complete_validation_evidence: boolean;
  explanation: string;
};
const signals = [
  ["name_hint", "Header hints"],
  ["value_format", "Value patterns"],
  ["declared_context", "Declared field meaning"],
] as const;

export default function EvidenceExperiment({
  fieldId,
  snapshotId,
}: {
  fieldId: string;
  snapshotId: string;
}) {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [withoutChecksums, setWithoutChecksums] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Panel
      title="What supports this finding?"
      subtitle="Temporarily remove evidence and compare the result."
      className="experiment-panel"
    >
      <div className="signal-controls">
        {signals.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={!disabled.includes(key)}
              disabled={busy}
              onChange={(e) => {
                setDisabled(
                  e.target.checked
                    ? disabled.filter((g) => g !== key)
                    : [...disabled, key],
                );
                setResult(null);
              }}
            />
            {label}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={!withoutChecksums}
            disabled={busy}
            onChange={(e) => {
              setWithoutChecksums(!e.target.checked);
              setResult(null);
            }}
          />
          Checksum validation
        </label>
      </div>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setResult(null);
          try {
            setResult(
              await api<Result>(`/fields/${fieldId}/sensitivity`, {
                snapshot_id: snapshotId,
                disabled_groups: disabled,
                without_checksums: withoutChecksums,
              }),
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Experiment failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FlaskConical size={16} />
        Compare evidence
      </Button>
      <p className="proof-note">
        Uses this snapshot’s stored aggregates, weights and threshold. Saved
        configuration, findings and reviews stay unchanged.
      </p>
      {error && (
        <p className="source-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite" className="experiment-results">
          <div className="proof-comparison">
            <div>
              <span>Original candidate</span>
              <strong>{result.before.suggested || "Abstained"}</strong>
              {result.before.ambiguous && (
                <Badge value="unresolved">Competing interpretations</Badge>
              )}
            </div>
            <div>
              <span>With selected evidence</span>
              <strong>{result.after.suggested || "Abstained"}</strong>
              {result.after.ambiguous && (
                <Badge value="unresolved">Competing interpretations</Badge>
              )}
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLASS</th>
                  <th>ORIGINAL SCORE</th>
                  <th>EXPERIMENT SCORE</th>
                  <th>CHANGE</th>
                </tr>
              </thead>
              <tbody>
                {result.deltas.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td>{d.before.toFixed(3)}</td>
                    <td>{d.after.toFixed(3)}</td>
                    <td>
                      {d.delta > 0 ? "+" : ""}
                      {d.delta.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="proof-note">
            {result.explanation} Scores are evidence weights, not probabilities.
          </p>
          {!result.complete_validation_evidence && (
            <p className="warning-banner">
              This older snapshot lacks complete validation details. Rescan to
              compare checksum removal accurately.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
