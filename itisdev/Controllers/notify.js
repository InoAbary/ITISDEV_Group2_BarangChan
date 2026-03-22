// Overrides window.alert so ALL existing alert() calls use toasts automatically.
// Also exposes window.notify(message, type) for explicit typed calls.
// Types: 'success' | 'error' | 'warning' | 'info'  (auto-detected if omitted)

(function () {
    const DURATION = 4000;
    const TRANSITION = 320;

    // Inject styles once
    const style = document.createElement('style');
    style.textContent = `
        #animotap-toast-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            font-family: 'Inter', -apple-system, sans-serif;
        }

        .animotap-toast {
            pointer-events: all;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            min-width: 280px;
            max-width: 380px;
            padding: 14px 16px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
            border: 1px solid transparent;
            opacity: 0;
            transform: translateX(24px);
            transition: opacity ${TRANSITION}ms ease, transform ${TRANSITION}ms ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        .animotap-toast.visible {
            opacity: 1;
            transform: translateX(0);
        }

        .animotap-toast.leaving {
            opacity: 0;
            transform: translateX(24px);
        }

        /* Progress bar */
        .animotap-toast::after {
            content: '';
            position: absolute;
            bottom: 0; left: 0;
            height: 3px;
            width: 100%;
            transform-origin: left;
            border-radius: 0 0 12px 12px;
            animation: toast-progress var(--duration, 4000ms) linear forwards;
        }

        @keyframes toast-progress {
            from { transform: scaleX(1); }
            to   { transform: scaleX(0); }
        }

        /* Success */
        .animotap-toast.success {
            background: #f0fdf4;
            border-color: #bbf7d0;
            color: #14532d;
        }
        .animotap-toast.success::after { background: #16a34a; }

        /* Error */
        .animotap-toast.error {
            background: #fff1f2;
            border-color: #fecdd3;
            color: #881337;
        }
        .animotap-toast.error::after { background: #e11d48; }

        /* Warning */
        .animotap-toast.warning {
            background: #fffbeb;
            border-color: #fed7aa;
            color: #7c2d12;
        }
        .animotap-toast.warning::after { background: #f59e0b; }

        /* Info */
        .animotap-toast.info {
            background: #eff6ff;
            border-color: #bfdbfe;
            color: #1e3a5f;
        }
        .animotap-toast.info::after { background: #3b82f6; }

        /* Dark mode */
        html.dark .animotap-toast.success { background: #052e16; border-color: #14532d; color: #bbf7d0; }
        html.dark .animotap-toast.error   { background: #2d0a10; border-color: #881337; color: #fecdd3; }
        html.dark .animotap-toast.warning { background: #2d1a00; border-color: #7c2d12; color: #fed7aa; }
        html.dark .animotap-toast.info    { background: #0c1a2e; border-color: #1e3a5f; color: #bfdbfe; }

        .animotap-toast-icon {
            font-size: 17px;
            line-height: 1;
            flex-shrink: 0;
            margin-top: 1px;
        }

        .animotap-toast-body {
            flex: 1;
            font-size: 13.5px;
            line-height: 1.5;
            font-weight: 500;
        }

        .animotap-toast-close {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            font-size: 16px;
            line-height: 1;
            opacity: 0.5;
            color: inherit;
            flex-shrink: 0;
            margin-top: -1px;
            transition: opacity 0.15s;
        }
        .animotap-toast-close:hover { opacity: 1; }
    `;
    document.head.appendChild(style);

    // Create container (do NOT assume document.body exists yet; notify.js may run in <head>)
    let container = document.getElementById('animotap-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'animotap-toast-container';
    }

    function ensureContainer() {
        if (!container) return;
        if (container.parentNode) return;
        // If body isn't available yet, fall back to documentElement.
        const parent = document.body || document.documentElement;
        if (parent) parent.appendChild(container);
    }

    // Attach once DOM is ready (so append to body works when possible)
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => {
            ensureContainer();
        });
    } else {
        ensureContainer();
    }

 

    // Auto-detect type from message keywords
    function detectType(message) {
        const m = message.toLowerCase();
        if (m.includes('success') || m.includes('successful') || m.includes('registered') ||
            m.includes('updated') || m.includes('saved') || m.includes('sent') ||
            m.includes('approved') || m.includes('activated') || m.includes('verified') ||
            m.includes('deactivated') || m.includes('linked') || m.includes('processed')) {
            return 'success';
        }
        if (m.includes('error') || m.includes('failed') || m.includes('invalid') ||
            m.includes('incorrect') || m.includes('not found') || m.includes('denied') ||
            m.includes('rejected') || m.includes('wrong') || m.includes('unauthorized') ||
            m.includes('insufficient') || m.includes('already registered') ||
            m.includes('already exists') || m.includes('locked') || m.includes('forbidden')) {
            return 'error';
        }
        if (m.includes('warning') || m.includes('expire') || m.includes('limit') ||
            m.includes('too many') || m.includes('please') || m.includes('required') ||
            m.includes('fill') || m.includes('enter') || m.includes('select') ||
            m.includes('must be') || m.includes('should be') || m.includes('match') ||
            m.includes('missing') || m.includes('short') || m.includes('long')) {
            return 'warning';
        }
        return 'info';
    }

    // Core show function
    function showToast(message, type) {
        // Ensure container is in the DOM
        ensureContainer();

        const resolvedType = type || detectType(String(message));
        const toast = document.createElement('div');
        toast.className = `animotap-toast ${resolvedType}`;
        toast.style.setProperty('--duration', `${DURATION}ms`);

        toast.innerHTML = `
            <span class="animotap-toast-body">${String(message)}</span>
            <button class="animotap-toast-close" aria-label="Dismiss">✕</button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('visible'));
        });

        // Auto-dismiss
        const timer = setTimeout(() => dismiss(toast), DURATION);

        function dismiss(el) {
            clearTimeout(timer);
            el.classList.add('leaving');
            el.classList.remove('visible');
            setTimeout(() => el.remove(), TRANSITION);
        }

        toast.querySelector('.animotap-toast-close').onclick = () => dismiss(toast);
        toast.onclick = (e) => {
            if (!e.target.classList.contains('animotap-toast-close')) dismiss(toast);
        };
    }

    // Override native alert as early as possible.
    // Any alert() calls after this line should show toasts instead of browser dialogs.
    window.alert = function (message) {
        showToast(message);
    };

    // Expose typed API for future use: notify('message', 'success')
    window.notify = showToast;

})();