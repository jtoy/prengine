(function () {
  "use strict";

  // Find the script tag to read data attributes
  var scripts = document.querySelectorAll("script[data-project], script[data-show]");
  var scriptTag = scripts[scripts.length - 1] || document.currentScript;
  if (!scriptTag) return;

  var project = scriptTag.getAttribute("data-project") || "";
  var tokenKey = scriptTag.getAttribute("data-token-key") || "prengine_token";
  var showMode = scriptTag.getAttribute("data-show") || "always";

  // Determine the base URL from the script src
  var scriptSrc = scriptTag.getAttribute("src") || "";
  var baseUrl = "";
  if (scriptSrc) {
    try {
      var url = new URL(scriptSrc);
      baseUrl = url.origin;
    } catch (e) {
      // Relative URL — same origin
      baseUrl = window.location.origin;
    }
  } else {
    baseUrl = window.location.origin;
  }

  if (showMode === "never") return;

  // State
  var button = null;
  var badge = null;
  var overlay = null;
  var capturedErrors = [];
  var isModalOpen = false;
  var pollInterval = null;

  // --- Styles ---
  var BUTTON_SIZE = 40;
  var BADGE_SIZE = 14;

  function createButton() {
    if (button) return;

    button = document.createElement("div");
    button.id = "prengine-widget-btn";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("aria-label", "Report a bug");
    Object.assign(button.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: BUTTON_SIZE + "px",
      height: BUTTON_SIZE + "px",
      borderRadius: "50%",
      backgroundColor: "#ea580c",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      zIndex: "2147483646",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
      border: "none",
      outline: "none",
    });

    // Rocket SVG icon
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>' +
      '<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' +
      '<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>' +
      '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';

    button.addEventListener("mouseenter", function () {
      button.style.transform = "scale(1.1)";
      button.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
    });
    button.addEventListener("mouseleave", function () {
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
    });
    button.addEventListener("click", openModal);
    button.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal();
      }
    });

    document.body.appendChild(button);
  }

  function showBadge() {
    if (!button || badge) return;
    badge = document.createElement("div");
    Object.assign(badge.style, {
      position: "absolute",
      top: "-2px",
      right: "-2px",
      width: BADGE_SIZE + "px",
      height: BADGE_SIZE + "px",
      borderRadius: "50%",
      backgroundColor: "#dc2626",
      border: "2px solid #fff",
      zIndex: "2147483647",
    });
    button.style.position = "fixed"; // ensure parent is positioned
    button.appendChild(badge);
  }

  function openModal() {
    if (isModalOpen) return;
    isModalOpen = true;

    overlay = document.createElement("div");
    overlay.id = "prengine-widget-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    });

    var container = document.createElement("div");
    Object.assign(container.style, {
      backgroundColor: "#fff",
      borderRadius: "12px",
      width: "100%",
      maxWidth: "540px",
      maxHeight: "90vh",
      position: "relative",
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      overflow: "hidden",
    });

    // Close button
    var closeBtn = document.createElement("button");
    closeBtn.setAttribute("aria-label", "Close");
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      width: "32px",
      height: "32px",
      borderRadius: "50%",
      border: "none",
      backgroundColor: "rgba(0,0,0,0.08)",
      color: "#333",
      fontSize: "18px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "1",
      lineHeight: "1",
    });
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", closeModal);

    var iframeSrc =
      baseUrl + "/embed/submit?project=" + encodeURIComponent(project);
    var iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.setAttribute("allow", "display-capture");
    Object.assign(iframe.style, {
      width: "100%",
      height: "80vh",
      maxHeight: "600px",
      border: "none",
      display: "block",
    });

    container.appendChild(closeBtn);
    container.appendChild(iframe);
    overlay.appendChild(container);

    // Close on overlay background click
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);

    // Listen for iframe messages
    function onIframeMessage(event) {
      if (!event.data || !event.data.type) return;

      if (event.data.type === "PRENGINE_IFRAME_READY") {
        // Send auth token and any captured errors
        var token = null;
        try {
          token = localStorage.getItem(tokenKey);
        } catch (e) {}

        var payload = {
          type: "PRENGINE_AUTH_TOKEN",
          token: token,
        };
        if (capturedErrors.length > 0) {
          payload.errors = capturedErrors.slice();
        }
        iframe.contentWindow.postMessage(payload, baseUrl);
      }

      if (event.data.type === "PRENGINE_SUBMIT_SUCCESS") {
        setTimeout(function () {
          closeModal();
        }, 2000);
      }

      if (event.data.type === "PRENGINE_CLOSE") {
        closeModal();
      }
    }

    window.addEventListener("message", onIframeMessage);

    // Store cleanup reference
    overlay._cleanup = function () {
      window.removeEventListener("message", onIframeMessage);
    };
  }

  function closeModal() {
    if (!overlay) return;
    if (overlay._cleanup) overlay._cleanup();
    overlay.remove();
    overlay = null;
    isModalOpen = false;
  }

  // --- Mode: always ---
  function initAlways() {
    function checkToken() {
      var token = null;
      try {
        token = localStorage.getItem(tokenKey);
      } catch (e) {}

      if (token) {
        createButton();
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    }

    checkToken();
    if (!button) {
      pollInterval = setInterval(checkToken, 5000);
    }
  }

  // --- Mode: on-error ---
  function initOnError() {
    function onError(event) {
      var err = {
        message: event.message || "Unknown error",
        stack: event.error && event.error.stack ? event.error.stack : undefined,
        source: event.filename || undefined,
        lineno: event.lineno || undefined,
        colno: event.colno || undefined,
        url: window.location.href,
        timestamp: Date.now(),
      };
      capturedErrors.unshift(err);
      if (capturedErrors.length > 5) capturedErrors.length = 5;

      createButton();
      showBadge();
    }

    function onUnhandledRejection(event) {
      var message = "Unhandled promise rejection";
      var stack;
      if (event.reason) {
        if (typeof event.reason === "string") {
          message = event.reason;
        } else if (event.reason.message) {
          message = event.reason.message;
          stack = event.reason.stack;
        }
      }
      var err = {
        message: message,
        stack: stack,
        url: window.location.href,
        timestamp: Date.now(),
      };
      capturedErrors.unshift(err);
      if (capturedErrors.length > 5) capturedErrors.length = 5;

      createButton();
      showBadge();
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
  }

  // --- Init ---
  if (showMode === "always") {
    initAlways();
  } else if (showMode === "on-error") {
    initOnError();
  }
})();
