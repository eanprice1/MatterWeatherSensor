# Validation and supported environment

The application targets Linux ARM64 with systemd, Node.js 24.22.0 and npm 11.19.1. Native Windows is not a supported service platform.

## Completed Linux validation

On October 22, 2026, revision `d72ee7ec1ec29791a3f7815d538725ae43b01902` passed **all 18 tests** on a Raspberry Pi running Debian 13 ARM64 with the pinned runtime and dependencies:

- Device metadata defaults/overrides, service account/interface validation, template rendering and argument validation.
- An isolated real Matter server: live reading changes, credential-output protection, invalid commands, persistent identity, restart/crash recovery and corrupt-state rejection.
- Fahrenheit conversion, negative temperatures, rounding, invalid values and unavailable/null measurements.
- Mocked weather responses, freshness/expiry, mode isolation, cached startup, restart scheduling, retries, authentication pause, rate limiting, durable quota accounting, concurrent-request prevention, timeouts and error redaction.

The tests ran as an existing non-root service account with temporary state/socket paths, a separate Matter port and no production credential environment. Weather tests used synthetic location/credentials and mocked HTTP responses; they made no real weather or geocoding requests.

Actual Linux account/interface selection and systemd unit verification also passed. This preflight discovered and corrected a quoted WorkingDirectory path in the verification helper before deployment. An existing paired installation was then updated, preserving its identity, service hardening, schedule and accounting. A subsequent naturally scheduled weather fetch succeeded, and a separately authorized simulated reading was confirmed in Google Home before weather mode was restored.

These checks validate the application and an existing-deployment update. **The complete fresh installer on a clean host, including the newly included automation-documentation payload, has not been executed end to end.** No CI workflow is included. Clean-host installation/removal and a full power-cycle acceptance test remain separate checks; do not describe them as completed.

## Local checks and privacy review

The local Windows environment uses an existing Node.js 20.11.0 installation for portable checks, not as the supported production runtime. Seven selected configuration/temperature tests passed during deployment preparation. Syntax, pinned-lockfile, documentation-link and sanitized automation-copy checks are separate from Linux installation validation.

On October 22, 2026, reviewed the 40 candidate public files and all 33 unique historical file blobs reachable from the two published commits. No credentials, household device/recipient selections, private network addresses, precise deployment coordinates, onboarding codes or live Matter state were found in that content. Public project attribution and repository URLs remain intentional. Git commit metadata includes the configured author identity/email; the review does not remove or rewrite it. Pattern scans and manual review cannot guarantee that every possible secret format is detected; review each future change before publication.

Real configuration, credentials, state, private keys, archives, logs and local dependency/runtime artifacts are excluded by `.gitignore`. Explicitly named fictional configuration examples remain included. An ignore rule does not remove an already tracked file or erase history.

A Windows baseline of the original temperature/weather tests passed 6 of 13 cases; seven persistence cases failed because Windows returns EPERM for directory fsync. The production durable-write implementation intentionally retains directory syncing for request accounting. Do not remove that protection to make Windows tests pass.

## Checks to run on an isolated Linux host

After staging the pinned runtime/dependencies:

```sh
runtime/bin/node scripts/verify-dependencies.mjs
runtime/bin/node --test test/*.test.mjs
```

The integration test uses temporary state/socket paths and Matter port 5559. Set `OTM_INTERFACE` to an existing interface on the test host and confirm the test port is free. It advertises an uncommissioned test sensor; do not pair it or point it at production state. All weather tests use mocked responses and synthetic credentials. No automated test needs an OpenWeather subscription/key.

Fresh-install acceptance must separately confirm refusal of missing/invalid account/interface selections and existing destinations, rendered unit ownership/permissions, service startup, commissioning, weather credential delivery and removal preserving identity. Null/recovery behavior in a smart-home app and thermostat automation behavior are manual deployment checks, not established by mocked HTTP tests.

`scripts/check-service.mjs` is an invasive installation diagnostic, excluded from `npm test`. It changes simulated readings and restarts/kills the installed service. It refuses commissioned devices and weather mode. Use it only on a disposable uncommissioned installation, never on a production device.
