// --- Configure ONNX Runtime for MV3 Offscreen Document ---
if (typeof ort !== "undefined") {
    ort.env.wasm.wasmPaths = chrome.runtime.getURL("");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = false;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = "fatal"; // Suppress WASM C++ warnings from fd_write (Ec)
}

let onnxSession = null;
let charsetMap = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== "offscreen" || message.type !== "RUN_ONNX") return;

    solveCaptcha(message.image).then((text) => {
        sendResponse({ text: text });
    }).catch((err) => {
        sendResponse({ error: err.message });
    });

    return true; // Keep async response channel open
});

async function solveCaptcha(dataUrl) {
    if (typeof ort === "undefined") {
        throw new Error("ONNX Runtime library failed to load in offscreen document.");
    }

    if (!dataUrl || dataUrl.length < 100) {
        throw new Error("Invalid or empty CAPTCHA image captured.");
    }

    // Load character set dictionary
    if (!charsetMap) {
        const res = await fetch(chrome.runtime.getURL("charset.json"));
        if (!res.ok) throw new Error("charset.json file missing in extension folder.");
        charsetMap = await res.json();
    }

    // Load ONNX Model safely with C++ warnings silenced
    if (!onnxSession) {
        const modelUrl = chrome.runtime.getURL("captcha_model.onnx");
        const res = await fetch(modelUrl);
        if (!res.ok) throw new Error("captcha_model.onnx file missing in extension folder.");
        const buffer = await res.arrayBuffer();

        onnxSession = await ort.InferenceSession.create(new Uint8Array(buffer), {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "disabled",
            logSeverityLevel: 4,  // 4 = Fatal only (silences [W:onnxruntime] C++ warnings in fd_write)
            logVerbosityLevel: 4
        });
    }

    // Convert image to normalized float array
    const { floatData, width, height } = await prepareTensor(dataUrl);

    if (width <= 0 || height <= 0) {
        throw new Error("Invalid tensor dimensions generated from CAPTCHA image.");
    }

    const inputTensor = new ort.Tensor("float32", floatData, [1, 1, height, width]);
    const inputName = onnxSession.inputNames[0];

    const results = await onnxSession.run({ [inputName]: inputTensor });
    const outputTensor = results[onnxSession.outputNames[0]];

    return decodeCTC(outputTensor.data, outputTensor.dims, charsetMap);
}

function prepareTensor(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            if (!img.width || !img.height || img.width === 0 || img.height === 0) {
                reject(new Error("Captured image has 0 width or height."));
                return;
            }

            const targetHeight = 64;
            const scale = targetHeight / img.height;
            const targetWidth = Math.max(1, Math.floor(img.width * scale));

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const pixels = imgData.data;
            const floatData = new Float32Array(targetWidth * targetHeight);

            for (let i = 0; i < pixels.length; i += 4) {
                const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
                floatData[i / 4] = (gray / 255.0 - 0.5) / 0.5;
            }

            resolve({ floatData, width: targetWidth, height: targetHeight });
        };
        img.onerror = () => reject(new Error("Failed to load image data URL into Image object."));
        img.src = dataUrl;
    });
}

function decodeCTC(data, dims, charset) {
    let steps = 0;
    let classes = 0;

    // Support dynamic 3D output shapes e.g. {21, 1, 8210} or {1, 21, 8210}
    if (dims.length === 3) {
        if (dims[0] === 1) {
            steps = dims[1];
            classes = dims[2];
        } else if (dims[1] === 1) {
            steps = dims[0];
            classes = dims[2];
        } else {
            steps = dims[0];
            classes = dims[2];
        }
    } else if (dims.length === 2) {
        steps = dims[0];
        classes = dims[1];
    } else {
        steps = dims[0];
        classes = dims[dims.length - 1];
    }

    let resultStr = "";
    let lastClassIdx = -1;

    for (let t = 0; t < steps; t++) {
        let maxIdx = 0;
        let maxVal = -Infinity;

        for (let c = 0; c < classes; c++) {
            const val = data[t * classes + c];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = c;
            }
        }

        if (maxIdx !== 0 && maxIdx !== lastClassIdx) {
            if (charset[maxIdx]) {
                resultStr += charset[maxIdx];
            }
        }
        lastClassIdx = maxIdx;
    }

    return resultStr;
}