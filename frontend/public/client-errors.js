(function () {
  var scripts = document.querySelectorAll("script[data-p]");
  var s = scripts[scripts.length - 1] || document.currentScript;
  if (!s) return;

  var P = s.getAttribute("data-p") || "";
  if (!P) return;

  var src = s.getAttribute("src") || "";
  var E;
  try { E = new URL(src).origin + "/api/client-errors"; } catch (e) {
    E = window.location.origin + "/api/client-errors";
  }

  function send(d) {
    var b = JSON.stringify({
      projectId: P,
      type: d.type,
      message: d.message,
      stack: d.stack,
      source: "client",
      metadata: { url: location.href, userAgent: navigator.userAgent }
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(E, new Blob([b], { type: "application/json" }));
    } else {
      fetch(E, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: b,
        keepalive: true
      }).catch(function () {});
    }
  }

  window.addEventListener("error", function (e) {
    send({
      type: "js_error",
      message: e.message || "Unknown error",
      stack: e.error && e.error.stack
    });
  });

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    send({
      type: "promise_rejection",
      message: r.message || String(e.reason),
      stack: r.stack
    });
  });
})();
