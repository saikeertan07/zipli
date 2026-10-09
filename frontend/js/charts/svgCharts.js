/**
 * ZIPLI PRO — Pure SVG & Canvas Charting Engine
 *
 * Zero external libraries (no Chart.js, D3, or CanvasJS).
 * Hand-drawn SVG & Canvas visualizations for:
 * 1. Line Chart with Confidence Bands (Sales, Demand Forecast vs Actual)
 * 2. Bar Chart (Category Sales & Reorder levels)
 * 3. Donut Chart (Order & Inventory Segmentation)
 * 4. Interactive Route Map (Depot, Delivery Target, Shortest Path & Rider)
 */

/**
 * Renders a responsive SVG Line Chart with optional confidence bands.
 *
 * @param {Element|string} container - Element or selector
 * @param {Object} options
 * @param {string[]} options.labels - X-axis labels
 * @param {Array<{ name: string, data: number[], color: string, dashed?: boolean }>} options.series
 * @param {Array<{ lower: number[], upper: number[], color?: string }>} [options.confidenceBand]
 * @param {number} [options.height=260]
 */
export function renderLineChart(container, { labels = [], series = [], confidenceBand = null, height = 260 }) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;

  const width = el.clientWidth || 600;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Compute scale boundaries
  let allVals = [];
  series.forEach((s) => allVals.push(...s.data));
  if (confidenceBand) {
    allVals.push(...confidenceBand.lower, ...confidenceBand.upper);
  }
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(10, ...allVals) * 1.1;

  const getX = (index) => padding.left + (index / Math.max(1, labels.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

  // Gridlines & Y-ticks
  const yTicks = 4;
  let gridSvg = '';
  for (let i = 0; i <= yTicks; i++) {
    const yVal = minVal + (i / yTicks) * (maxVal - minVal);
    const yPos = getY(yVal);
    gridSvg += `
      <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="var(--border-subtle)" stroke-dasharray="3,3" />
      <text x="${padding.left - 8}" y="${yPos + 4}" font-size="11" fill="var(--text-muted)" text-anchor="end" font-family="var(--font-sans)">${Math.round(yVal)}</text>
    `;
  }

  // X-ticks
  let xTicksSvg = '';
  const xStep = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % xStep === 0 || i === labels.length - 1) {
      const xPos = getX(i);
      xTicksSvg += `
        <text x="${xPos}" y="${height - 12}" font-size="11" fill="var(--text-muted)" text-anchor="middle" font-family="var(--font-sans)">${label}</text>
      `;
    }
  });

  // Confidence band
  let bandSvg = '';
  if (confidenceBand && confidenceBand.lower && confidenceBand.upper) {
    const ptsUpper = confidenceBand.upper.map((v, i) => `${getX(i)},${getY(v)}`);
    const ptsLower = confidenceBand.lower.map((v, i) => `${getX(i)},${getY(v)}`).reverse();
    const bandPath = `M ${ptsUpper.join(' L ')} L ${ptsLower.join(' L ')} Z`;
    const bandColor = confidenceBand.color || 'rgba(12, 131, 31, 0.12)';
    bandSvg = `<path d="${bandPath}" fill="${bandColor}" />`;
  }

  // Line paths
  let linesSvg = '';
  series.forEach((s) => {
    const pts = s.data.map((val, i) => `${getX(i)},${getY(val)}`);
    const pathD = `M ${pts.join(' L ')}`;
    const dash = s.dashed ? 'stroke-dasharray="4,4"' : '';
    linesSvg += `
      <path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="2.5" ${dash} stroke-linecap="round" stroke-linejoin="round" />
    `;
    // Dots
    s.data.forEach((val, i) => {
      linesSvg += `
        <circle cx="${getX(i)}" cy="${getY(val)}" r="3.5" fill="${s.color}" stroke="var(--surface-card)" stroke-width="1.5" />
      `;
    });
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;overflow:visible;">
      ${gridSvg}
      ${xTicksSvg}
      ${bandSvg}
      ${linesSvg}
    </svg>
  `;
}

/**
 * Renders a responsive SVG Bar Chart.
 */
export function renderBarChart(container, { labels = [], values = [], height = 220, barColor = 'var(--color-brand)' }) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;

  const width = el.clientWidth || 500;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...values) * 1.15;
  const barWidth = Math.max(12, Math.min(36, (chartW / labels.length) * 0.65));

  let barsSvg = '';
  values.forEach((val, i) => {
    const barH = (val / maxVal) * chartH;
    const x = padding.left + (i + 0.5) * (chartW / labels.length) - barWidth / 2;
    const y = padding.top + chartH - barH;

    barsSvg += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${barColor}" />
      <text x="${x + barWidth / 2}" y="${y - 6}" font-size="10" font-weight="600" fill="var(--text-primary)" text-anchor="middle" font-family="var(--font-sans)">${val}</text>
      <text x="${x + barWidth / 2}" y="${height - 14}" font-size="11" fill="var(--text-muted)" text-anchor="middle" font-family="var(--font-sans)">${labels[i] || ''}</text>
    `;
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;">
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="var(--border-subtle)" />
      ${barsSvg}
    </svg>
  `;
}

/**
 * Renders an animated delivery route map on HTML5 Canvas.
 */
export function renderRouteMap(canvas, { depot, target, rider, path = [] }) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Background map grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const gridSize = 30;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw Path (Route)
  if (path.length > 1) {
    ctx.strokeStyle = '#0c831f';
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw Depot (Dark Store)
  if (depot) {
    ctx.fillStyle = '#0c831f';
    ctx.beginPath();
    ctx.arc(depot.x, depot.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter';
    ctx.fillText('⚡', depot.x - 5, depot.y + 4);
    ctx.fillStyle = '#1e293b';
    ctx.font = '11px Inter';
    ctx.fillText('Dark Store Hub', depot.x + 14, depot.y + 4);
  }

  // Draw Customer Target
  if (target) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter';
    ctx.fillText('🏠', target.x - 6, target.y + 4);
    ctx.fillStyle = '#1e293b';
    ctx.font = '11px Inter';
    ctx.fillText('Your Location', target.x + 14, target.y + 4);
  }

  // Draw Live Rider Dot
  if (rider) {
    // Pulse ring
    ctx.fillStyle = 'rgba(248, 192, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(rider.x, rider.y, 18, 0, Math.PI * 2);
    ctx.fill();

    // Rider icon dot
    ctx.fillStyle = '#f8c000';
    ctx.beginPath();
    ctx.arc(rider.x, rider.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 11px Inter';
    ctx.fillText('🛵', rider.x - 7, rider.y + 4);
  }
}
