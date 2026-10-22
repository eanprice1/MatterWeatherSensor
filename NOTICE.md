# Attribution and third-party licensing

Original MatterWeatherSensor contributions are provided by eanprice1 under CC BY-NC-SA 4.0. See the root LICENSE. The project is noncommercial, source-available software. That license does not replace licenses applying to upstream material or dependencies.

The device structure adapts the Matter.js v0.17.9 temperature sensor example:
https://github.com/matter-js/matter.js/blob/v0.17.9/examples/device-sensor/src/SensorDeviceNode.ts

Copyright 2022–2026 Matter.js Authors. The adapted upstream material remains under Apache-2.0; the full license is included in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt). The sensor implementation has been modified for weather polling, a local control socket and configurable metadata.

Dependency license notices remain in their installed package directories. This is an uncertified development device, not a certified Matter product.

The pinned Matter.js packages use Apache-2.0. The pinned noble packages use MIT. Node.js and its bundled npm include their own license/third-party notices in the downloaded runtime. Runtime archives and node_modules are not redistributed in this source repository; retain their notices when deploying or redistributing installed bundles. The dependency lockfile identifies the exact packages and versions.
