import exifr from 'exifr';

/**
 * Extract comprehensive metadata from image buffer
 * Extracts ALL available EXIF/GPS/IPTC data for forensic display
 * @param {Buffer} buffer
 * @returns {Object|null} Metadata object
 */
export async function extractPhotoMetadata(buffer) {
    try {
        const output = await exifr.parse(buffer, {
            tiff: true,
            exif: true,
            gps: true,
            ifd0: true,
            ifd1: true,
            iptc: true,
            xmp: true,
            interop: true,
            translateKeys: true,
            translateValues: true,
            reviveValues: true
        });

        if (!output) return null;

        return {
            // Device Info
            make: output.Make || null,
            model: output.Model || null,
            software: output.Software || null,
            lensMake: output.LensMake || null,
            lensModel: output.LensModel || output.Lens || null,

            // Timestamps
            dateTime: output.DateTimeOriginal || output.CreateDate || output.ModifyDate || null,
            dateTimeDigitized: output.DateTimeDigitized || null,

            // GPS Data
            latitude: output.latitude || null,
            longitude: output.longitude || null,
            altitude: output.GPSAltitude || null,
            altitudeRef: output.GPSAltitudeRef || null,
            gpsSpeed: output.GPSSpeed || null,
            gpsDirection: output.GPSImgDirection || null,
            gpsDOP: output.GPSDOP || null,

            // Image Dimensions & Resolution
            width: output.ExifImageWidth || output.ImageWidth || null,
            height: output.ExifImageHeight || output.ImageHeight || null,
            xResolution: output.XResolution || null,
            yResolution: output.YResolution || null,
            resolutionUnit: output.ResolutionUnit || null,
            orientation: output.Orientation || null,

            // Camera Settings
            iso: output.ISO || null,
            fStop: output.FNumber || null,
            exposure: output.ExposureTime || null,
            focalLength: output.FocalLength || null,
            focalLengthIn35mm: output.FocalLengthIn35mmFormat || null,
            flash: output.Flash || null,
            whiteBalance: output.WhiteBalance || null,
            exposureMode: output.ExposureMode || null,
            exposureProgram: output.ExposureProgram || null,
            meteringMode: output.MeteringMode || null,
            sceneCaptureType: output.SceneCaptureType || null,
            brightnessValue: output.BrightnessValue || null,
            contrast: output.Contrast || null,
            saturation: output.Saturation || null,
            sharpness: output.Sharpness || null,

            // Color & Encoding
            colorSpace: output.ColorSpace || null,
            bitsPerSample: output.BitsPerSample || null,
            compression: output.Compression || null,

            // Digital Fingerprint
            imageUniqueID: output.ImageUniqueID || null,
            bodySerialNumber: output.BodySerialNumber || null,
            lensSerialNumber: output.LensSerialNumber || null,

            // Summary for Google Sheets (compact)
            summary: [
                output.Make, output.Model,
                output.ExifImageWidth && output.ExifImageHeight ? `${output.ExifImageWidth}x${output.ExifImageHeight}` : null,
                output.ISO ? `ISO${output.ISO}` : null,
                output.FNumber ? `f/${output.FNumber}` : null,
                output.FocalLength ? `${output.FocalLength}mm` : null,
                output.latitude ? `GPS:${output.latitude.toFixed(4)},${output.longitude.toFixed(4)}` : null
            ].filter(Boolean).join(' | ')
        };
    } catch (error) {
        console.warn('Metadata extraction failed', error.message);
        return null;
    }
}

/**
 * Extract GPS coordinates from image buffer (Wrapper)
 */
export async function extractGpsData(buffer) {
    const meta = await extractPhotoMetadata(buffer);
    if (meta && meta.latitude && meta.longitude) {
        return { latitude: meta.latitude, longitude: meta.longitude };
    }
    return null;
}
