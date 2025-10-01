// src/utils/DottedLineDrawer.js

// Draw dashed/dotted line on any ctx (does NOT clear canvas)
export const drawDashedLineOnCtx = (ctx, chartInst, seriesInst, start, end, opts = {}) => {
  try {
    if (!ctx || !chartInst || !seriesInst || !start || !end) return;
    const { color = "rgba(200,0,0,0.7)", width = 1, dash = [5, 5] } = opts;

    const x1 = chartInst.timeScale().timeToCoordinate(start.time);
    const x2 = chartInst.timeScale().timeToCoordinate(end.time);
    const y1 = seriesInst.priceToCoordinate(start.price);
    const y2 = seriesInst.priceToCoordinate(end.price);

    if (![x1, x2, y1, y2].every((v) => isFinite(v))) return;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } catch {}
};

// Draw preview dashed line (clears + resizes canvas each call)
export const drawDottedPreview = ({ canvas, container, chartInst, seriesInst, start, end, opts = {} }) => {
  try {
    if (!canvas || !container || !chartInst || !seriesInst || !start || !end) return;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    canvas.width = Math.floor(w * devicePixelRatio);
    canvas.height = Math.floor(h * devicePixelRatio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawDashedLineOnCtx(ctx, chartInst, seriesInst, start, end, opts);
  } catch {}
};
