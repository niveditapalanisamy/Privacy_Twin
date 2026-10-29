"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Tooltip, AlertDialog } from "radix-ui";
import { Workflow, WorkflowActions, stepIndex, steps } from "./workflow";
import { useDraftGuard } from "./use-draft-guard";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Fingerprint,
  FolderInput,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import type { Detail, FieldRecord, Source, View, Workspace } from "./types";
import {
  api,
  Badge,
  Button,
  colors,
  DownloadLink,
  Empty,
  Family,
  families,
  Hero,
  Panel,
  short,
  time,
  Timeline,
} from "./ui";
import DetailView from "./field-view";
import SettingsView from "./settings-view";
import ExportsView from "./exports-view";
import ReviewChallenge from "./review-challenge";

const navigation = steps.map((s) => ({
  id: s.id,
  label: s.label,
  icon: s.icon,
}));

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>("sources");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const commandRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const value = await api<Workspace>("/state");
    setWorkspace(value);
    setRefreshKey((v) => v + 1);
    return value;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const focus = () => refresh().catch((e) => setError(e.message));
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api<Detail>(`/fields/${selected}`)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshKey]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === "Escape") {
        setCommand(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (command) commandRef.current?.focus();
  }, [command]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  function navigate(next: View, confirmed = false) {
    if (next === view) {
      setCommand(false);
      return true;
    }
    const event = new Event("privacytwin:leave", { cancelable: true });
    if (!confirmed && !window.dispatchEvent(event)) {
      setPendingView(next);
      return false;
    }
    setView(next);
    setCommand(false);
    setQuery("");
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    return true;
  }
  function inspect(id: string, next: View = "evidence") {
    if (!navigate(next)) {
      setPendingField(id);
      setCommand(false);
      return;
    }
    if (id !== selected) setDetail(null);
    setSelected(id);
  }
  async function run(
    label: string,
    operation: () => Promise<unknown>,
    success: string,
  ) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await operation();
      await refresh();
      setNotice(success);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function scan(source: Source, file?: File) {
    const form = new FormData();
    form.set("request_id", crypto.randomUUID());
    if (file) form.set("file", file);
    await run(
      `Scanning ${source.name}`,
      () => api(`/sources/${source.id}/scan`, form),
      `${source.name} scanned. Inventory and review dependencies updated.`,
    );
  }
  const loadDemo = () =>
    run(
      "Scanning synthetic sources",
      () => api("/demo/load", {}),
      "Sample sources ready.",
    );
  const activeLabel =
    navigation.find((n) => n.id === view)?.label ||
    (
      {
        settings: "Configuration",
        evidence: "Field evidence",
        review: "Review decision",
        fix: "Fix preview",
      } as Record<string, string>
    )[view];
  const filtered =
    workspace?.fields.filter((f) =>
      `${f.name} ${f.source_name} ${f.table_key} ${f.suggested || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) || [];

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="app-shell wizard-app">
        <div className="workspace-main">
          <header className="product-header">
            <div className="product-header-inner">
              <button
                className="product-brand"
                onClick={() => navigate("sources")}
                aria-label="PrivacyTwin home"
              >
                <span>
                  <Fingerprint size={25} />
                </span>
                Privacy<span className="brand-accent">Twin</span>
              </button>
              <div className="header-divider" />
              <span className="product-section">Data review</span>
              <div className="product-tools">
                <Button
                  className="report-shortcut"
                  onClick={() => navigate("exports")}
                >
                  Scan report <ArrowUpRight size={15} />
                </Button>
                <button
                  className="search-launch"
                  onClick={() => setCommand(true)}
                  aria-label="Search workspace"
                >
                  <Search size={17} />
                  <span>Search</span>
                  <kbd>Ctrl K</kbd>
                </button>
                <span className="service-status">
                  <i className={workspace ? "online" : ""} />
                  {workspace ? "Online" : "Connecting"}
                </span>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      className="icon-button"
                      aria-label="Open review queue"
                      onClick={() => navigate("reviews")}
                    >
                      <Bell size={19} />
                      {!!workspace?.totals.reopened && (
                        <span className="header-notification-dot" />
                      )}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="ui-tooltip">
                      Review queue
                      <Tooltip.Arrow />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
            </div>
          </header>
          <Workflow
            view={view}
            workspace={workspace}
            onNavigate={navigate}
            busy={!!busy}
          />
          {busy && (
            <div className="operation-progress">
              <span />
              <LoaderCircle size={14} className="spin" />
              {busy}
            </div>
          )}
          <main id="main-content">
            <div className="stage-caption">
              STEP {String(stepIndex(view) + 1).padStart(2, "0")}
              <span /> {activeLabel}
            </div>
            {error && (
              <div className="error-banner" role="alert">
                <div>
                  <strong>Action needs attention</strong>
                  <p>{error}</p>
                </div>
                <Button
                  onClick={() =>
                    refresh()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
                  }
                >
                  Reload data
                </Button>
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {!workspace ? (
              <div className="loading-state">
                <LoaderCircle size={32} className="spin" />
                <h2>Opening your workspace</h2>
                <p>Connecting to the local inventory.</p>
              </div>
            ) : (
              <div key={view} className="view-enter">
                {view === "inventory" && (
                  <Inventory
                    workspace={workspace}
                    fields={filtered}
                    query={query}
                    setQuery={setQuery}
                    inspect={inspect}
                    navigate={navigate}
                  />
                )}
                {view === "sources" && (
                  <Sources
                    workspace={workspace}
                    busy={busy}
                    run={run}
                    scan={scan}
                    loadDemo={loadDemo}
                    inspect={inspect}
                  />
                )}
                {view === "reviews" && (
                  <Reviews workspace={workspace} inspect={inspect} />
                )}
                {view === "changes" && (
                  <Changes
                    workspace={workspace}
                    busy={busy}
                    run={run}
                    scan={scan}
                    inspect={inspect}
                  />
                )}
                {view === "metadata" && (
                  <Metadata workspace={workspace} inspect={inspect} />
                )}
                {view === "exports" && (
                  <ExportsView
                    workspace={workspace}
                    busy={busy}
                    run={run}
                    inspect={inspect}
                    navigate={navigate}
                    onRefresh={refresh}
                  />
                )}
                {view === "settings" && (
                  <SettingsView workspace={workspace} busy={busy} run={run} />
                )}
                {(["evidence", "review", "fix"] as View[]).includes(view) &&
                  (detail ? (
                    <DetailView
                      detail={detail}
                      view={view}
                      setView={navigate}
                      busy={busy}
                      run={run}
                      refresh={refresh}
                    />
                  ) : (
                    <div className="loading-state">
                      <LoaderCircle className="spin" />
                      Loading field evidence…
                    </div>
                  ))}
              </div>
            )}
          </main>
          {workspace && (
            <WorkflowActions
              view={view}
              workspace={workspace}
              onNavigate={navigate}
              busy={!!busy}
            />
          )}
        </div>
        {notice && (
          <div className="toast" role="status">
            <span>
              <Check size={17} />
            </span>
            {notice}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <Dialog.Root open={command} onOpenChange={setCommand}>
          <Dialog.Portal>
            <Dialog.Overlay className="search-overlay" />
            <Dialog.Content
              className="command-modal"
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                commandRef.current?.focus();
              }}
            >
              <Dialog.Title className="visually-hidden">
                Search workspace
              </Dialog.Title>
              <div className="command-input">
                <Search size={21} />
                <input
                  ref={commandRef}
                  placeholder="Search fields, sources, or pages"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="icon-button"
                  onClick={() => setCommand(false)}
                  aria-label="Close search"
                >
                  <X size={19} />
                </button>
              </div>
              <div className="command-results">
                <small>PAGES</small>
                {navigation
                  .filter((n) =>
                    n.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((n) => (
                    <button key={n.id} onClick={() => navigate(n.id)}>
                      <n.icon size={17} />
                      {n.label}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                <small>FIELDS</small>
                {filtered.slice(0, 12).map((f) => (
                  <button key={f.id} onClick={() => inspect(f.id)}>
                    <Fingerprint size={17} />
                    <span>
                      {f.name}
                      <small>
                        {f.source_name} / {f.table_key}
                      </small>
                    </span>
                    <Family name={f.suggested} />
                  </button>
                ))}
                {!filtered.length && (
                  <p className="quiet">No matching fields.</p>
                )}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <AlertDialog.Root
          open={pendingView !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingView(null);
              setPendingField(null);
            }
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="search-overlay" />
            <AlertDialog.Content className="draft-dialog">
              <AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title>
              <AlertDialog.Description>
                Your saved data will stay unchanged.
              </AlertDialog.Description>
              <div className="actions">
                <AlertDialog.Cancel asChild>
                  <Button>Keep editing</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button
                    primary
                    onClick={() => {
                      if (pendingView) navigate(pendingView, true);
                      if (pendingField) {
                        setSelected(pendingField);
                        setDetail(null);
                      }
                      setPendingView(null);
                      setPendingField(null);
                    }}
                  >
                    Discard & continue
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </Tooltip.Provider>
  );
}

export type Run = (
  label: string,
  operation: () => Promise<unknown>,
  success: string,
) => Promise<boolean | undefined>;
type Inspect = (id: string, view?: View) => void;

function Inventory({
  workspace,
  fields,
  query,
  setQuery,
  inspect,
  navigate,
}: {
  workspace: Workspace;
  fields: FieldRecord[];
  query: string;
  setQuery: (s: string) => void;
  inspect: Inspect;
  navigate: (v: View) => void;
}) {
  const [family, setFamily] = useState("All fields");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const rows = fields.filter(
    (f) =>
      (family === "All fields" || f.suggested === family) &&
      (source === "all" || f.source_id === source) &&
      (status === "all" ||
        Object.values(f.reviews).some((r) => r.state === status) ||
        (status === "unreviewed" && !f.reviews.classification)),
  );
  const present = workspace.fields.filter((f) => f.availability === "present");
  const reviewed = present.filter(
    (f) => f.reviews.classification?.state === "current",
  ).length;
  const rate = present.length
    ? Math.round((reviewed / present.length) * 100)
    : 0;
  const counts = families.map((name) => ({
    name,
    count: present.filter((f) => f.suggested === name).length,
  }));
  return (
    <>
      <Hero
        title="Inventory"
        actions={
          <>
            <DownloadLink kind="inventory">Export inventory</DownloadLink>
            <Button primary onClick={() => navigate("sources")}>
              <Plus size={17} />
              Add source
            </Button>
          </>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Fields discovered"
          value={present.length}
          caption={`${workspace.sources.length} registered sources`}
          icon={<Database />}
        />
        <Stat
          label="Current classification reviews"
          value={reviewed}
          caption={`${present.length - reviewed} fields awaiting a current review`}
          icon={<ShieldCheck />}
          tone="teal"
        />
        <Stat
          label="Reviews reopened"
          value={workspace.totals.reopened}
          caption="Evidence changed since the decision"
          icon={<RefreshCw />}
          tone="amber"
        />
        <Stat
          label="Metadata gaps"
          value={workspace.totals.gaps}
          caption="Across configured requirements"
          icon={<Layers3 />}
          tone="purple"
        />
      </div>
      <div className="inventory-overview">
        <Panel className="coverage-panel">
          <div className="coverage-copy">
            <span className="eyebrow">REVIEW COVERAGE</span>
            <h2>Classification reviews</h2>
            <p>
              {present.length
                ? `${reviewed} of ${present.length} fields have a current classification review.`
                : "Connect a source to begin building your inventory."}
            </p>
            <button className="text-button" onClick={() => navigate("reviews")}>
              Open review queue <ArrowRight size={15} />
            </button>
          </div>
          <div
            className="coverage-ring"
            style={{
              background: `conic-gradient(var(--teal) ${rate * 3.6}deg, #e7eeeb 0)`,
            }}
          >
            <div>
              <strong>
                {rate}
                <small>%</small>
              </strong>
              <span>reviewed</span>
            </div>
          </div>
        </Panel>
        <Panel className="distribution-panel">
          <div className="panel-heading">
            <h2>Candidate distribution</h2>
            <span className="subtle-label">{present.length} fields</span>
          </div>
          <div className="distribution-bar">
            {counts.map(
              (c) =>
                c.count > 0 && (
                  <span
                    key={c.name}
                    style={{ flex: c.count, background: colors[c.name] }}
                    title={`${c.name}: ${c.count}`}
                  />
                ),
            )}
            {present.filter((f) => !f.suggested).length > 0 && (
              <span
                style={{
                  flex: present.filter((f) => !f.suggested).length,
                  background: "#c3cbd2",
                }}
              />
            )}
            {!present.length && (
              <span style={{ flex: 1, background: "#e7edeb" }} />
            )}
          </div>
          <div className="distribution-legend">
            {counts.map((c) => (
              <button
                key={c.name}
                onClick={() =>
                  setFamily(family === c.name ? "All fields" : c.name)
                }
              >
                <i style={{ background: colors[c.name] }} />
                {c.name}
                <strong>{c.count}</strong>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel className="inventory-panel">
        <div className="panel-heading">
          <div className="title-with-count">
            <h2>Field inventory</h2>
            <span className="count-pill">{rows.length}</span>
          </div>
          <div className="table-tools">
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="Search inventory"
                placeholder="Search fields…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">All sources</option>
              {workspace.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter review status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All review states</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="current">Current</option>
              <option value="reopened">Reopened</option>
              <option value="missing">Missing</option>
            </select>
          </div>
        </div>
        <div className="filter-tabs">
          {["All fields", ...families].map((name) => (
            <button
              key={name}
              className={family === name ? "selected" : ""}
              onClick={() => setFamily(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {rows.length ? (
          <FieldTable fields={rows} inspect={inspect} />
        ) : (
          <Empty
            title={
              workspace.fields.length
                ? "No matching fields"
                : "Your inventory starts here"
            }
            action={
              <Button primary onClick={() => navigate("sources")}>
                <FolderInput size={16} />
                Connect a source
              </Button>
            }
          >
            {workspace.fields.length
              ? "Adjust the filters to see more fields."
              : "Upload a CSV or SQLite file. Your field profiles, evidence, and review states will appear here."}
          </Empty>
        )}
        <div className="table-footer">
          <span>
            {rows.length} of {workspace.fields.length} fields
          </span>
          <span>
            <span className="tiny-dot" />
            Computed from committed scans
          </span>
        </div>
      </Panel>
    </>
  );
}

function Stat({
  label,
  value,
  caption,
  icon,
  tone = "blue",
}: {
  label: string;
  value: number;
  caption: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <strong>{value.toLocaleString()}</strong>
      <small>{caption}</small>
    </div>
  );
}

function FieldTable({
  fields,
  inspect,
  mode = "inventory",
}: {
  fields: FieldRecord[];
  inspect: Inspect;
  mode?: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>FIELD / SOURCE</th>
            <th>CANDIDATE</th>
            <th>PROFILE</th>
            <th>CLASSIFICATION</th>
            <th>METADATA</th>
            <th>GAPS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id}>
              <td>
                <button
                  className="field-link"
                  onClick={() =>
                    inspect(f.id, mode === "review" ? "review" : "evidence")
                  }
                >
                  <span className="field-type">
                    <Fingerprint size={16} />
                  </span>
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {f.source_name}
                      {f.table_key !== "csv" ? ` / ${f.table_key}` : ""}
                    </small>
                  </span>
                </button>
                {f.availability === "missing" && <Badge value="missing" />}
                {f.policy_stale && (
                  <span className="inline-warning">Rescan needed</span>
                )}
              </td>
              <td>
                <Family name={f.suggested} />
                {(f.ambiguous || f.mixed) && (
                  <small className="cell-note">
                    {f.ambiguous ? "Competing classes" : "Mixed value formats"}
                  </small>
                )}
              </td>
              <td>
                <strong className="number">
                  {f.profile.non_null}{" "}
                  <span className="muted">/ {f.profile.rows}</span>
                </strong>
                <small className="cell-note">non-null values</small>
              </td>
              <td>
                <Badge
                  value={f.reviews.classification?.state || "unreviewed"}
                />
                {f.reviews.classification && (
                  <small className="cell-note">
                    {f.reviews.classification.outcome}
                  </small>
                )}
              </td>
              <td>
                <Badge value={f.reviews.metadata?.state || "unreviewed"} />
              </td>
              <td>
                <span className={`gap-count ${f.gap_count ? "has-gaps" : ""}`}>
                  {f.gap_count}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Inspect ${f.name}`}
                  onClick={() =>
                    inspect(f.id, mode === "review" ? "review" : "evidence")
                  }
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sources({
  workspace,
  busy,
  run,
  scan,
  loadDemo,
  inspect,
}: {
  workspace: Workspace;
  busy: string;
  run: Run;
  scan: (s: Source, f?: File) => Promise<void>;
  loadDemo: () => Promise<unknown>;
  inspect: Inspect;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("CSV");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useDraftGuard(file !== null);
  function pick(f?: File) {
    if (!f) return;
    setFile(f);
    setName(f.name);
    setKind(/\.(db|sqlite|sqlite3)$/i.test(f.name) ? "SQLite" : "CSV");
  }
  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("name", name);
    form.set("kind", kind);
    const saved = await run(
      "Registering and scanning source",
      async () => {
        const source = await api<{ id: string }>("/sources", form);
        const request = new FormData();
        request.set("request_id", crypto.randomUUID());
        await api(`/sources/${source.id}/scan`, request);
      },
      "Source registered and scanned.",
    );
    if (saved) {
      setFile(null);
      setName("");
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <Hero
        title="Data sources"
        actions={
          <Button onClick={loadDemo} disabled={!!busy}>
            <Layers3 size={17} />
            Load synthetic workspace
          </Button>
        }
      />
      <div className="story-strip">
        <div>
          <strong>Find personal data. Keep its evidence current.</strong>
          <p>
            Scan CSV and SQLite sources, inspect the evidence, and record human
            decisions.
          </p>
        </div>
        <div>
          <strong>Two questions, two reviews</strong>
          <p>What is this field? Is its purpose and retention documented?</p>
        </div>
        <div>
          <strong>When evidence changes</strong>
          <p>
            ReviewGuard reopens affected decisions and explains why. Try the
            challenge in Changes.
          </p>
        </div>
      </div>
      <div className="source-intake">
        <section
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <div className="upload-illustration">
            <div className="upload-file back">
              <Database />
            </div>
            <div className="upload-file front">
              <FileSpreadsheet size={30} />
            </div>
            <span>
              <Plus size={16} />
            </span>
          </div>
          <h2>{file ? file.name : "Drop your data here"}</h2>
          <p>
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · ready to register`
              : "CSV or SQLite · up to 10 MB per source"}
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,.db,.sqlite,.sqlite3"
            aria-label="Upload source file"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button onClick={() => input.current?.click()}>
            <Upload size={16} />
            {file ? "Choose another file" : "Browse files"}
          </Button>
        </section>
        <Panel className="source-form">
          <div className="eyebrow">REGISTER A SOURCE</div>
          <h2>Source details</h2>
          <label>
            Source name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer operations"
              maxLength={150}
            />
          </label>
          <label>
            File format
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option>CSV</option>
              <option>SQLite</option>
            </select>
          </label>
          <Button
            primary
            onClick={upload}
            disabled={!file || !name.trim() || !!busy}
          >
            <Database size={16} />
            Register & scan
            <ArrowRight size={16} />
          </Button>
        </Panel>
      </div>
      <div className="section-heading">
        <h2>
          Connected sources{" "}
          <span className="count-pill">{workspace.sources.length}</span>
        </h2>
        <span className="muted">
          CSV · exact headers &nbsp; / &nbsp; SQLite · all ordinary tables
        </span>
      </div>
      {workspace.sources.length ? (
        <div className="sources-grid">
          {workspace.sources.map((s) => (
            <Panel key={s.id} className="source-card">
              <div className="source-top">
                <span className={`source-icon ${s.kind.toLowerCase()}`}>
                  {s.kind === "CSV" ? (
                    <FileSpreadsheet size={24} />
                  ) : (
                    <Database size={24} />
                  )}
                </span>
                <Badge value={s.status} />
              </div>
              <h3>{s.name}</h3>
              <div className="source-tags">
                <span>{s.kind}</span>
                {!!s.synthetic && <span>Synthetic</span>}
                <span>Revision {s.revision}</span>
              </div>
              <div className="source-metrics">
                <div>
                  <strong>{s.row_count ?? "—"}</strong>
                  <small>rows scanned</small>
                </div>
                <div>
                  <strong>{s.field_count}</strong>
                  <small>fields</small>
                </div>
              </div>
              {s.error && <p className="source-error">{s.error}</p>}
              <div className="source-actions">
                <Button disabled={!!busy} onClick={() => scan(s)}>
                  <RefreshCw size={15} />
                  Scan
                </Button>
                <Button
                  disabled={!s.field_count}
                  onClick={() => {
                    const f = workspace.fields.find(
                      (f) => f.source_id === s.id,
                    );
                    if (f) inspect(f.id);
                  }}
                >
                  Inspect
                  <ArrowUpRight size={15} />
                </Button>
              </div>
              <small className="source-time">
                Last scan {time(s.last_scan)}
              </small>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty title="No connected sources yet">
          Upload a file above or load the synthetic workspace to try the
          complete workflow.
        </Empty>
      )}
    </>
  );
}

function Reviews({
  workspace,
  inspect,
}: {
  workspace: Workspace;
  inspect: Inspect;
}) {
  const [filter, setFilter] = useState("needs-review");
  const fields = workspace.fields.filter(
    (f) =>
      filter === "all" ||
      (filter === "reopened"
        ? Object.values(f.reviews).some((r) => r.state === "reopened")
        : !f.reviews.classification ||
          !f.reviews.metadata ||
          Object.values(f.reviews).some(
            (r) => r.state !== "current" || r.outcome === "unresolved",
          )),
  );
  return (
    <>
      <Hero title="Review decisions" />
      <Panel>
        <div className="panel-heading">
          <h2>
            Review queue <span className="count-pill">{fields.length}</span>
          </h2>
          <select
            aria-label="Review queue filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="needs-review">Needs attention</option>
            <option value="reopened">Reopened only</option>
            <option value="all">All fields</option>
          </select>
        </div>
        {fields.length ? (
          <FieldTable fields={fields} inspect={inspect} mode="review" />
        ) : (
          <Empty title="Nothing waiting in this queue">
            Scan a source or change the filter to see fields here.
          </Empty>
        )}
      </Panel>
    </>
  );
}

function Changes({
  workspace,
  busy,
  run,
  scan,
  inspect,
}: {
  workspace: Workspace;
  busy: string;
  run: Run;
  scan: (s: Source, f?: File) => Promise<void>;
  inspect: Inspect;
}) {
  const [sourceId, setSourceId] = useState(workspace.sources[0]?.id || "");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [scenario, setScenario] = useState("v2");
  const [scope, setScope] = useState("all");
  const source = workspace.sources.find((s) => s.id === sourceId);
  const events = workspace.events.filter(
    (e) => e.scope && (scope === "all" || e.scope === scope),
  );
  return (
    <>
      <Hero title="Change history" />
      <ReviewChallenge />
      <div className="change-counters">
        <div>
          <span className="counter-symbol amber">
            <RefreshCw size={20} />
          </span>
          <strong>{workspace.totals.reopened}</strong>
          <span>Reopened reviews</span>
        </div>
        <div>
          <span className="counter-symbol teal">
            <ShieldCheck size={20} />
          </span>
          <strong>{workspace.totals.current}</strong>
          <span>Current reviews</span>
        </div>
        <div>
          <span className="counter-symbol blue">
            <Database size={20} />
          </span>
          <strong>{workspace.scans.length}</strong>
          <span>Committed scans</span>
        </div>
      </div>
      <div className="two-columns">
        <Panel title="Run a comparison">
          <div className="form-body">
            <label>
              Registered source
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setReplacement(null);
                }}
              >
                <option value="" disabled>
                  Select a source
                </option>
                {workspace.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Replacement file <span className="muted">(optional)</span>
              <input
                type="file"
                key={sourceId}
                accept=".csv,.db,.sqlite,.sqlite3"
                onChange={(e) => setReplacement(e.target.files?.[0] || null)}
              />
            </label>

            <Button
              primary
              disabled={!source || !!busy}
              onClick={() => source && scan(source, replacement || undefined)}
            >
              <RefreshCw size={16} />
              Scan & compare
            </Button>
            {source?.demo_key === "customers" && (
              <div className="scenario-section">
                <div className="eyebrow">SYNTHETIC SOURCE VARIANTS</div>
                <label>
                  Choose a file variant
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  >
                    <option value="v2">
                      V2 · 40 phone-shaped + 10 internal IDs
                    </option>
                    <option value="v1">V1 · 50 internal IDs</option>
                    <option value="renamed">
                      Rename · member_reference replaces loyalty_id
                    </option>
                  </select>
                </label>
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "Scanning selected variant",
                      () =>
                        api(`/sources/${source.id}/demo-scan`, {
                          version: scenario,
                          request_id: crypto.randomUUID(),
                        }),
                      "Variant scanned. ReviewGuard comparisons are available below.",
                    )
                  }
                >
                  <Activity size={16} />
                  Scan selected variant
                </Button>
              </div>
            )}
          </div>
        </Panel>
        <Panel
          title="Scan history"
          subtitle={`${workspace.scans.length} recent committed scans`}
        >
          <div className="scan-history">
            {workspace.scans.length ? (
              workspace.scans.slice(0, 6).map((s) => (
                <div key={s.id}>
                  <span className="scan-icon">
                    <Database size={17} />
                  </span>
                  <div>
                    <strong>{s.source_name}</strong>
                    <small>
                      {s.row_count} rows · {s.field_count} fields ·{" "}
                      {short(s.id)}
                    </small>
                  </div>
                  <time>{time(s.created_at)}</time>
                </div>
              ))
            ) : (
              <Empty title="No comparisons yet">
                Register and scan a source first.
              </Empty>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title="Review continuity"
        action={
          <select
            aria-label="Filter event scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">Both scopes</option>
            <option value="classification">Classification</option>
            <option value="metadata">Metadata</option>
          </select>
        }
      >
        <Timeline events={events} select={(id) => inspect(id)} />
      </Panel>
    </>
  );
}

function Metadata({
  workspace,
  inspect,
}: {
  workspace: Workspace;
  inspect: Inspect;
}) {
  const [gapsOnly, setGapsOnly] = useState(false);
  const fields = workspace.fields.filter((f) => !gapsOnly || f.gap_count > 0);
  return (
    <>
      <Hero
        title="Metadata"
        actions={<DownloadLink kind="gaps">Download gap report</DownloadLink>}
      />
      <div className="metadata-summary">
        <div>
          <span className="eyebrow">OPEN REQUIREMENTS</span>
          <strong>{workspace.totals.gaps}</strong>
          <p>gaps across {workspace.fields.length} fields</p>
        </div>
        <div>
          <h2>Declaration requirements</h2>

          <span className="subtle-label">
            {workspace.config.checklist.length} configured requirements
          </span>
        </div>
      </div>
      <Panel
        title="Metadata checklist"
        action={
          <label className="inline-check">
            <input
              type="checkbox"
              checked={gapsOnly}
              onChange={(e) => setGapsOnly(e.target.checked)}
            />
            Only fields with gaps
          </label>
        }
      >
        {fields.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>FIELD</th>
                  <th>SOURCE</th>
                  <th>DECLARATION REVISION</th>
                  <th>REVIEW</th>
                  <th>OPEN GAPS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <button
                        className="text-button mono"
                        onClick={() => inspect(f.id, "fix")}
                      >
                        {f.name}
                      </button>
                    </td>
                    <td>
                      {f.source_name}
                      <small className="cell-note">{f.table_key}</small>
                    </td>
                    <td>
                      {f.declaration_revision
                        ? `Revision ${f.declaration_revision}`
                        : "Not declared"}
                    </td>
                    <td>
                      <Badge
                        value={f.reviews.metadata?.state || "unreviewed"}
                      />
                    </td>
                    <td>
                      <span
                        className={`gap-count ${f.gap_count ? "has-gaps" : ""}`}
                      >
                        {f.gap_count}
                      </span>
                    </td>
                    <td>
                      <Button onClick={() => inspect(f.id, "fix")}>
                        Edit declaration
                        <ArrowRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No fields to display">
            Scan a source to build its metadata checklist.
          </Empty>
        )}
      </Panel>
    </>
  );
}
