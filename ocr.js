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
            // Automatically paste text directly into the #captcha input box
            autoFillCaptchaInput(recognizedText);
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