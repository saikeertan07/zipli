/**
 * ZIPLI — Client-Side Server-Sent Events (SSE) Manager
 *
 * Connects to /api/events with reconnect logic and dispatches real-time events.
 */

export class SseClient {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect(token) {
    if (!token) return;
    this.disconnect();

    const url = `${this.apiBaseUrl}/events?token=${encodeURIComponent(token)}`;
    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._dispatch('connection_status', { connected: true });
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this._dispatch('connection_status', { connected: false });
        this.disconnect();
        this._scheduleReconnect(token);
      };

      // Register default system events
      const events = [
        'order_status_changed',
        'rider_location_updated',
        'stock_reservation_expiring',
        'notification_received',
        'fraud_status_updated',
      ];

      for (const eventName of events) {
        this.eventSource.addEventListener(eventName, (event) => {
          try {
            const data = JSON.parse(event.data);
            this._dispatch(eventName, data);
          } catch {
            this._dispatch(eventName, event.data);
          }
        });
      }
    } catch {
      this._scheduleReconnect(token);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isConnected = false;
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(handler);
    return () => this.listeners.get(eventName).delete(handler);
  }

  _dispatch(eventName, data) {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error('SSE handler error:', err);
        }
      }
    }
  }

  _scheduleReconnect(token) {
    if (this.reconnectAttempts >= 8) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect(token);
    }, delay);
  }
}
