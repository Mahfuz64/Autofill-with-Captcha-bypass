function cropImage(x, y, w, h) {
    const img = new Image();

    img.onload = async function () {
        // Calculate EXACT scaling factor based on actual captured dimensions vs viewport dimensions
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w * scaleX);
        canvas.height = Math.max(1, h * scaleY);

        const ctx = canvas.getContext("2d");

        ctx.drawImage(
            img,
            x * scaleX,
            y * scaleY,
            w * scaleX,
            h * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const dataUrl = canvas.toDataURL("image/png");

        // Send pixel-perfect cropped area to OCR
        runOCR(dataUrl);
    };

    img.src = screenshot;
}