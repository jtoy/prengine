(function () {
  "use strict";

  // Find the script tag to read data attributes
  var scripts = document.querySelectorAll("script[data-project], script[data-show]");
  var scriptTag = scripts[scripts.length - 1] || document.currentScript;
  if (!scriptTag) return;

  var project = scriptTag.getAttribute("data-project") || "";
  var tokenKey = scriptTag.getAttribute("data-token-key") || "prengine_token";
  var showMode = scriptTag.getAttribute("data-show") || "always";
  // "bar" (default) = slim vertical bar on right edge | "circle" = classic round button
  var widgetStyle = scriptTag.getAttribute("data-widget-style") || "bar";

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
  var dismissBtn = null;
  var badge = null;
  var overlay = null;
  var capturedErrors = [];
  var isModalOpen = false;
  var isRecording = false;
  var pollInterval = null;
  var stopPill = null;
  var recordingStartTime = null;
  var recordingTimerInterval = null;
  var iframeRef = null;

  // --- Styles ---
  var BUTTON_SIZE = 40;
  var BADGE_SIZE = 14;

  // Inject keyframe styles once
  function injectBaseStyles() {
    if (document.getElementById("prengine-base-style")) return;
    var styleTag = document.createElement("style");
    styleTag.id = "prengine-base-style";
    styleTag.textContent =
      "@keyframes prengine-bar-in { from { opacity:0; transform:translateX(100%) translateY(-50%); } to { opacity:1; transform:translateX(0) translateY(-50%); } }" +
      "#prengine-widget-btn.bar-style { animation: prengine-bar-in 0.3s ease forwards; }" +
      "#prengine-widget-btn.bar-style:hover { width: 14px !important; box-shadow: -4px 0 14px rgba(0,0,0,0.25) !important; }";
    document.head.appendChild(styleTag);
  }

  function createButton() {
    if (button) return;
    injectBaseStyles();

    button = document.createElement("div");
    button.id = "prengine-widget-btn";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("aria-label", "Report a bug");

    if (widgetStyle === "bar") {
      // ── Slim vertical bar ──────────────────────────────────────────────
      button.classList.add("bar-style");
      Object.assign(button.style, {
        position: "fixed",
        top: "50%",
        right: "0",
        transform: "translateY(-50%)",
        width: "8px",
        height: "64px",
        borderRadius: "4px 0 0 4px",
        backgroundColor: "#ea580c",
        cursor: "pointer",
        zIndex: "2147483646",
        transition: "width 0.15s ease, box-shadow 0.15s ease",
        border: "none",
        outline: "none",
        overflow: "visible",
      });

      // Tooltip label that appears on hover
      var tooltip = document.createElement("div");
      tooltip.id = "prengine-bar-tooltip";
      Object.assign(tooltip.style, {
        position: "absolute",
        top: "50%",
        right: "12px",
        transform: "translateY(-50%)",
        backgroundColor: "#ea580c",
        color: "#fff",
        fontSize: "11px",
        fontWeight: "600",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        whiteSpace: "nowrap",
        padding: "4px 8px",
        borderRadius: "4px",
        pointerEvents: "none",
        opacity: "0",
        transition: "opacity 0.15s ease",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      });
      tooltip.textContent = "Report a bug";
      button.appendChild(tooltip);

      button.addEventListener("mouseenter", function () {
        button.style.width = "14px";
        button.style.boxShadow = "-4px 0 14px rgba(0,0,0,0.25)";
        tooltip.style.opacity = "1";
      });
      button.addEventListener("mouseleave", function () {
        button.style.width = "8px";
        button.style.boxShadow = "none";
        tooltip.style.opacity = "0";
      });

      // Dismiss: right-click or long-press (don't clutter the tiny bar with an ×)
      button.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        button.remove();
        button = null;
      });

    } else {
      // ── Classic circle ─────────────────────────────────────────────────
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

      // Dismiss × button (visible on hover)
      dismissBtn = document.createElement("div");
      dismissBtn.setAttribute("role", "button");
      dismissBtn.setAttribute("aria-label", "Hide widget");
      Object.assign(dismissBtn.style, {
        position: "absolute",
        top: "-6px",
        right: "-6px",
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        backgroundColor: "#666",
        color: "#fff",
        fontSize: "12px",
        lineHeight: "18px",
        textAlign: "center",
        cursor: "pointer",
        opacity: "0",
        transition: "opacity 0.15s ease",
        zIndex: "2147483647",
      });
      dismissBtn.textContent = "\u00d7";
      dismissBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        button.remove();
        button = null;
      });
      button.appendChild(dismissBtn);

      button.addEventListener("mouseenter", function () {
        button.style.transform = "scale(1.1)";
        button.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
        if (dismissBtn) dismissBtn.style.opacity = "1";
      });
      button.addEventListener("mouseleave", function () {
        button.style.transform = "scale(1)";
        button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
        if (dismissBtn) dismissBtn.style.opacity = "0";
      });
    }

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

  function showStopPill() {
    if (stopPill) return;

    stopPill = document.createElement("div");
    stopPill.id = "prengine-stop-pill";
    stopPill.setAttribute("role", "button");
    stopPill.setAttribute("tabindex", "0");
    Object.assign(stopPill.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 16px",
      backgroundColor: "#dc2626",
      color: "#fff",
      borderRadius: "24px",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: "2147483647",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "14px",
      fontWeight: "500",
      transition: "transform 0.15s ease",
      border: "none",
      outline: "none",
    });

    // Pulsing red dot
    var dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: "#fff",
      display: "inline-block",
      animation: "prengine-pulse 1.5s ease-in-out infinite",
    });

    var label = document.createElement("span");
    label.textContent = "Stop Recording 0:00";

    stopPill.appendChild(dot);
    stopPill.appendChild(label);

    // Add pulse animation
    var styleTag = document.createElement("style");
    styleTag.id = "prengine-pulse-style";
    styleTag.textContent = "@keyframes prengine-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }";
    document.head.appendChild(styleTag);

    // Timer
    recordingStartTime = Date.now();
    recordingTimerInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      label.textContent = "Stop Recording " + m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000);

    stopPill.addEventListener("mouseenter", function () {
      stopPill.style.transform = "scale(1.05)";
    });
    stopPill.addEventListener("mouseleave", function () {
      stopPill.style.transform = "scale(1)";
    });

    stopPill.addEventListener("click", function () {
      // Tell iframe to stop recording
      if (iframeRef && iframeRef.contentWindow) {
        iframeRef.contentWindow.postMessage({ type: "PRENGINE_STOP_RECORDING" }, baseUrl);
      }
    });

    document.body.appendChild(stopPill);
  }

  function hideStopPill() {
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }
    recordingStartTime = null;
    if (stopPill) {
      stopPill.remove();
      stopPill = null;
    }
    var pulseStyle = document.getElementById("prengine-pulse-style");
    if (pulseStyle) pulseStyle.remove();
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
    closeBtn.addEventListener("click", function () {
      if (!isRecording) closeModal();
    });

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
    iframeRef = iframe;

    // Close on overlay background click (but not while recording)
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay && !isRecording) closeModal();
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

      if (event.data.type === "PRENGINE_RECORDING_STATE") {
        isRecording = !!event.data.recording;
        if (isRecording) {
          // Hide modal so it's not in the recording, show floating stop pill
          if (overlay) overlay.style.display = "none";
          if (button) button.style.display = "none";
          showStopPill();
        } else {
          // Recording ended — show modal again for upload progress
          hideStopPill();
          if (overlay) overlay.style.display = "flex";
          if (button) button.style.display = widgetStyle === "bar" ? "block" : "flex";
        }
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
    iframeRef = null;
    isModalOpen = false;
    isRecording = false;
    hideStopPill();
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
