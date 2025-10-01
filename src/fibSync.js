// src/fibSync.js
import React, { useState, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000/api/fibs";

let setStatusGlobal = null;
let retryFnGlobal = null;
let hideTimer = null;

/** Small status UI you already had — unchanged shape but improved behavior */
export function FibStatusUI() {
  const [status, setStatus] = useState(null);
  const [retryFn, setRetryFn] = useState(null);

  useEffect(() => {
    setStatusGlobal = setStatus;
    retryFnGlobal = setRetryFn;
    return () => {
      setStatusGlobal = null;
      retryFnGlobal = null;
    };
  }, []);

  if (!status) return null;

  const { msg, kind } = status;
  const bg = kind === "error" ? "#ff4d4f" : kind === "info" ? "#1890ff" : "#52c41a";

  return (
    <div
      onClick={() => {
        if (retryFn) 
          {
            setStatus(null);
            setRetryFn(null);
            const fn = retryFn(); // retryFn here is () => actualFn
            if (fn) fn();         // now run the stored retry function    

          }
      }}
      style={{
        position: "absolute",
        top: 50,
        right: 20,
        background: bg,
        color: "#fff",
        padding: "8px 12px",
        borderRadius: "6px",
        fontSize: "13px",
        cursor: retryFn ? "pointer" : "default",
        zIndex: 5000,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {msg}
    </div>
  );
}

/** showStatus:
 *  - kind: "info" | "success" | "error"
 *  - if kind === "error", UI stays until user retries (no auto-hide)
 *  - if kind === "info" or "success", auto-hide after 5s
 */
function showStatus(msg, kind = "info", retryFn = null) {
  if (!setStatusGlobal) return;
  // clear any previous timer
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  setStatusGlobal({ msg, kind });
  // FIX: store retryFn as value, not execute immediately
  if (retryFn) {
    retryFnGlobal(() => retryFn);
  } else {
    retryFnGlobal(null);
  }

  // auto-hide for non-error statuses
  if (kind !== "error") {
    setTimeout(() => {
      if (setStatusGlobal) {
        setStatusGlobal(null);
        retryFnGlobal(() => null);
      }
      hideTimer = null;   
    }, 5000);
  }
}

/** CREATE: returns saved object on success, null on failure.
 *  Note: caller should not pass DOM elements (overlayCanvas) or circular objects.
 */
export async function syncCreate(fib) {
  showStatus("Saving fib…", "info");
  try {
    // Prepare payload (strip DOM elements or internal-only props if any)
    const payload = {
      // send only the serializable fields the server expects
      startTime: fib.startTime,
      endTime: fib.endTime,
      high: fib.high,
      low: fib.low,
      isDowntrend: Boolean(fib.isDowntrend),
      levels: Array.isArray(fib.levels) ? fib.levels : [],
      showLabels: !!fib.showLabels,
      showPrices: !!fib.showPrices,
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Failed to save");
      throw new Error(text || "Failed to save");
    }

    const saved = await res.json();
    showStatus("Fib saved ✅", "success");
    return saved;
  } catch (err) {
    console.error("syncCreate error:", err);
    showStatus("❌ Failed to save fib (click to retry)", "error", () => syncCreate(fib));
    return null;
  }
}

/** UPDATE: returns saved object or null */
export async function syncUpdate(fib) {
  showStatus("Updating fib…", "info");
  try {
    const payload = {
      startTime: fib.startTime,
      endTime: fib.endTime,
      high: fib.high,
      low: fib.low,
      isDowntrend: Boolean(fib.isDowntrend),
      levels: Array.isArray(fib.levels) ? fib.levels : [],
      showLabels: !!fib.showLabels,
      showPrices: !!fib.showPrices,
    };
    const res = await fetch(`${API_URL}/${encodeURIComponent(fib.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Failed to update");
      throw new Error(text || "Failed to update");
    }
    const saved = await res.json();
    showStatus("Fib updated ✅", "success");
    return saved;
  } catch (err) {
    console.error("syncUpdate error:", err);
    showStatus("❌ Failed to update fib (click to retry)", "error", () => syncUpdate(fib));
    return null;
  }
}

/** DELETE: returns true on success, false on failure */
export async function syncDelete(id) {
  showStatus("Deleting fib…", "info");
  try {
    const res = await fetch(`${API_URL}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text().catch(() => "Failed to delete");
      throw new Error(text || "Failed to delete");
    }
    showStatus("Fib deleted 🗑️", "success");
    return true;
  } catch (err) {
    console.error("syncDelete error:", err);
    showStatus("❌ Failed to delete fib (click to retry)", "error", () => syncDelete(id));
    return false;
  }
}


