// src/ChartContainer.js
import React, { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import OHLCBox from "./OHLCBox";
import FibTool from "./FibTool";
import RangeMeasure from "./RangeMeasure";
import { initSessionBreaks } from "./sessionBreaks";
import GoToDate from "./GoToDate";

export default function ChartContainer() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const dataRef = useRef([]); // formatted candles
  const metaRef = useRef({ oldest: null, latest: null });

  const [ready, setReady] = useState(false);
  const [fibModeOn, setFibModeOn] = useState(false);

  // Parse "YYYY-MM-DD HH:MM:SS" which is already in Asia/Kolkata (UTC+5:30)
  const parseKolkataToUnix = (ts) => {
    if (!ts) return null;
    // Convert "YYYY-MM-DD HH:mm:ss" → Unix seconds
    const d = new Date(ts.replace(" ", "T"));
    const shifted = d.getTime() + 5.5 * 60 * 60 * 1000;
    return Math.floor(shifted / 1000);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        backgroundColor: "#131722",
        textColor: "#d0d0d0",
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" }, // ~5% opacity white
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)", // faint border
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)", // faint border
      },
    });

    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      priceFormat: {
        type: "price",
        precision: 0, // no decimal places
        minMove: 1, // step size
      },
      upColor: "#089981",
      downColor: "#f23645",
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
      borderUpColor: "#089981", // solid border color
      borderDownColor: "#f23645",
      borderVisible: true,
      wickVisible: true,
    });
    seriesRef.current = series;

    // --- Helper to force crisp rendering on all canvases inside container ---
    const makeCanvasesCrisp = () => {
      try {
        const canvases = container.querySelectorAll("canvas");
        canvases.forEach((canvas) => {
          // CSS hints — several fallbacks
          canvas.style.imageRendering = "optimize-contrast"; // older webkit
          canvas.style.imageRendering = "-moz-crisp-edges";
          canvas.style.imageRendering = "crisp-edges";
          canvas.style.imageRendering = "pixelated";
          canvas.style.backfaceVisibility = "hidden";
          canvas.style.transform = "translateZ(0)";
          canvas.style.willChange = "transform";

          // Ensure integer pixel backing store size to avoid fractional scaling blur
          const cw = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
          const ch = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
            // keep CSS size unchanged (clientWidth/clientHeight)
            canvas.style.width = `${Math.max(1, canvas.clientWidth)}px`;
            canvas.style.height = `${Math.max(1, canvas.clientHeight)}px`;
          }

          // Disable smoothing on the 2D context (prevents resample smoothing)
          const ctx = canvas.getContext("2d");
          if (ctx) {
            try {
              ctx.imageSmoothingEnabled = false;
              ctx.webkitImageSmoothingEnabled = false;
              ctx.mozImageSmoothingEnabled = false;
              // helpful stroke settings for crisper lines
              ctx.lineJoin = "miter";
              ctx.lineCap = "butt";
            } catch (e) {
              // ignore per-canvas ctx errors
            }
          }
        });
      } catch (err) {
        // swallow
      }
    };

    // initial pass (give the chart a tick so it created canvases)
    makeCanvasesCrisp();

    
    

    (async () => {
      try {
        const path = window.location.pathname; // e.g. "/1"
        const offset = parseInt(path.replace("/", ""), 10) || 0;
        const res = await fetch(`http://127.0.0.1:8000/data/15min?offset=${offset}`, { method: "GET" });
        const raw = await res.json();
        const rows = Array.isArray(raw.candles) ? raw.candles : [];
        // ✅ store oldest/latest
        metaRef.current.oldest = raw.oldest_time;
        metaRef.current.latest = raw.latest_time;
        
        const formatted = rows
          .map((r) => {
            const t = parseKolkataToUnix(r.timestamp || r.time || r.date || "");
            if (!Number.isFinite(t)) return null;
            return {
              time: t,
              open: Number(r.open),
              high: Number(r.high),
              low: Number(r.low),
              close: Number(r.close),
              ts: r.timestamp,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.time - b.time);

        dataRef.current = formatted;
        if (formatted.length) series.setData(formatted);

        

        // after data is set, canvases exist — ensure crisp
        makeCanvasesCrisp()
      } catch (err) {
        console.error("Failed to fetch/format candles:", err);
      } finally {
        setReady(true);
      }
    })();

    // responsive
    const onResize = () => {
      try {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      } catch {}
      // re-apply crisp adjustments after resize
      setTimeout(() => makeCanvasesCrisp(), 20);
    };
    window.addEventListener("resize", onResize);
    onResize();

    // listen for FibTool's async UI update events (FibTool will call it asynchronously)
    const fibModeHandler = (ev) => {
      try {
        const val = ev?.detail;
        setFibModeOn(Boolean(val));

        // Switch crosshair mode automatically
        chartRef.current?.applyOptions({
          crosshair: { mode: 0 },
        });
      } catch {}
    };
    window.addEventListener("fibModeUI", fibModeHandler);

    // session break
    const sessionBreaks = initSessionBreaks({
      container: containerRef.current,
      chart,
      series,
      dataRef, // same ref you already use for candles
    });
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        try {
          chart.timeScale().scrollToRealTime();
          chart.priceScale("right").applyOptions({ autoScale: true });
          
        } catch {}
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // cleanup
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("fibModeUI", fibModeHandler);
      window.removeEventListener("keydown", handleKeyDown);
      try {
        chart.remove();
        sessionBreaks?.destroy();
      } catch {}
      
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={containerRef} className="chart-container" />
      {ready && chartRef.current && seriesRef.current && (
        <>
          {/* OHLC reads from dataRef (nearest candle) — robust for v3 */}
          <OHLCBox chart={chartRef.current} series={seriesRef.current} dataRef={dataRef} />

          {/* FibTool gets containerRef + dataRef so it can draw overlays and find nearest candles */}
          <FibTool
            chart={chartRef.current}
            series={seriesRef.current}
            containerRef={containerRef}
            dataRef={dataRef}
            oldestTime={metaRef.current.oldest}
            latestTime={metaRef.current.latest}
          />
          <RangeMeasure chart={chartRef.current} series={seriesRef.current} containerRef={containerRef} dataRef={dataRef} />
          <div className="controls" aria-hidden>
            <div className={fibModeOn ? "fib-indicator on" : "fib-indicator off"}>
              {fibModeOn ? "Fib Mode (Alt+F ON)" : "Press Alt+F for Fib"}
            </div>
          </div>
          <GoToDate chart={chartRef.current} dataRef={dataRef} containerRef={containerRef}/>
        </>
      )}
    </>
  );
}
