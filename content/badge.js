// GenCost — Badge component (shadow DOM)
// Keeps host-page CSS from interfering while still inheriting text color
// and font from the button (color and font-* are inherited CSS properties
// that cross shadow boundaries).

window.GenCost = window.GenCost || {};

window.GenCost.Badge = class Badge {
  constructor() {
    // The host span sits in the page's light DOM.
    this.host = document.createElement('span');
    Object.assign(this.host.style, {
      display: 'inline-flex',
      alignItems: 'center',
      verticalAlign: 'middle',
      pointerEvents: 'none',
      marginLeft: '6px',
      marginRight: '6px',
    });

    const shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
      }
      .gc-badge {
        display: inline-flex;
        align-items: center;
        font-family: inherit;
        font-size: 1em;
        font-weight: 500;
        line-height: 1;
        color: inherit;
        opacity: 0.65;
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
        letter-spacing: 0.01em;
      }
      .gc-badge.gc-set-plan {
        opacity: 0.8;
        cursor: pointer;
        pointer-events: auto;
        text-decoration: underline dotted;
        text-underline-offset: 2px;
      }
      .gc-badge.gc-error {
        opacity: 0.4;
      }
    `;

    this._inner = document.createElement('span');
    this._inner.className = 'gc-badge';

    shadow.appendChild(style);
    shadow.appendChild(this._inner);

    this._clickHandler = null;
  }

  // -------------------------------------------------------------------------
  // Public state setters
  // -------------------------------------------------------------------------

  showCost(dollars) {
    this._clearClickHandler();
    this._inner.className = 'gc-badge';
    this._inner.textContent = `\u2248$${dollars.toFixed(2)}`; // ≈$X.XX
    this._inner.title = '';
    this.host.style.pointerEvents = 'none';
  }

  showNoPlan() {
    this._clearClickHandler();
    this._inner.className = 'gc-badge gc-set-plan';
    this._inner.textContent = 'Set plan \u2192'; // Set plan →
    this._inner.title = 'Click to open GenCost settings';
    this.host.style.pointerEvents = 'auto';

    // Stop click propagating to the button (would trigger generation).
    this._clickHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'openPopup' }).catch(() => {
        this._inner.title = 'Click the GenCost icon in your toolbar to set your plan';
      });
    };
    this.host.addEventListener('click', this._clickHandler);
  }

  showError() {
    this._clearClickHandler();
    this._inner.className = 'gc-badge gc-error';
    this._inner.textContent = '?';
    this._inner.title = "GenCost: couldn't read credit cost from page";
    this.host.style.pointerEvents = 'none';
  }

  // -------------------------------------------------------------------------
  // Mounting
  // -------------------------------------------------------------------------

  mount(anchorEl, position) {
    // position: 'afterend' | 'beforeend' | 'afterbegin' | 'beforebegin'
    anchorEl.insertAdjacentElement(position || 'afterend', this.host);
  }

  isAttached() {
    return this.host.isConnected;
  }

  remove() {
    this._clearClickHandler();
    this.host.remove();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _clearClickHandler() {
    if (this._clickHandler) {
      this.host.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
  }
};
