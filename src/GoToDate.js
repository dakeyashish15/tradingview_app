// // src/GoToDate.js
// import React, { useState, useEffect, useRef, useCallback } from "react";
// import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
// import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
// import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
// import IconButton from "@mui/material/IconButton";
// import EventIcon from "@mui/icons-material/Event";
// import Modal from "@mui/material/Modal";
// import Box from "@mui/material/Box";
// import { ThemeProvider, createTheme } from "@mui/material/styles";

// const darkTheme = createTheme({
//   palette: {
//     mode: "dark",
//     background: { paper: "#121212" },
//     text: { primary: "#ffffff", secondary: "#BBBBBB" },
//     primary: { main: "#1976d2" },
//   },
// });

// const STORAGE_KEY = "GoToDate:lastSelectedSession";
// const FLOAT_ICON_STYLE = { position: "fixed", bottom: 16, left: 16, zIndex: 2147483647 };
// const EVENT_ICON_SX = { fontSize: 32, color: "#aaa" };

// const LABEL_BASE_STYLE = {
//   position: "absolute",
//   pointerEvents: "none",
//   transform: "translate(-50%, 60%)",
//   background: "rgba(25,118,210,0.95)",
//   color: "#ffffff",
//   padding: "6px 10px",
//   borderRadius: "8px",
//   fontFamily: "monospace",
//   fontSize: "12px",
//   whiteSpace: "nowrap",
//   zIndex: 2147483647,
//   boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
// };

// const calendarWrapperSx = {
//   "& .MuiCalendarPicker-root": { bgcolor: "background.paper", color: "text.primary", borderRadius: 1, p: 1 },
//   "& .MuiPickersCalendarHeader-label": { color: "#ffffff", fontWeight: 600, fontSize: "1rem" },
//   "& .MuiPickersCalendarHeader-iconButton": { color: "#ffffff", opacity: 0.9 },
//   "& .MuiDayCalendar-weekDayLabel": { color: "#cfcfcf" },
//   "& .MuiPickersDay-root": { color: "#e6e6e6" },
//   "& .Mui-selected": { bgcolor: "primary.main !important", color: "white !important" },
//   "& .MuiPickersDay-today": { borderColor: "rgba(255,255,255,0.12)" },
//   "& .Mui-disabled": { color: "rgba(255,255,255,0.12) !important" },
//   "& .MuiYearCalendar-root .MuiPickersYear-root:not(.Mui-disabled)": { color: "#ffffff", fontWeight: 500 },
//   "& .MuiYearCalendar-root .MuiPickersYear-root.Mui-disabled": { color: "rgba(255,255,255,0.38) !important" },
//   "& .MuiMonthCalendar-root .MuiPickersMonth-root:not(.Mui-disabled)": { color: "#ffffff" },
//   "& .MuiMonthCalendar-root .MuiPickersMonth-root.Mui-disabled": { color: "rgba(255,255,255,0.38) !important" },
// };

// export default function GoToDate({ chart, dataRef, containerRef }) {
//   const [open, setOpen] = useState(false);
//   const [selectedDate, setSelectedDate] = useState(null);

//   const tempLabelRef = useRef(null);
//   const visibleSubRef = useRef(null);
//   const clickUnsubRef = useRef(null);
//   const autoClearTimerRef = useRef(null);

//   // memoized availability sets and the array they were built for
//   const availabilityRef = useRef({ builtForRef: null, builtForLen: -1, sets: null });

//   // load remembered date from sessionStorage (per-tab)
//   useEffect(() => {
//     try {
//       const s = sessionStorage.getItem(STORAGE_KEY);
//       if (s) {
//         const d = new Date(s);
//         if (!Number.isNaN(d.getTime())) setSelectedDate(d);
//       }
//     } catch (e) {
//       // ignore silently
//     }
//     // run once
//   }, []);

//   // keyboard shortcut Alt+G to open
//   useEffect(() => {
//     const onKey = (e) => {
//       if (e.altKey && e.key.toLowerCase() === "g") {
//         e.preventDefault();
//         setOpen(true);
//       }
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, []);

//   // lazy build availability, memoized by array reference+length
//   const buildAvailabilityIfNeeded = useCallback(() => {
//     const arr = dataRef?.current ?? [];
//     if (availabilityRef.current.builtForRef === arr && availabilityRef.current.builtForLen === arr.length && availabilityRef.current.sets) {
//       return availabilityRef.current.sets;
//     }

//     const days = new Set();
//     const months = new Set();
//     const years = new Set();

