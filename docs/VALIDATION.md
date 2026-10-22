# Validation and supported environment

The application targets Linux ARM64 with systemd, Node.js 24.22.0 and npm 11.19.1. Earlier versions of the core weather/Matter application passed 15 tests on a Raspberry Pi running Debian 13, including an isolated real Matter server. This is historical evidence for the core application, not validation of the new generic installer or metadata configuration.

## Repository migration checks

The new metadata configuration and service-rendering helpers have portable tests. The dependency lockfile remains restricted to the original nine pinned runtime libraries. No real weather/geocoding request, commissioning, HVAC action or live systemd change is part of migration validation.

On October 21, 2026, using the existing Windows Node.js 20.11.0 installation, **10 selected portable tests passed**: four configuration/template/manifest checks, four temperature checks, and two mocked response/HTTP checks. The manifest check covered a one-time migration utility that has since been removed along with that utility. Seven Linux-dependent weather persistence cases were excluded by the explicit test-name selection, not removed from the suite. Syntax checks passed for the then-existing 15 JavaScript modules and five shell files using existing Node and Git's shell. Lockfile verification found exactly the nine pinned libraries. These checks do not validate Node.js 24 service execution on Linux.

Linux installation, account lookup, systemd execution and the full Matter integration suite for this migrated version remain **pending**. No CI workflow is included. Do not describe this revision as freshly installation-tested on Linux until that work is performed in an approved environment.

On October 22, 2026, after removing the obsolete one-time migration tools and their dedicated test, all three remaining configuration/service-rendering tests passed with `node --test test/configuration.test.mjs`. Public local Markdown links were checked and no references to the removed tools remained. Application runtime behavior was unchanged; no deployment or live-device test was performed.

Native Windows is not a supported service/runtime platform. A Windows baseline of the existing temperature/weather tests passed 6 of 13 cases; seven weather persistence cases failed because Windows returns EPERM for directory fsync. The durable-write implementation deliberately retains directory syncing for request accounting. Do not remove this protection to make Windows tests pass.

## Checks to run on an isolated Linux host

After staging the pinned runtime/dependencies:

```sh
runtime/bin/node scripts/verify-dependencies.mjs
runtime/bin/node --test test/*.test.mjs
```

The integration test uses temporary state/socket paths and Matter port 5559. Set `OTM_INTERFACE` to an existing interface on the test host. It advertises an uncommissioned test sensor; do not pair it or point it at production state. All weather tests use mocked responses and synthetic credentials. No automated test needs an OpenWeather subscription/key.

Fresh-install acceptance must separately confirm invalid/missing account/interface rejection, preflight refusal of existing destinations, correct rendered account/group, service permissions, commissioning, weather credential delivery and removal preserving identity. Real reboot, stale/null behavior in a smart-home app and thermostat automation behavior are manual deployment checks, not established by mocked HTTP tests.

`scripts/check-service.mjs` is an invasive installation diagnostic, excluded from `npm test`. It changes simulated readings and restarts/kills the installed service. It refuses commissioned devices and weather mode. Use it only on a disposable uncommissioned installation, never on a production device.
