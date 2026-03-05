// // sessionBreaks.js
// export function initSessionBreaks({ container, chart, series, dataRef }) {
//   if (!container || !chart || !series) return;

//   // --- create overlay canvas ---
//   const canvas = document.createElement("canvas");
//   canvas.style.position = "absolute";
//   canvas.style.left = "0";
//   canvas.style.top = "0";
//   canvas.style.pointerEvents = "none";
//   canvas.style.zIndex = 1; // above chart background, below crosshair
//   container.appendChild(canvas);

//   const estimateCandleWidth = () => {
//     const range = chart.timeScale().getVisibleLogicalRange();
//     if (!range) return 2;
//     const bars = range.to - range.from;
//     if (bars <= 0) return 2;
//     return container.clientWidth / bars;
//   };

//   const draw = () => {
//     if (!canvas || !container) return;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     const dpr = window.devicePixelRatio || 1;
//     canvas.width = container.clientWidth * dpr;
//     canvas.height = container.clientHeight * dpr;
//     canvas.style.width = container.clientWidth + "px";
//     canvas.style.height = container.clientHeight + "px";
//     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

//     ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);

//     const timeScale = chart.timeScale();
//     const chartHeight = container.clientHeight;
//     const candleWidth = Math.max(1, Math.floor(estimateCandleWidth() / 2)); // half thickness

//     (dataRef.current || []).forEach(candle => {
//       try {
//         const t = new Date(candle.time * 1000); // epoch seconds
//         const hh = t.getUTCHours();
//         const mm = t.getUTCMinutes();

//         // Match 21:00 exactly
//         if (hh === 21 && mm === 0) {
//           const x = timeScale.timeToCoordinate(candle.time);
//           if (!isFinite(x)) return;

//           ctx.fillStyle = "rgba(219,219,219,0.2)"; // grey with opacity 0.5
//           ctx.fillRect(x - candleWidth / 3, 0, candleWidth, chartHeight);
//         }
//       } catch {}
//     }); 
//   };

//   // --- re-draw on chart events ---
//   chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
//   chart.timeScale().subscribeVisibleTimeRangeChange(draw);
//   window.addEventListener("resize", draw);

//   draw(); // initial draw

//   return {
//     redraw: draw,
//     destroy: () => {
//       chart.timeScale().unsubscribeVisibleLogicalRangeChange(draw);
//       chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
//       window.removeEventListener("resize", draw);
//       if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
//     },
//   };
// }



// model 2 for gold


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

    const raw = Array.isArray(dataRef.current) ? dataRef.current : [];
    if (!raw.length) return;

    // Work on a sorted copy (ascending by epoch seconds)
    const candles = raw.slice().sort((a, b) => a.time - b.time);

    // Helper: UTC midnight for a timestamp
    const utcMidnight = (ts) => {
      const d = new Date(ts * 1000);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
    };

    const firstTs = candles[0].time;
    const lastTs = candles[candles.length - 1].time;

    let curDay = utcMidnight(firstTs);
    const lastDay = utcMidnight(lastTs);

    // pointer to walk candles once, and a set so we don't assign same candle to multiple expected 21:00s
    let j = 0;
    const usedIdx = new Set();
    const markTimes = []; // store candle objects to mark

    while (curDay <= lastDay) {
      // Skip Saturday (6) and Sunday (0) in UTC
      const dayOfWeek = curDay.getUTCDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        curDay = new Date(curDay);
        curDay.setUTCDate(curDay.getUTCDate() + 1);
        continue;
      }

      // expected 21:00 UTC epoch seconds for this day
      const expected21 = Date.UTC(
        curDay.getUTCFullYear(),
        curDay.getUTCMonth(),
        curDay.getUTCDate(),
        21,
        0,
        0
      ) / 1000;

      // Move pointer to first candle with time >= expected21 that is unused
      while (j < candles.length && (candles[j].time < expected21 || usedIdx.has(j))) {
        j++;
      }

      if (j < candles.length) {
        // Found a candle at/after expected21 -> use it
        markTimes.push(candles[j]);
        usedIdx.add(j);
        // advance by one to avoid pathological re-checks
        j++;
      }
      // else: no candle after expected21 within dataset — nothing to mark for this day

      // next day
      curDay = new Date(curDay);
      curDay.setUTCDate(curDay.getUTCDate() + 1);
    }

    // Finally draw marks for each chosen candle
    for (const candle of markTimes) {
      try {
        const x = timeScale.timeToCoordinate(candle.time);
        if (!isFinite(x)) continue;

        ctx.fillStyle = "rgba(219,219,219,0.2)";
        ctx.fillRect(x - candleWidth / 3, 0, candleWidth, chartHeight);
      } catch (e) {
        // swallow individual errors to avoid breaking the whole draw pass
      }
    }
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

























