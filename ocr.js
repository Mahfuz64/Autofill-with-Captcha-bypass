async function runOCR(dataUrl) {
    showLoadingUI();
    try {
        // Delegate execution to Background -> Offscreen Document
        const response = await chrome.runtime.sendMessage({
            type: "PROCESS_CAPTCHA",
            image: dataUrl
        });

        if (response && response.error) {
            throw new Error(response.error);
        }

        let recognizedText = (response && response.text) ? response.text : "";
        recognizedText = recognizedText.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();

        hideLoadingUI();

        if (recognizedText.length > 0) {
            // Automatically paste text into the #captcha input box
            autoFillCaptchaInput(recognizedText);
            
            showResultUI(recognizedText, dataUrl);
        } else {
            alert("No text detected. Try selecting the CAPTCHA box closely.");
        }

    } catch (err) {
        hideLoadingUI();
        console.error("Offscreen OCR Error:", err);
        alert("OCR Error: " + (err.message || err));
    }
}

const runOcrEngine = runOCR;

/**
 * Automatically targets <input id="captcha" name="captcha">
 * and triggers input/change/focus events to paste the text instantly.
 */
function autoFillCaptchaInput(text) {
    const selectors = [
        "#captcha",                      // Exact ID match (<input id="captcha">)
        "input[name='captcha']",         // Exact Name match (<input name="captcha">)
        "input[id*='captcha']",
        "input[name*='captcha']",
        "input[id*='vcode']",
        "input[name*='code']",
        "input[id*='code']",
        "input[placeholder*='code']",
        "input[placeholder*='captcha']"
    ];

    for (let selector of selectors) {
        const input = document.querySelector(selector);
        if (input) {
            input.focus();
            input.value = text;
            
            // Dispatch synthetic events so JS frameworks & HTML5 validation detect the paste
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
            break;
        }
    }
}

function showLoadingUI() {
    let loader = document.getElementById("ocr-loading-overlay");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "ocr-loading-overlay";
        loader.innerHTML = `
            <div style="
                position: fixed; top: 20px; right: 20px;
                background: #0f172a; color: #ffffff;
                padding: 12px 20px; border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-family: sans-serif; font-size: 14px;
                z-index: 2147483647; display: flex;
                align-items: center; gap: 10px;
            ">
                <div style="
                    width: 16px; height: 16px;
                    border: 2px solid #3b82f6; border-top-color: transparent;
                    border-radius: 50%; animation: ocr-spin 0.8s linear infinite;
                "></div>
                Solving CAPTCHA & Auto-Filling...
            </div>
            <style>@keyframes ocr-spin { to { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(loader);
    }
}

function hideLoadingUI() {
    const loader = document.getElementById("ocr-loading-overlay");
    if (loader) loader.remove();
}

function showResultUI(text, cropUrl) {
    const existing = document.getElementById("ocr-result-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "ocr-result-modal";
    modal.innerHTML = `
        <div style="
            position: fixed; bottom: 30px; right: 30px;
            background: #ffffff; color: #1e293b;
            border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            padding: 18px 22px; z-index: 2147483647;
            font-family: system-ui, -apple-system, sans-serif;
            min-width: 280px; max-width: 380px; border: 1px solid #e2e8f0;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: 600; font-size: 13px; color: #64748b;">Pasted to #captcha Textbox</span>
                <button id="ocr-modal-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8;">&times;</button>
            </div>
            
            <div style="display: flex; justify-content: center; margin-bottom: 12px; background: #f1f5f9; padding: 6px; border-radius: 6px;">
                <img src="${cropUrl}" style="height: 40px; object-fit: contain;" title="Captured CAPTCHA"/>
            </div>

            <div style="
                background: #f8fafc; border: 2px solid #16a34a;
                border-radius: 8px; padding: 10px;
                font-size: 26px; font-weight: 800;
                letter-spacing: 5px; color: #0f172a;
                text-align: center; margin-bottom: 12px;
                user-select: all;
            ">${escapeHtml(text)}</div>
            
            <button id="ocr-modal-copy" style="
                width: 100%; background: #2563eb; color: white;
                border: none; padding: 10px; border-radius: 6px;
                font-weight: 600; font-size: 13px; cursor: pointer;
            ">Copy Text</button>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("ocr-modal-close").onclick = () => modal.remove();

    const copyBtn = document.getElementById("ocr-modal-copy");
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerText = "Copied!";
            copyBtn.style.background = "#16a34a";
            setTimeout(() => {
                copyBtn.innerText = "Copy Text";
                copyBtn.style.background = "#2563eb";
            }, 2000);
        });
    };
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}