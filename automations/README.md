# Google Home temperature-band automations

These Google Home Script Editor templates use fictional device and household-member selections. Replace the placeholders using the editor's autocomplete, then **Validate** before saving or activating a routine. Copying these files into the repository does not install them in Google Home.

| Placeholder | Replace with |
|---|---|
| `Outdoor Temperature Sensor - Example Room` | Your paired sensor's exact device and room selection |
| `Example Thermostat - Example Room` | Your thermostat's exact device and room selection |
| `example-member@example.invalid` | A household notification recipient selected using autocomplete |

## Choose a routine layout

- [Combined notification reference](outdoor-temperature-notify.yaml): one script with six starter/action pairs. It sends notifications describing the planned thermostat settings and does not issue thermostat commands.
- [Six separate thermostat routines](notification-bands/README.md): one script per band. Each sets thermostat mode, sets the target temperature, then sends a notification. Separate top-level names identify each band in routine history.
- [Simple notification-only example](../examples/temperature-notification.yaml): a single below-40°F notification for an initial reporting check.

Enable one chosen layout, keeping duplicate notification routines disabled. The combined file's internal rule names do not guarantee separate Activity titles. Pressing Run/Play on the combined script can execute all of its notification actions; automatic range-entry behavior follows the starters.

## Example bands and actions

| Outdoor range | Thermostat action in the separate routines |
|---|---|
| Below 20°F | Heat at 72°F |
| 20°F to below 40°F | Heat at 71°F |
| 40°F to below 60°F | Heat at 70°F |
| 60°F to below 70°F | Cool at 70°F |
| 70°F to below 80°F | Cool at 69°F |
| 80°F and above | Cool at 68°F |

These are configurable example preferences, not universal comfort or efficiency recommendations. Lower bounds are inclusive and upper bounds exclusive. The 60°F-to-below-70°F band intentionally selects cooling. Descriptive text uses degree symbols; Script Editor numeric values retain syntax such as `70F`.

Only the outdoor sensor determines the band. These templates have no indoor-temperature conditions, schedules or continuously enforced thermostat targets. Thermostat schedules and manual changes can supersede a setting until another band-entry event. Reported measurements can differ from rounded displays; validate boundary behavior with your own devices.

The separate routines issue real thermostat commands once configured and enabled, including changing a thermostat from Off to Heat or Cool. Their notifications describe the requested rule, not independently verified equipment state. Keep equipment-controlling routines disabled while performing sensor-only tests. Null/recovery and reconnect behavior require observation in your own home.
