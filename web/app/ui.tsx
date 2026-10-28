"use client";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDashed,
  Download,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { AuditEvent, Scope } from "./types";

export const families = [
  "Identity",
  "Contact",
  "Location",
  "Official ID",
  "Demographic",
];
export const colors: Record<string, string> = {
  Identity: "#6589d8",
  Contact: "#1d9d8b",
  Location: "#d7a14b",
  "Official ID": "#9d7bca",
  Demographic: "#d17983",
};
export const labels: Record<string, string> = {
  purpose: "Purpose",
  retention: "Retention duration & unit",
  retention_duration: "Retention duration",
  retention_unit: "Retention unit",
  retention_start_trigger: "Retention start trigger",
  owner: "Owner / data fiduciary",
  provenance: "Provenance",
  meaning: "Declared meaning",
};
export const time = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not scanned";
export const short = (v: string) => v.slice(0, 8);
export function Button({
  children,
  primary = false,
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${primary ? "primary" : ""} ${className}`}
      disabled={props.disabled || loading}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${value.toLowerCase().replaceAll(" ", "-")}`}>
      <span className="badge-dot" />
      {children || value.replaceAll("_", " ")}
    </span>
  );
}
export function Family({ name }: { name: string | null }) {
  return name ? (
    <span className="family">
      <i style={{ background: colors[name] || "#7d8c9b" }} />
      {name}
    </span>
  ) : (
    <span className="muted">Abstained</span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CircleDashed size={30} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Hero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="field-path">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function ScopeState({ scope, state }: { scope: Scope; state: string }) {
  return (
    <div className="scope-state">
      <span>{scope}</span>
      <Badge value={state} />
    </div>
  );
}
export function DownloadLink({
  kind,
  children,
}: {
  kind: string;
  children: ReactNode;
}) {
  return (
    <a className="button" href={`/api/export/${kind}`} download>
      <Download size={16} />
      {children}
    </a>
  );
}
export function Timeline({
  events,
  select,
}: {
  events: AuditEvent[];
  select?: (id: string) => void;
}) {
  return (
    <div className="timeline">
      {events.length ? (
        events.map((e) => (
          <div className="timeline-item" key={e.id}>
            <span className={`event-dot ${e.type}`}>
              <ShieldCheck size={14} />
            </span>
            <div className="event-main">
              <div className="event-title">
                <strong>{e.type.replaceAll("_", " ")}</strong>
                {e.scope && <span className="scope-label">{e.scope}</span>}
                <time>{time(e.created_at)}</time>
              </div>
              {e.field_name && (
                <button
                  className="text-button mono"
                  onClick={() => e.field_id && select?.(e.field_id)}
                >
                  {e.source_name} / {e.field_name}
                  <ArrowUpRight size={13} />
                </button>
              )}
              <p>{e.reason}</p>
              {e.comparisons.length > 0 && (
                <details>
                  <summary>
                    {e.comparisons.length} changed dependencies
                    <ChevronRight size={14} />
                  </summary>
                  <div className="dependency-list">
                    {e.comparisons.map((c, i) => (
                      <div key={i}>
                        <strong>{c.dependency}</strong>
                        <div className="diff-values">
                          <code>{formatValue(c.before)}</code>
                          <ChevronRight size={12} />
                          <code>{formatValue(c.after)}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="quiet">
          Your activity will appear here after a scan or decision.
        </div>
      )}
    </div>
  );
}
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Not declared";
  return typeof value === "string" ? value : JSON.stringify(value);
}
export function Checklist({
  items,
}: {
  items: { key: string; status: string; reason: string }[];
}) {
  return (
    <div className="checklist">
      {items.map((c) => (
        <div className="check-item" key={c.key}>
          <span className={`check-icon ${c.status}`}>
            {c.status === "present" ? (
              <Check size={16} />
            ) : (
              <CircleDashed size={16} />
            )}
          </span>
          <div>
            <strong>{labels[c.key] || c.key}</strong>
            <small>{c.reason}</small>
          </div>
          <Badge value={c.status} />
        </div>
      ))}
    </div>
  );
}

export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: isForm ? undefined : { "Content-Type": "application/json" },
          body: isForm ? body : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: { msg: string }) => e.msg).join("; ")
          : "Request failed";
    throw new Error(message);
  }
  return data as T;
}
