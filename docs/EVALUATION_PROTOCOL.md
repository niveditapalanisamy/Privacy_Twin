# Human-labelled evaluation and submission checklist

The bundled 19 cases are developer-authored synthetic regression inputs. They are not independent manual annotation. Passing automated tests does not substitute for the evaluation requested by PS-019.

## Annotation procedure

1. Ask a teammate who did not tune the detectors to prepare synthetic structured field cases from different templates. Include positive fields for all five configured classes, negative fields, misleading names and failed checksums. Use enough cases to show support for each class; 10 positive fields per class is a practical target, not a claim of statistical sufficiency.
2. Agree the five-class taxonomy with the mentor. PS-019.pdf says five predefined classes but does not enumerate them. This prototype uses Identity, Contact, Location, Official ID and Demographic.
3. Label the intended field meaning using the synthetic source specification and owner context. Do not derive labels by running PrivacyTwin. Record case ID, author, annotator, rationale, ambiguity and dataset family in a separate annotation ledger.
4. Keep tuning families separate from test families. Have a second person inspect disagreements before freezing test labels. Single-class custom evaluation supports one expected class or null; keep inherently multi-class fields in a separately documented challenge set rather than silently forcing a misleading label.
5. Export/freeze configuration.json and its policy identifier before revealing held-out labels to the detector author. Preserve the input cases and their SHA-256 digest separately from the aggregate evidence package.
6. Upload the completed JSON array under Exports & evaluation and run it once against the frozen configuration. Report per-class precision/recall/support, abstentions, baseline method and difficult-case errors. An unsupported class is not evidence of success. Report all failures.
7. Record authorship, split protocol, dates and revisions in the report. The application's conservative independent_heldout=false flag is not an annotation attestation; attach the external ledger instead of relabelling an automated set as independent.

Accepted evaluation input:

```json
[
  {"field": "email", "values": ["one@example.test", "two@example.test"], "expected": "Contact"},
  {"field": "quantity", "values": ["24", "36"], "expected": null},
  {"field": "loyalty_id", "values": ["9876543210"], "expected": "Contact", "stress": true}
]
```

These three examples illustrate the format; they are not an independent test set. Annotation-ledger columns: case_id, dataset_family, author, annotator, expected_class, rationale, disagreement, resolution, frozen_policy_id, frozen_at.

## PS-019 evidence map

| Requirement | Evidence available in this repository | Submission status |
|---|---|---|
| CSV and one SQL database | Upload/scan UI, CSV adapter and read-only SQLite adapter | Implemented and tested |
| Five data classes | Configurable registry and per-class evaluation | Confirm the taxonomy with mentor |
| Configurable rules | Rules editor, checksum options and custom regex | Implemented and tested |
| Small manually labelled test set | Custom evaluation uploader and annotation procedure | Human annotation still required |
| Purpose/retention mapping | Field/table declaration resolution and provenance | Implemented and tested |
| Configurable evidence checklist | Settings and field metadata checklist | Implemented and tested |
| Missing metadata and evidence gaps | Preview, gap CSV and evidence package | Implemented and tested |
| Per-class precision and recall | Measured metrics and baseline comparisons | Independent results still required |
| Technical evidence/human review boundary | Explicit UI/report wording; scoped human decisions | Implemented |
| Technical report and demonstration | Pitch deck, script, architecture, executable challenge, verifier | Apply official report template and record demo |

## Organizer deliverables from PS-019

- Private GitHub repository named after the team.
- Add aiori-hackathon as collaborator and complete the stated acceptance/ownership workflow with the organizer.
- Upload the required report PDF, following Proposed-structure-hackathon.pdf. That template was not supplied; the pitch PDF is presentation material and does not replace it.
- Demonstrate the prototype and show pseudocode to the mentor.

Ownership transfer is an external administrative action requiring the correct team repository and organizer coordination. No transfer or collaborator invitation is performed by these local changes.

## Pseudocode matching the implementation

```text
register a controlled local copy of the synthetic source
read CSV or SQLite tables within configured size limits
for each exact table/column identity:
    resolve the explicit field declaration or table default
    profile non-empty values and run enabled detectors
    cap correlated evidence within each signal group
    score candidates and retain ambiguity and unknown states
    commit an immutable aggregate snapshot
    for each existing review scope:
        compare its saved dependencies with current evidence/policy/declarations
        preserve, reopen, or mark missing with a recorded reason
show required metadata gaps and require an explicit human decision
export the inventory, original dependencies and reproducible evidence
```
