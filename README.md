# MatterWeatherSensor

MatterWeatherSensor publishes OpenWeather's current outdoor temperature as a virtual **Matter Temperature Sensor** on a Raspberry Pi. Pair it with Google Home to display readings or use them in household automations.

## TLDR

For a **fresh installation**. The application is tested; the complete clean-host installer remains untested. [Validation details](docs/VALIDATION.md).

1. **Have the prerequisites:** a Raspberry Pi 4 with 64-bit Linux/systemd, an existing non-root account, internet access, a supported Google Home Matter hub, and an Android phone. Your LAN needs IPv6 and device discovery. [Prerequisites](#prerequisites).
2. **Get weather access:** create an OpenWeather account, subscribe to One Call API with **4.0** access, obtain an API key, and set its daily limit to **1,000 calls** to stay within the free allowance. Get your location's decimal latitude/longitude.
3. **Create the Google integration:** use the Google Home Developer Console, preferably with your Google Home account. Choose **Sensor**, VID **`0xFFF1`**, and PID **`0x8000`**. [Console setup](#google-developer-console-and-commissioning).
4. **Install on the Pi**, replacing the account/interface placeholders:

   ```sh
   git clone https://github.com/eanprice1/MatterWeatherSensor.git
   cd MatterWeatherSensor
   sh scripts/stage.sh
   sudo sh scripts/install.sh --user YOUR_EXISTING_USER --interface YOUR_INTERFACE
   ```

5. **Configure private weather access:** follow the [configuration commands](#production-deployment-and-weather-credentials) to create `/etc/outdoor-matter-sensor/weather.json` with your coordinates and the root-only, mode-0600 `api-key` file. Optionally customize `device.env`. Keep these files outside Git.
6. **Load the API credential and restart** from the source directory:

   ```sh
   sudo install -d -m 0755 /etc/systemd/system/outdoor-matter-sensor.service.d
   sudo install -m 0644 systemd/weather.conf /etc/systemd/system/outdoor-matter-sensor.service.d/weather.conf
   sudo systemctl daemon-reload
   sudo systemctl restart outdoor-matter-sensor.service
   ```

7. **Pair with Google Home:** as the selected service account, run `/opt/outdoor-matter-sensor/bin/sensorctl pairing`, then add a Matter device in Google Home using its QR/manual code. Confirm the initial **68°F / 20°C** reading.
8. **Switch to real weather** as the selected service account:

   ```sh
   /opt/outdoor-matter-sensor/bin/sensorctl mode weather
   /opt/outdoor-matter-sensor/bin/sensorctl status
   ```

   Confirm a successful fetch and the reading in Google Home. The service starts automatically at boot and fetches every **15 minutes**.
9. **Optional:** customize the [automation templates](automations/README.md), replace their fictional device/member selections, and validate/save them in Google Home. The thermostat routines can control real equipment.

---

The application runs as a native systemd service and fetches weather every **15 minutes**. A separate simulated mode supports commissioning and controlled testing. The Pi publishes temperature; your smart-home platform owns automation actions.

This is **noncommercial, source-available software** under CC BY-NC-SA 4.0, with separately licensed upstream material. It is an uncertified development device. No credentials, personal location or preconfigured household device selections are supplied.

The application has passed **18 tests on Debian 13 ARM64**, including an isolated Matter server, and has been deployed successfully to an existing paired installation. Systemd unit verification also passed. **The complete fresh-install procedure on a clean host remains untested.** See [Validation](docs/VALIDATION.md).

---

## Features

- OpenWeather One Call API 4.0 current temperature, not forecast or feels-like temperature
- One Matter Temperature Sensor with persistent device identity and pairing
- Fifteen-minute fetching with cached readings and restart-persistent scheduling
- Unavailable/null readings after 30 minutes without fresh data
- Bounded requests, retry backoff, rate-limit handling and a rolling 900-attempt/24-hour ceiling
- Protected API-key delivery through systemd `LoadCredential`
- Local Unix-socket CLI for status, simulated measurements and mode selection
- Automatic service startup and recovery, without an additional web server or database

---

## Repository Structure

```text
src/                 Application, weather engine and local control protocol
bin/sensorctl        Command-line launcher using the bundled runtime
scripts/             Staging, installation and verification tools
systemd/             Generic service template and weather credential drop-in
test/                Portable checks, mocked weather tests and Linux Matter integration
examples/            Fictional configuration and simple notification example
automations/         Sanitized temperature-band notification/thermostat templates
docs/                Validation results and limitations
LICENSE              CC BY-NC-SA 4.0 for original contributions
LICENSES/            Upstream license text
NOTICE.md            Attribution and third-party licensing
```

`package.json` deliberately retains `private: true` to prevent accidental npm publication. The GitHub source repository is public.

---

## Configuration

The service uses these conventional locations:

| Location | Purpose |
|---|---|
| `/opt/outdoor-matter-sensor/` | Root-owned application, runtime and dependencies |
| `/etc/outdoor-matter-sensor/weather.json` | Your latitude and longitude |
| `/etc/outdoor-matter-sensor/api-key` | Root-owned, mode-0600 OpenWeather key |
| `/etc/outdoor-matter-sensor/device.env` | Optional display-name and VID/PID overrides |
| `/var/lib/outdoor-matter-sensor/` | Private identity, pairing, weather state and simulated reading |
| `/run/outdoor-matter-sensor/control.sock` | Permission-restricted local CLI socket |

Runtime environment settings:

| Setting | Default / use |
|---|---|
| `OTM_INTERFACE` | `wlan0`; installer requires an explicit existing interface |
| `OTM_DEVICE_NAME` | `Outdoor Temperature Sensor` |
| `OTM_VENDOR_NAME` | `MatterWeatherSensor` |
| `OTM_VENDOR_ID` | `0xFFF1`; decimal or hexadecimal |
| `OTM_PRODUCT_ID` | `0x8000`; decimal or hexadecimal |
| `OTM_PORT` | `5540` |
| `OTM_CONFIG_PATH` | `/etc/outdoor-matter-sensor/weather.json` |
| `OTM_STATE_DIR` | `/var/lib/outdoor-matter-sensor` |
| `OTM_SOCKET_PATH` | `/run/outdoor-matter-sensor/control.sock` |

Names must be nonempty and at most 32 UTF-8 bytes. Use only vendor identifiers you are entitled to use; development VIDs `0xFFF1` through `0xFFF4` are documented below. Do not change VID/PID or replace state on an already paired installation as a routine update.

Keep the API key in its dedicated credential file, not in environment variables, authenticated URLs, shell command arguments or Git. The application reads it from systemd's credentials directory. This is an IP-based device; it does not enable Bluetooth or configure Wi-Fi.

---

## Prerequisites

### Raspberry Pi and Linux

- Raspberry Pi 4 with a **64-bit ARM Linux** installation, working network access and accurate system time. Native Windows is not supported.
- Existing systemd with `LoadCredential` support (introduced in systemd 247), an existing non-root service account, and administrative authorization for project installation.
- Existing utilities: `sh`, `curl`, `tar` with xz/gzip support, `sha256sum`, `grep`, `find`, `id`, `uname`, `ss`, `install`, `cp`, `chmod`, `chown`, `mktemp`, `rm`, `rmdir`, `systemctl`, `systemd-analyze`, `journalctl` and `sudo`/`sudoedit`. Git is optional if obtaining a source archive instead.
- The staging script installs the pinned project-local runtime: **Node.js 24.22.0**, bundled **npm 11.19.1**, Matter.js **0.17.9** and noble dependencies **2.4.0**. It does not change system PATH, repositories or accounts.

Scripts do not install missing OS utilities, adjust sudo policy or change networking. Resolve missing prerequisites separately before continuing.

### Google Home and Matter

You need a supported **Matter-enabled hub for Google Home**, already configured in your home, and a compatible Android phone with Google Home. Examples include supported Nest displays and speakers; an arbitrary Matter bulb or plug is not itself a hub. This sensor uses your existing IP network, so **a Thread border router is not required for this sensor**. [Google's hub requirements](https://support.google.com/googlehome/answer/12391458?hl=en)

The Pi, hub and commissioning phone need suitable local connectivity, IPv6 and multicast/mDNS discovery. Isolated guest networks can prevent discovery. Matter uses UDP port 5540. Check the platform's current network prerequisites; this project does not modify routers, firewalls, IPv6 or discovery services and needs no internet port forwarding.

### OpenWeather account and One Call subscription

1. Create an [OpenWeather account](https://home.openweathermap.org/users/sign_up) and obtain an API key.
2. Subscribe to the separate **One Call API** product that provides access to **endpoint version 4.0**. An account/key alone does not establish that subscription.
3. The current pay-as-you-go subscription includes **1,000 API calls per day free**, with billable usage above that allowance. This is not an unlimited free subscription. Review [current pricing and documentation](https://openweathermap.org/api/one-call-4?collection=one_call_api).
4. In your account's Billing Plans settings, consider setting the daily limit to **1,000** to avoid paid overage. OpenWeather currently documents a default limit of **2,000 calls/day**, which exceeds the free allowance. Check the account's current limits and terms before enabling fetching.

Normal operation makes approximately **96 calls/day**. Retries also count. The application's rolling 900-attempt/24-hour ceiling is an additional safeguard; it does not count requests from other programs sharing your key or replace the provider's account-level cap.

You also need your location's latitude/longitude, supplied privately. Obtain decimal-degree coordinates from a map: latitude must be between -90 and 90, longitude between -180 and 180; south and west use negative values. The example coordinates are placeholders, not location detection. No automatic address lookup is performed, and the configuration does not accept a street address.

---

## Installation

These instructions are for a **fresh, isolated installation**. The installer refuses existing application, service, configuration or state destinations. Do not rerun it over an existing deployment. Create weather configuration only after completing the fresh installer.

### 1. Obtain the source on your Pi

With Git already available:

```sh
git clone https://github.com/eanprice1/MatterWeatherSensor.git
cd MatterWeatherSensor
```

Alternatively, download and extract the GitHub source archive using existing utilities:

```sh
curl --fail --location --proto '=https' --tlsv1.2 \
  https://github.com/eanprice1/MatterWeatherSensor/archive/refs/heads/main.tar.gz \
  -o MatterWeatherSensor-source.tar.gz
tar -xzf MatterWeatherSensor-source.tar.gz
cd MatterWeatherSensor-main
```

Review the revision you intend to install. The `main` branch can change; keep the selected commit SHA with your private deployment records.

### 2. Stage the pinned runtime and dependencies

Run as your regular existing account:

```sh
sh scripts/stage.sh
```

The script checks ARM64 architecture, verifies the official Node archive against both its pinned SHA-256 and published checksums, and uses the lockfile with npm lifecycle scripts disabled. It omits development and optional packages; the Node adapter is explicit. No compilers or global npm installation are used. A second staging run refuses an existing runtime.

On an isolated Linux test host, run the checks in [Validation](docs/VALIDATION.md) before installing. They do not fetch real weather. Do not run integration or simulated-temperature tests against an installed device controlling equipment.

### 3. Select an existing account and network interface

Inspect available interfaces using existing OS tools, for example `ip -brief address` if `ip` is installed. Replace both selections below with your existing account and intended interface:

```sh
sudo sh scripts/install.sh --user YOUR_EXISTING_USER --interface YOUR_INTERFACE
```

Both arguments are required. The installer validates the account, derives its existing primary group, checks the interface has an address, renders the unit and runs systemd preflight verification using the staged executable before writing installation destinations. It never creates users/groups or changes privileges. It installs and enables the service, initially in **simulated mode at 68°F / 20°C**.

The fresh installer copies application files into `/opt/outdoor-matter-sensor`; it does not copy `.git` or create a Git-managed installation there. Pulling changes in your separate source checkout does not update the installed copy. See [Updates and removal](#updates-and-removal) for the distinction and compatible Git-managed update workflow.

Keep the staging directory until setup is complete. Do not install the placeholder-filled tracked unit directly.

---

## Production Deployment and Weather Credentials

Run these setup steps only for a fresh installation. Do not overwrite existing private files. In the examples, replace `YOUR_SERVICE_GROUP` with the account's existing primary group, obtainable with `id -gn YOUR_EXISTING_USER`.

```sh
sudo install -d -o root -g YOUR_SERVICE_GROUP -m 0750 /etc/outdoor-matter-sensor
sudo install -o root -g YOUR_SERVICE_GROUP -m 0640 \
  examples/weather.example.json /etc/outdoor-matter-sensor/weather.json
sudoedit /etc/outdoor-matter-sensor/weather.json
```

Replace **both zero-valued example coordinates** with your real numeric latitude and longitude. The example is not your location. Do not save your edited file into this repository.

Create an empty root-only credential file without overwriting an existing file, then enter the API key in the editor:

```sh
sudo sh -c 'umask 077; set -C; : > /etc/outdoor-matter-sensor/api-key'
sudoedit /etc/outdoor-matter-sensor/api-key
```

The file contains only the key, optionally ending with a newline. Do not put it in a shell command, screenshot, Git commit or diagnostic paste. Creation as root with this umask gives mode 0600.

Optionally set display names and identifiers **before commissioning**:

```sh
sudo install -o root -g YOUR_SERVICE_GROUP -m 0640 \
  examples/device.env.example /etc/outdoor-matter-sensor/device.env
sudoedit /etc/outdoor-matter-sensor/device.env
```

These metadata settings must match the Developer Console integration where applicable. The following service restart loads the edited file. Keep it outside the source checkout.

Install the project's credential drop-in and restart this project service:

```sh
sudo install -d -m 0755 /etc/systemd/system/outdoor-matter-sensor.service.d
sudo install -m 0644 systemd/weather.conf \
  /etc/systemd/system/outdoor-matter-sensor.service.d/weather.conf
sudo systemctl daemon-reload
sudo systemctl restart outdoor-matter-sensor.service
```

Systemd supplies the key through `LoadCredential`; the service account does not need direct access to the root-only original. The service still remains simulated until you explicitly select weather mode after commissioning.

The service is root-owned, runs under the selected existing account, and uses private state/socket permissions, `NoNewPrivileges`, filesystem protection and existing journald logging. It restarts process failures after 10 seconds and preserves identity, cached weather and request scheduling. Global logging and unrelated services remain untouched.

---

## Google Developer Console and Commissioning

1. Sign in to the [Google Home Developer Console](https://console.home.google.com/) and create a project and **Matter integration** for the sensor. Choose **Sensor** if that is the console's available category. The application advertises the specific Matter Temperature Sensor type.
2. Prefer the **same Google account** used by your Google Home app. A different account can work if the commissioning account receives the appropriate project membership or Field Trial access; a shared network does not grant that permission.
3. Match the application's identifiers: by default **test VID `0xFFF1`**, **PID `0x8000`**. Google documents test VIDs for development; personal experimentation can use this workflow. This does not certify a consumer product or authorize selling devices with test identifiers. [Google's identifier rules](https://developers.home.google.com/matter/get-started)
4. An integration represents a **VID/PID combination**, not every individual physical copy. Identical sensors can share that integration while each retains its own unique state/pairing. A different custom product needs its matching integration. Do not duplicate an integration for a combination already registered in your project.
5. Optional branding can be skipped. Keep the hub and commissioning phone on the appropriate local network and use the account with project access.
6. As the service account, obtain the device-generated QR/manual code:

   ```sh
   /opt/outdoor-matter-sensor/bin/sensorctl pairing
   ```

7. In Google Home, add a Matter-enabled device, scan the displayed QR code or enter the manual code, and follow the prompts. For this development device, an uncertified-device prompt may appear. Protect onboarding codes as credentials. [Google pairing documentation](https://developers.home.google.com/matter/integration/pair)
8. Verify the initial **68°F / 20°C** simulated reading. Before equipment-controlling automations are enabled, controlled simulated changes can verify reporting. An uncommissioned service restart can reopen its initial commissioning window; do not reset/delete state on a paired device to obtain a new code.
9. Explicitly enable real weather reporting:

   ```sh
   /opt/outdoor-matter-sensor/bin/sensorctl mode weather
   /opt/outdoor-matter-sensor/bin/sensorctl status
   ```

The first fetch occurs when the persisted schedule permits. A fresh installation will be due immediately. A new weather-mode startup publishes a fresh cache or null, never an old simulated reading. Verify a successful fetch and Google Home's displayed temperature before relying on automations.

This repository supports one service/device per host by default; multiple-instance service management is not implemented. The hub requirement described here is specific to using this application with Google Home, not a claim that every Matter ecosystem requires a separate Nest device.

---

## Operation

Run the CLI as the selected service account (or using your existing administrative access).

If you are logged in as a different account, prefix CLI commands with `sudo -u YOUR_EXISTING_USER`, using the account selected during installation. The private socket is intentionally inaccessible to unrelated users.

```sh
/opt/outdoor-matter-sensor/bin/sensorctl status
/opt/outdoor-matter-sensor/bin/sensorctl mode weather
```

Status includes mode, published temperature, last attempt/success, provider timestamp, age, stale state, sanitized errors, next attempt and rolling request count. It excludes the key and location. This is a Unix-socket interface, not an HTTP API.

For deliberate simulated tests only:

```sh
/opt/outdoor-matter-sensor/bin/sensorctl mode simulated
/opt/outdoor-matter-sensor/bin/sensorctl set-f 77
/opt/outdoor-matter-sensor/bin/sensorctl unavailable
/opt/outdoor-matter-sensor/bin/sensorctl mode weather
```

Simulated mode pauses new fetching and persists across restarts. Manual commands are rejected in weather mode. **Simulated readings can trigger real household actions**; isolate or disable equipment-controlling automations before testing. Mode changes can also publish a different value immediately.

Readings use Matter's hundredths of a degree Celsius internally. Fahrenheit conversions can land slightly above/below nominal boundaries; do not infer exact comparisons from a rounded display. Use your Google Home temperature-unit preferences for Fahrenheit display.

### Freshness and requests

The provider endpoint is `/data/4.0/onecall/current` with metric units; the application validates `data[0].temp`, location and timestamps. It uses a 10-second timeout, rejects redirects/oversized responses, and permits one request at a time. A success schedules the next fetch 15 minutes later.

Transient failures retry after one minute, five minutes, then every 15 minutes. Authentication/configuration errors pause fetching until corrected and restarted. HTTP 429 delays at least one hour or longer when instructed. Attempts are durably saved before sending; if accounting cannot be persisted, fetching blocks. Restarting respects the saved schedule and rate-limit delays.

A sample becomes unavailable when either its provider timestamp or successful-fetch time is 30 minutes old. Expiry is checked independently of retries. Google Home's handling of null/recovery requires observation; null does not guarantee a particular automation action or change an existing thermostat setpoint.

### Service commands

```sh
systemctl status outdoor-matter-sensor.service --no-pager
systemctl is-enabled outdoor-matter-sensor.service
journalctl -u outdoor-matter-sensor.service -b --no-pager -n 50
sudo systemctl restart outdoor-matter-sensor.service
sudo systemctl stop outdoor-matter-sensor.service
sudo systemctl start outdoor-matter-sensor.service
```

### Automation example

[The example YAML](examples/temperature-notification.yaml) sends a notification when a fictional sensor enters a temperature range. Select your own device and household member using Script Editor autocomplete, Validate, then save. Numeric temperature comparisons use `40F`, while descriptive text can use `40°F`.

Range-entry starters react to transitions, rather than every weather fetch. Initial activation, reconnect and unavailable recovery need testing. Child-rule names do not guarantee distinct Activity titles; separate scripts with descriptive top-level metadata names can make history clearer. No household thermostat thresholds or equipment commands are included in the example.

For the complete six-band layout, see [the automation templates](automations/README.md). They include a combined notification-only reference and six separate routines that set thermostat mode/temperature and notify. All device and recipient selections are fictional placeholders; replace them using Script Editor autocomplete and validate each routine before use. The example targets are configurable preferences. The separate routines can operate real HVAC equipment once configured and enabled.

### Updates and removal

Do not run the fresh installer over an existing deployment. An automated update/rollback procedure is not provided. Converting an existing file-based installation into a Git checkout requires a separate, backed-up migration; `git pull` cannot perform that conversion.

For an installation already running from a **root-owned Git checkout** of this repository on `main`, ordinary code-only updates can use the following commands after reviewing the incoming changes and confirming a clean working tree:

```sh
sudo git -C /opt/outdoor-matter-sensor status --short
sudo git -C /opt/outdoor-matter-sensor fetch origin main
sudo git -C /opt/outdoor-matter-sensor diff HEAD..origin/main -- package.json package-lock.json systemd/ src/state.mjs src/weather.mjs
```

Review the complete incoming change as well, especially any changes to persistent data formats or update instructions. If a manifest changes, stop and check whether dependency or runtime work is required. For a reviewed code-only change with compatible persisted state:

```sh
sudo git -C /opt/outdoor-matter-sensor pull --ff-only origin main
sudo systemctl restart outdoor-matter-sensor.service
/opt/outdoor-matter-sensor/bin/sensorctl status
```

Stop if Git reports local changes, a divergent branch, or an error. Do not force-reset or clean the installation to bypass those checks. Fast-forward-only pulling prevents an automatic merge; it does not validate application compatibility. The restart briefly interrupts reporting. A post-update status should show the expected mode, commissioned/online state, freshness and schedule; also check service health and the next normal weather fetch.

Pull-and-restart is sufficient only when the installed dependencies/runtime, service configuration and persisted data remain compatible. Dependency changes require a separately reviewed lockfile-based installation; runtime changes require a verified runtime update. Tracked systemd templates are not automatically installed into `/etc`, and data migrations need explicit recovery instructions. The staging script refuses an existing runtime and is not an updater.

Keep real configuration and pairing data outside the checkout. The bundled `runtime/` and `node_modules/` remain ignored, root-owned local files; future source commits must not track them. Do not configure GitHub credentials on the Pi for public HTTPS pulls, or change global Git settings to work around ownership checks. Use `sudo git` for a root-owned installation.

Back up before applying new code and retain the previous commit for recovery. Routine code rollback must preserve the current live Matter and weather state; never replace it with an old state backup without a separate recovery investigation.

To disable startup and remove service registration while retaining application, configuration and pairing data:

```sh
sudo systemctl disable --now outdoor-matter-sensor.service
sudo rm -- /etc/systemd/system/outdoor-matter-sensor.service
sudo rm -f -- /etc/systemd/system/outdoor-matter-sensor.service.d/weather.conf
sudo systemctl daemon-reload
```

Review and remove any separately created project drop-ins when fully unregistering the service. Deleting `/var/lib/outdoor-matter-sensor` or removing the device from Google Home is a separate destructive action and is not necessary merely to stop the service. Store protected backups outside Git.

---

## Troubleshooting

| Symptom | Checks |
|---|---|
| Cannot discover/pair | Supported hub, correct Google account/project access, matching VID/PID, commissioning window, LAN IPv6/mDNS and selected interface |
| Service does not start | Journal, existing account/interface, bundled runtime, port availability and private state/configuration permissions |
| Fetching paused | Sanitized status error, correct One Call subscription, credential file and drop-in; correct configuration then restart |
| Reading unavailable | Provider/success age, internet access, authentication, quota and saved retry delay |
| CLI permission error | Run as the selected service account; do not make the socket/state world-accessible |
| Installer refuses existing paths | Preserve the deployment; the fresh installer intentionally does not overwrite it |
| Weather tests fail on Windows | Linux directory syncing is intentional; see validation limitations rather than weakening durable accounting |

Do not erase identity, disable safety checks, expose the control socket or change unrelated host settings to troubleshoot. This sensor reports provider data for coordinates; it is not a physical thermometer at your house. Alerts, local history, manual refresh and additional endpoints are not implemented.

---

## Contributing

Open an issue or pull request with reproducible behavior and sanitized diagnostics. Contributions must be compatible with the project's CC BY-NC-SA 4.0 license and retained upstream licenses. Keep weather tests mocked and production credentials/state out of fixtures. Disclose which platform and checks actually ran; do not equate mocked tests with live commissioning or HVAC validation.

## License

Original contributions are licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)**. You may share and adapt them with attribution for noncommercial purposes; shared adaptations must use the same license. See [LICENSE](LICENSE) for the full terms and [NOTICE.md](NOTICE.md) for adapted Matter.js code and separately licensed dependencies. Third-party material retains its own license; the root license does not remove its existing permissions or obligations.

## Security

Never commit real API keys, addresses/coordinates, SSH credentials, onboarding QR codes or Matter pairing state. Keep the API key root-only and use systemd credentials. `.gitignore` is a safeguard, not a substitute for reviewing files before publishing. Share diagnostics only after checking them for private values; report security issues privately rather than posting credentials in an issue.

Git commit author names and email addresses are also public metadata when commits are published. Choose the public identity you intend to expose before committing; excluding a value from source files does not remove it from existing commit metadata or history.

## Contact

For questions and non-sensitive bug reports, open an [Issue on GitHub](https://github.com/eanprice1/MatterWeatherSensor/issues).
