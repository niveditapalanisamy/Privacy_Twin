"use client";
import { useState } from "react";
import { Slider, Switch } from "radix-ui";
import { useDraftGuard } from "./use-draft-guard";
import {
  Braces,
  ChevronDown,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { Configuration, Rule, Workspace } from "./types";
import type { Run } from "./page";
import { api, Badge, Button, families, Hero, labels, Panel } from "./ui";

export default function SettingsView({
  workspace,
  busy,
  run,
}: {
  workspace: Workspace;
  busy: string;
  run: Run;
}) {
  const [config, setConfig] = useState<Configuration>(
    structuredClone(workspace.config),
  );
  const [policy, setPolicy] = useState(workspace.policy_id);
  const [open, setOpen] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState("");
  const dirty = JSON.stringify(config) !== JSON.stringify(workspace.config);
  useDraftGuard(
    dirty || (advanced && json !== JSON.stringify(config, null, 2)),
  );
  function updateRule(index: number, key: keyof Rule, value: string | boolean) {
    setConfig({
      ...config,
      rules: config.rules.map((r, i) =>
        i === index ? { ...r, [key]: value } : r,
      ),
    });
  }
  function add() {
    const id = `custom_${Date.now().toString(36)}`;
    setConfig({
      ...config,
      rules: [
        ...config.rules,
        {
          id,
          label: "Custom rule",
          family: "Identity",
          pattern: "",
          headers: "",
          normalizer: "trim",
          check: "",
          enabled: true,
          note: "Custom pattern; confirm field context",
        },
      ],
    });
    setOpen(id);
  }
  async function save() {
    const saved = await run(
      "Saving configuration",
      () => api("/config", { config, expected_policy_id: policy }, "PUT"),
      "Configuration saved. Rescan sources to calculate updated results.",
    );
    if (saved) {
      const fresh = await api<Workspace>("/state");
      setPolicy(fresh.policy_id);
      setConfig(structuredClone(fresh.config));
      setJson(JSON.stringify(fresh.config, null, 2));
    }
  }
  return (
    <>
      <Hero
        title="Detection settings"
        actions={
          <Button primary disabled={!!busy || !dirty} onClick={save}>
            <Save size={17} />
            Save configuration
          </Button>
        }
      />
      {workspace.policy_id !== policy && (
        <div className="warning-banner">
          Configuration changed while you were editing. Reload before saving.
          <Button
            onClick={() => {
              setConfig(structuredClone(workspace.config));
              setPolicy(workspace.policy_id);
            }}
          >
            Reload configuration
          </Button>
        </div>
      )}
      <div className="two-columns settings-top">
        <Panel title="Evidence weights">
          <div className="form-body">
            {Object.entries(config.weights).map(([group, value]) => (
              <div className="slider-row" key={group}>
                <label htmlFor={`weight-${group}`}>
                  {group.replaceAll("_", " ")}
                </label>
                <Slider.Root
                  className="ui-slider"
                  id={`weight-${group}`}
                  min={0}
                  max={1}
                  step={0.05}
                  value={[value]}
                  onValueChange={([next]) =>
                    setConfig({
                      ...config,
                      weights: { ...config.weights, [group]: next },
                    })
                  }
                >
                  <Slider.Track className="ui-slider-track">
                    <Slider.Range className="ui-slider-range" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="ui-slider-thumb"
                    aria-label={group.replaceAll("_", " ")}
                  />
                </Slider.Root>
                <output>{value.toFixed(2)}</output>
              </div>
            ))}
            <div
              className={`weight-total ${Math.abs(Object.values(config.weights).reduce((a, b) => a + b, 0) - 1) > 0.00001 ? "invalid" : ""}`}
            >
              Total{" "}
              <strong>
                {Object.values(config.weights)
                  .reduce((a, b) => a + b, 0)
                  .toFixed(2)}
              </strong>
            </div>
            <div className="form-row">
              <label>
                Acceptance threshold
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={config.acceptance}
                  onChange={(e) =>
                    setConfig({ ...config, acceptance: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Near-tie threshold
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={config.near_tie}
                  onChange={(e) =>
                    setConfig({ ...config, near_tie: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </div>
        </Panel>
        <Panel title="Change thresholds">
          <div className="form-body">
            <label>
              Pattern-rate change
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="1"
                value={config.materiality.rate_delta}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    materiality: {
                      ...config.materiality,
                      rate_delta: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Minimum sample size
              <input
                type="number"
                min="1"
                max="1000"
                value={config.materiality.minimum_denominator}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    materiality: {
                      ...config.materiality,
                      minimum_denominator: Number(e.target.value),
                    },
                  })
                }
              />
            </label>

            <h3>Required metadata</h3>
            <div className="checklist-settings">
              {[
                "purpose",
                "retention",
                "retention_start_trigger",
                "owner",
                "provenance",
              ].map((key) => (
                <label className="inline-check" key={key}>
                  <input
                    type="checkbox"
                    checked={config.checklist.includes(key)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        checklist: e.target.checked
                          ? [...config.checklist, key]
                          : config.checklist.filter((k) => k !== key),
                      })
                    }
                  />
                  {labels[key]}
                </label>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Detection rules"
        subtitle={`${config.rules.filter((r) => r.enabled).length} active`}
        action={
          <Button onClick={add}>
            <Plus size={16} />
            Add rule
          </Button>
        }
      >
        <div className="rule-list">
          {config.rules.map((r, i) => (
            <div
              className={`rule-item ${!r.enabled ? "disabled-rule" : ""}`}
              key={i}
            >
              <div className="rule-header">
                <button
                  className="rule-expand"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <span className="rule-icon">
                    <SlidersHorizontal size={17} />
                  </span>
                  <span>
                    <strong>{r.label}</strong>
                    <code>{r.id}</code>
                  </span>
                  <Badge value="snapshot">{r.family}</Badge>
                  <ChevronDown
                    size={16}
                    className={open === r.id ? "rotated" : ""}
                  />
                </button>
                <Switch.Root
                  className="ui-switch"
                  checked={r.enabled}
                  aria-label={`Enable ${r.label}`}
                  onCheckedChange={(value) => updateRule(i, "enabled", value)}
                >
                  <Switch.Thumb className="ui-switch-thumb" />
                </Switch.Root>
              </div>
              {open === r.id && (
                <div className="rule-form">
                  <div className="form-row">
                    <label>
                      Rule identifier
                      <input
                        value={r.id}
                        onChange={(e) => {
                          updateRule(i, "id", e.target.value);
                          setOpen(e.target.value);
                        }}
                      />
                    </label>
                    <label>
                      Display label
                      <input
                        value={r.label}
                        onChange={(e) => updateRule(i, "label", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Candidate family
                      <select
                        value={r.family}
                        onChange={(e) =>
                          updateRule(i, "family", e.target.value)
                        }
                      >
                        {families.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Normalization
                      <select
                        value={r.normalizer}
                        onChange={(e) =>
                          updateRule(i, "normalizer", e.target.value)
                        }
                      >
                        <option value="trim">Trim whitespace</option>
                        <option value="upper">Trim & uppercase</option>
                        <option value="phone">
                          Remove spaces, hyphens, parentheses
                        </option>
                        <option value="digits">Remove digit separators</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Full-value regular expression
                    <input
                      className="mono"
                      value={r.pattern}
                      onChange={(e) => updateRule(i, "pattern", e.target.value)}
                      placeholder="e.g. CUST-[0-9]{6}"
                    />
                  </label>
                  <label>
                    Header context expression
                    <input
                      className="mono"
                      value={r.headers}
                      onChange={(e) => updateRule(i, "headers", e.target.value)}
                      placeholder="e.g. customer_id|member_id"
                    />
                  </label>
                  <label>
                    Additional validation
                    <select
                      value={r.check}
                      onChange={(e) => updateRule(i, "check", e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="verhoeff">Verhoeff checksum</option>
                      <option value="gstin">GSTIN checksum</option>
                      <option value="age">Age range (0–120)</option>
                      <option value="birth_date">Calendar date</option>
                    </select>
                  </label>
                  <label>
                    Evidence limitation
                    <input
                      value={r.note}
                      onChange={(e) => updateRule(i, "note", e.target.value)}
                    />
                  </label>
                  <Button
                    className="danger"
                    onClick={() =>
                      setConfig({
                        ...config,
                        rules: config.rules.filter((_, index) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={15} />
                    Remove rule
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Configuration JSON"
        action={
          <Button
            onClick={() => {
              setAdvanced(!advanced);
              setJson(JSON.stringify(config, null, 2));
            }}
          >
            <Braces size={16} />
            {advanced ? "Close editor" : "Open editor"}
          </Button>
        }
      >
        {advanced && (
          <div className="form-body">
            <textarea
              className="code-editor"
              rows={22}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              aria-label="Configuration JSON"
            />
            {parseError && <p className="source-error">{parseError}</p>}
            <Button
              onClick={() => {
                try {
                  const parsed = JSON.parse(json);
                  if (!isConfiguration(parsed))
                    throw new Error(
                      "Invalid configuration structure. Each rule needs valid text fields, enabled, and a supported family; numeric policies and checklist are required.",
                    );
                  setConfig(parsed);
                  setParseError("");
                  setAdvanced(false);
                } catch (e) {
                  setParseError(
                    e instanceof Error ? e.message : "Invalid JSON",
                  );
                }
              }}
            >
              Apply JSON to draft
            </Button>
          </div>
        )}
      </Panel>
      <div className="sticky-save">
        <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button primary disabled={!!busy || !dirty} onClick={save}>
          <Save size={16} />
          Save configuration
        </Button>
      </div>
    </>
  );
}

function isConfiguration(value: unknown): value is Configuration {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (
    !Array.isArray(c.rules) ||
    !c.rules.length ||
    !Array.isArray(c.checklist) ||
    !c.checklist.every((k) => typeof k === "string")
  )
    return false;
  if (
    !c.rules.every(
      (r) =>
        r &&
        typeof r === "object" &&
        [
          "id",
          "label",
          "family",
          "pattern",
          "headers",
          "normalizer",
          "check",
          "note",
        ].every((k) => typeof r[k] === "string") &&
        typeof r.enabled === "boolean" &&
        families.includes(r.family),
    )
  )
    return false;
  if (
    !c.weights ||
    typeof c.weights !== "object" ||
    !c.materiality ||
    typeof c.materiality !== "object"
  )
    return false;
  const w = c.weights as Record<string, unknown>,
    m = c.materiality as Record<string, unknown>;
  return (
    ["name_hint", "value_format", "declared_context"].every(
      (k) => typeof w[k] === "number" && Number.isFinite(w[k]),
    ) &&
    typeof c.acceptance === "number" &&
    Number.isFinite(c.acceptance) &&
    typeof c.near_tie === "number" &&
    Number.isFinite(c.near_tie) &&
    typeof m.rate_delta === "number" &&
    Number.isFinite(m.rate_delta) &&
    typeof m.minimum_denominator === "number" &&
    Number.isFinite(m.minimum_denominator)
  );
}
