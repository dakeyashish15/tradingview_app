// fibService.js
const API_URL = "http://127.0.0.1:8000/api/fibs";

// CREATE
export async function createFib(fib) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fib),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// READ
export async function fetchFibs() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// UPDATE
export async function updateFib(fibId, changes) {
  const res = await fetch(`${API_URL}/${fibId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// DELETE
export async function deleteFib(fibId) {
  const res = await fetch(`${API_URL}/${fibId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { success: true };
}
