// ==========================================
// 1. CAPTCHA DETECTOR & SCREENSHOT RECEIVER
// ==========================================
let screenshot = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "AUTO_SOLVE_CAPTCHA") {
        const captchaImg = findCaptchaOnPage();
        if (captchaImg) {
            captureElementImage(captchaImg);
            sendResponse({ success: true, method: "element" });
        } else {
            // Request full tab screenshot as fallback
            chrome.runtime.sendMessage({ type: "TRIGGER_CAPTURE" });
            sendResponse({ success: true, method: "screenshot" });
        }
        return true;
    }

    if (message.type === "SCREENSHOT") {
        screenshot = message.image;
        const captchaImg = findCaptchaOnPage();
        if (captchaImg) {
            captureElementImage(captchaImg);
        } else {
            startSelection();
        }
    }
});

function findCaptchaOnPage() {
    const selectors = [
        "img[src*='captcha']",
        "img[src*='code']",
        "img[id*='captcha']",
        "img[id*='code']",
        "img[alt*='captcha']",
        "#vcode",
        "#captcha_img"
    ];

    for (let selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.width > 20 && el.height > 10) {
            return el;
        }
    }
    return null;
}

function captureElementImage(imgEl) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = imgEl.naturalWidth || imgEl.width;
        canvas.height = imgEl.naturalHeight || imgEl.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0);

        const dataUrl = canvas.toDataURL("image/png");
        runOCR(dataUrl);
    } catch (e) {
        const rect = imgEl.getBoundingClientRect();
        cropImage(rect.left, rect.top, rect.width, rect.height);
    }
}

function startSelection() {
    if (document.getElementById("screen-ocr-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "screen-ocr-overlay";

    const box = document.createElement("div");
    box.id = "screen-ocr-selection";

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let sx = 0, sy = 0;

    overlay.onmousedown = (e) => {
        sx = e.clientX;
        sy = e.clientY;

        box.style.left = sx + "px";
        box.style.top = sy + "px";
        box.style.width = "0px";
        box.style.height = "0px";

        overlay.onmousemove = (ev) => {
            const left = Math.min(sx, ev.clientX);
            const top = Math.min(sy, ev.clientY);
            const width = Math.abs(ev.clientX - sx);
            const height = Math.abs(ev.clientY - sy);

            box.style.left = left + "px";
            box.style.top = top + "px";
            box.style.width = width + "px";
            box.style.height = height + "px";
        };
    };

    overlay.onmouseup = (e) => {
        const width = Math.abs(e.clientX - sx);
        const height = Math.abs(e.clientY - sy);
        const left = Math.min(sx, e.clientX);
        const top = Math.min(sy, e.clientY);

        overlay.remove();

        if (width > 5 && height > 5) {
            cropImage(left, top, width, height);
        }
    };

    window.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") {
            overlay.remove();
            window.removeEventListener("keydown", escHandler);
        }
    });
}

// ==========================================
// 2. THE PAGE 2 WATCHER (Aggressive Hunter)
// ==========================================
chrome.storage.local.get(["savedProfiles", "page2Armed"], (result) => {
    const profileName = result.page2Armed;
    if (!profileName) return; 

    const profile = result.savedProfiles ? result.savedProfiles[profileName] : null;
    if (!profile) return;

    let injectedAnything = false;
    let attempts = 0;

    function injectVirtualFile(base64Data, filename, keywords) {
        if (!base64Data || base64Data.trim() === "") return false;
        
        const fileInputs = document.querySelectorAll('input[type="file"]');
        let target = null;
        
        for (const el of fileInputs) {
            const identifier = ((el.name || "") + " " + (el.id || "") + " " + (el.className || "")).toLowerCase();
            if (keywords.some(kw => identifier.includes(kw))) {
                target = el;
                break;
            }
        }

        if (target && target.files.length === 0) {
            try {
                const arr = base64Data.split(',');
                const mime = arr[0].match(/:(.*?);/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while(n--){ u8arr[n] = bstr.charCodeAt(n); }
                const file = new File([u8arr], filename, { type: mime });

                const dt = new DataTransfer();
                dt.items.add(file);
                target.files = dt.files;
                
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                
                target.style.border = "3px solid #4CAF50";
                console.log(`✅ Auto-uploaded: ${filename}`);
                return true;
            } catch (err) {
                console.error(`❌ Error uploading ${filename}:`, err);
            }
        }
        return false;
    }

    function checkDeclaration() {
        const checkbox = document.querySelector('input[name="agree"], input[name="declare"], input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
            checkbox.click();
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            console.log("✅ Page 2 Declaration checked automatically.");
            return true;
        }
        return false;
    }

    console.log("👀 Page 2 Watcher is hunting for photo boxes and checkboxes...");

    const huntInterval = setInterval(() => {
        attempts++;
        
        const photoInjected = injectVirtualFile(profile.photo_base64, "photo.jpg", ["photo", "pic", "image"]);
        const sigInjected = injectVirtualFile(profile.signature_base64, "signature.jpg", ["sig", "sign"]); 
        const boxChecked = checkDeclaration();

        if (photoInjected || sigInjected || boxChecked) {
            injectedAnything = true;
        }

        if (injectedAnything || attempts >= 10) {
            clearInterval(huntInterval);
            if (injectedAnything) {
                chrome.storage.local.remove("page2Armed"); 
                console.log("✅ Watcher finished and disarmed.");
            }
        }
    }, 500); 
});