//     for (let i = 0, len = arr.length; i < len; i++) {
//       const c = arr[i];
//       if (!c) continue;
//       let ms = NaN;
//       const t = c.time;
//       if (t !== undefined && t !== null && t !== "" && !Number.isNaN(Number(t))) {
//         ms = Number(t) * 1000;
//       } else if (c.ts) {
//         const parsed = Date.parse(String(c.ts).replace(" ", "T"));
//         if (!Number.isNaN(parsed)) ms = parsed;
//       }
//       if (Number.isNaN(ms)) continue;
//       const d = new Date(ms);
//       if (Number.isNaN(d.getTime())) continue;
//       const Y = d.getFullYear();
//       const M = String(d.getMonth() + 1).padStart(2, "0");
//       const D = String(d.getDate()).padStart(2, "0");
//       days.add(`${Y}-${M}-${D}`);
//       months.add(`${Y}-${M}`);
//       years.add(Y);
//     }

//     availabilityRef.current = { builtForRef: arr, builtForLen: arr.length, sets: { availableDays: days, availableMonths: months, availableYears: years } };
//     return availabilityRef.current.sets;
//   }, [dataRef]);

//   useEffect(() => {
//     if (open) buildAvailabilityIfNeeded();
//   }, [open, buildAvailabilityIfNeeded]);

//   const removeTempLabel = useCallback(() => {
//     if (autoClearTimerRef.current) {
//       clearTimeout(autoClearTimerRef.current);
//       autoClearTimerRef.current = null;
//     }

//     const t = tempLabelRef.current;
//     if (t?.el && t.el.parentNode) {
//       try { t.el.parentNode.removeChild(t.el); } catch {}
//     }
//     tempLabelRef.current = null;

//     if (visibleSubRef.current && typeof visibleSubRef.current.unsubscribe === "function") {
//       try { visibleSubRef.current.unsubscribe(); } catch {}
//     } else if (typeof visibleSubRef.current === "function") {
//       try { visibleSubRef.current(); } catch {}
//     }
//     visibleSubRef.current = null;

//     if (clickUnsubRef.current && chart && typeof chart.unsubscribeClick === "function") {
//       try { chart.unsubscribeClick(clickUnsubRef.current); } catch {}
//     }
//     clickUnsubRef.current = null;
//   }, [chart]);

//   const createTempLabel = useCallback((candle) => {
//     removeTempLabel();
//     if (!containerRef?.current || !chart || !candle) return;

//     const root = containerRef.current;
//     const label = document.createElement("div");
//     Object.assign(label.style, LABEL_BASE_STYLE);

//     const dt = candle.ts ? new Date(String(candle.ts).replace(" ", "T")) : new Date(Number(candle.time) * 1000);
//     const dateText = Number.isFinite(dt.getTime()) ? dt.toLocaleDateString() : "";
//     const timeText = Number.isFinite(dt.getTime()) ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
//     label.textContent = `📍 ${dateText} ${timeText}`;

//     root.appendChild(label);
//     tempLabelRef.current = { el: label, candle };

//     const positionLabel = () => {
//       if (!tempLabelRef.current?.el) return;
//       const { el, candle } = tempLabelRef.current;
//       let x = NaN;
//       let y = 20;
//       try {
//         const tScale = chart.timeScale();
//         if (tScale && typeof tScale.timeToCoordinate === "function") x = tScale.timeToCoordinate(candle.time);
//       } catch {}
//       try {
//         const priceScaleFunc = chart.priceScale ? chart.priceScale("right") : chart.priceScale;
//         if (priceScaleFunc && typeof priceScaleFunc.priceToCoordinate === "function") y = priceScaleFunc.priceToCoordinate(Number(candle.high));
//         else if (typeof chart.priceToCoordinate === "function") y = chart.priceToCoordinate(Number(candle.high));
//       } catch {}
//       if (isFinite(x) && isFinite(y)) {
//         el.style.left = `${x}px`;
//         el.style.top = `${y - 12}px`;
//         el.style.display = "block";
//       } else el.style.display = "none";
//     };

//     // best-effort subscribe; store whatever unsubscribe is returned
//     try { visibleSubRef.current = chart.timeScale().subscribeVisibleLogicalRangeChange(positionLabel); } catch (e1) {
//       try { visibleSubRef.current = chart.timeScale().subscribeVisibleTimeRangeChange(positionLabel); } catch {}
//     }

//     try {
//       const onClick = () => removeTempLabel();
//       clickUnsubRef.current = onClick;
//       if (chart && typeof chart.subscribeClick === "function") chart.subscribeClick(onClick);
//     } catch {}

//     positionLabel();
//     autoClearTimerRef.current = setTimeout(() => removeTempLabel(), 8000);
//   }, [chart, containerRef, removeTempLabel]);

//   const findFiveThirtyIndex = useCallback((arr, dateObj) => {
//     if (!arr || arr.length === 0 || !dateObj) return -1;
//     const targetLocal = new Date(dateObj);
//     // keep the original semantics (use the same hour that caller expects)
//     targetLocal.setHours(11, 0, 0, 0);
//     const targetMs = targetLocal.getTime();

