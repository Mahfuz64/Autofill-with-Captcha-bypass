// --- 1. TELETALK BADGE LISTENER ---
function updateBadge(tabId, url) {
    if (url && url.includes("teletalk.com.bd")) {
        chrome.action.setBadgeText({ text: "🗲", tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0], tabId: tabId });
    } else {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) updateBadge(activeInfo.tabId, tab.url);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab && tab.url) {
        updateBadge(tabId, tab.url);
    }
});

// --- 2. SHORTCUT COMMAND LISTENER ---
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "start-ocr") {
        triggerCapture();
    }
});

async function triggerCapture(targetTabId) {
    let tabId = targetTabId;
    if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        tabId = tab.id;
    }

    chrome.tabs.get(tabId, (tab) => {
        if (!tab) return;
        chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (image) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            chrome.tabs.sendMessage(tabId, { type: "SCREENSHOT", image: image });
        });
    });
}

// --- 3. MESSAGE ROUTER & OFFSCREEN PROCESSOR ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TRIGGER_CAPTURE") {
        triggerCapture(sender?.tab?.id);
        sendResponse({ status: "started" });
        return true;
    }

    if (message.type === "PROCESS_CAPTCHA") {
        processInOffscreen(message.image)
            .then((result) => sendResponse(result))
            .catch((err) => sendResponse({ error: err.message }));
        return true; // Keep message channel open for async response
    }
});

async function processInOffscreen(imageDataUrl) {
    if (!await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.createDocument({
            url: "offscreen.html",
            reasons: ["WORKERS"],
            justification: "Run ONNX Runtime WebAssembly inference for CAPTCHA solving"
        });
    }

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            target: "offscreen",
            type: "RUN_ONNX",
            image: imageDataUrl
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}