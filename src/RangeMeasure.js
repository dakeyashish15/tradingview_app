// src/RangeMeasure.js
import React, { useEffect, useRef, useState } from "react";
import IconButton from "@mui/material/IconButton";
import UpgradeIcon from "@mui/icons-material/Upgrade";

export default function RangeMeasure({ chart, series, containerRef, dataRef }) {
  const [active, setActive] = useState(false);
  const shiftDownRef = useRef(false);

  const startRef = useRef(null);
  const endRef = useRef(null);
  const lastTempEndRef = useRef(null);
  const resultRef = useRef(null);

  const overlayCanvasRef = useRef(null);
  const lowLabelRef = useRef(null);  // Low
  const highLabelRef = useRef(null); // High + ΔAbs + Δ%

  // --- helpers ---
  const findClosestIndex = (arr, time) => {
    if (!arr || arr.length === 0 || time == null) return -1;
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

  const normalizeParamTime = (time) => {
    if (time == null) return null;
    if (typeof time === "number") return Math.floor(time);
    const parsed = Date.parse(String(time));
    if (!isNaN(parsed)) return Math.floor(parsed / 1000);
    return null;
  };

  const pickNearestCandleByParam = (paramTime) => {
    const t = normalizeParamTime(paramTime);
    if (t == null) return null;
    const arr = dataRef?.current || [];
    const idx = findClosestIndex(arr, t);
    if (idx < 0 || idx >= arr.length) return null;
    return { candle: arr[idx], index: idx };
  };

  // --- setup overlay + labels ---
  useEffect(() => {
    const root = containerRef?.current;
    if (!root || !chart) return;

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      pointerEvents: "none",
      zIndex: "2147483646",
    });
    root.appendChild(canvas);
    overlayCanvasRef.current = canvas;

    const makeLabel = (bg) => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "absolute",
        pointerEvents: "none",
        zIndex: "2147483647",
        background: bg,
        color: "#fff",
        padding: "4px 6px",
        borderRadius: "4px",
        fontFamily: "monospace",
        fontSize: "12px",
        display: "none",
        whiteSpace: "pre", // stacked text
      });
      root.appendChild(d);
      return d;
    };

    lowLabelRef.current = makeLabel("rgba(0,150,136,0.95)");
    highLabelRef.current = makeLabel("rgba(25,118,210,0.95)");

    const ensureCanvasSize = () => {
      const c = overlayCanvasRef.current;
      const r = containerRef.current;
      if (!c || !r) return;
      const w = Math.max(1, r.clientWidth);
      const h = Math.max(1, r.clientHeight);
      c.width = Math.floor(w * devicePixelRatio);
      c.height = Math.floor(h * devicePixelRatio);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    ensureCanvasSize();

    const onResize = () => {
      ensureCanvasSize();
      window.requestAnimationFrame(() => {
        if (typeof window.__rangeMeasureRedraw === "function") window.__rangeMeasureRedraw();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      try {
        canvas.remove();
        lowLabelRef.current?.remove();
        highLabelRef.current?.remove();
      } catch {}
      if (window.__rangeMeasureRedraw) delete window.__rangeMeasureRedraw;
    };
  }, [containerRef, chart]);

  // --- draw utils ---
  const hideAllLabels = () => {
    [lowLabelRef, highLabelRef].forEach((r) => {
      if (r.current) r.current.style.display = "none";
    });
  };

  const showLowLabel = (x, y, price) => {
    const d = lowLabelRef.current;
    if (!d) return;
    d.style.left = `${Math.round(x)}px`;
    d.style.top = `${Math.round(y + 20)}px`; // breathing space
    d.textContent = `Low ${price}`;
    d.style.display = "block";
  };

  const showHighLabel = (x, y, price, diff, pct, isUp) => {
    const d = highLabelRef.current;
    if (!d) return;
    d.style.left = `${Math.round(x)}px`;
    d.style.top = `${Math.round(y - 50)}px`; // breathing space above high
    d.innerHTML = `High ${price}<br><span style="color:#ffffffff">Δ ${diff.toFixed(
      0
    )} (${pct.toFixed(2)}%)</span>`;
    d.style.display = "block";
  };

  const clearCanvas = () => {
    const canvas = overlayCanvasRef.current;
    const root = containerRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, root.clientWidth, root.clientHeight);
  };

  const ensureCanvasReady = () => {
    const canvas = overlayCanvasRef.current;
    const root = containerRef.current;
    if (!canvas || !root) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (canvas.width !== Math.floor(w * devicePixelRatio) || canvas.height !== Math.floor(h * devicePixelRatio)) {
      canvas.width = Math.floor(w * devicePixelRatio);
      canvas.height = Math.floor(h * devicePixelRatio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    return true;
  };

  const drawDottedLine = (s, e, result) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !chart || !series || !s || !e) return;
    if (!ensureCanvasReady()) return;

    const ctx = canvas.getContext("2d");
    const root = containerRef.current;
    ctx.clearRect(0, 0, root.clientWidth, root.clientHeight);

    let x1, y1, x2, y2;
    try {
      x1 = chart.timeScale().timeToCoordinate(s.time);
      x2 = chart.timeScale().timeToCoordinate(e.time);
      y1 = series.priceToCoordinate(s.price);
      y2 = series.priceToCoordinate(e.price);
    } catch {
      return;
    }
    if (![x1, y1, x2, y2].every((v) => isFinite(v))) return;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const maxHigh = result?.maxHigh ?? Math.max(s.high ?? s.price, e.high ?? e.price);
    const minLow = result?.minLow ?? Math.min(s.low ?? s.price, e.low ?? e.price);
    const diff = result?.diff ?? Math.abs(maxHigh - minLow);
    const pct = result?.pct ?? (minLow === 0 ? 0 : (diff / minLow) * 100);
    const isUp = maxHigh > minLow;

    // show labels
    const xHigh = chart.timeScale().timeToCoordinate(s.time < e.time ? e.time : s.time);
    const yHigh = series.priceToCoordinate(maxHigh);
    const xLow = chart.timeScale().timeToCoordinate(s.time < e.time ? s.time : e.time);
    const yLow = series.priceToCoordinate(minLow);

    showHighLabel(xHigh, yHigh, maxHigh, diff, pct, isUp);
    showLowLabel(xLow, yLow, minLow);
  };

  const clearAll = () => {
    startRef.current = null;
    endRef.current = null;
    lastTempEndRef.current = null;
    resultRef.current = null;
    clearCanvas();
    hideAllLabels();
  };

  // --- subs ---
  useEffect(() => {
    if (!chart || !series || !containerRef?.current || !dataRef) return;

    let mounted = true;

    const redraw = () => {
      if (!mounted) return;
      if (startRef.current && (lastTempEndRef.current || endRef.current)) {
        const e = endRef.current || lastTempEndRef.current;
        drawDottedLine(startRef.current, e, resultRef.current);
      } else {
        clearCanvas();
        hideAllLabels();
      }
    };
    window.__rangeMeasureRedraw = redraw;

    const clickHandler = (param) => {
      if (!mounted) return;
      if (endRef.current) {
        clearAll();
        setActive(false);
        return;
      }
      if (!active && !shiftDownRef.current && !startRef.current) return;
      if (!param?.time || !param?.point) return;
      const picked = pickNearestCandleByParam(param.time);
      if (!picked) return;
      const candle = picked.candle;
      const cY = param.point.y;
      const highY = series.priceToCoordinate(candle.high);
      const lowY = series.priceToCoordinate(candle.low);
      const chooseHigh = Math.abs(cY - highY) < Math.abs(cY - lowY);
      const price = chooseHigh ? candle.high : candle.low;

      if (!startRef.current) {
        startRef.current = { time: candle.time, price, high: candle.high, low: candle.low, index: picked.index };
        lastTempEndRef.current = { time: candle.time, price };
        drawDottedLine(startRef.current, lastTempEndRef.current);
        return;
      }
      if (!endRef.current) {
        endRef.current = { time: candle.time, price, high: candle.high, low: candle.low, index: picked.index };
        const maxHigh = Math.max(startRef.current.high, endRef.current.high);
        const minLow = Math.min(startRef.current.low, endRef.current.low);
        const diff = Math.abs(maxHigh - minLow);
        const pct = minLow === 0 ? 0 : (diff / minLow) * 100;
        resultRef.current = { maxHigh, minLow, diff, pct };
        drawDottedLine(startRef.current, endRef.current, resultRef.current);
        setActive(false);
      }
    };

    const moveHandler = (param) => {
      if (!mounted) return;
      if (!active && !shiftDownRef.current && !startRef.current) return;
      if (!startRef.current || endRef.current) return;
      if (!param?.time || !param?.point) return;
      const picked = pickNearestCandleByParam(param.time);
      if (!picked) return;
      const candle = picked.candle;
      const cY = param.point.y;
      const highY = series.priceToCoordinate(candle.high);
      const lowY = series.priceToCoordinate(candle.low);
      const chooseHigh = Math.abs(cY - highY) < Math.abs(cY - lowY);
      const price = chooseHigh ? candle.high : candle.low;
      lastTempEndRef.current = { time: candle.time, price };

      const maxHigh = Math.max(startRef.current.high, candle.high);
      const minLow = Math.min(startRef.current.low, candle.low);
      const diff = Math.abs(maxHigh - minLow);
      const pct = minLow === 0 ? 0 : (diff / minLow) * 100;

      drawDottedLine(startRef.current, lastTempEndRef.current, { maxHigh, minLow, diff, pct });
    };

    const keyDown = (ev) => {
      if (ev.key === "Shift") shiftDownRef.current = true;
      if (ev.key === "Escape") {
        clearAll();
        setActive(false);
      }
    };
    const keyUp = (ev) => {
      if (ev.key === "Shift") shiftDownRef.current = false;
    };

    chart.subscribeClick(clickHandler);
    chart.subscribeCrosshairMove(moveHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    return () => {
      mounted = false;
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(moveHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      if (window.__rangeMeasureRedraw) delete window.__rangeMeasureRedraw;
    };
  }, [chart, series, containerRef, dataRef, active]);

  const wrapperStyle = {
    position: "fixed",
    top: 16,
    left: 500,
    zIndex: 2147483647,
  };

  return (
    <div style={wrapperStyle}>
      <IconButton
        size="large"
        onClick={() => {
          if (active) {
            clearAll();
            setActive(false);
          } else {
            clearAll();
            setActive(true);
          }
        }}
        sx={{ width: 64, height: 64 }}
      >
        <UpgradeIcon sx={{ fontSize: 32 }} />
      </IconButton>
    </div>
  );
}
