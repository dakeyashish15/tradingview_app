// src/OHLCBox.js
import React, { useEffect, useState } from "react";

const normalizeTime = (time) => {
  if (time == null) return null;
  if (typeof time === "number") return time;
  const parsed = Date.parse(time);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return null;
};

const findClosestIndex = (arr, time) => {
  if (!arr || arr.length === 0) return -1;
  let lo = 0,
    hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid].time === time) return mid;
    if (arr[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  const cand1 = Math.max(0, Math.min(arr.length - 1, lo));
  const cand0 = Math.max(0, Math.min(arr.length - 1, lo - 1));
  return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time) ? cand0 : cand1;
};


export default function OHLCBox({ chart, series, dataRef }) {
  const [ohlc, setOhlc] = useState(null);

  useEffect(() => {
    if (!chart || !series || !dataRef) return;

    const handleCrosshairMove = (param) => {
      try {
        if (!param || !param.time) {
          setOhlc(null);
          return;
        }
        const tNorm = normalizeTime(param.time);
        if (tNorm == null) {
          setOhlc(null);
          return;
        }
        const idx = findClosestIndex(dataRef.current, tNorm);
        if (idx < 0) {
          setOhlc(null);
          return;
        }
        const candle = dataRef.current[idx];
        if (!candle) {
          setOhlc(null);
          return;
        }
        setOhlc({
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
        });
      } catch (err) {
        console.error("OHLCBox handler error:", err);
        setOhlc(null);
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    return () => {
      try {
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch {}
    };
  }, [chart, series, dataRef]);

  return (
    <div className="ohlc-box" role="status" aria-live="polite">
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
