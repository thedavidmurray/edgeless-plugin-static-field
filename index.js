/**
 * Edgeless OTel Command — Static Field plug-in
 *
 * A dense pixel-grid visualization. Every cell is one span.
 *   - Hue:        hash of the span's service name (stable across runs)
 *   - Brightness: clamped log of duration (longer = brighter)
 *   - Pulse:      cell flashes red if the span has an error tag
 *   - Click:      navigates to the trace detail view
 *
 * Pairs especially well with the Outrun theme. With ~500+ spans on
 * screen, you get that circuit-board density from the reference.
 *
 * @example  drop into ~/Library/Application Support/edgeless-otel-command/plugins/edgeless.plugin.static-field/
 */

const STYLE_ID = 'edgeless-plugin-static-field-styles';
const CELL_PX = 6;          // pixel cell size; tighter = denser
const GAP_PX = 0;           // 0 for the truly circuit-board look
const MAX_SPANS = 4000;     // safety cap; renderer won't choke

function injectStyles(edgeless) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sf-wrap {
      display: flex; flex-direction: column; height: 100%;
      gap: 6px;
    }
    .sf-head {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 9px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--text-dim, #888);
    }
    .sf-head .sf-stat { color: var(--text-bright, #fff); }
    .sf-canvas-wrap {
      flex: 1; min-height: 120px; position: relative;
      border: 1px solid var(--grid, #333);
      background: var(--bg, #000);
      overflow: hidden;
      cursor: crosshair;
    }
    .sf-canvas { display: block; image-rendering: pixelated; }
    .sf-tooltip {
      position: absolute; pointer-events: none;
      padding: 4px 8px; font-size: 10px;
      background: var(--bg-panel, #111); color: var(--text-bright, #fff);
      border: 1px solid var(--text-dim, #444);
      transform: translate(8px, -100%);
      z-index: 5; opacity: 0; transition: opacity 0.1s;
      white-space: nowrap;
    }
    .sf-tooltip.show { opacity: 1; }
    .sf-legend {
      display: flex; gap: 10px; flex-wrap: wrap;
      font-size: 9px; color: var(--text-med, #999);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .sf-legend-swatch {
      display: inline-block; width: 10px; height: 10px;
      vertical-align: middle; margin-right: 4px;
      border: 1px solid var(--text-dim, #444);
    }
  `;
  document.head.appendChild(style);
}

// Stable per-service hue (0-360) without using lib.hashColor — we want raw H
function serviceHue(svc) {
  let h = 0;
  const s = svc || 'unknown';
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h % 360);
}

// log10-clamped brightness: 0.25 -> 1.0
function durBrightness(us) {
  if (!us || us < 1) return 0.25;
  // 1ms ~ 0.4, 10ms ~ 0.55, 100ms ~ 0.7, 1s ~ 0.85, 10s+ ~ 1.0
  const l = Math.log10(us);
  return Math.max(0.25, Math.min(1.0, 0.2 + l * 0.16));
}

function isError(span, ctx) {
  const tags = ctx.lib.tagsToObj(span.tags || []);
  return tags.error === true || tags.error === 'true';
}

// Flatten ctx.traces -> [{ span, service, trace }] sorted by start time
function buildPoints(ctx) {
  const points = [];
  for (const trace of ctx.traces || []) {
    const procs = trace.processes || {};
    for (const s of trace.spans || []) {
      const proc = procs[s.processID] || {};
      points.push({
        traceID: trace.traceID,
        spanID: s.spanID,
        op: s.operationName || '?',
        service: proc.serviceName || 'unknown',
        duration: s.duration || 0,
        startTime: s.startTime || 0,
        error: isError(s, ctx),
      });
    }
  }
  points.sort((a, b) => a.startTime - b.startTime);
  if (points.length > MAX_SPANS) points.splice(0, points.length - MAX_SPANS);
  return points;
}

function draw(canvas, points, dims, hover) {
  const ctx = canvas.getContext('2d');
  const { cols, rows, cell } = dims;
  const w = cols * cell;
  const h = rows * cell;
  canvas.width = w;
  canvas.height = h;
  // Clear to panel bg so transparent cells blend
  ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--bg').trim() || '#000';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (row >= rows) break;
    const x = col * cell;
    const y = row * cell;

    if (p.error) {
      // Red error pixel that pops against everything
      ctx.fillStyle = '#ff2a4a';
    } else {
      const hue = serviceHue(p.service);
      const lum = durBrightness(p.duration) * 60; // 0-60% luminance
      ctx.fillStyle = `hsl(${hue}, 75%, ${lum.toFixed(0)}%)`;
    }
    ctx.fillRect(x, y, cell - GAP_PX, cell - GAP_PX);

    // Hover highlight
    if (hover && hover.index === i) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - GAP_PX - 1, cell - GAP_PX - 1);
    }
  }
}

export default function activate(edgeless) {
  injectStyles(edgeless);
  edgeless.app.log('static-field activated');

  let state = {
    points: [],
    dims: { cols: 1, rows: 1, cell: CELL_PX },
    hover: null,
  };

  edgeless.panels.register('edgeless.plugin.static-field.grid', {
    label: 'Static Field',
    render(container, ctx) {
      // Build / reuse skeleton once per render
      let wrap = container.querySelector('.sf-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'sf-wrap';
        wrap.innerHTML = `
          <div class="sf-head">
            <span class="sf-stat" id="sf-count">0 spans</span>
            <span>service = hue · duration = brightness · error = red</span>
          </div>
          <div class="sf-canvas-wrap">
            <canvas class="sf-canvas"></canvas>
            <div class="sf-tooltip" id="sf-tooltip"></div>
          </div>
          <div class="sf-legend" id="sf-legend"></div>
        `;
        container.appendChild(wrap);
      }

      const points = buildPoints(ctx);
      state.points = points;

      const canvasWrap = wrap.querySelector('.sf-canvas-wrap');
      const canvas = wrap.querySelector('canvas');
      const tooltip = wrap.querySelector('#sf-tooltip');
      const countEl = wrap.querySelector('#sf-count');
      const legend = wrap.querySelector('#sf-legend');

      countEl.textContent = `${points.length} spans · ${ctx.services.length} services`;

      // Compute grid dims from container size
      const rect = canvasWrap.getBoundingClientRect();
      const cell = CELL_PX;
      const cols = Math.max(1, Math.floor(rect.width / cell));
      const rows = Math.max(1, Math.floor(rect.height / cell));
      state.dims = { cols, rows, cell };
      canvas.style.width = (cols * cell) + 'px';
      canvas.style.height = (rows * cell) + 'px';

      draw(canvas, points, state.dims, state.hover);

      // Render legend (top services)
      const seen = {};
      for (const p of points) seen[p.service] = (seen[p.service] || 0) + 1;
      const topSvcs = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 8);
      legend.innerHTML = topSvcs.map(([svc, n]) => {
        const hue = serviceHue(svc);
        return `<span><span class="sf-legend-swatch" style="background:hsl(${hue},75%,55%)"></span>${svc} <span style="color:var(--text-dim)">(${n})</span></span>`;
      }).join('');

      // Hover + click handlers (wire once)
      if (!canvas.dataset.wired) {
        canvas.dataset.wired = '1';
        canvas.addEventListener('mousemove', (e) => {
          const r = canvas.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          const col = Math.floor(x / state.dims.cell);
          const row = Math.floor(y / state.dims.cell);
          const index = row * state.dims.cols + col;
          if (index < 0 || index >= state.points.length) {
            state.hover = null;
            tooltip.classList.remove('show');
            draw(canvas, state.points, state.dims, null);
            return;
          }
          state.hover = { index };
          const p = state.points[index];
          tooltip.textContent = `${p.service} · ${p.op} · ${ctx.lib.fmtDur(p.duration)}${p.error ? ' · ERROR' : ''}`;
          tooltip.style.left = x + 'px';
          tooltip.style.top = y + 'px';
          tooltip.classList.add('show');
          draw(canvas, state.points, state.dims, state.hover);
        });
        canvas.addEventListener('mouseleave', () => {
          state.hover = null;
          tooltip.classList.remove('show');
          draw(canvas, state.points, state.dims, null);
        });
        canvas.addEventListener('click', (e) => {
          const r = canvas.getBoundingClientRect();
          const col = Math.floor((e.clientX - r.left) / state.dims.cell);
          const row = Math.floor((e.clientY - r.top) / state.dims.cell);
          const index = row * state.dims.cols + col;
          if (index < 0 || index >= state.points.length) return;
          const p = state.points[index];
          edgeless.router.navigate(`#/trace/${p.traceID}`);
        });
      }
    },
    destroy() {
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
    },
  });
}
