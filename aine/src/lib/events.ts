/**
 * SSE event stream management.
 * Returns cleanup functions for use in onMount.
 */

export function createPreloadStream(
  onStatus: (status: { cached: number; total: number; preloading: boolean }) => void,
): () => void {
  const es = new EventSource("/api/preload-stream");
  es.onmessage = (e) => {
    try { onStatus(JSON.parse(e.data)); } catch {}
  };
  es.onerror = () => { es.close(); };
  return () => es.close();
}

export interface EventStreamCallbacks {
  onNavigate: (file: string) => void;
  onStale: () => void;
  onRefresh: () => void;
}

export function createEventStream(callbacks: EventStreamCallbacks): () => void {
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    es = new EventSource("/api/events");
    es.onmessage = async (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "navigate" && event.file) callbacks.onNavigate(event.file);
        if (event.type === "stale") callbacks.onStale();
        if (event.type === "reload" || event.type === "refresh") callbacks.onRefresh();
      } catch {}
    };
    es.onerror = () => {
      es?.close();
      es = null;
      reconnectTimer = setTimeout(connect, 2000);
    };
  }

  connect();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    es?.close();
  };
}
