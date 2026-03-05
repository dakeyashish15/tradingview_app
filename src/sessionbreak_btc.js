// sessionBreaks.js
export function initSessionBreaks({ container, chart, series, dataRef }) {
  if (!container || !chart || !series) return;

  // --- create overlay canvas ---
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = 1; // above chart background, below crosshair
  container.appendChild(canvas);

  const estimateCandleWidth = () => {
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return 2;
    const bars = range.to - range.from;
    if (bars <= 0) return 2;
    return container.clientWidth / bars;
  };

  const draw = () => {
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + "px";
    canvas.style.height = container.clientHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);

    const timeScale = chart.timeScale();
    const chartHeight = container.clientHeight;
    const candleWidth = Math.max(1, Math.floor(estimateCandleWidth() / 2)); // half thickness

    (dataRef.current || []).forEach(candle => {
      try {
        const t = new Date(candle.time * 1000); // epoch seconds
        const day = t.getUTCDate();
        const hh = t.getUTCHours();
        const mm = t.getUTCMinutes();

      
      
      // Match 21:00 exactly
      //   if (hh === 21 && mm === 0) {
      //     const x = timeScale.timeToCoordinate(candle.time);
      //     if (!isFinite(x)) return;

      //     ctx.fillStyle = "rgba(219,219,219,0.2)"; // grey with opacity 0.5
      //     ctx.fillRect(x - candleWidth / 3, 0, candleWidth, chartHeight);
      //   }

      
      
      // Match first candle of every month (00:00 on date 1)
      if (day === 1 && hh === 0 && mm === 0) {
        const x = timeScale.timeToCoordinate(candle.time);
        if (!isFinite(x)) return;

        ctx.fillStyle = "rgba(219,219,219,0.2)";
        ctx.fillRect(x - candleWidth / 3, 0, candleWidth, chartHeight);
      }


    } catch {}
    }); 
  };

  // --- re-draw on chart events ---
  chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
  chart.timeScale().subscribeVisibleTimeRangeChange(draw);
  window.addEventListener("resize", draw);

  draw(); // initial draw

  return {
    redraw: draw,
    destroy: () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(draw);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
      window.removeEventListener("resize", draw);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

