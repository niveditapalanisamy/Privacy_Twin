"use client";

import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Database,
  FileDown,
  Fingerprint,
  GitCompareArrows,
  Layers3,
  ListChecks,
  SlidersHorizontal,
} from "lucide-react";
import { Progress, Tooltip } from "radix-ui";
import type { View, Workspace } from "./types";
import { Button } from "./ui";

export const steps = [
  { id: "sources", title: "Sources", label: "Data sources", icon: Database },
  {
    id: "settings",
    title: "Rules",
    label: "Configuration",
    icon: SlidersHorizontal,
  },
  {
    id: "inventory",
    title: "Inventory",
    label: "Inventory",
    icon: Fingerprint,
  },
  { id: "reviews", title: "Reviews", label: "Review queue", icon: ListChecks },
  { id: "metadata", title: "Metadata", label: "Metadata", icon: Layers3 },
  {
    id: "changes",
    title: "Changes",
    label: "ReviewGuard",
    icon: GitCompareArrows,
  },
  {
    id: "exports",
    title: "Results",
    label: "Exports & evaluation",
    icon: FileDown,
  },
] as const;

export function stepIndex(view: View) {
  const parent =
    view === "evidence"
      ? "inventory"
      : view === "review"
        ? "reviews"
        : view === "fix"
          ? "metadata"
          : view;
  return Math.max(
    0,
    steps.findIndex((s) => s.id === parent),
  );
}

export function Workflow({
  view,
  workspace,
  onNavigate,
  busy,
}: {
  view: View;
  workspace: Workspace | null;
  onNavigate: (view: View) => void;
  busy: boolean;
}) {
  const current = stepIndex(view);
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [current]);
  const fields =
    workspace?.fields.filter((f) => f.availability === "present") || [];
  const facts = [
    `${workspace?.sources.length || 0} sources`,
    `${workspace?.config.rules.filter((r) => r.enabled).length || 0} active rules`,
    `${fields.length} fields`,
    `${fields.filter((f) => f.reviews.classification?.state === "current").length} reviewed`,
    `${workspace?.totals.gaps || 0} gaps`,
    `${workspace?.scans.length || 0} scans`,
    workspace?.evaluation ? "Evaluation available" : "JSON & CSV",
  ];
  return (
    <div className="workflow-shell">
      <div className="workflow-inner">
        <nav aria-label="Workflow steps">
          <ol className="workflow-steps">
            {steps.map((s, i) => (
              <li key={s.id}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      ref={i === current ? active : undefined}
                      disabled={busy}
                      aria-label={s.label}
                      aria-current={i === current ? "step" : undefined}
                      className={`workflow-step ${i === current ? "active" : ""}`}
                      onClick={() => onNavigate(s.id)}
                    >
                      <span className="step-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="step-copy">
                        <strong>{s.title}</strong>
                        <small>{facts[i]}</small>
                      </span>
                      <s.icon className="step-icon" size={17} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="ui-tooltip" sideOffset={8}>
                      {s.label}
                      <Tooltip.Arrow />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                {i < steps.length - 1 && (
                  <ChevronRight className="step-separator" size={14} />
                )}
              </li>
            ))}
          </ol>
        </nav>
        <Progress.Root
          className="workflow-progress"
          value={((current + 1) / steps.length) * 100}
          aria-label="Workflow position"
        >
          <Progress.Indicator
            style={{
              transform: `translateX(-${100 - ((current + 1) / steps.length) * 100}%)`,
            }}
          />
        </Progress.Root>
      </div>
    </div>
  );
}

export function WorkflowActions({
  view,
  workspace,
  onNavigate,
  busy,
}: {
  view: View;
  workspace: Workspace;
  onNavigate: (view: View) => void;
  busy: boolean;
}) {
  const index = stepIndex(view);
  const next = steps[index + 1];
  const previous = steps[index - 1];
  const sourceNeeded = index === 0 && !workspace.fields.length;
  return (
    <div className="workflow-actions">
      <div className="workflow-actions-inner">
        <div>
          <span className="step-counter">
            {String(index + 1).padStart(2, "0")}{" "}
            <span>/ {String(steps.length).padStart(2, "0")}</span>
          </span>
          <strong>{steps[index].title}</strong>
        </div>
        <div className="actions">
          {previous && (
            <Button onClick={() => onNavigate(previous.id)} disabled={busy}>
              <ArrowLeft size={16} />
              Back
            </Button>
          )}
          {next ? (
            <Button
              primary
              disabled={busy || sourceNeeded}
              title={sourceNeeded ? "Scan a source to continue" : undefined}
              onClick={() => onNavigate(next.id)}
            >
              Continue to {next.title.toLowerCase()}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              primary
              disabled={busy}
              onClick={() => onNavigate("sources")}
            >
              Back to sources
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
