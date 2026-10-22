# Separate temperature-band thermostat routines

Create one Google Home Script Editor automation per YAML file. Each routine has a descriptive top-level `metadata.name`, sets the thermostat mode, sets its temperature target, then sends the band notification. Notifications describe the requested setting; they do not confirm that equipment reached that state.

| File | Routine name |
|---|---|
| [80f-and-above.yaml](80f-and-above.yaml) | Outdoor 80°F and above - target Cool 68°F |
| [70f-to-below-80f.yaml](70f-to-below-80f.yaml) | Outdoor 70°F to below 80°F - target Cool 69°F |
| [60f-to-below-70f.yaml](60f-to-below-70f.yaml) | Outdoor 60°F to below 70°F - target Cool 70°F |
| [40f-to-below-60f.yaml](40f-to-below-60f.yaml) | Outdoor 40°F to below 60°F - target Heat 70°F |
| [20f-to-below-40f.yaml](20f-to-below-40f.yaml) | Outdoor 20°F to below 40°F - target Heat 71°F |
| [below-20f.yaml](below-20f.yaml) | Outdoor below 20°F - target Heat 72°F |

1. Replace `Outdoor Temperature Sensor - Example Room`, `Example Thermostat - Example Room`, and `example-member@example.invalid` using your account's device/member autocomplete. See the [placeholder guide](../README.md).
2. Disable the combined notification routine and duplicate band routines before activating these six scripts.
3. Paste each complete YAML file into its own Script Editor entry. Validate that your thermostat supports `ThermostatSetMode`, `ThermostatTemperatureSetpoint` and the selected mode values, then save each entry. Do not combine the six files into one script.
4. Review the example temperature preferences for your home and enable the desired routines. Confirm normal range-entry behavior and check the descriptive top-level names in Activity.

The lower bounds are inclusive and upper bounds exclusive, so the bands cover the reported outdoor range without overlap. The 60°F-to-below-70°F rule intentionally uses cooling at 70°F. There are no indoor-temperature conditions or scheduled starters. Activity names describe the band and target; they do not include a dynamically inserted measured temperature.

Actions run on band entry rather than continuously enforcing settings or reconciling an already-active band. Schedules and manual changes can override the target afterward. These routines can change a thermostat from Off to Heat or Cool, and pressing Run/Play can issue real thermostat commands. Use the notification-only examples for reporting checks before enabling equipment control.

The [combined reference](../outdoor-temperature-notify.yaml) remains notification-only. No file here publishes itself to Google Home or modifies the Pi.
