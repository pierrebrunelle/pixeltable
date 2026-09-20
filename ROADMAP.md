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

Implemented: `defineQuery`, `usePixeltableQuery`, `usePixeltableMutation`, and `usePixeltableJob`, using TanStack Query with documented polling, cancellation, cache scopes, and invalidation.

Remaining: generate named query and mutation handles from explicit serving metadata and supply a tested authenticated application-backend example. Browser code calls an authenticated application backend. Service/catalog credentials remain on the server.

Required server contracts: stable route identity, public/internal visibility, final background-result schemas, tenant authorization, and any presigned upload flow. Preserve current route methods and media representations. Do not infer a table's identity or permissions from a URL.

Acceptance: a Next.js application inserts media, renders a typed query, observes a job, and refreshes affected reads without custom REST serialization or exposing a service credential.

## Phase 3: schema and query authoring

Add a versioned server API for schema descriptions, schema diffs, typed expression serialization, query execution, and explicit apply operations. Define tables, views, computed columns, and indexes from TypeScript against that contract. Keep custom UDFs and iterators in Python and reference them by registered identity.

Acceptance: a TypeScript-defined pipeline and its Python equivalent produce the same rows, computed values, index behavior, and validation failures. Preview destructive or expensive schema effects before apply. Document drift/conflict policy between Python and TypeScript definitions.

## Phase 4: lifecycle parity

Extend the public server contract to cover snapshots, history, revert, row/column error inspection, recompute/backfill, deployment, observability, and typed agent tools. Document supported atomicity and job durability. Add hosted/local compatibility tests before claiming equivalent behavior.

Acceptance: maintain a capability matrix against the Python public API, with runtime tests and explicit unsupported entries. Keep authoring, execution, and control-plane APIs separately versioned where their compatibility needs differ.

## Sources

- [Unified proposal](https://app.notion.com/p/3cc439ccd15b4d0e819cf5c440df5efb): server-first client, generated handles, React, schema authoring, lifecycle coverage.
- [Concise proposal](https://app.notion.com/p/39854609e49080e68bdeea84d7e4860f): package boundaries and Python's execution role.
- Python implementation: `pixeltable/serving/_fastapi.py` and `pixeltable/serving/_app.py` at upstream commit `0d733d47e`.

Slack was not connected during implementation. The proposals are design input; the checked-out Python implementation defines the Phase 1 wire contract.
