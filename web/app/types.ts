export type Scope = "classification" | "metadata";
export type View =
  | "inventory"
  | "sources"
  | "reviews"
  | "changes"
  | "metadata"
  | "exports"
  | "settings"
  | "evidence"
  | "review"
  | "fix";
export type Profile = {
  rows: number;
  non_null: number;
  null_count: number;
  null_rate: number;
  distinct_count: number;
  min_length: number;
  max_length: number;
  shapes: Record<string, number>;
};
export type Candidate = {
  label: string;
  score: number;
  contributions: Record<string, number>;
};
export type Evidence = {
  evidence_id: string;
  detector_id: string;
  label: string;
  candidate_class: string;
  group: string;
  matches?: number;
  format_matches?: number;
  sampled_non_null?: number;
  pass_rate?: number;
  strength: number;
  notes: string[];
  normalization_policy?: string;
};
export type Payload = {
  profile: Profile;
  evidence: Evidence[];
  candidates: Candidate[];
  suggested: string | null;
  ambiguous: boolean;
  mixed: boolean;
  insufficient: boolean;
  sampling: { id: string; null_policy: string };
  limitations: string[];
  declared_meaning: string;
};
export type Review = {
  id: string;
  field_id: string;
  scope: Scope;
  outcome: string;
  selected_class: string | null;
  state: string;
  rationale: string;
  reviewer: string;
  snapshot_id: string;
  declaration_id: string | null;
  created_at: string;
  dependencies: Record<string, unknown>;
};
export type FieldRecord = {
  id: string;
  source_id: string;
  source_name: string;
  source_kind: string;
  table_key: string;
  name: string;
  availability: string;
  snapshot_id: string;
  scan_id: string;
  suggested: string | null;
  ambiguous: boolean;
  mixed: boolean;
  profile: Profile;
  candidates: Candidate[];
  reviews: Partial<Record<Scope, Review>>;
  gap_count: number;
  declaration_revision: number;
  policy_stale: boolean;
};
export type Source = {
  id: string;
  name: string;
  kind: string;
  synthetic: number;
  demo_key: string | null;
  revision: number;
  status: string;
  error: string | null;
  field_count: number;
  row_count: number | null;
  last_scan: string | null;
};
export type Scan = {
  id: string;
  source_id: string;
  source_name: string;
  policy_id: string;
  row_count: number;
  field_count: number;
  created_at: string;
};
export type Change = {
  dependency: string;
  before: unknown;
  after: unknown;
  reason: string;
  material: boolean;
};
export type AuditEvent = {
  id: number;
  field_id: string | null;
  field_name?: string;
  source_name?: string;
  review_id: string | null;
  scan_id: string | null;
  type: string;
  scope: Scope | null;
  before_state: string | null;
  after_state: string | null;
  reason: string;
  comparisons: Change[];
  created_at: string;
};
export type Draft = {
  purpose: string;
  retention_duration: number | null;
  retention_unit: string;
  retention_start_trigger: string;
  owner: string;
  provenance: string;
  meaning: string;
};
export type Check = {
  key: string;
  status: string;
  reason: string;
  revision: number;
};
export type Token = {
  expected_snapshot_id: string;
  expected_declaration_id: string | null;
  expected_policy_id: string;
};
export type Detail = {
  field: FieldRecord;
  snapshots: {
    id: string;
    scan_id: string;
    payload: Payload;
    declaration_revision: number;
    created_at: string;
  }[];
  declaration: {
    id: string | null;
    revision: number;
    payload: Draft;
    origin: string;
  };
  checklist: Check[];
  reviews: Review[];
  events: AuditEvent[];
  policy_id: string;
  policy_stale: boolean;
  token: Token;
};
export type Preview = {
  before: Draft;
  after: Draft;
  draft: Draft;
  before_checklist: Check[];
  after_checklist: Check[];
  affected: { field_id: string; name: string; scopes: Scope[] }[];
  target_revision: number;
  preview_digest: string;
};
export type Rule = {
  id: string;
  label: string;
  family: string;
  pattern: string;
  headers: string;
  normalizer: string;
  check: string;
  enabled: boolean;
  note: string;
};
export type Configuration = {
  rules: Rule[];
  weights: Record<string, number>;
  acceptance: number;
  near_tie: number;
  materiality: { rate_delta: number; minimum_denominator: number };
  checklist: string[];
};
export type Evaluation = {
  baseline_method?: string;
  baselines?: {
    name: string;
    policy_id: string;
    macro_f1: number | null;
    cases: number;
    abstentions: number;
    stress_errors: number;
    stress_cases: number;
    metrics: {
      label: string;
      precision: number;
      recall: number;
      f1: number;
      support: number;
      predicted: number;
    }[];
  }[];
  id: string;
  policy_id: string;
  created_at: string;
  fixture_digest: string;
  suite: string;
  limitations: string;
  macro_f1: number | null;
  cases: number;
  abstentions: number;
  stress_cases: number;
  stress_errors: number;
  metrics: {
    label: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
    predicted: number;
  }[];
  results: {
    field: string;
    expected: string | null;
    predicted: string | null;
    stress: boolean;
  }[];
  replay: {
    case: string;
    scope: Scope;
    expected_reopen: boolean;
    actual_reopen: boolean;
    passed: boolean;
  }[];
  scope_metrics: {
    scope: Scope;
    correct: number;
    total: number;
    false_reopenings: number;
    missed_reopenings: number;
  }[];
};
export type Workspace = {
  workspace_id: string;
  sources: Source[];
  fields: FieldRecord[];
  scans: Scan[];
  events: AuditEvent[];
  policy_id: string;
  config: Configuration;
  evaluation: Evaluation | null;
  totals: {
    fields: number;
    sources: number;
    reopened: number;
    current: number;
    gaps: number;
  };
};