//     const getMs = (i) => {
//       const c = arr[i];
//       if (!c) return NaN;
//       const t = c.time;
//       if (t !== undefined && t !== null && t !== "" && !Number.isNaN(Number(t))) return Number(t) * 1000;
//       if (c.ts) {
//         const parsed = Date.parse(String(c.ts).replace(" ", "T"));
//         if (!Number.isNaN(parsed)) return parsed;
//       }
//       return NaN;
//     };

//     let lo = 0, hi = arr.length - 1, best = -1, bestDiff = Infinity;
//     while (lo <= hi) {
//       const mid = (lo + hi) >> 1;
//       const ms = getMs(mid);
//       if (Number.isNaN(ms)) {
//         // small local linear window around mid
//         const window = 8;
//         for (let k = Math.max(0, mid - window), end = Math.min(arr.length - 1, mid + window); k <= end; k++) {
//           const ms2 = getMs(k);
//           if (!Number.isNaN(ms2)) {
//             const diff = Math.abs(ms2 - targetMs);
//             if (diff < bestDiff) { bestDiff = diff; best = k; }
//             if (ms2 === targetMs) return k;
//           }
//         }
//         break;
//       }
//       const diff = ms - targetMs;
//       const absDiff = Math.abs(diff);
//       if (absDiff < bestDiff) { bestDiff = absDiff; best = mid; }
//       if (ms === targetMs) return mid;
//       if (ms < targetMs) lo = mid + 1; else hi = mid - 1;
//     }
//     if (best >= 0) return best;

//     // fallback to ends
//     try {
//       const ms0 = getMs(0), ms1 = getMs(arr.length - 1);
//       if (!Number.isNaN(ms0) && !Number.isNaN(ms1)) return Math.abs(ms0 - targetMs) <= Math.abs(ms1 - targetMs) ? 0 : arr.length - 1;
//     } catch {}
//     return -1;
//   }, []);

//   const handleGo = useCallback((date) => {
//     if (!chart || !dataRef?.current || !containerRef?.current || !date) return;
//     const arr = dataRef.current;
//     if (!arr || arr.length === 0) return;

//     const idx = findFiveThirtyIndex(arr, date);
//     if (idx < 0) return;
//     const candle = arr[idx];

//     let span = null;
//     try {
//       const vr = chart.timeScale().getVisibleRange?.();
//       if (vr && vr.from != null && vr.to != null) span = Number(vr.to) - Number(vr.from);
//     } catch {}

//     if (span == null) {
//       try {
//         const vlr = chart.timeScale().getVisibleLogicalRange?.();
//         if (vlr && vlr.from != null && vlr.to != null && arr.length > 3) {
//           const idxFrom = Math.max(0, Math.floor(Number(vlr.from)));
//           const idxTo = Math.min(arr.length - 1, Math.ceil(Number(vlr.to)));
//           const tFrom = Number(arr[idxFrom]?.time ?? arr[0]?.time);
//           const tTo = Number(arr[idxTo]?.time ?? arr[arr.length - 1]?.time);
//           if (Number.isFinite(tFrom) && Number.isFinite(tTo) && tTo > tFrom) span = tTo - tFrom;
//         }
//       } catch {}
//     }

//     if (span == null) {
//       try {
//         const lastIdx = arr.length - 1;
//         const a = Math.max(0, lastIdx - 100);
//         const tFrom = Number(arr[a]?.time ?? arr[0]?.time);
//         const tTo = Number(arr[lastIdx]?.time ?? arr[arr.length - 1]?.time);
//         if (Number.isFinite(tFrom) && Number.isFinite(tTo) && tTo > tFrom) span = Math.max(1, tTo - tFrom);
//       } catch {}
//     }

//     try {
//       if (span && Number.isFinite(span) && span > 0) {
//         const from = Number(candle.time) - span / 2;
//         const to = Number(candle.time) + span / 2;
//         try {
//           if (typeof chart.timeScale().setVisibleRange === "function") chart.timeScale().setVisibleRange({ from, to });
//           else {
//             const vlr = chart.timeScale().getVisibleLogicalRange?.();
//             if (vlr && vlr.from != null && vlr.to != null) {
//               const spanIdx = vlr.to - vlr.from;
//               const newFromIdx = Math.max(0, idx - Math.floor(spanIdx / 2));
//               const newToIdx = Math.min(arr.length - 1, idx + Math.floor(spanIdx / 2));
//               chart.timeScale().setVisibleLogicalRange?.({ from: newFromIdx, to: newToIdx });
//             }
//           }
//         } catch {}
//       } else {
//         try {
//           const vlr = chart.timeScale().getVisibleLogicalRange?.();
//           if (vlr && vlr.from != null && vlr.to != null) {
//             const spanIdx = vlr.to - vlr.from;
//             const newFromIdx = Math.max(0, idx - Math.floor(spanIdx / 2));
//             const newToIdx = Math.min(arr.length - 1, idx + Math.floor(spanIdx / 2));
//             chart.timeScale().setVisibleLogicalRange?.({ from: newFromIdx, to: newToIdx });
//           }
//         } catch {}
//       }
//     } catch (err) {
//       // console.error omitted for perf/noise in hot paths
//     }

