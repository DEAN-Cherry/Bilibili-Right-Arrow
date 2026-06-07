// ==UserScript==
// @name         B站右键 Bilibili-Right-Arrow
// @description  按住"→"键倍速播放，松开"→"键恢复原速；单击"→"键快进。支持所有H5视频网站(YouTube、腾讯视频、优酷、番剧等)。Fork 并修改自 SkyJin 的 Golden-Right (https://github.com/SkyJinXX/Golden-Right)。Press and hold the right arrow key (→) to speed up, release to restore; tap → to skip forward.
// @namespace    http://tampermonkey.net/
// @homepage     https://github.com/DEAN-Cherry/Bilibili-Right-Arrow
// @version      1.2.0
// @author       DEAN-Cherry
// @match        http://*/*
// @match        https://*/*
// @exclude      *://*.bilibili.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function () {
    "use strict";

    // GM storage with graceful fallback (works even without @grant)
    const GMget = (k, d) => (typeof GM_getValue === "function" ? GM_getValue(k, d) : d);
    const GMset = (k, v) => { if (typeof GM_setValue === "function") GM_setValue(k, v); };

    // User-configurable settings (brought from upstream Golden-Right)
    let faster_rate = GMget("faster_rate", 3);
    let add_time = GMget("add_time", 3);
    let normal_rate = 1;

    const isYT = location.origin.indexOf("youtube.com") > -1;

    let page_video;
    let speedActive = false; // currently in hold-to-speed mode
    let didRepeat = false;   // auto-repeat (hold) seen during the current press

    function makeArray(arr) {
        if (arr.item) {
            var len = arr.length;
            var array = [];
            while (len--) {
                array[len] = arr[len];
            }
            return array;
        }
        return Array.prototype.slice.call(arr);
    }

    /* ---------------- styles (modern, dark/light aware) ---------------- */
    const STYLE_ID = "gr-style";
    const ensureStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
.gr-speed-indicator{
  position:absolute; top:16px; left:50%;
  transform:translateX(-50%) translateY(-10px) scale(.96);
  display:flex; align-items:center; gap:7px;
  padding:7px 13px; border-radius:999px;
  font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
  letter-spacing:.02em; white-space:nowrap;
  z-index:2147483647; pointer-events:none; user-select:none;
  opacity:0; transition:opacity .22s ease, transform .26s cubic-bezier(.2,.8,.2,1);
  background:rgba(255,255,255,.82); color:#1c1c1e;
  border:1px solid rgba(0,0,0,.06); box-shadow:0 6px 22px rgba(0,0,0,.16);
  -webkit-backdrop-filter:blur(14px) saturate(160%); backdrop-filter:blur(14px) saturate(160%);
}
.gr-speed-indicator.gr-visible{ opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
.gr-speed-indicator .gr-ico{ width:15px; height:15px; display:block; color:inherit; opacity:.9; }
.gr-speed-indicator.gr-visible .gr-ico{ animation:gr-ff 1s ease-in-out infinite; }
.gr-speed-indicator .gr-num{ font-variant-numeric:tabular-nums; }
@keyframes gr-ff{ 0%,100%{ opacity:.5; transform:translateX(-1px); } 50%{ opacity:1; transform:translateX(2px); } }

.gr-overlay{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.45); -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px);
  z-index:2147483647; }
