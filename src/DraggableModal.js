// src/DraggableModal.js
import React, { useRef, useEffect, useCallback } from "react";

const DraggableModal = React.memo(function DraggableModal({
  title = "Edit",
  editModal,
  setEditModal,
  onOk,
  onCancel,
}) {
  const modalRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef(null);

  // --- Pointer-based drag logic ---
  const onPointerMove = useCallback((e) => {
    const start = dragStartRef.current;
    if (!start || !modalRef.current) return;
    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    posRef.current = { x: start.initX + dx, y: start.initY + dy };
    modalRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
  }, []);

  const onPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragStartRef.current = null;
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (e) => {
      if (!modalRef.current) return;
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initX: posRef.current.x,
        initY: posRef.current.y,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onPointerMove, onPointerUp]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // --- Click outside to close ---
  const backdropRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target)
      ) {
        onCancel?.();
      }
    };
    const node = backdropRef.current;
    if (node) node.addEventListener("mousedown", handler);
    return () => node?.removeEventListener("mousedown", handler);
  }, [onCancel]);

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "auto",
        zIndex: 3000,
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: "#ffffff",
          color: "#000",
          padding: "20px 24px",
          borderRadius: "12px",
          width: "320px",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          userSelect: "none",
          transform: "translate(0, 0)",
        }}
        onClick={(e) => e.stopPropagation()} // prevent close when clicking inside
      >
        {/* Draggable Header */}
        <div
          onPointerDown={onPointerDown}
          style={{
            cursor: "grab",
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "16px",
            borderBottom: "1px solid #eee",
            paddingBottom: "6px",
          }}
        >
          {title}
        </div>

        {/* Input fields */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <input
            type="number"
            step="0.01"
            value={editModal.high}
            onChange={(e) =>
              setEditModal((m) => ({ ...m, high: e.target.value }))
            }
            style={{
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #bbb",
              fontSize: "16px",
              fontFamily: '"Inter", "Segoe UI", sans-serif',
              textAlign: "center",
              outline: "none",
            }}
          />
          <input
            type="number"
            step="0.01"
            value={editModal.low}
            onChange={(e) =>
              setEditModal((m) => ({ ...m, low: e.target.value }))
            }
            style={{
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #bbb",
              fontSize: "16px",
              fontFamily: '"Inter", "Segoe UI", sans-serif',
              textAlign: "center",
              outline: "none",
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <button
            onClick={onOk}
            style={{
              background: "#52c41a",
              border: "none",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              fontFamily: '"Inter", "Segoe UI", sans-serif',
            }}
          >
            OK
          </button>
          <button
            onClick={onCancel}
            style={{
              background: "#d9d9d9",
              border: "none",
              color: "#000",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              fontFamily: '"Inter", "Segoe UI", sans-serif',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});

export default DraggableModal;