// for GOLD 

// // sessionBreaks.js
// export function initSessionBreaks({ container, chart, series, dataRef }) {
//   if (!container || !chart || !series) return;

//   // --- create overlay canvas ---
//   const canvas = document.createElement("canvas");
//   canvas.style.position = "absolute";
//   canvas.style.left = "0";
//   canvas.style.top = "0";
//   canvas.style.pointerEvents = "none";
//   canvas.style.zIndex = 1; // above chart background, below crosshair
//   container.appendChild(canvas);

//   const estimateCandleWidth = () => {
//     const range = chart.timeScale().getVisibleLogicalRange();
//     if (!range) return 2;
//     const bars = range.to - range.from;
//     if (bars <= 0) return 2;
//     return container.clientWidth / bars;
//   };

//   // Fallback gap threshold (36 hours, used only if Friday-based detection doesn't apply)
//   const GAP_THRESHOLD = 36 * 3600; // seconds

//   const draw = () => {
//     if (!canvas || !container) return;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     const dpr = window.devicePixelRatio || 1;
//     canvas.width = container.clientWidth * dpr;
//     canvas.height = container.clientHeight * dpr;
//     canvas.style.width = container.clientWidth + "px";
//     canvas.style.height = container.clientHeight + "px";
//     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

//     ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);

//     const timeScale = chart.timeScale();
//     const chartHeight = container.clientHeight;
//     const candleWidth = Math.max(1, Math.floor(estimateCandleWidth() / 2)); // half thickness

//     const candles = dataRef.current || [];

//     // iterate candles in ascending time (old -> new)
//     for (let i = 0; i < candles.length; i++) {
//       try {
//         const candle = candles[i];
//         const t = new Date(candle.time * 1000); // epoch seconds -> ms
//         const weekday = t.getUTCDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

//         // previous candle (if any)
//         const prev = i > 0 ? candles[i - 1] : null;
//         let prevWeekday = null;
//         let diffSeconds = Infinity;

//         if (prev) {
//           try {
//             prevWeekday = new Date(prev.time * 1000).getUTCDay();
//             diffSeconds = candle.time - prev.time; // seconds
//           } catch {
//             prevWeekday = null;
//             diffSeconds = Infinity;
//           }
//         }

//         // PRIMARY: Friday -> next non-Friday bar (prev is Friday, current is NOT Friday)
//         const isFridayToNext = prev ? (prevWeekday === 5 && weekday !== 5) : false;

//         // FALLBACK 1: large time gap (weekend/holiday) - still useful if Friday data missing
//         const isGapStart = prev ? (diffSeconds > GAP_THRESHOLD) : true;

//         // FALLBACK 2: Sunday-first fallback (if dataset has explicit Sunday rows)
//         const isSundayFirst = (weekday === 0) && (prevWeekday !== 0);

//         // Combined: prefer Friday->next, but accept gap or Sunday-first as safety
//         const isSessionStart = isFridayToNext || isGapStart || isSundayFirst;

//         if (isSessionStart) {
//           const x = timeScale.timeToCoordinate(candle.time);
//           if (!isFinite(x)) continue;

//           // rectangle to highlight the session start
//           ctx.fillStyle = "rgba(219,219,219,0.2)"; // grey with opacity
//           ctx.fillRect(x - candleWidth / 3, 0, candleWidth, chartHeight);

//           // optional: draw a thin vertical line for clearer boundary
//           ctx.beginPath();
//           ctx.moveTo(x, 0);
//           ctx.lineTo(x, chartHeight);
//           ctx.lineWidth = 1;
//           ctx.strokeStyle = "rgba(120,120,120,0.35)";
//           ctx.stroke();
//         }
//       } catch (err) {
//         // swallow per-candle errors so one bad candle doesn't stop drawing
//         // console.debug("sessionBreaks draw error:", err);
//       }
//     }
//   };

//   // --- re-draw on chart events ---
//   chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
//   chart.timeScale().subscribeVisibleTimeRangeChange(draw);
//   window.addEventListener("resize", draw);

//   draw(); // initial draw

//   return {
//     redraw: draw,
//     destroy: () => {
//       chart.timeScale().unsubscribeVisibleLogicalRangeChange(draw);
//       chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
//       window.removeEventListener("resize", draw);
//       if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
//     },
//   };
// }
