import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function suppressHmrPlugin() {
  return {
    name: 'suppress-hmr-ws-error',
    transformIndexHtml: {
      order: 'pre' as const,
      handler() {
        return [
          {
            tag: 'script',
            children: `
(function() {
  function isViteWs(e) {
    if (!e) return false;
    var s = String(e.message || e.reason || e || '');
    var st = String(e.stack || '');
    return s.includes('WebSocket') || s.includes('createWebSocketModuleRunnerTransport') || s.includes('closed without opened') || st.includes('@vite/client');
  }
  window.addEventListener('error', function(e) {
    if (isViteWs(e) || (e.filename && e.filename.includes('@vite/client'))) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    if (isViteWs(e.reason)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);
  if (typeof window !== 'undefined' && window.WebSocket) {
    var OrigWS = window.WebSocket;
    var DummyWS = function(url, proto) {
      if (proto === 'vite-hmr' || (typeof url === 'string' && (url.includes('token=') || url.includes('24678')))) {
        var handlers = {};
        return {
          readyState: 1,
          OPEN: 1, CLOSED: 3, CLOSING: 2, CONNECTING: 0,
          send: function() {},
          close: function() {},
          addEventListener: function(t, fn) {
            if (!handlers[t]) handlers[t] = [];
            handlers[t].push(fn);
            if (t === 'open') setTimeout(fn, 5);
          },
          removeEventListener: function() {},
          dispatchEvent: function() { return true; }
        };
      }
      return new OrigWS(url, proto);
    };
    DummyWS.prototype = OrigWS.prototype;
    DummyWS.CONNECTING = 0;
    DummyWS.OPEN = 1;
    DummyWS.CLOSING = 2;
    DummyWS.CLOSED = 3;
    window.WebSocket = DummyWS;
  }
})();
`,
            injectTo: 'head-prepend' as const,
          },
        ];
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [suppressHmrPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio to prevent WebSocket connection errors in iFrame
      hmr: false,
      watch: null,
    },
  };
});
