const {
  escapeHtml,
  safeText,
  safeUrl,
  html,
  rawHtml,
} = require('../../../frontend/js/utils/escape.js');

describe('XSS Payload Neutralization Across All Text Fields (F-021, SEC-IO-02)', () => {
  const HTML_XSS_PAYLOADS = [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(1)">',
    '"><svg onload=alert(document.cookie)>',
    '"><script src=//evil.com/xss.js></script>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<body onload=alert(1)>',
    '<input autofocus onfocus=alert(1)>',
    '\'"--><script>alert(1)</script>',
  ];

  const URL_XSS_PAYLOADS = [
    'javascript:alert(document.domain)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox("XSS")',
  ];

  describe('Core Escaping Engine', () => {
    HTML_XSS_PAYLOADS.forEach((payload, index) => {
      it(`neutralizes executable tags for vector #${index + 1}: ${payload.slice(0, 30)}`, () => {
        const escaped = escapeHtml(payload);
        // Assert no executable HTML tags survive
        expect(escaped).not.toContain('<script');
        expect(escaped).not.toContain('<img');
        expect(escaped).not.toContain('<svg');
        expect(escaped).not.toContain('<iframe');
        expect(escaped).not.toContain('<body');
        expect(escaped).not.toContain('<input');
        // Angle brackets and quotes must be encoded
        expect(escaped).toMatch(/(&lt;|&gt;|&quot;|&#39;|&#96;)/);
      });
    });

    URL_XSS_PAYLOADS.forEach((payload, index) => {
      it(`neutralizes pseudo-protocol injection for vector #${index + 1}: ${payload.slice(0, 30)}`, () => {
        const safe = safeUrl(payload);
        expect(safe).toBe('#');
      });
    });

    it('allows benign http and https URLs', () => {
      expect(safeUrl('https://example.com/item.jpg')).toBe('https://example.com/item.jpg');
      expect(safeUrl('/images/banana.jpg')).toBe('/images/banana.jpg');
    });
  });

  describe('Tagged Template Safe HTML Engine', () => {
    it('automatically escapes interpolated variables in html tagged template', () => {
      const malicious = '<img src="x" onerror="alert(1)">';
      const template = html`<div class="user-content">${malicious}</div>`;
      const rendered = template.toString();

      expect(rendered).toContain('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
      expect(rendered).not.toContain('<img');
    });

    it('escapes arrays of malicious strings', () => {
      const tags = ['<b>bold</b>', '<script>bad()</script>', 'regular'];
      const template = html`<div>${tags}</div>`;
      const rendered = template.toString();

      expect(rendered).toContain('&lt;b&gt;bold&lt;/b&gt;');
      expect(rendered).toContain('&lt;script&gt;bad()&lt;/script&gt;');
      expect(rendered).not.toContain('<script>');
    });

    it('honors rawHtml explicitly marked as safe', () => {
      const trusted = rawHtml('<span class="badge">Safe SVG</span>');
      const template = html`<div>${trusted}</div>`;
      expect(template.toString()).toBe('<div><span class="badge">Safe SVG</span></div>');
    });
  });

  describe('Text Field 1: User Name & Profile Fields', () => {
    it('escapes malicious user name in account and header rendering', () => {
      HTML_XSS_PAYLOADS.forEach((payload) => {
        const rendered = html`
          <div class="user-badge">
            <span class="user-name">${payload}</span>
          </div>
        `.toString();

        expect(rendered).not.toContain('<script');
        expect(rendered).not.toContain('<img');
        expect(rendered).not.toContain('<svg');
        expect(rendered).not.toContain('<iframe');
      });
    });
  });

  describe('Text Field 2: Delivery Address & Order Notes', () => {
    it('escapes malicious address and delivery instructions in checkout', () => {
      HTML_XSS_PAYLOADS.forEach((payload) => {
        const address = `Flat 402, ${payload}`;
        const notes = `Ring doorbell twice: ${payload}`;

        const rendered = html`
          <div class="checkout-summary">
            <p class="address">${address}</p>
            <p class="notes">${notes}</p>
          </div>
        `.toString();

        expect(rendered).not.toContain('<script');
        expect(rendered).not.toContain('<iframe');
        expect(rendered).not.toContain('<body');
      });
    });
  });

  describe('Text Field 3: Product Catalog (Name, Badge, Description)', () => {
    it('escapes malicious product catalog fields', () => {
      HTML_XSS_PAYLOADS.forEach((payload) => {
        const product = {
          name: `Organic Apples ${payload}`,
          badge: `SALE ${payload}`,
          qty_label: `1 kg ${payload}`,
        };

        const rendered = html`
          <div class="product-card">
            <span class="badge">${product.badge}</span>
            <h3 class="title">${product.name}</h3>
            <span class="unit">${product.qty_label}</span>
          </div>
        `.toString();

        expect(rendered).not.toContain('<script');
        expect(rendered).not.toContain('<img');
        expect(rendered).not.toContain('<svg');
        expect(rendered).not.toContain('<input');
      });
    });
  });

  describe('Text Field 4: AI Assistant & Chat Stream', () => {
    it('escapes malicious chat text, tool chips, and suggestion chips', () => {
      HTML_XSS_PAYLOADS.forEach((payload) => {
        const message = {
          role: 'assistant',
          text: `Here are suggestions: ${payload}`,
          toolChip: `Tool: ${payload}`,
          chips: [payload, 'Regular Option'],
        };

        const rendered = html`
          <div class="assistant-msg ${message.role}">
            <div class="chip">${message.toolChip}</div>
            <div class="text">${message.text}</div>
            <div class="chips-row">
              ${message.chips.map((c) => html`<button class="chip">${c}</button>`)}
            </div>
          </div>
        `.toString();

        expect(rendered).not.toContain('<script');
        expect(rendered).not.toContain('<img');
        expect(rendered).not.toContain('<svg');
      });
    });
  });

  describe('Text Field 5: Notifications & Live Toasts', () => {
    it('escapes malicious toast and notification message strings', () => {
      HTML_XSS_PAYLOADS.forEach((payload) => {
        const rendered = html`
          <div class="toast toast-info">
            <span>${payload}</span>
          </div>
        `.toString();

        expect(rendered).not.toContain('<script');
        expect(rendered).not.toContain('<svg');
        expect(rendered).not.toContain('<input');
      });
    });
  });
});