//     createTempLabel(candle);
//   }, [chart, dataRef, containerRef, createTempLabel, findFiveThirtyIndex]);

//   const onCalendarChange = useCallback((newDate) => {
//     setOpen(false);
//     if (!newDate) return;
//     try { sessionStorage.setItem(STORAGE_KEY, newDate.toISOString()); } catch {}
//     setSelectedDate(newDate);
//     // schedule centering at next paint (lightweight)
//     if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
//       window.requestAnimationFrame(() => handleGo(newDate));
//     } else {
//       setTimeout(() => handleGo(newDate), 0);
//     }
//   }, [handleGo]);

//   useEffect(() => () => { removeTempLabel(); }, [removeTempLabel]);

//   const shouldDisableYear = useCallback((yearDate) => {
//     const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
//     return !sets.availableYears.has(yearDate.getFullYear());
//   }, [buildAvailabilityIfNeeded]);

//   const shouldDisableMonth = useCallback((monthDate) => {
//     const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
//     const y = monthDate.getFullYear();
//     const m = String(monthDate.getMonth() + 1).padStart(2, "0");
//     return !sets.availableMonths.has(`${y}-${m}`);
//   }, [buildAvailabilityIfNeeded]);

//   const shouldDisableDate = useCallback((dt) => {
//     const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
//     const y = dt.getFullYear();
//     const m = String(dt.getMonth() + 1).padStart(2, "0");
//     const d = String(dt.getDate()).padStart(2, "0");
//     return !sets.availableDays.has(`${y}-${m}-${d}`);
//   }, [buildAvailabilityIfNeeded]);

//   return (
//     <ThemeProvider theme={darkTheme}>
//       <div style={FLOAT_ICON_STYLE}>
//         <IconButton size="large" onClick={() => setOpen(true)} aria-label="Open date picker">
//           <EventIcon sx={EVENT_ICON_SX} />
//         </IconButton>
//       </div>

//       <Modal open={open} onClose={() => setOpen(false)}>
//         <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", bgcolor: "background.paper", p: 1, borderRadius: 2, boxShadow: 24, minWidth: 300, maxWidth: 420 }}>
//           <LocalizationProvider dateAdapter={AdapterDateFns}>
//             <Box sx={calendarWrapperSx}>
//               <DateCalendar
//                 disableFuture
//                 views={["year", "month", "day"]}
//                 value={selectedDate}
//                 onChange={onCalendarChange}
//                 displayWeekNumber={false}
//                 shouldDisableYear={shouldDisableYear}
//                 shouldDisableMonth={shouldDisableMonth}
//                 shouldDisableDate={shouldDisableDate}
//               />
//             </Box>
//           </LocalizationProvider>
//         </Box>
//       </Modal>
//     </ThemeProvider>
//   );
// }

// // ashish

// src/GoToDate.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import IconButton from "@mui/material/IconButton";
import EventIcon from "@mui/icons-material/Event";
import Modal from "@mui/material/Modal";
import Box from "@mui/material/Box";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    background: { paper: "#121212" },
    text: { primary: "#ffffff", secondary: "#BBBBBB" },
    primary: { main: "#1976d2" },
  },
});

const STORAGE_KEY = "GoToDate:lastSelectedSession";
const FLOAT_ICON_STYLE = { position: "fixed", bottom: 16, left: 16, zIndex: 2147483647 };
const EVENT_ICON_SX = { fontSize: 32, color: "#aaa" };

const LABEL_BASE_STYLE = {
  position: "absolute",
  pointerEvents: "none",
  transform: "translate(-50%, 60%)",
  background: "rgba(25,118,210,0.95)",
  color: "#ffffff",
  padding: "6px 10px",
  borderRadius: "8px",
  fontFamily: "monospace",
  fontSize: "12px",
  whiteSpace: "nowrap",
  zIndex: 2147483647,
  boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
};

