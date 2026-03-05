// // src/OHLCBox.js
// import React, { useEffect, useState } from "react";

// const normalizeTime = (time) => {
//   if (time == null) return null;
//   if (typeof time === "number") return time;
//   const parsed = Date.parse(time);
//   if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
//   return null;
// };

// const findClosestIndex = (arr, time) => {
//   if (!arr || arr.length === 0) return -1;
//   let lo = 0,
//     hi = arr.length - 1;
//   while (lo <= hi) {
//     const mid = Math.floor((lo + hi) / 2);
//     if (arr[mid].time === time) return mid;
//     if (arr[mid].time < time) lo = mid + 1;
//     else hi = mid - 1;
//   }
//   const cand1 = Math.max(0, Math.min(arr.length - 1, lo));
//   const cand0 = Math.max(0, Math.min(arr.length - 1, lo - 1));
//   return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time) ? cand0 : cand1;
// };


// export default function OHLCBox({ chart, series, dataRef }) {
//   const [ohlc, setOhlc] = useState(null);

//   useEffect(() => {
//     if (!chart || !series || !dataRef) return;

//     const handleCrosshairMove = (param) => {
//       try {
//         if (!param || !param.time) {
//           setOhlc(null);
//           return;
//         }
//         const tNorm = normalizeTime(param.time);
//         if (tNorm == null) {
//           setOhlc(null);
//           return;
//         }
//         const idx = findClosestIndex(dataRef.current, tNorm);
//         if (idx < 0) {
//           setOhlc(null);
//           return;
//         }
//         const candle = dataRef.current[idx];
//         if (!candle) {
//           setOhlc(null);
//           return;
//         }
//         setOhlc({
//           open: Number(candle.open),
//           high: Number(candle.high),
//           low: Number(candle.low),
//           close: Number(candle.close),
//         });
//       } catch (err) {
//         console.error("OHLCBox handler error:", err);
//         setOhlc(null);
//       }
//     };

//     chart.subscribeCrosshairMove(handleCrosshairMove);
//     return () => {
//       try {
//         chart.unsubscribeCrosshairMove(handleCrosshairMove);
//       } catch {}
//     };
//   }, [chart, series, dataRef]);

//   return (
//     <div className="ohlc-box" role="status" aria-live="polite">
//       {ohlc ? (
//         <div>
//           <div>O: {ohlc.open.toFixed(2)}</div>
//           <div>H: {ohlc.high.toFixed(2)}</div>
//           <div>L: {ohlc.low.toFixed(2)}</div>
//           <div>C: {ohlc.close.toFixed(2)}</div>
//         </div>
//       ) : (
//         <div>Hover candles...</div>
//       )}
//     </div>
//   );
// }

// src/OHLCBox.js
import React, { useEffect, useRef, useState } from "react";

const normalizeTime = (time) => {
  if (time == null) return null;
  if (typeof time === "number") {
    // try to be robust: accept seconds or milliseconds.
    // treat values > 1e11 as milliseconds (common JS ms timestamps),
    // otherwise assume seconds.
    if (time > 1e11) return Math.floor(time / 1000);
    return Math.floor(time);
  }
  const parsed = Date.parse(time);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return null;
};

/**
 * Optimized "closest index" search:
 * - if we have a previous index and the new time is near it, do a bounded linear scan (fast for small moves)
 * - otherwise fallback to binary search (log n)
 * - scanning is bounded to avoid worst-case O(n)
 */
const findClosestIndex = (arr, time, lastIndexRef) => {
  if (!arr || arr.length === 0) return -1;
  const n = arr.length;

  const last = (lastIndexRef && typeof lastIndexRef.current === "number") ? lastIndexRef.current : -1;
  if (last >= 0 && last < n) {
    const lastT = arr[last].time;
    if (lastT === time) return last;

    // Bounded local scan (fast when crosshair moves slowly)
    const STEP_LIMIT = 512; // prevents worst-case long scans
    let steps = 0;
    if (time > lastT) {
      let i = last;
      while (i + 1 < n && arr[i + 1].time <= time && ++steps <= STEP_LIMIT) i++;
      const cand0 = i;
      const cand1 = Math.min(n - 1, i + 1);
      // pick closer of the two
      return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time) ? cand0 : cand1;
    } else {
      let i = last;
      while (i - 1 >= 0 && arr[i - 1].time >= time && ++steps <= STEP_LIMIT) i--;
      const cand1 = i;
      const cand0 = Math.max(0, i - 1);
      return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time) ? cand0 : cand1;
    }
  }

  // fallback binary search (safe and O(log n))
  let lo = 0, hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tmid = arr[mid].time;
    if (tmid === time) return mid;
    if (tmid < time) lo = mid + 1;
    else hi = mid - 1;
  }
  const cand1 = Math.max(0, Math.min(n - 1, lo));
  const cand0 = Math.max(0, Math.min(n - 1, lo - 1));
  return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time) ? cand0 : cand1;
};

export default function OHLCBox({ chart, series, dataRef }) {
  const [ohlc, setOhlc] = useState(null);

  // refs used to avoid rerenders and to keep small memory use
  const lastIndexRef = useRef(-1);
  const lastOhlcRef = useRef({ open: null, high: null, low: null, close: null });
  const pendingTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!chart || !dataRef) return;

    const processPending = () => {
      rafRef.current = null;
      const t = pendingTimeRef.current;
      pendingTimeRef.current = null;

      // If no time (cursor left chart), clear only if previously set
      if (t == null) {
        if (lastOhlcRef.current.open != null) {
          lastOhlcRef.current = { open: null, high: null, low: null, close: null };
          lastIndexRef.current = -1;
          setOhlc(null);
        }
        return;
      }

      const data = dataRef.current;
      if (!data || data.length === 0) return;

      const idx = findClosestIndex(data, t, lastIndexRef);
      if (idx < 0 || idx >= data.length) {
        if (lastOhlcRef.current.open != null) {
          lastOhlcRef.current = { open: null, high: null, low: null, close: null };
          lastIndexRef.current = -1;
          setOhlc(null);
        }
        return;
      }

      // If index same as previous, we can skip unless values changed (rare)
      if (idx === lastIndexRef.current) return;

      const candle = data[idx];
      if (!candle) return;

      // parse numbers once
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);

      const prev = lastOhlcRef.current;
      // update only if any value actually changed
      if (open === prev.open && high === prev.high && low === prev.low && close === prev.close) {
        lastIndexRef.current = idx; // still update index
        return;
      }

      // commit minimal state update
      lastOhlcRef.current = { open, high, low, close };
      lastIndexRef.current = idx;
      setOhlc({ open, high, low, close });
    };

    // coalescing handler: store time and schedule RAF
    const handleCrosshairMove = (param) => {
      try {
        const tNorm = param && param.time ? normalizeTime(param.time) : null;
        pendingTimeRef.current = tNorm;
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(processPending);
        }
      } catch (err) {
        // swallow errors quietly to avoid spamming console on fast events
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      try {
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch {}
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingTimeRef.current = null;
    };
    // intentionally depend only on chart and dataRef to avoid frequent re-subscriptions
  }, [chart, dataRef]);

  return (
    <div className="ohlc-box" role="status" aria-live="polite" style={{ willChange: "contents" }}>
      {ohlc ? (
        <div>
          <div>O: {ohlc.open.toFixed(2)}</div>
          <div>H: {ohlc.high.toFixed(2)}</div>
          <div>L: {ohlc.low.toFixed(2)}</div>
          <div>C: {ohlc.close.toFixed(2)}</div>
        </div>
      ) : (
        <div>Hover candles...</div>
      )}
    </div>
  );
}
