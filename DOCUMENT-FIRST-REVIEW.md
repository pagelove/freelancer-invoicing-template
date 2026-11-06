# Document-first review — invoicing

Guide: Pagelove Document-first development edition2.4, revised2026-11-04; supplied source SHA256 `322d0c1c1c016787edeb67702c62c69610f26916933d0f34ec3dd7b2468b26dc`. Actor: Codex. Review source: `cb6a4f0630d871d6a68638340fceab5c4aadddad`. Maintainer: repository maintainers. Profiles: A3/A4.

## Model, authority and lifecycle

site/invoicing-demo/index.html: #invoices contains owned Invoice/InvoiceLine HTML; USD integer cents and quantity hundredths. Parsed invoice objects are derived read caches; the editable command is built from current form controls, not an independently persisted JSON catalog.

## Operation, state and recovery contract

Strong page ETag conditions selector POST/PUT. Draft/sent/paid/void transitions preserve historical invoice terms. Ambiguous creates reconcile stable pendingCreateId on refresh; no emails, payments or external effects are sent.

Line math, date bounds and conflict recovery use existing tests. Working composer data is in-page; no offline queue or multi-account recovery guarantee. Production maxima/performance and physical-device/AT tasks remain separate acceptance gates.

## Enforcement and effects

Public fictional client details only. Actual private-read/write/schema/uniqueness enforcement is not established by mocked HTTP tests or authoring upload.

## W1–W8 / R01–R12 acceptance

- W1–W3 / R01–R04: selected profiles, HTML preference, stable identities, owned aggregates and the representation exception above are the governing source contract. Derived caches/runtime arrays cannot become independent editable authorities.
- W4 / R05–R07: inspect exact canonical address/selector, actor, source revision and actual enforcement before enabling a newly relied-on mutation. Local fixtures and declaration review do not establish target-host privacy or validation.
- W5–W6 / R08–R10: distinguish working draft, frozen pending command, accepted state and unknown outcome. Preserve original data on rejected/future imports. No automatic external-effect replay. Offline collaboration/subscription features are not implied by browser storage; add tested scope/disposal/reconnect contracts before offering them.
- W7–W8 / R09–R12: audit/CHANGELOG.md records current commands, revisions and results. Existing REVIEW evidence remains historical. Re-run the appropriate source/shape/round-trip/concurrency/negative checks, then actual affected browser tasks. Never label pending live, maximum-device, assistive, restore or security checks as passed.

## Release and maintenance gates

Preserve user records, mutable source paths and incompatible backups during code updates. Do not replace a live document containing user records with a seed. Exclude credentials/private payloads from source, logs, public examples and previews. Pin coupled runtime/definition versions and retain rollback assets. Before real private or consequential use, verify supported read/write paths with valid and known-invalid/unauthorized requests on the actual host, exercise restoration in isolation, and record device/performance/accessibility limits. No new service or identity provider is authorized by this record. Re-review when format, source route, write adapter, host configuration, rules or runtime changes.
