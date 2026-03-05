// src/ShapeTool.js
import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * ShapeTool - v2 (fixed)
 * - Left-click in Shape Mode (press T) -> add marker (saved to backend; falls back to local)
 * - Click a marker when not in Shape Mode -> shows small Delete popup near click
 * - Delete popup removes marker from backend & UI
 * - Normalizes times to integer seconds to avoid disappearing on zoom
 *
 * Props:
 * - chart, series, containerRef, oldestTime, latestTime
 */
export default function ShapeTool({ chart, series, containerRef, oldestTime, latestTime }) {
  const markersRef = useRef([]); // canonical marker array
  const [shapeMode, setShapeMode] = useState(false);
  const [, setLogs] = useState([]);
  const [selectedMarkerUI, setSelectedMarkerUI] = useState(null); // { marker, x, y }

  const addLog = useCallback((msg, type = "info") => {
    setLogs((prev) => {
      const entry = { msg, type, ts: new Date().toLocaleTimeString() };
      return [entry, ...prev].slice(0, 8);
    });
    if (type === "error") console.error(msg);
    else console.log(msg);
  }, []);

  // Normalize incoming marker record -> ensure `time` is integer seconds and epoch is ms integer
  const normalizeMarker = useCallback((m) => {
    if (!m) return null;
    const out = { ...m };
    // Prefer explicit time number; fall back to epoch
    let t = Number(out.time);
    if (!Number.isFinite(t) && out.epoch) t = Number(out.epoch);
    if (!Number.isFinite(t)) return null;

    // If looks like ms (>= 1e12 or > 1e10), convert to seconds
    if (t > 1e12) out.time = Math.round(t / 1000);
    else if (t > 1e10) out.time = Math.round(t / 1000);
    else out.time = Math.round(t);

    out.epoch = Math.round(Number(out.time) * 1000);
    out.id = out.id ?? `shape-temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    // keep other fields (color, shape, etc.)
    return out;
  }, []);

  // Persist local backup to localStorage (fast)
  const persistMarkersLocal = useCallback(() => {
    try {
      localStorage.setItem("shapes", JSON.stringify(markersRef.current));
    } catch (e) {}
  }, []);

  // Load shapes from backend (or local fallback). Dependencies included so eslint is quiet.
  useEffect(() => {
    if (!chart || !series) return;
    let cancelled = false;

    (async () => {
      try {
        const url = `http://127.0.0.1:8000/api/shapes?start_time=${oldestTime ?? 0}&end_time=${latestTime ?? 0}`;
        const res = await fetch(url);
        if (!res.ok) {
          addLog(`⚠️ Load shapes HTTP ${res.status}`, "warn");
          // try localStorage fallback
          const saved = JSON.parse(localStorage.getItem("shapes") || "[]");
          if (Array.isArray(saved)) {
            markersRef.current = saved.map(normalizeMarker).filter(Boolean);
            series.setMarkers([...markersRef.current]);
            addLog(`⚠️ Loaded ${markersRef.current.length} shapes from localStorage`, "warn");
          }
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          addLog("⚠️ Shapes payload not an array", "warn");
          return;
        }
        if (cancelled) return;
        markersRef.current = data.map(normalizeMarker).filter(Boolean);
        series.setMarkers([...markersRef.current]);
        persistMarkersLocal();
        addLog(`✅ Loaded ${markersRef.current.length} shapes`);
      } catch (err) {
        addLog("❌ Failed to load shapes: " + (err.message || err), "error");
        // try local fallback
        try {
          const saved = JSON.parse(localStorage.getItem("shapes") || "[]");
          markersRef.current = Array.isArray(saved) ? saved.map(normalizeMarker).filter(Boolean) : [];
          series.setMarkers([...markersRef.current]);
          if (markersRef.current.length) addLog(`⚠️ Loaded ${markersRef.current.length} shapes from localStorage`, "warn");
        } catch (_) {}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, series, oldestTime, latestTime, normalizeMarker, persistMarkersLocal, addLog]);

  // Keyboard toggle (T / Escape)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "t" || e.key === "T") {
        setShapeMode(true);
        addLog("🟠 Shape mode enabled");
      } else if (e.key === "Escape") {
        setShapeMode(false);
        setSelectedMarkerUI(null);
        addLog("⬛ Shape mode disabled");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addLog]);

  // Single chart click handler does both add (when shapeMode) and select (when not)
  useEffect(() => {
    if (!chart || !series) return;

    const handleChartClick = async (param) => {
      if (!param || !param.time) return;
      const clickedTime = Math.round(Number(param.time));

      // ADD mode
      if (shapeMode) {
        const newShape = {
          time: clickedTime,
          epoch: Math.round(clickedTime * 1000),
          position: "aboveBar",
          color: "#faad14",
          shape: "circle",
          text: "",
        };

        // POST to backend
        try {
          const res = await fetch("http://127.0.0.1:8000/api/shapes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newShape),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} ${txt}`);
          }
          const saved = await res.json();
          const normalized = normalizeMarker(saved) ?? normalizeMarker(newShape);
          markersRef.current.push(normalized);
          series.setMarkers([...markersRef.current]);
          persistMarkersLocal();
          addLog(`💾 Shape saved @ ${normalized.time}`);
        } catch (err) {
          // fallback: add locally with temp id
          const tmp = normalizeMarker({ ...newShape, id: `shape-temp-${Date.now()}` });
          markersRef.current.push(tmp);
          series.setMarkers([...markersRef.current]);
          persistMarkersLocal();
          addLog("❌ Save failed, added locally: " + (err.message || err), "error");
        }
        return;
      }

      // SELECT / show Delete UI when not in shape mode
      // find nearest marker by exact time equality or +/-1 second tolerance
      const found = markersRef.current.find((m) => Math.abs(Number(m.time) - clickedTime) <= 1);
      if (!found) {
        setSelectedMarkerUI(null);
        return;
      }

      // compute screen location for popup: use param.point if present
      const rect = (containerRef && containerRef.current) ? containerRef.current.getBoundingClientRect() : document.body.getBoundingClientRect();
      const xChart = (param.point && typeof param.point.x === "number") ? param.point.x : (chart.timeScale().timeToCoordinate(found.time) || 0);
      const yChart = (param.point && typeof param.point.y === "number") ? param.point.y : 24;

      setSelectedMarkerUI({
        marker: found,
        x: Math.round(rect.left + xChart),
        y: Math.round(rect.top + yChart),
      });
    };

    chart.subscribeClick(handleChartClick);
    return () => {
      try { chart.unsubscribeClick(handleChartClick); } catch (e) {}
    };
  }, [chart, series, shapeMode, containerRef, normalizeMarker, persistMarkersLocal, addLog]);

  // Delete handler
  const handleDeleteMarker = useCallback(async (marker) => {
    if (!marker) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/shapes/${marker.id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }
      markersRef.current = markersRef.current.filter((m) => m.id !== marker.id);
      series.setMarkers([...markersRef.current]);
      persistMarkersLocal();
      addLog(`🗑️ Deleted shape ID ${marker.id}`);
    } catch (err) {
      addLog("❌ Delete failed: " + (err.message || err), "error");
    } finally {
      setSelectedMarkerUI(null);
    }
  }, [series, persistMarkersLocal, addLog]);

  // UI
  return (
    <>
      {/* status badge */}
      <div style={{
        position: "absolute",
        top: 106,
        right: 12,
        background: shapeMode ? "#faad14" : "#444",
        color: "white",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontFamily: "monospace",
        zIndex: 1200,
      }}>
        {shapeMode ? "🟠 Shape Mode (T to toggle)" : "Press T to draw"}
      </div>

      {/* debug log */}
      {/* <div style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        width: 320,
        maxHeight: 160,
        overflowY: "auto",
        background: "rgba(0,0,0,0.6)",
        color: "#eee",
        fontSize: 12,
        fontFamily: "monospace",
        padding: 8,
        borderRadius: 8,
        zIndex: 1200,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: "#9ff" }}>🧠 ShapeTool Log</div>
        {logs.map((l, i) => (
          <div key={i} style={{ marginBottom: 4, color: l.type === "error" ? "#f88" : l.type === "warn" ? "#ffb84d" : "#bfe" }}>
            [{l.ts}] {l.msg}
          </div>
        ))}
      </div> */}

      {/* Delete popup */}
      {selectedMarkerUI && (
        <div style={{
          position: "absolute",
          left: selectedMarkerUI.x,
          top: selectedMarkerUI.y,
          transform: "translate(-50%, -140%)",
          zIndex: 2000,
          pointerEvents: "auto",
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleDeleteMarker(selectedMarkerUI.marker)} style={{
              background: "#ff4d4f",
              color: "#fff",
              border: "none",
              padding: "8px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
            }}>Delete</button>
          </div>
        </div>
      )}
    </>
  );
}
