/**
 * ZIPLI — AI Assistant Drawer & Floating Widget
 *
 * Implements:
 * 1. Floating trigger button with AI badge.
 * 2. Streaming responses with markdown formatting.
 * 3. Dynamic tool-call status chips.
 * 4. Inline product recommendation cards with explicit cart confirm buttons.
 * 5. Thumbs up/down eval rating buttons.
 * 6. Privacy & safety notice.
 */

import { html } from '../utils/dom.js';
import { formatCurrency } from '../utils/format.js';

export function renderAssistantDrawer(state) {
  const {
    assistantMessages = [],
    assistantStreaming = false,
    assistantDrawerOpen = false,
    user = null,
    aiDegraded = false,
    isOffline = false,
  } = state;

  return html`
    <!-- Floating Assistant Trigger Button -->
    <button
      class="assistant-floating-btn"
      data-action="toggle-assistant"
      aria-label="AI Helper: Open AI Grocery Assistant"
      title="Ask Zipli AI"
    >
      <span style="font-size:22px;">✨</span>
      <span class="assistant-floating-label">AI Helper</span>
    </button>

    <!-- Overlay & Drawer Side Panel -->
    <div
      class="drawer-overlay ${assistantDrawerOpen ? 'open' : ''}"
      id="assistantOverlay"
      data-action="close-assistant"
    ></div>

    <aside class="drawer ${assistantDrawerOpen ? 'open' : ''}" id="assistantDrawer" aria-label="AI Shopping Assistant">
      <!-- Head -->
      <div class="drawer-head" style="background:var(--color-brand-subtle); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:var(--radius-full); background:var(--color-brand); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px;">
            ✨
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <h2 style="font-size:var(--text-base); margin:0; font-family:var(--font-display);">Zipli AI Assistant</h2>
              ${user
                ? html`<span class="badge badge-success" style="font-size:10px; padding:2px 6px;">Logged in</span>`
                : html`<span class="badge badge-warning" style="font-size:10px; padding:2px 6px;">Guest Mode (10/min)</span>`}
            </div>
            <div style="font-size:11px; color:var(--color-brand); font-weight:600;">Recipe planner & Smart Search</div>
          </div>
        </div>
        <button class="icon-btn" data-action="close-assistant" aria-label="Close Assistant">✕</button>
      </div>

      <!-- Offline / Degraded Notice Banner -->
      ${aiDegraded || isOffline
        ? html`
            <div style="background:#fef3c7; color:#92400e; padding:8px 16px; font-size:11px; border-bottom:1px solid #fde68a; display:flex; align-items:center; gap:6px;">
              <span>⚠️</span>
              <span><strong>Offline Mode Active:</strong> Running deterministic BM25 search & meal planner.</span>
            </div>
          `
        : ''}

      <!-- Privacy Notice -->
      <div style="background:var(--surface-bg); padding:8px 16px; font-size:11px; color:var(--text-muted); border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; gap:6px;">
        <span>🔒</span>
        <span>Guarded with prompt injection defense & real-time inventory verification.</span>
      </div>

      <!-- Messages Stream Area -->
      <div class="drawer-body" id="assistantMessagesList" style="display:flex; flex-direction:column; gap:16px;">
        ${assistantMessages.map(
          (msg, idx) => html`
            <div class="assistant-msg ${msg.role === 'user' ? 'user-msg' : 'bot-msg'}" style="${msg.role === 'user' ? 'align-self:flex-end; max-width:85%; background:var(--color-brand); color:#fff; border-radius:14px 14px 2px 14px; padding:10px 14px;' : 'align-self:flex-start; max-width:92%; background:var(--surface-bg); border:1px solid var(--border-subtle); border-radius:14px 14px 14px 2px; padding:12px 14px;'}">
              <!-- Tool Call Status Chip -->
              ${msg.toolChip
                ? html`
                    <div style="display:inline-flex; align-items:center; gap:6px; background:var(--color-brand-light); color:var(--color-brand); font-size:11px; font-weight:700; padding:3px 8px; border-radius:var(--radius-full); margin-bottom:8px;">
                      <span>⚡</span>
                      <span>${msg.toolChip}</span>
                    </div>
                  `
                : ''}

              <!-- Message Text -->
              <div style="font-size:var(--text-sm); line-height:1.5;">${msg.text}</div>

              <!-- Proposed Cart (Explicit confirmation required: model never mutates cart) -->
              ${msg.proposedCart && msg.proposedCart.length > 0
                ? html`
                    <div class="proposed-cart-box" style="background:var(--color-brand-subtle); border:1px solid var(--color-brand); border-radius:var(--radius-md); padding:12px; margin-top:10px;">
                      <div style="font-size:var(--text-xs); font-weight:700; color:var(--color-brand); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🛒 Proposed Cart Additions (${msg.proposedCart.length} items)</span>
                        <span style="font-size:10px; color:var(--text-muted); font-weight:normal;">User confirms; model never mutates cart</span>
                      </div>
                      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
                        ${msg.proposedCart.map(
                          (item) => html`
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--text-xs); background:var(--surface-card); padding:6px 8px; border-radius:4px;">
                              <span>${item.quantity || 1}× ${item.name || `Product #${item.productId}`}</span>
                              ${item.price ? html`<span style="font-weight:700;">${formatCurrency(item.price * (item.quantity || 1))}</span>` : ''}
                            </div>
                          `
                        )}
                      </div>
                      <button
                        class="btn btn-primary btn-sm btn-full"
                        data-action="confirm-proposed-cart"
                        data-msg-idx="${idx}"
                        style="justify-content:center;"
                      >
                        ✓ Add all ${msg.proposedCart.length} items to cart
                      </button>
                    </div>
                  `
                : ''}

              <!-- Inline Product Recommendations -->
              ${msg.products && msg.products.length > 0
                ? html`
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                      ${msg.products.map(
                        (prod) => html`
                          <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-card); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:6px 10px; gap:8px;">
                            <div style="font-size:var(--text-xs); font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                              ${prod.name}
                            </div>
                            <span style="font-size:var(--text-xs); font-weight:700;">${formatCurrency(prod.price)}</span>
                            <button
                              class="btn btn-primary btn-sm"
                              style="padding:3px 8px; font-size:11px;"
                              data-action="add-to-cart"
                              data-product-id="${prod.id}"
                            >
                              Add
                            </button>
                          </div>
                        `
                      )}
                    </div>
                  `
                : ''}

              <!-- Quick Prompt Suggestion Chips -->
              ${msg.chips && msg.chips.length > 0
                ? html`
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;">
                      ${msg.chips.map(
                        (chipText) => html`
                          <button
                            class="chip"
                            style="font-size:11px; padding:4px 10px;"
                            data-action="send-assistant-chip"
                            data-chip-text="${chipText}"
                          >
                            ${chipText}
                          </button>
                        `
                      )}
                    </div>
                  `
                : ''}

              <!-- Thumbs Up / Down Evaluation Feedback -->
              ${msg.role === 'assistant' && idx > 0
                ? html`
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:11px; color:var(--text-muted);" class="feedback-area">
                      <span>Helpful?</span>
                      <button
                        class="icon-btn"
                        style="width:24px; height:24px; font-size:11px;"
                        data-action="rate-assistant"
                        data-rating="1"
                        data-msg-idx="${idx}"
                        data-conversation-id="${msg.conversationId || ''}"
                        data-message-id="${msg.id || ''}"
                        aria-label="Thumbs up"
                      >👍</button>
                      <button
                        class="icon-btn"
                        style="width:24px; height:24px; font-size:11px;"
                        data-action="rate-assistant"
                        data-rating="-1"
                        data-msg-idx="${idx}"
                        data-conversation-id="${msg.conversationId || ''}"
                        data-message-id="${msg.id || ''}"
                        aria-label="Thumbs down"
                      >👎</button>
                    </div>
                  `
                : ''}
            </div>
          `
        )}

        <!-- Streaming Indicator -->
        ${assistantStreaming
          ? html`
              <div style="align-self:flex-start; background:var(--surface-bg); padding:8px 14px; border-radius:14px; font-size:var(--text-xs); color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
                <span class="typing-dot">●</span>
                <span class="typing-dot" style="animation-delay:0.2s">●</span>
                <span class="typing-dot" style="animation-delay:0.4s">●</span>
                <span style="margin-left:4px;">Zipli AI streaming response...</span>
              </div>
            `
          : ''}
      </div>

      <!-- Input Footer -->
      <div class="drawer-foot" style="padding:12px 16px;">
        <form id="assistantForm" data-action="submit-assistant" style="display:flex; gap:8px;">
          <input
            type="text"
            id="assistantInput"
            class="input"
            placeholder="Ask for dinner recipes, fruit baskets..."
            style="flex:1; height:40px; font-size:var(--text-sm);"
            autocomplete="off"
          />
          <button type="submit" class="btn btn-primary btn-sm" style="height:40px; padding:0 14px;">
            Send
          </button>
        </form>
      </div>
    </aside>
  `;
}