.gr-dialog{ width:min(92vw,420px); box-sizing:border-box; padding:22px 22px 18px; border-radius:16px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
  background:#fff; color:#1c1c1e; box-shadow:0 20px 60px rgba(0,0,0,.35); border:1px solid rgba(0,0,0,.06); }
.gr-dialog h3{ margin:0 0 16px; font-size:17px; font-weight:700; }
.gr-row{ margin:14px 0; }
.gr-row label{ display:block; margin-bottom:6px; font-size:13px; font-weight:600; }
.gr-row input{ width:110px; padding:8px 10px; font-size:14px; border-radius:9px;
  border:1px solid rgba(0,0,0,.18); background:#fff; color:inherit; outline:none; box-sizing:border-box; }
.gr-row input:focus{ border-color:#8e8e93; box-shadow:0 0 0 3px rgba(120,120,128,.22); }
.gr-hint{ margin-left:10px; font-size:12px; opacity:.6; }
.gr-help{ margin:18px 0 4px; padding:11px 13px; font-size:12.5px; line-height:1.8; border-radius:10px;
  background:rgba(120,120,128,.1); border:1px solid rgba(120,120,128,.18); }
.gr-actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
.gr-btn{ padding:8px 16px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer;
  border:1px solid transparent; transition:filter .15s ease; }
.gr-btn:hover{ filter:brightness(1.06); }
.gr-btn-cancel{ background:rgba(0,0,0,.05); color:inherit; border-color:rgba(0,0,0,.1); }
.gr-btn-save{ background:#1c1c1e; color:#fff; }
@media (prefers-color-scheme: dark){
  .gr-speed-indicator{ background:rgba(28,28,30,.7); color:#f5f5f7;
    border:1px solid rgba(255,255,255,.12); box-shadow:0 6px 24px rgba(0,0,0,.5); }
  .gr-dialog{ background:#1c1c1e; color:#f5f5f7; border:1px solid rgba(255,255,255,.1); }
  .gr-row input{ background:#2c2c2e; border-color:rgba(255,255,255,.16); }
  .gr-btn-cancel{ background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.14); }
  .gr-btn-save{ background:#f5f5f7; color:#1c1c1e; }
}`;
        (document.head || document.documentElement).appendChild(style);
    };

    /* ---------------- speed indicator ---------------- */
    const INDICATOR_ID = "gr-speed-indicator";
    const SVG_NS = "http://www.w3.org/2000/svg";

    const ensureIndicator = (host) => {
        let el = document.getElementById(INDICATOR_ID);
        if (!el) {
            el = document.createElement("div");
            el.id = INDICATOR_ID;
            el.className = "gr-speed-indicator";
            // Build via DOM API (avoids TrustedHTML errors on strict CSP sites)
            const svg = document.createElementNS(SVG_NS, "svg");
            svg.setAttribute("class", "gr-ico");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", "currentColor");
            svg.setAttribute("aria-hidden", "true");
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", "M3 5l8.5 7L3 19V5zm9 0l8.5 7L12 19V5z");
            svg.appendChild(path);
            const num = document.createElement("span");
            num.className = "gr-num";
            el.appendChild(svg);
            el.appendChild(num);
        }
        if (host && el.parentElement !== host) host.appendChild(el);
        return el;
    };

    const showSpeedIndicator = (anchorEl) => {
        ensureStyle();
        const host = (anchorEl && anchorEl.parentElement) || document.body;
        const el = ensureIndicator(host);
        el.querySelector(".gr-num").textContent = faster_rate + "×";
        void el.offsetWidth; // force reflow so the fade-in transition plays
        el.classList.add("gr-visible");
    };

    const hideSpeedIndicator = () => {
        const el = document.getElementById(INDICATOR_ID);
        if (el) el.classList.remove("gr-visible");
    };

    /* ---------------- video discovery ---------------- */
    const checkPageVideo = (v) => !!v && v.offsetWidth > 9 && !v.paused;
    const getPageVideo = () => {
        const all = makeArray(document.getElementsByTagName("video"))
            .concat(makeArray(document.getElementsByTagName("bwp-video")));
        return Array.prototype.find.call(all, (e) => checkPageVideo(e));
    };

    const checkPageVideo_YT = (v) => !!v && v.getPlayerState() === 1;
    const getPageVideo_YT = () => {
        const p = document.getElementById("ytd-player");
        if (p && checkPageVideo_YT(p.player_)) return p.player_;
    };

    /* ---------------- qq/wetv rate&time event guard ---------------- */
    const relativeEvent = {
        _stopper: (e) => e.stopPropagation(),
        shouldPrevent:
            location.origin.indexOf("qq.com") > -1 ||
            location.origin.indexOf("wetv.vip") > -1,
        prevent() {
            document.body.addEventListener("ratechange", this._stopper, true);
            document.body.addEventListener("timeupdate", this._stopper, true);
        },
        allow() {
            document.body.removeEventListener("ratechange", this._stopper, true);
            document.body.removeEventListener("timeupdate", this._stopper, true);
        },
    };

    /* ---------------- actions: standard H5 video ---------------- */
    const beginFast = () => {
        if (checkPageVideo(page_video) || (page_video = getPageVideo())) {
            relativeEvent.shouldPrevent && relativeEvent.prevent();
            normal_rate = page_video.playbackRate;
            page_video.playbackRate = faster_rate;
            showSpeedIndicator(page_video);
            speedActive = true;
        }
    };
    const endFast = () => {
        if (page_video) page_video.playbackRate = normal_rate;
        relativeEvent.shouldPrevent && relativeEvent.allow();
        hideSpeedIndicator();
        speedActive = false;
    };
    const skipForward = () => {
        if (checkPageVideo(page_video) || (page_video = getPageVideo())) {
            page_video.currentTime += add_time;
        }
    };

    /* ---------------- actions: YouTube native player ---------------- */
    const beginFast_YT = () => {
        if (checkPageVideo_YT(page_video) || (page_video = getPageVideo_YT())) {
            normal_rate = page_video.getPlaybackRate();
            page_video.setPlaybackRate(faster_rate);
            showSpeedIndicator(page_video.getIframe());
            speedActive = true;
        }
    };
    const endFast_YT = () => {
        if (page_video) page_video.setPlaybackRate(normal_rate);
        hideSpeedIndicator();
        speedActive = false;
    };
    const skipForward_YT = () => {
        if (checkPageVideo_YT(page_video) || (page_video = getPageVideo_YT())) {
            page_video.seekToStreamTime(page_video.getCurrentTime() + add_time);
        }
    };

    const begin = isYT ? beginFast_YT : beginFast;
    const end = isYT ? endFast_YT : endFast;
    const skip = isYT ? skipForward_YT : skipForward;

    /* ----------- key handling: robust tap-vs-hold via e.repeat -----------
       A real "hold" fires keydown events with e.repeat === true (OS auto-
       repeat). A "tap" produces a single keydown (repeat false) then keyup.
       This is self-correcting every keyup, so the state can never get stuck
       (the old down_count counter could, which broke later taps). */
    const downEvent = (e) => {
        if (e.keyCode !== 39) return;
        e.stopPropagation();
        if (e.repeat) {
            didRepeat = true;
            if (!speedActive) begin();
        } else {
            didRepeat = false; // fresh press
        }
    };
    const upEvent = (e) => {
        if (e.keyCode !== 39) return;
        e.stopPropagation();
        if (speedActive) {
            end();
        } else if (!didRepeat) {
            skip();
        }
        didRepeat = false;
    };

    /* ---------------- settings dialog (upstream feature, restyled) ---------------- */
    const showSettings = () => {
        ensureStyle();
        const overlay = document.createElement("div");
        overlay.className = "gr-overlay";

        const dialog = document.createElement("div");
        dialog.className = "gr-dialog";

        const title = document.createElement("h3");
        title.textContent = "黄金右键 · 设置 / Settings";
        dialog.appendChild(title);

        const mkRow = (labelText, id, val, min, max, step, hint) => {
            const row = document.createElement("div");
            row.className = "gr-row";
            const label = document.createElement("label");
            label.textContent = labelText;
            label.htmlFor = id;
            row.appendChild(label);
            const input = document.createElement("input");
            input.type = "number";
            input.id = id;
            input.value = val;
            input.min = min;
            input.max = max;
            if (step) input.step = step;
            row.appendChild(input);
            const h = document.createElement("span");
            h.className = "gr-hint";
            h.textContent = hint;
            row.appendChild(h);
            dialog.appendChild(row);
            return input;
        };

        const rateInput = mkRow("倍速 / Playback rate", "gr-rate", GMget("faster_rate", 3), "1", "16", "0.1", "建议 2–4");
        const timeInput = mkRow("快进秒数 / Skip seconds", "gr-time", GMget("add_time", 3), "1", "120", "1", "单击 → 前进的秒数");

        const help = document.createElement("div");
        help.className = "gr-help";
        const l1 = document.createElement("div");
        const b1 = document.createElement("b");
        b1.textContent = "→";
        l1.append("单击 ", b1, "：快进指定秒数");
        const l2 = document.createElement("div");
        const b2 = document.createElement("b");
        b2.textContent = "→";
        l2.append("按住 ", b2, "：倍速播放，松开恢复");
        help.append(l1, l2);
        dialog.appendChild(help);

        const actions = document.createElement("div");
        actions.className = "gr-actions";
        const cancel = document.createElement("button");
        cancel.className = "gr-btn gr-btn-cancel";
        cancel.textContent = "取消 Cancel";
        const save = document.createElement("button");
        save.className = "gr-btn gr-btn-save";
        save.textContent = "保存 Save";
        actions.append(cancel, save);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        (document.body || document.documentElement).appendChild(overlay);

        const close = () => overlay.remove();
        cancel.onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        save.onclick = () => {
            const r = parseFloat(rateInput.value);
            const t = parseInt(timeInput.value, 10);
            if (r > 0 && t > 0) {
                GMset("faster_rate", r);
                GMset("add_time", t);
                faster_rate = r;
                add_time = t;
                close();
            } else {
                rateInput.focus();
            }
        };
    };

    /* ---------------- init ---------------- */
    const init = () => {
        document.body.addEventListener("keydown", downEvent, true);
        document.body.parentElement.addEventListener("keyup", upEvent, true);
        // Lost focus while holding → always restore & hide (fixes "UI stays on screen")
        window.addEventListener("blur", () => {
            if (speedActive) {
                end();
                didRepeat = true; // swallow the pending keyup so it doesn't skip
            }
        });
        if (typeof GM_registerMenuCommand === "function") {
            GM_registerMenuCommand("⚙️ 黄金右键设置 / Settings", showSettings);
        }
    };

    init();
})();
