import React, { useEffect, useRef, useState } from "react";
import { drawDashedLineOnCtx, drawDottedPreview } from "./utils/DottedLineDrawer";
import DraggableModal from "./DraggableModal";
import { FibStatusUI, syncCreate, syncUpdate, syncDelete } from "./fibSync";

// Efficient FibTool — single overlay canvas, stable handlers, small retries, minimal allocations
export default function FibTool({ chart, series, containerRef, dataRef,oldestTime,latestTime }) {
  const groupsRef = useRef([]); // fib metadata only
  const overlayCanvasRef = useRef(null); // single shared overlay
  const previewCanvasRef = useRef(null); // preview canvas while drawing

  const fibStartRef = useRef(null);
  const fibTempRef = useRef(null);
  const fibModeRef = useRef(false);
  const magnetRef = useRef(true);

  const [fibMode, setFibMode] = useState(false);
  const [magnetOn, setMagnetOn] = useState(true);
  const [selectedFibUI, setSelectedFibUI] = useState(null);

  // --- NEW MODAL STATE ---
  const [editModal, setEditModal] = useState({ open: false, idx: null, high: "", low: "" });
  const extFibRef = useRef(false);

  // scheduling / throttling
  const rafRef = useRef(null);
  const pendingRef = useRef(false);
  const lastRenderKeyRef = useRef(null);

  const hasFetchedRef = useRef(false);

  // tweak for memory/GPU; set to 1 for minimum memory
  const DPR_CAP = 1.5;

  const FIB_LEVELS = [
    { r: 4.764, label: "4.764" },
    { r: 4.236, label: "4.236" },
    { r: 3.618, label: "3.618" },
    { r: 2.618, label: "2.618" },
    { r: 1.618, label: "1.618" },
    { r: 1.0, label: "1" },
    { r: 0.618, label: "0.618" },
    { r: 0.5, label: "0.50" },
    { r: 0.382, label: "0.38" },
    { r: 0.0, label: "0" },
  ];

  // ---------------- Helpers ----------------
  const normalizeTime = (time) => {
    if (time == null) return null;
    if (typeof time === "number") return Math.floor(time);
    const parsed = Date.parse(String(time));
    if (isNaN(parsed)) return null;
    return Math.floor(parsed / 1000);
  };

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
    return Math.abs(arr[cand0].time - time) <= Math.abs(arr[cand1].time - time)
      ? cand0
      : cand1;
  };

  const computeFibLevels = (high, low, isDowntrend) =>
    FIB_LEVELS.map((lvl) => ({
      r: lvl.r,
      label: lvl.label,
      price: isDowntrend ? high - (high - low) * lvl.r : low + (high - low) * lvl.r,
    }));

  const ensureContainerPosition = (container) => {
    try {
      if (!container) return;
      const s = window.getComputedStyle(container);
      if (s.position === "static") container.style.position = "relative";
    } catch {}
  };

  const ensureOverlay = () => {
    const container = containerRef?.current;
    if (!container) return null;
    ensureContainerPosition(container);
    if (!overlayCanvasRef.current) {
      const c = document.createElement("canvas");
      c.style.position = "absolute";
      c.style.left = "0";
      c.style.top = "0";
      c.style.pointerEvents = "none";
      c.style.zIndex = 30;
      container.appendChild(c);
      overlayCanvasRef.current = c;
    }
    return overlayCanvasRef.current;
  };

  const ensurePreview = () => {
    const container = containerRef?.current;
    if (!container) return null;
    if (!previewCanvasRef.current) {
      const c = document.createElement("canvas");
      c.style.position = "absolute";
      c.style.left = "0";
      c.style.top = "0";
      c.style.pointerEvents = "none";
      c.style.zIndex = 40;
      container.appendChild(c);
      previewCanvasRef.current = c;
    }
    return previewCanvasRef.current;
  };

  // coalesced redraw — added invalidateKey param to force a render even when render-key is unchanged
  const scheduleRedraw = (invalidateKey = false) => {
    if (invalidateKey) lastRenderKeyRef.current = null; // important: force next draw regardless of last key
    if (pendingRef.current) return;
    pendingRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      pendingRef.current = false;
      rafRef.current = null;
      drawAll();
    });
  };

  // small retry helper: tries to draw when chart's mapping becomes available
  const retryDrawPendingGroups = (maxRetries = 6) => {
    let tries = 0;
    const tick = () => {
      tries += 1;
      const pending = (groupsRef.current || []).filter((g) => {
        try {
          const x1 = chart.timeScale().timeToCoordinate(g.startTime);
          const x2 = chart.timeScale().timeToCoordinate(g.endTime);
          if (!isFinite(x1) || !isFinite(x2)) return true;
          for (let lvl of g.levels || []) {
            const y = series.priceToCoordinate(lvl.price);
            if (!isFinite(y)) return true;
          }
          return false;
        } catch {
          return true;
        }
      });

      if (pending.length === 0) {
        scheduleRedraw(true);
        return;
      }
      if (tries >= maxRetries) {
        scheduleRedraw(true);
        return;
      }
      setTimeout(tick, 60 * tries);
    };
    tick();
  };

  // main drawing routine
  const drawAll = () => {
    const canvas = ensureOverlay();
    const container = containerRef?.current;
    if (!canvas || !container) return;

    const DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(1, Math.round(container.clientWidth));
    const h = Math.max(1, Math.round(container.clientHeight));

    // cheap visible-key to skip redundant draws
    let visibleRange = null;
    try {
      const ts = chart.timeScale();
      if (typeof ts.getVisibleRange === "function") visibleRange = ts.getVisibleRange();
      else if (typeof ts.getVisibleLogicalRange === "function") visibleRange = ts.getVisibleLogicalRange();
    } catch {}

    // sample price mapping (vertical change detector)
    let priceSample = null;
    try {
      const d = dataRef.current;
      if (d && d.length) priceSample = Number(d[d.length - 1].close);
    } catch {}

    let sampleY = null;
    try {
      if (priceSample != null && typeof series.priceToCoordinate === "function") sampleY = Math.round(series.priceToCoordinate(priceSample));
    } catch {}

    const key = `${visibleRange?.from || ""}-${visibleRange?.to || ""}-${w}-${h}-${DPR}-${sampleY}`;
    if (lastRenderKeyRef.current === key) return; // skip if nothing changed
    lastRenderKeyRef.current = key;

    // size canvas and set DPR transform
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const leftEdge = 0;
    const rightEdge = w;

    // static reusable color array
    const bandColors = [
      "rgba(34, 108, 96,0.2)",
      "rgba(160, 57, 91, 0.3)",
      "rgba(43, 20, 47,0.7)",
      "rgba(60, 23, 26, 0.78)",
      "rgba(20, 29, 63,0.7)",
      "rgba(255, 255, 255, 0.05)",
      "rgba(108, 226, 90, 0.1)",
      "rgba(250, 250, 32, 0.2)",
      "rgba(255, 255, 255, 0.05)",
    ];

    const groups = groupsRef.current || [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.hidden) continue; // skip hidden FIBs
      try {
        const sx = chart.timeScale().timeToCoordinate(g.startTime);
        const ex = chart.timeScale().timeToCoordinate(g.endTime);
        if (!isFinite(sx) || !isFinite(ex)) continue;
        const leftX = Math.min(sx, ex);
        //const rightX = Math.max(sx, ex);
        const rightX = g.extendRight ? rightEdge : Math.max(sx, ex);
        if (rightX < leftEdge || leftX > rightEdge) continue; // offscreen

        // compute Ys
        const ys = new Array(g.levels.length);
        let ok = true;
        for (let j = 0; j < g.levels.length; j++) {
          const y = series.priceToCoordinate(g.levels[j].price);
          if (!isFinite(y)) { ok = false; break; }
          ys[j] = y;
        }
        if (!ok) continue;

        // draw filled bands + lines
        for (let j = 0; j < ys.length - 1; j++) {
          const yTop = ys[j];
          const yBottom = ys[j + 1];
          const top = Math.min(yTop, yBottom);
          const height = Math.abs(yBottom - yTop);

          ctx.fillStyle = bandColors[j % bandColors.length];
          ctx.fillRect(leftX, top, rightX - leftX, height);

          ctx.beginPath();
          ctx.moveTo(leftX, yTop);
          ctx.lineTo(rightX, yTop);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.stroke();

          if (g.showLabels || g.showPrices) {
            let text = "";
            if (g.showLabels) text += g.levels[j].label;
            if (g.showPrices) {
              if (text) text += " ";
              text += `(${g.levels[j].price.toFixed(2)})`;
            }
            if (text) {
              ctx.fillStyle = "#ffffff78";
              ctx.font = "12px monospace";
              ctx.textBaseline = "middle";
              const tw = ctx.measureText(text).width;
              const tx = leftX - tw - 6;
              ctx.fillText(text, tx, yTop);
            }
          }
        }

        // bottom line
        const lastY = ys[ys.length - 1];
        ctx.beginPath();
        ctx.moveTo(leftX, lastY);
        ctx.lineTo(rightX, lastY);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();

        if (g.showLabels || g.showPrices) {
          let text = "";
          const li = g.levels.length - 1;
          if (g.showLabels) text += g.levels[li].label;
          if (g.showPrices) {
            if (text) text += " ";
            text += `(${g.levels[li].price.toFixed(2)})`;
          }
          if (text) {
            ctx.fillStyle = "#ffffff78";
            ctx.font = "12px monospace";
            ctx.textBaseline = "middle";
            const tw = ctx.measureText(text).width;
            const tx = leftX - tw - 6;
            ctx.fillText(text, tx, lastY);
          }
        }

        // connector (dashed)
        try {
          const startPoint = g.isDowntrend ? { time: g.startTime, price: g.low } : { time: g.startTime, price: g.high };
          const endPoint = g.isDowntrend ? { time: g.endTime, price: g.high } : { time: g.endTime, price: g.low };
          drawDashedLineOnCtx(ctx, chart, series, startPoint, endPoint, { color: "rgba(255, 255, 255, 1)", width: 1, dash: [5, 5] });
        } catch {}

      } catch {}
    }
  };

  const initFibGroup = (fibData) => {
    groupsRef.current.push({ ...fibData });
    scheduleRedraw(true); // force draw after adding
    return groupsRef.current[groupsRef.current.length - 1];
  };

  const resolveFibPrices = (start, end) => {
    let startPrice = null;
    let endPrice = null;
    if (Number.isFinite(start?.price) && Number.isFinite(end?.price)) {
      startPrice = start.price;
      endPrice = end.price;
    }
    return { startPrice, endPrice };
  };

  const createFibBetween = async (start, end) => {
    if (!start || !end) return;
    let high, low, isDowntrend;
    if(extFibRef.current){
      high = start.price
      low = end.price
      isDowntrend = start.price < end.price;
    }else {
        if (magnetRef.current) {
        const startHigh = Number.isFinite(start.high) ? start.high : -Infinity;
        const endHigh = Number.isFinite(end.high) ? end.high : -Infinity;
        const startLow = Number.isFinite(start.low) ? start.low : Infinity;
        const endLow = Number.isFinite(end.low) ? end.low : Infinity;
        high = Math.max(startHigh, endHigh);
        low = Math.min(startLow, endLow);
        isDowntrend = start.high < end.high;
      } else {
        const { startPrice, endPrice } = resolveFibPrices(start, end);
        if (startPrice == null || endPrice == null) return;
        high = Math.max(startPrice, endPrice);
        low = Math.min(startPrice, endPrice);
        isDowntrend = startPrice < endPrice;
      }
    }
    

    const levels = computeFibLevels(high, low, isDowntrend);
    const tempId = `temp-${Date.now()}`;
    const group = initFibGroup({ id: tempId, startTime: start.time, endTime: end.time, high, low, isDowntrend, levels, showLabels: false, showPrices: false, _pending: true });

    // ensure immediate visual feedback for newly-created group (draw now)
    scheduleRedraw(true);

    // persist
    try {
      const payload = {
        startTime: group.startTime,
        endTime: group.endTime,
        high: group.high,
        low: group.low,
        isDowntrend: Boolean(group.isDowntrend),
        showLabels: !!group.showLabels,
        showPrices: !!group.showPrices,
      };
      const saved = await syncCreate(payload);
      if (saved && saved.id) {
        group.id = saved.id;
        group._pending = false;
        if (Array.isArray(saved.levels)) group.levels = saved.levels;
        // force redraw now that server may have adjusted levels
        scheduleRedraw(true);
      }
    } catch (e) {
      group._pending = true;
      scheduleRedraw(true);
    }

    // cleanup preview
    if (previewCanvasRef.current && previewCanvasRef.current.parentNode) {
      try { previewCanvasRef.current.parentNode.removeChild(previewCanvasRef.current); } catch {};
      previewCanvasRef.current = null;
    }
    fibTempRef.current = null;
    extFibRef.current = false;
  };

  const clickHandler = (param) => {
    try {
      if (fibModeRef.current) {
        if (!param || !param.time) return;
        const tNorm = normalizeTime(param.time);
        if (tNorm == null) return;

        if (magnetRef.current) {
          const idx = findClosestIndex(dataRef.current, tNorm);
          if (idx < 0) return;
          const clicked = dataRef.current[idx];
          if (!clicked) return;

          if (!fibStartRef.current) {
            fibStartRef.current = { index: idx, time: clicked.time, high: Number(clicked.high), low: Number(clicked.low) };
            fibTempRef.current = { time: clicked.time, price: Number(clicked.high) };
            ensurePreview();
            drawDottedPreview({ canvas: previewCanvasRef.current, container: containerRef.current, chartInst: chart, seriesInst: series, start: { time: fibStartRef.current.time, price: fibStartRef.current.high }, end: fibTempRef.current, opts: { color: "rgba(20,200,0,0.9)" } });
          } else {
            const start = fibStartRef.current;
            const endIdx = findClosestIndex(dataRef.current, tNorm);
            if (endIdx >= 0) {
              const endCandle = dataRef.current[endIdx];
              if (endCandle) createFibBetween(start, { index: endIdx, time: endCandle.time, high: Number(endCandle.high), low: Number(endCandle.low) });
            }
            fibStartRef.current = null;
            if (previewCanvasRef.current && previewCanvasRef.current.parentNode) try { previewCanvasRef.current.parentNode.removeChild(previewCanvasRef.current); } catch {}
            previewCanvasRef.current = null;
            setFibMode(false);
            setTimeout(() => window.dispatchEvent(new CustomEvent("fibModeUI", { detail: false })), 0);
          }
        } else {
          // free-draw
          if (!param.point) return;
          const priceAtY = (() => { try { return series.coordinateToPrice(param.point.y); } catch { return null; } })();
          if (!Number.isFinite(priceAtY)) return;

          if (!fibStartRef.current) {
            fibStartRef.current = { time: tNorm, price: priceAtY };
            fibTempRef.current = { time: tNorm, price: priceAtY };
            ensurePreview();
            drawDottedPreview({ canvas: previewCanvasRef.current, container: containerRef.current, chartInst: chart, seriesInst: series, start: { time: fibStartRef.current.time, price: fibStartRef.current.price }, end: fibTempRef.current,  });
          } else {
            createFibBetween(fibStartRef.current, { time: tNorm, price: priceAtY });
            fibStartRef.current = null;
            if (previewCanvasRef.current && previewCanvasRef.current.parentNode) try { previewCanvasRef.current.parentNode.removeChild(previewCanvasRef.current); } catch {}
            previewCanvasRef.current = null;
            setFibMode(false);
            setTimeout(() => window.dispatchEvent(new CustomEvent("fibModeUI", { detail: false })), 0);
          }
        }
      } else {
        // selection mode
        if (!param || !param.point) { setSelectedFibUI(null); return; }
        const clickX = param.point.x; const clickY = param.point.y; const threshold = 8;
        let found = -1;
        const groups = groupsRef.current || [];
        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          try {
            const startPoint = g.isDowntrend ? { time: g.startTime, price: g.low } : { time: g.startTime, price: g.high };
            const endPoint = g.isDowntrend ? { time: g.endTime, price: g.high } : { time: g.endTime, price: g.low };
            const sx = chart.timeScale().timeToCoordinate(startPoint.time);
            const sy = series.priceToCoordinate(startPoint.price);
            const ex = chart.timeScale().timeToCoordinate(endPoint.time);
            const ey = series.priceToCoordinate(endPoint.price);
            if ([sx, sy, ex, ey].every((v) => isFinite(v))) {
              const dx = ex - sx; const dy = ey - sy; const l2 = dx * dx + dy * dy; let dist;
              if (l2 === 0) dist = Math.hypot(clickX - sx, clickY - sy); else { let t = ((clickX - sx) * dx + (clickY - sy) * dy) / l2; t = Math.max(0, Math.min(1, t)); const cx = sx + t * dx; const cy = sy + t * dy; dist = Math.hypot(clickX - cx, clickY - cy); }
              if (dist <= threshold) found = i;
            }
            if (found === -1 && g.levels && g.levels.length > 0) {
              const x1 = chart.timeScale().timeToCoordinate(g.startTime); const x2 = chart.timeScale().timeToCoordinate(g.endTime);
              if (isFinite(x1) && isFinite(x2)) {
                const leftX = Math.min(x1, x2); const rightX = Math.max(x1, x2);
                for (let lvl of g.levels) {
                  const yLine = series.priceToCoordinate(lvl.price); if (!isFinite(yLine)) continue;
                  if (Math.abs(clickY - yLine) <= threshold && clickX >= leftX && clickX <= rightX) { found = i; break; }
                }
              }
            }
            if (found !== -1) {
              const contRect = containerRef.current.getBoundingClientRect(); const absX = contRect.left + clickX + window.scrollX; const absY = contRect.top + clickY + window.scrollY;
              setSelectedFibUI({ idx: found, xPx: absX, yPx: absY });
              break;
            }
          } catch {}
        }
        if (found === -1) setSelectedFibUI(null);
      }
    } catch (err) {}
  };

  // fetch FIBs and merge
  const fetchFibs = async () => {
    try {
      //const res = await fetch(`http://127.0.0.1:8000/api/fibs?oldest_time=${oldestTime}&latest_time=${latestTime}`);
      const res = await fetch(`https://fastapi-backend-ac7i.onrender.com/api/fibs?oldest_time=${oldestTime}&latest_time=${latestTime}`);

      if (!res.ok) throw new Error(`Failed to load fibs: ${res.status}`);
      const fibs = await res.json();
      if (!Array.isArray(fibs)) return;
      for (const fib of fibs) {
        const exists = groupsRef.current.some((g) => g.id === fib.id || (g.startTime === fib.startTime && g.endTime === fib.endTime && g.high === fib.high && g.low === fib.low));
        if (!exists) groupsRef.current.push({ ...fib,levels: computeFibLevels(fib.high, fib.low, fib.isDowntrend), _pending: false });
      }
      scheduleRedraw(true);
      retryDrawPendingGroups();
    } catch (err) {
      // ignore network errors for now
    }
  };

  useEffect(() => {
    // keep refs in sync so event handlers don't need to be re-subscribed
    fibModeRef.current = fibMode;
  }, [fibMode]);
  useEffect(() => { magnetRef.current = magnetOn; }, [magnetOn]);

  useEffect(() => {
    if (!chart || !series || !containerRef?.current || !dataRef) return;

    ensureOverlay();

    // stable handlers
    const onKey = (e) => {
      try {
        if (e.altKey && e.key.toLowerCase() === "f") {
          e.preventDefault();
          setFibMode((prev) => {
            const next = !prev;
            setTimeout(() => window.dispatchEvent(new CustomEvent("fibModeUI", { detail: next })), 0);
            return next;
          });
          fibStartRef.current = null;
          if (previewCanvasRef.current) try { previewCanvasRef.current.getContext("2d")?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height); } catch { }
        }
        if (e.key === "Escape") {
          setFibMode(false);
          setTimeout(() => window.dispatchEvent(new CustomEvent("fibModeUI", { detail: false })), 0);
          fibStartRef.current = null;
          if (previewCanvasRef.current && previewCanvasRef.current.parentNode) try { previewCanvasRef.current.parentNode.removeChild(previewCanvasRef.current); } catch { }
          previewCanvasRef.current = null;
          fibTempRef.current = null;
          setSelectedFibUI(null);
          closeEditModal();
        }
      } catch {}
    };
    window.addEventListener("keydown", onKey);

    // chart event handlers (store references so we can unsubscribe exact handlers)
    const onChartClick = clickHandler;
    const onCrosshair = (param) => {
  try {
    if (fibModeRef.current && fibStartRef.current) {
      if (!param || !param.time || !param.point) return;
      const tNorm = normalizeTime(param.time);
      if (tNorm == null) return;

      // 🔹 raw coords fallback prepared for edge cases
      const rawTime = chart.timeScale().coordinateToTime(param.point.x);
      const rawPrice = series.coordinateToPrice(param.point.y);

      if (magnetRef.current) {
        // 🔹 magnet ON → snap to candle
        const idx = findClosestIndex(dataRef.current, tNorm);
        if (idx < 0) return;
        const hovered = dataRef.current[idx];
        if (!hovered) return;

        let pickedPrice = hovered.close;
        try {
          const highY = series.priceToCoordinate(Number(hovered.high));
          const lowY = series.priceToCoordinate(Number(hovered.low));
          if (isFinite(highY) && isFinite(lowY) && typeof param.point.y === "number") {
            pickedPrice =
              Math.abs(param.point.y - highY) < Math.abs(param.point.y - lowY)
                ? Number(hovered.high)
                : Number(hovered.low);
          }
        } catch {
          pickedPrice = Number(hovered.close);
        }

        fibTempRef.current = { time: hovered.time, price: pickedPrice };
      } 
      else if(rawTime && Number.isFinite(rawPrice)){
        fibTempRef.current = { time: rawTime, price: rawPrice };
      }
      
      else {
        // 🔹 free-draw → use raw mouse coordinates
        const priceAtY = (() => {
          try {
            return series.coordinateToPrice(param.point.y);
          } catch {
            return null;
          }
        })();
        if (!Number.isFinite(priceAtY)) return;

        fibTempRef.current = { time: tNorm, price: priceAtY };
      }

      // common preview draw
      ensurePreview();
      drawDottedPreview({
        canvas: previewCanvasRef.current,
        container: containerRef.current,
        chartInst: chart,
        seriesInst: series,
        start: { time: fibStartRef.current.time, price: fibStartRef.current.high ?? fibStartRef.current.price },
        end: { time: fibTempRef.current.time, price: fibTempRef.current.price },
        opts: { color: "rgba(255, 255, 255, 0.9)", width: 1, dash: [5, 5] }
      });
    }
  } catch {}

  // always schedule redraw
  scheduleRedraw();
};


    try { chart.subscribeClick(onChartClick); } catch {}
    try { chart.subscribeCrosshairMove(onCrosshair); } catch {}

    // timeScale handlers
    const ts = chart.timeScale();
    const onVisibleTimeChange = () => scheduleRedraw();
    const onSizeChange = () => scheduleRedraw();
    const onLogicalRange = () => scheduleRedraw();
    try {
      if (ts && typeof ts.subscribeVisibleTimeRangeChange === "function") ts.subscribeVisibleTimeRangeChange(onVisibleTimeChange);
      if (ts && typeof ts.subscribeSizeChange === "function") ts.subscribeSizeChange(onSizeChange);
      if (ts && typeof ts.subscribeVisibleLogicalRangeChange === "function") ts.subscribeVisibleLogicalRangeChange(onLogicalRange);
    } catch {}

    // pointer interactions: redraw while pointer is down (cheap)
    let interactionRAF = null;
    let pointerDown = false;
    const onPointerDown = () => {
      if (pointerDown) return;
      pointerDown = true;
      const loop = () => {
        if (!pointerDown) return;
        interactionRAF = requestAnimationFrame(loop);
        scheduleRedraw();
      };
      loop();
    };
    const onPointerUp = () => {
      pointerDown = false;
      if (interactionRAF) cancelAnimationFrame(interactionRAF);
      interactionRAF = null;
      scheduleRedraw();
    };

    const container = containerRef.current;
    container?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    

    // fetch once
    if (!hasFetchedRef.current) { hasFetchedRef.current = true; fetchFibs(); }

    return () => {
      try { chart.unsubscribeClick(onChartClick); } catch {}
      try { chart.unsubscribeCrosshairMove(onCrosshair); } catch {}
      try {
        if (ts && typeof ts.unsubscribeVisibleTimeRangeChange === "function") ts.unsubscribeVisibleTimeRangeChange(onVisibleTimeChange);
        if (ts && typeof ts.unsubscribeSizeChange === "function") ts.unsubscribeSizeChange(onSizeChange);
        if (ts && typeof ts.unsubscribeVisibleLogicalRangeChange === "function") ts.unsubscribeVisibleLogicalRangeChange(onLogicalRange);
      } catch {}

      window.removeEventListener("keydown", onKey);
      container?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);

      if (previewCanvasRef.current && previewCanvasRef.current.parentNode) try { previewCanvasRef.current.parentNode.removeChild(previewCanvasRef.current); } catch {}
      previewCanvasRef.current = null;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null; pendingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, containerRef, dataRef]);

  // UI helpers
  const toggleMagnet = () => {
    setMagnetOn((v) => { const n = !v; magnetRef.current = n; return n; });
  };

  const deleteFibByIndex = (idx) => {
    const arr = groupsRef.current || [];
    if (idx < 0 || idx >= arr.length) return;
    const g = arr[idx];
    arr.splice(idx, 1);
    setSelectedFibUI(null);
    if (!g._pending) syncDelete(g.id);
    scheduleRedraw(true);
  };

  // --- MODAL HANDLERS ---
  const openEditModal = (idx) => {
    const g = groupsRef.current[idx];
    if (!g) return;
    setEditModal({
      open: true,
      idx,
      high: g.high.toFixed(2),
      low: g.low.toFixed(2),
    });
  };

  const closeEditModal = () => {
    setEditModal({ open: false, idx: null, high: "", low: "" });
  };

  const handleEditOk = (idx) => {
    const { high, low } = editModal;
    if (idx == null) return;
    const g = groupsRef.current[idx];
    if (!g) return;

    const parsedHigh = parseFloat(high);
    const parsedLow = parseFloat(low);
    if (!Number.isFinite(parsedHigh) || !Number.isFinite(parsedLow)) return;

    g.high = parsedHigh;
    g.low = parsedLow;
    g.levels = computeFibLevels(g.high, g.low, g.isDowntrend);
    syncUpdate(g);
    scheduleRedraw(true);
    closeEditModal();
  };

  const extendedFib = (idx, pax) => {
    if (idx == null) return;
    const g = groupsRef.current[idx];
    if (!g || !Array.isArray(g.levels)) return;

    extFibRef.current = true;

    // Validate pax value
    const validPax = [4.764, 3.618, 2.618,1.618,1.0,0.0];
    if (!validPax.includes(Number(pax))) {
      console.warn("extendedFib(): invalid pax value", pax);
      return;
    }

    // Always include the 2.618 level as the second reference,
    // except when pax === 1.618 (then 1.618 becomes the second)
    const primaryLevelValue = pax;
    // const secondaryLevelValue = pax === 2.618 ? 1.618 : 2.618;
    //const secondaryLevelValue = pax === 2.618 ? 1.618 : (pax === 1.618 ? 1.0 : 2.618);

    const secondaryLevelValue =
      pax === 2.618 ? 1.618 :
      pax === 1.618 ? 1.0 :
      pax === 1.0 ? 0.618 :
      pax === 0.0 ? 0.382 :
      2.618;


    // Find levels safely
    const levelPrimary = g.levels.find(l => Number(l.r) === primaryLevelValue);
    const levelSecondary = g.levels.find(l => Number(l.r) === secondaryLevelValue);

    const pricePrimary = Number(levelPrimary?.price ?? g.high);
    const priceSecondary = Number(levelSecondary?.price ?? g.low);

    // Validate before creating
    if (!Number.isFinite(pricePrimary) || !Number.isFinite(priceSecondary)) {
      console.warn("extendedFib(): invalid price values", { pricePrimary, priceSecondary, pax });
      return;
    }
    // for BTC
    const timeShift = 3600*4*8;
    //const timeShift = 3600*3;


    // previously used
    let shiftedStart = Number(g.startTime) + timeShift;
    let shiftedEnd = Number(g.endTime) + timeShift;

    // let shiftedStart = Number(g.endTime) + timeShift;
    // let shiftedEnd = Number(g.endTime) + timeShift +3600*1;

    

    // Create the new fib
    createFibBetween(
      { time: shiftedStart, price: pricePrimary },
      { time: shiftedEnd, price: priceSecondary }
    );
};


  return (
    <>
      <div style={{ position: "relative" }}><FibStatusUI /></div>

      <div style={{ position: "fixed", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 1500 }}>
        <button
          onClick={toggleMagnet}
          title={magnetOn ? "Magnet ON (snap to high/low)" : "Magnet OFF (free draw)"}
          style={{ width: 44, height: 44, borderRadius: 8, border: "1px solid #ccc", background: magnetOn ? "#1d1e1fff" : "#fff", fontSize: 20, cursor: "pointer" }}
        >
          🧲
        </button>
      </div>

      {selectedFibUI && (
        

        // for sensex
        <div style={{ position: "absolute", left: selectedFibUI.xPx, top: selectedFibUI.yPx, transform: "translate(-50%, -120%)", zIndex: 2000, pointerEvents: "auto", display: "flex", gap: "8px", alignItems:"center", flexDirection:"column" }}>
          <div style={{display:"flex",gap:"8px", alignItems:"center", justifyContent:"center"}}>
            {/* <button onClick={() => deleteFibByIndex(selectedFibUI.idx)} style={{ background: '#ff4d4f', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>Delete</button> */}
            <button onClick={() => openEditModal(selectedFibUI.idx)} style={{ background: "#fa8c16", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>Edit</button>
            <button onClick={() => extendedFib(selectedFibUI.idx,2.618)} style={{ background: "#aa16faff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>Ext2.6</button>
            <button onClick={() => extendedFib(selectedFibUI.idx,1.618)} style={{ background: "#fa16a6ff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>Ext1.6</button>
            {/* <button onClick={() => { const g = groupsRef.current[selectedFibUI.idx];  g.hidden = !g.hidden; scheduleRedraw(true); }} style={{ background: '#d12ebeff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>Hide</button>  */}
            {/* <button onClick={() => { const g = groupsRef.current[selectedFibUI.idx];  g.extendRight = !g.extendRight; scheduleRedraw(true); }} style={{ background: '#d12ebeff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>ToRight</button> */}
            <button onClick={() => extendedFib(selectedFibUI.idx,1.0)} style={{ background: "rgb(242, 22, 250)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>L1</button>
            <button onClick={() => extendedFib(selectedFibUI.idx,0.0)} style={{ background: "rgb(109, 22, 250)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>L0</button>
            <button onClick={() => deleteFibByIndex(selectedFibUI.idx)} style={{ background: '#ff4d4f', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>Delete</button> 
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={() => extendedFib(selectedFibUI.idx,4.764)} style={{ background: "#fa16e7ff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>Ext</button>
            <button onClick={() => extendedFib(selectedFibUI.idx,3.618)} style={{ background: "#fa1680ff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>Ext3.6</button>
            {/* <button onClick={() => { const g = groupsRef.current[selectedFibUI.idx]; g.showLabels = !g.showLabels; scheduleRedraw(true); syncUpdate(g); }} style={{ background: '#1890ff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>Labels</button> */}
            <button onClick={() => { const g = groupsRef.current[selectedFibUI.idx]; g.showPrices = !g.showPrices; scheduleRedraw(true); syncUpdate(g); }} style={{ background: '#722ed1', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>Prices</button>
            <button onClick={() => { const g = groupsRef.current[selectedFibUI.idx]; g.isDowntrend = !g.isDowntrend; g.levels = computeFibLevels(g.high, g.low, g.isDowntrend); syncUpdate(g); scheduleRedraw(true); }} style={{ background: '#13c2c2', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>REV</button>
          </div>
        </div>

        
      
      
      
      )}

      

      {fibMode && <div className="fib-active-msg">FIB MODE ACTIVE (Esc to exit)</div>}

      {/* --- MODAL UI --- */}
        {editModal.open && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 3000,
              pointerEvents: "none",
            }}
          >
            <DraggableModal
              title="Edit FIB Levels"
              editModal={editModal}
              setEditModal={setEditModal}
              onOk={() => handleEditOk(selectedFibUI.idx)}
              onCancel={closeEditModal}
            />
          </div>
        )}
      
    </>
  );
}