const calendarWrapperSx = {
  "& .MuiCalendarPicker-root": { bgcolor: "background.paper", color: "text.primary", borderRadius: 1, p: 1 },
  "& .MuiPickersCalendarHeader-label": { color: "#ffffff", fontWeight: 600, fontSize: "1rem" },
  "& .MuiPickersCalendarHeader-iconButton": { color: "#ffffff", opacity: 0.9 },
  "& .MuiDayCalendar-weekDayLabel": { color: "#cfcfcf" },
  "& .MuiPickersDay-root": { color: "#e6e6e6" },
  "& .Mui-selected": { bgcolor: "primary.main !important", color: "white !important" },
  "& .MuiPickersDay-today": { borderColor: "rgba(255,255,255,0.12)" },
  "& .Mui-disabled": { color: "rgba(255,255,255,0.12) !important" },
  "& .MuiYearCalendar-root .MuiPickersYear-root:not(.Mui-disabled)": { color: "#ffffff", fontWeight: 500 },
  "& .MuiYearCalendar-root .MuiPickersYear-root.Mui-disabled": { color: "rgba(255,255,255,0.38) !important" },
  "& .MuiMonthCalendar-root .MuiPickersMonth-root:not(.Mui-disabled)": { color: "#ffffff" },
  "& .MuiMonthCalendar-root .MuiPickersMonth-root.Mui-disabled": { color: "rgba(255,255,255,0.38) !important" },
};

