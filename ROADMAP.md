# TypeScript SDK phases

## Decision

Requirement: let TypeScript applications consume Pixeltable with checked inputs and outputs, then expand toward the Python SDK's capabilities.

Uncertainty: the existing HTTP surface exposes application-defined routes. It does not expose arbitrary catalog expressions, schema operations, durable jobs, or tenant-scoped subscriptions.

Options: build a new remote execution API first, or generate a client from existing services.

Constraints: retain Python computation, preserve existing service behavior, and keep the package extractable to its own repository.

Risk: presenting proposed schema, tenancy, or subscription APIs as implemented would give callers guarantees the server does not provide.

Choice: begin with generated OpenAPI types and a service client, as requested in the conversation. The original proposals describe a broader launch; this implementation is the first phase of that work.

Falsifier: an existing service cannot be called with its generated request types, media inputs, and background-job responses.

Verification: compile-time rejection tests, HTTP transport tests, reproducible generation, and actual Pixeltable service integration.

## Phase 1: service client

Implemented: generated request/response types, service URL and optional bearer auth, JSON and multipart requests, file response modes, HTTP errors, background-job polling, cancellation, and bounded waits. The package can be built and packed independently. The endpoint must already exist.

Remaining release gates: select the standalone GitHub repository and npm owner; test against a hosted HTTP service; define the supported Pixeltable/FastAPI version matrix; configure release publishing. The package remains private and unpublished.

## Phase 2: application handles and React

Implemented: named calls generated from OpenAPI operation IDs with automatic JSON/multipart serialization, `defineQuery`, `usePixeltableQuery`, `usePixeltableMutation`, and `usePixeltableJob`, using TanStack Query with documented polling, cancellation, cache scopes, and invalidation.

Implemented: version 1 serving metadata and generated scoped query handles and mutation functions, including POST queries.

Implemented: authenticated document-backend handler with tenant-to-service selection, job-ticket storage interface, and live Pixeltable integration.

Remaining: verify the complete Next.js application with its session provider and shared job store. Browser code calls an authenticated application backend. Service/catalog credentials remain on the server.

Required server contracts: stable route identity, public/internal visibility, final background-result schemas, tenant authorization, and any presigned upload flow. Preserve current route methods and media representations. Do not infer a table's identity or permissions from a URL.

Acceptance: a Next.js application inserts media, renders a typed query, observes a job, and refreshes affected reads without custom REST serialization or exposing a service credential.

## Phase 3: schema and query authoring

Use the existing versioned catalog proxy protocol where it supports schema descriptions, typed expression serialization, query execution, and explicit operations. Add public contracts for schema diffs and any missing behavior. The service client and experimental catalog adapter remain separate. Define tables, views, computed columns, and indexes from TypeScript against that contract. Keep custom UDFs and iterators in Python and reference them by registered identity.

Implemented: an experimental adapter for direct protocol-v4 HTTP endpoints, with Python-compatible binary framing, directory creation, and recursive catalog listing. Scalar/JSON table schemas now support typed creation, schema-checked opening, insertion, literal and expression updates, filtered deletes, collection with limits, and counts. Scalar column addition, renaming, and removal return updated typed handles. Version checks reject stale writes without replay. Typed queries support scalar comparisons, null checks, Boolean predicates, typed named expression projections, ordering, limits, and offsets. Numeric arithmetic with literal or same-table expression operands works in filters and updates. Stored scalar computed columns support backfills, typed handles, automatic maintenance, and read-only write types. Explicit B-tree indexes support creation and removal with version checks. Filtered live views inherit typed base columns, support computed columns, indexes, history, and nested views, and reflect base mutations. View handles omit row writes; schema mutations check versions across the base chain. Declared scalar Python function references work in projections and computed columns using required named arguments. Text embedding indexes reference installed Python UDFs and support similarity filtering, projection, and expression-based ranking. Signature discovery, aggregate/window functions, projected/iterator views, multimodal embeddings, media, and schema diffs remain incomplete.

Decision update: the Python client already uses `proxy_protocol.py` and `proxy_dispatch.py` for remote catalog operations. Reuse their versioned protocol first rather than duplicate the dispatch API. Its metadata format remains internal and version-coupled, so expose the adapter only under `./experimental/catalog`. A supported hosted transport, type/expression mappings, schema-staleness behavior, and parity tests remain required. Falsifier: Python and TypeScript requests produce different catalog state under the same protocol version. Verification: byte-for-byte framing fixtures generated by Python and live calls to the existing dispatcher.

Acceptance: a TypeScript-defined pipeline and its Python equivalent produce the same rows, computed values, index behavior, and validation failures. Preview destructive or expensive schema effects before apply. Document drift/conflict policy between Python and TypeScript definitions.

## Phase 4: lifecycle parity

Implemented: filtered recomputation with error-only retries, cascade control, and version checks; stored computed-column error type/message inspection through query expressions; table/view/directory moves and removal, with dependency checks by default and explicit cascading removal. Typed version history and version-checked rollback of the latest data or schema change. Rollback returns a handle validated against the caller's expected prior schema.

Extend the public server contract to cover snapshots, history, revert, row/column error inspection, recompute/backfill, deployment, observability, and typed agent tools. Document supported atomicity and job durability. Add hosted/local compatibility tests before claiming equivalent behavior.

Acceptance: maintain a capability matrix against the Python public API, with runtime tests and explicit unsupported entries. Keep authoring, execution, and control-plane APIs separately versioned where their compatibility needs differ.

## Sources

- [Unified proposal](https://app.notion.com/p/3cc439ccd15b4d0e819cf5c440df5efb): server-first client, generated handles, React, schema authoring, lifecycle coverage.
- [Concise proposal](https://app.notion.com/p/39854609e49080e68bdeea84d7e4860f): package boundaries and Python's execution role.
- Python implementation: `pixeltable/serving/_fastapi.py` and `pixeltable/serving/_app.py` at upstream commit `0d733d47e`.

Slack was not connected during implementation. The proposals are design input; the checked-out Python implementation defines the Phase 1 wire contract.
