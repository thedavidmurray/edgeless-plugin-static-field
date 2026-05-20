# Static Field

A dense pixel-grid plug-in for [Edgeless OTel Command](https://github.com/thedavidmurray/edgeless-otel-command). Every span becomes one cell — color by service, brightness by duration, red flash for errors. Hover for span detail, click to drill into the trace.

Pairs especially well with the **Outrun** theme. With ~500+ spans on screen you get the synth-wave circuit-board density.

## Install

In the Edgeless OTel Command app: open **Settings → Browse community plug-ins**, find _Static Field_, click **Install**, then reload (Cmd+R).

Or install manually:

```bash
cd ~/Library/Application\ Support/edgeless-otel-command/plugins/
git clone https://github.com/thedavidmurray/edgeless-plugin-static-field.git edgeless.plugin.static-field
```

Then reload the app.

## How to read it

| Channel | Meaning |
|---------|---------|
| Hue | Service name (stable hash → consistent color across reloads) |
| Brightness | Duration (log-scaled; 1ms → dim, 10s → bright) |
| Red | Span has `error=true` tag |
| Hover | Tooltip with `service · operation · duration` |
| Click | Navigate to the trace's detail view |

Spans are laid out left-to-right, top-to-bottom, sorted by start time. Up to 4000 spans are rendered before the oldest get evicted to keep the renderer responsive.

## What this exists to prove

This is the second plug-in in the community registry — its main job is to validate the plug-in API surface with something visual and interactive. It uses:

- `edgeless.panels.register(id, { render, destroy })`
- `edgeless.router.navigate('#/trace/<id>')`
- `edgeless.lib.fmtDur`, `edgeless.lib.tagsToObj`
- `edgeless.app.log`
- The `ctx.traces` data + `processes[].serviceName` resolution
- Canvas 2D rendering inside the panel container
- Mouse hover + click against canvas coordinates
- Host CSS variables (`--bg`, `--text-bright`, `--text-dim`, `--grid`, `--bg-panel`) so it inherits the active theme

Fork this if you want a starting point for a high-density visual panel.

## License

MIT — see `LICENSE`.