export default function GoToDate({ chart, dataRef, containerRef }) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const tempLabelRef = useRef(null);
  const visibleSubRef = useRef(null);
  const clickUnsubRef = useRef(null);
  const autoClearTimerRef = useRef(null);

  // memoized availability, keyed by array reference & length (fast guards)
  const availabilityRef = useRef({ builtForRef: null, builtForLen: -1, sets: null });

  // ---------- load remembered date (sessionStorage + history.state fallback) ----------
  useEffect(() => {
    try {
      let parsed = null;

      // 1️⃣ Check URL param (?gotoDate=YYYY-MM-DD)
      const params = new URLSearchParams(window.location.search);
      const gotoDate = params.get("gotoDate");
      if (gotoDate) {
        const d = new Date(gotoDate);
        if (!Number.isNaN(d.getTime())) {
          parsed = d;
        }
      }

      // 2️⃣ If no URL param, try restoring from history.state or sessionStorage
      if (!parsed) {
        const hs =
          (typeof window !== "undefined" && window.history && window.history.state) ||
          null;
        if (hs && hs[STORAGE_KEY]) {
          const d = new Date(hs[STORAGE_KEY]);
          if (!Number.isNaN(d.getTime())) parsed = d;
        }
      }

      if (!parsed) {
        const s = sessionStorage.getItem(STORAGE_KEY);
        if (s) {
          const d = new Date(s);
          if (!Number.isNaN(d.getTime())) parsed = d;
        }
      }

      // 3️⃣ Apply if valid
      if (parsed) {
        setSelectedDate(parsed);

        // sync sessionStorage + history.state
        sessionStorage.setItem(STORAGE_KEY, parsed.toISOString());
        try {
          const newS = Object.assign({}, window.history.state || {}, {
            [STORAGE_KEY]: parsed.toISOString(),
          });
          window.history.replaceState(newS, "");
        } catch (e) {
          console.warn("Failed to replaceState", e);
        }

        // If URL param was used, trigger handleGo automatically
        if (gotoDate) {
          const timer = setTimeout(() => handleGo(parsed), 500);
          return () => clearTimeout(timer);
        }
      }
    } catch (e) {
      console.warn("Failed to initialize GoToDate", e);
    }
    // Run only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // keyboard shortcut Alt+G to open
  useEffect(() => {
    const onKey = (e) => {
      try {
        if (e.altKey && e.key && e.key.toLowerCase() === "g") {
          e.preventDefault();
          setOpen(true);
        }
      } catch {}
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- lazy build availability (memoized) ----------
  const buildAvailabilityIfNeeded = useCallback(() => {
    const arr = dataRef?.current ?? [];
    if (availabilityRef.current.builtForRef === arr && availabilityRef.current.builtForLen === arr.length && availabilityRef.current.sets) {
      return availabilityRef.current.sets;
    }

    const days = new Set();
    const months = new Set();
    const years = new Set();

    // micro-optimized loop: avoid extra allocations
    for (let i = 0, len = arr.length; i < len; i++) {
      const c = arr[i];
      if (!c) continue;
      let ms = NaN;
      const t = c.time;
      if (t !== undefined && t !== null && t !== "" && !Number.isNaN(Number(t))) {
        ms = Number(t) * 1000;
      } else if (c.ts) {
        const parsed = Date.parse(String(c.ts).replace(" ", "T"));
        if (!Number.isNaN(parsed)) ms = parsed;
      }
      if (Number.isNaN(ms)) continue;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) continue;
      const Y = d.getFullYear();
      const M = String(d.getMonth() + 1).padStart(2, "0");
      const D = String(d.getDate()).padStart(2, "0");
      days.add(`${Y}-${M}-${D}`);
      months.add(`${Y}-${M}`);
      years.add(Y);
    }

    availabilityRef.current = {
      builtForRef: arr,
      builtForLen: arr.length,
      sets: { availableDays: days, availableMonths: months, availableYears: years },
    };
    return availabilityRef.current.sets;
  }, [dataRef]);

  useEffect(() => {
    if (open) buildAvailabilityIfNeeded();
  }, [open, buildAvailabilityIfNeeded]);

  // ---------- temporary label handling (single node, reposition on rAF) ----------
  const removeTempLabel = useCallback(() => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }

    const t = tempLabelRef.current;
    if (t?.el && t.el.parentNode) {
      try { t.el.parentNode.removeChild(t.el); } catch {}
    }
    tempLabelRef.current = null;

    if (visibleSubRef.current && typeof visibleSubRef.current.unsubscribe === "function") {
      try { visibleSubRef.current.unsubscribe(); } catch {}
    } else if (typeof visibleSubRef.current === "function") {
      try { visibleSubRef.current(); } catch {}
    }
    visibleSubRef.current = null;

    if (clickUnsubRef.current && chart && typeof chart.unsubscribeClick === "function") {
      try { chart.unsubscribeClick(clickUnsubRef.current); } catch {}
    }
    clickUnsubRef.current = null;
  }, [chart]);

  const createTempLabel = useCallback((candle) => {
    removeTempLabel();
    if (!containerRef?.current || !chart || !candle) return;

    const root = containerRef.current;
    const label = document.createElement("div");
    Object.assign(label.style, LABEL_BASE_STYLE);

    const dt = candle.ts ? new Date(String(candle.ts).replace(" ", "T")) : new Date(Number(candle.time) * 1000);
    const dateText = Number.isFinite(dt.getTime()) ? dt.toLocaleDateString() : "";
    const timeText = Number.isFinite(dt.getTime()) ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    label.textContent = `📍 ${dateText} ${timeText}`;

    root.appendChild(label);
    tempLabelRef.current = { el: label, candle };

    const positionLabel = () => {
      if (!tempLabelRef.current?.el) return;
      const { el, candle } = tempLabelRef.current;
      let x = NaN;
      let y = 20;
      try {
        const tScale = chart.timeScale();
        if (tScale && typeof tScale.timeToCoordinate === "function") x = tScale.timeToCoordinate(candle.time);
      } catch {}
      try {
        const priceScaleFunc = chart.priceScale ? chart.priceScale("right") : chart.priceScale;
        if (priceScaleFunc && typeof priceScaleFunc.priceToCoordinate === "function") y = priceScaleFunc.priceToCoordinate(Number(candle.high));
        else if (typeof chart.priceToCoordinate === "function") y = chart.priceToCoordinate(Number(candle.high));
      } catch {}
      if (isFinite(x) && isFinite(y)) {
        el.style.left = `${x}px`;
        el.style.top = `${y - 12}px`;
        el.style.display = "block";
      } else el.style.display = "none";
    };

    // best-effort subscribe; store whatever unsubscribe is returned
    try { visibleSubRef.current = chart.timeScale().subscribeVisibleLogicalRangeChange(positionLabel); } catch (e1) {
      try { visibleSubRef.current = chart.timeScale().subscribeVisibleTimeRangeChange(positionLabel); } catch {}
    }

    try {
      const onClick = () => removeTempLabel();
      clickUnsubRef.current = onClick;
      if (chart && typeof chart.subscribeClick === "function") chart.subscribeClick(onClick);
    } catch {}

    positionLabel();
    autoClearTimerRef.current = setTimeout(() => removeTempLabel(), 8000);
  }, [chart, containerRef, removeTempLabel]);

  // ---------- index finder (preserves your original semantics) ----------
  const findFiveThirtyIndex = useCallback((arr, dateObj) => {
    if (!arr || arr.length === 0 || !dateObj) return -1;
    const targetLocal = new Date(dateObj);
    // keep the original semantics (use the same hour that caller expects)
    targetLocal.setHours(11, 0, 0, 0);
    const targetMs = targetLocal.getTime();

    const getMs = (i) => {
      const c = arr[i];
      if (!c) return NaN;
      const t = c.time;
      if (t !== undefined && t !== null && t !== "" && !Number.isNaN(Number(t))) return Number(t) * 1000;
      if (c.ts) {
        const parsed = Date.parse(String(c.ts).replace(" ", "T"));
        if (!Number.isNaN(parsed)) return parsed;
      }
      return NaN;
    };

    let lo = 0, hi = arr.length - 1, best = -1, bestDiff = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const ms = getMs(mid);
      if (Number.isNaN(ms)) {
        // small local linear window around mid
        const window = 8;
        for (let k = Math.max(0, mid - window), end = Math.min(arr.length - 1, mid + window); k <= end; k++) {
          const ms2 = getMs(k);
          if (!Number.isNaN(ms2)) {
            const diff = Math.abs(ms2 - targetMs);
            if (diff < bestDiff) { bestDiff = diff; best = k; }
            if (ms2 === targetMs) return k;
          }
        }
        break;
      }
      const diff = ms - targetMs;
      const absDiff = Math.abs(diff);
      if (absDiff < bestDiff) { bestDiff = absDiff; best = mid; }
      if (ms === targetMs) return mid;
      if (ms < targetMs) lo = mid + 1; else hi = mid - 1;
    }
    if (best >= 0) return best;

    // fallback to ends
    try {
      const ms0 = getMs(0), ms1 = getMs(arr.length - 1);
      if (!Number.isNaN(ms0) && !Number.isNaN(ms1)) return Math.abs(ms0 - targetMs) <= Math.abs(ms1 - targetMs) ? 0 : arr.length - 1;
    } catch {}
    return -1;
  }, []);

  // ---------- price-scale autoscale helper ----------
  // Re-enables autoscale and (when possible) sets a padded visible price range computed from visible candles.
  const ensurePriceScaleFits = useCallback((/* idx may be unused */) => {
    if (!chart || !dataRef?.current) return;
    const tick = () => {
      try {
        const arr = dataRef.current;
        if (!arr || arr.length === 0) return;

        const tScale = chart.timeScale?.();
        const vlr = tScale?.getVisibleLogicalRange?.();
        let fromIdx = 0, toIdx = arr.length - 1;
        if (vlr && Number.isFinite(Number(vlr.from)) && Number.isFinite(Number(vlr.to))) {
          fromIdx = Math.max(0, Math.floor(Number(vlr.from)));
          toIdx = Math.min(arr.length - 1, Math.ceil(Number(vlr.to)));
        } else {
          const last = arr.length - 1;
          fromIdx = Math.max(0, last - 100);
          toIdx = last;
        }

        let min = Infinity, max = -Infinity;
        for (let i = fromIdx; i <= toIdx; i++) {
          const c = arr[i];
          if (!c) continue;
          const low = Number(c.low ?? c.l ?? NaN);
          const high = Number(c.high ?? c.h ?? NaN);
          if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
          if (low < min) min = low;
          if (high > max) max = high;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;

        // small padding to avoid tight clipping
        const rawRange = max - min;
        const pad = rawRange > 0 ? Math.max(rawRange * 0.06, Math.abs(max) * 0.0005) : Math.abs(max) * 0.01 || 1;

        const priceScaleApi = typeof chart.priceScale === "function" ? chart.priceScale("right") : chart.priceScale;
        if (!priceScaleApi) return;

        // re-enable autoscale if supported
        if (typeof priceScaleApi.setAutoScale === "function") {
          try { priceScaleApi.setAutoScale(true); } catch {}
        } else if (typeof priceScaleApi.applyOptions === "function") {
          try { priceScaleApi.applyOptions({ autoScale: true }); } catch {}
        }

        // if priceScale supports explicit visible range, set it with padding
        if (typeof priceScaleApi.setVisibleRange === "function") {
          try {
            // set from = (min - pad), to = (max + pad)
            priceScaleApi.setVisibleRange({ from: (min - pad), to: (max + pad) });
          } catch (e) {
            // ignore failures — different versions may have slightly different semantics
          }
        }
      } catch (e) {
        // ignore any errors silently (best-effort)
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(tick);
    else setTimeout(tick, 0);
  }, [chart, dataRef]);

  // ---------- move view to the candle for a date ----------
  const handleGo = useCallback((date) => {
    if (!chart || !dataRef?.current || !containerRef?.current || !date) return;
    const arr = dataRef.current;
    if (!arr || arr.length === 0) return;

    const idx = findFiveThirtyIndex(arr, date);
    if (idx < 0) return;
    const candle = arr[idx];

    let span = null;
    try {
      const vr = chart.timeScale().getVisibleRange?.();
      if (vr && vr.from != null && vr.to != null) span = Number(vr.to) - Number(vr.from);
    } catch {}

    if (span == null) {
      try {
        const vlr = chart.timeScale().getVisibleLogicalRange?.();
        if (vlr && vlr.from != null && vlr.to != null && arr.length > 3) {
          const idxFrom = Math.max(0, Math.floor(Number(vlr.from)));
          const idxTo = Math.min(arr.length - 1, Math.ceil(Number(vlr.to)));
          const tFrom = Number(arr[idxFrom]?.time ?? arr[0]?.time);
          const tTo = Number(arr[idxTo]?.time ?? arr[arr.length - 1]?.time);
          if (Number.isFinite(tFrom) && Number.isFinite(tTo) && tTo > tFrom) span = tTo - tFrom;
        }
      } catch {}
    }

    if (span == null) {
      try {
        const lastIdx = arr.length - 1;
        const a = Math.max(0, lastIdx - 100);
        const tFrom = Number(arr[a]?.time ?? arr[0]?.time);
        const tTo = Number(arr[lastIdx]?.time ?? arr[arr.length - 1]?.time);
        if (Number.isFinite(tFrom) && Number.isFinite(tTo) && tTo > tFrom) span = Math.max(1, tTo - tFrom);
      } catch {}
    }

    try {
      if (span && Number.isFinite(span) && span > 0) {
        const from = Number(candle.time) - span / 2;
        const to = Number(candle.time) + span / 2;
        try {
          if (typeof chart.timeScale().setVisibleRange === "function") chart.timeScale().setVisibleRange({ from, to });
          else {
            const vlr = chart.timeScale().getVisibleLogicalRange?.();
            if (vlr && vlr.from != null && vlr.to != null) {
              const spanIdx = vlr.to - vlr.from;
              const newFromIdx = Math.max(0, idx - Math.floor(spanIdx / 2));
              const newToIdx = Math.min(arr.length - 1, idx + Math.floor(spanIdx / 2));
              chart.timeScale().setVisibleLogicalRange?.({ from: newFromIdx, to: newToIdx });
            }
          }
        } catch {}
      } else {
        try {
          const vlr = chart.timeScale().getVisibleLogicalRange?.();
          if (vlr && vlr.from != null && vlr.to != null) {
            const spanIdx = vlr.to - vlr.from;
            const newFromIdx = Math.max(0, idx - Math.floor(spanIdx / 2));
            const newToIdx = Math.min(arr.length - 1, idx + Math.floor(spanIdx / 2));
            chart.timeScale().setVisibleLogicalRange?.({ from: newFromIdx, to: newToIdx });
          }
        } catch {}
      }
    } catch (err) {
      // keep silent for perf/noise
    }

    // create the temporary pointer label
    createTempLabel(candle);

    // ensure price scale autoscaling (best-effort).
    // tiny rAF inside ensurePriceScaleFits will pick up the updated visible range
    ensurePriceScaleFits(idx);
  }, [chart, dataRef, containerRef, createTempLabel, ensurePriceScaleFits, findFiveThirtyIndex]);

  // calendar change: persist to sessionStorage AND history.state (fast & per-tab)
  const onCalendarChange = useCallback((newDate) => {
    setOpen(false);
    if (!newDate) return;
    try { sessionStorage.setItem(STORAGE_KEY, newDate.toISOString()); } catch {}
    try {
      const newS = Object.assign({}, window.history.state || {}, { [STORAGE_KEY]: newDate.toISOString() });
      window.history.replaceState(newS, "");
    } catch {}
    setSelectedDate(newDate);
    // schedule centering at next paint (lightweight)
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => handleGo(newDate));
    } else {
      setTimeout(() => handleGo(newDate), 0);
    }
  }, [handleGo]);

  useEffect(() => () => { removeTempLabel(); }, [removeTempLabel]);

  const shouldDisableYear = useCallback((yearDate) => {
    const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
    return !sets.availableYears.has(yearDate.getFullYear());
  }, [buildAvailabilityIfNeeded]);

  const shouldDisableMonth = useCallback((monthDate) => {
    const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
    const y = monthDate.getFullYear();
    const m = String(monthDate.getMonth() + 1).padStart(2, "0");
    return !sets.availableMonths.has(`${y}-${m}`);
  }, [buildAvailabilityIfNeeded]);

  const shouldDisableDate = useCallback((dt) => {
    const sets = availabilityRef.current.sets || buildAvailabilityIfNeeded();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return !sets.availableDays.has(`${y}-${m}-${d}`);
  }, [buildAvailabilityIfNeeded]);

  return (
    <ThemeProvider theme={darkTheme}>
      <div style={FLOAT_ICON_STYLE}>
        <IconButton size="large" onClick={() => setOpen(true)} aria-label="Open date picker">
          <EventIcon sx={EVENT_ICON_SX} />
        </IconButton>
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", bgcolor: "background.paper", p: 1, borderRadius: 2, boxShadow: 24, minWidth: 300, maxWidth: 420 }}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={calendarWrapperSx}>
              <DateCalendar
                disableFuture
                views={["year", "month", "day"]}
                value={selectedDate}
                onChange={onCalendarChange}
                displayWeekNumber={false}
                shouldDisableYear={shouldDisableYear}
                shouldDisableMonth={shouldDisableMonth}
                shouldDisableDate={shouldDisableDate}
              />
            </Box>
          </LocalizationProvider>
        </Box>
      </Modal>
    </ThemeProvider>
  );
}
