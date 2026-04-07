// AvatarCropEditor – inline circular avatar crop selector.
//
// The preview math mirrors _crop_cover() in uploads.py exactly so what you
// see in the circle is what the backend will generate.
//
// Crop parameters: { x, y, zoom }
//   x, y  : -1.0 … 1.0  — normalized offset from image center
//   zoom  : 1.0 … 4.0   — zoom multiplier (1 = minimum cover)

const { useCallback, useEffect, useRef, useState } = React;

const VIEWPORT_PX = 320; // diameter of the preview circle (matches CSS)
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.01;

export function AvatarCropEditor({ imageFile, initialCrop, onApply, onCancel }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [panX, setPanX] = useState(initialCrop?.x ?? 0);
  const [panY, setPanY] = useState(initialCrop?.y ?? 0);
  const [zoom, setZoom] = useState(
    Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, initialCrop?.zoom ?? 1.0))
  );

  const dragRef = useRef(null); // {startX, startY, startPanX, startPanY}
  const viewportRef = useRef(null);

  // Create a local object URL from the File; reset pan/zoom to initialCrop (or defaults)
  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setObjectUrl(url);
    setLoaded(false);
    setPanX(initialCrop?.x ?? 0);
    setPanY(initialCrop?.y ?? 0);
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, initialCrop?.zoom ?? 1.0)));
    return () => URL.revokeObjectURL(url);
  }, [imageFile, initialCrop]);

  const handleImageLoad = useCallback(
    (event) => {
      setNaturalW(event.currentTarget.naturalWidth);
      setNaturalH(event.currentTarget.naturalHeight);
      setLoaded(true);
    },
    []
  );

  // ── Geometry (matches _crop_cover in uploads.py) ────────────────────────────
  const minSide = Math.min(naturalW, naturalH) || 1;
  const cropSrcW = minSide / zoom; // crop window width in source pixels
  const cropSrcH = minSide / zoom;
  const displayScale = naturalW && naturalH ? VIEWPORT_PX / cropSrcW : 1;
  const offsetX = (naturalW - cropSrcW) / 2;
  const offsetY = (naturalH - cropSrcH) / 2;
  const cx = naturalW / 2 + panX * offsetX;
  const cy = naturalH / 2 + panY * offsetY;
  const imgW = naturalW * displayScale;
  const imgH = naturalH * displayScale;
  const imgLeft = VIEWPORT_PX / 2 - cx * displayScale;
  const imgTop = VIEWPORT_PX / 2 - cy * displayScale;

  // ── Drag handling ────────────────────────────────────────────────────────────
  const stopDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onMouseUp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDelta = useCallback(
    (dxPx, dyPx) => {
      if (!dragRef.current) return;
      const { startPanX, startPanY } = dragRef.current;
      // Converting screen-pixel delta to normalized pan units:
      //   newCx = oldCx - dxPx / displayScale
      //   newPanX = (newCx - naturalW/2) / offsetX
      const panDx = offsetX > 0 ? dxPx / (displayScale * offsetX) : 0;
      const panDy = offsetY > 0 ? dyPx / (displayScale * offsetY) : 0;
      setPanX(Math.max(-1, Math.min(1, startPanX - panDx)));
      setPanY(Math.max(-1, Math.min(1, startPanY - panDy)));
    },
    [displayScale, offsetX, offsetY]
  );

  const onMouseMove = useCallback(
    (event) => {
      if (!dragRef.current) return;
      applyDelta(
        event.clientX - dragRef.current.startX,
        event.clientY - dragRef.current.startY
      );
    },
    [applyDelta]
  );

  const onTouchMove = useCallback(
    (event) => {
      if (!dragRef.current) return;
      event.preventDefault();
      const t = event.touches[0];
      applyDelta(
        t.clientX - dragRef.current.startX,
        t.clientY - dragRef.current.startY
      );
    },
    [applyDelta]
  );

  const onMouseUp = useCallback(() => stopDrag(), [stopDrag]);

  const startDrag = useCallback(
    (clientX, clientY) => {
      dragRef.current = {
        startX: clientX,
        startY: clientY,
        startPanX: panX,
        startPanY: panY,
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onMouseUp);
    },
    [panX, panY, onMouseMove, onMouseUp, onTouchMove]
  );

  const handleMouseDown = useCallback(
    (event) => {
      event.preventDefault();
      startDrag(event.clientX, event.clientY);
    },
    [startDrag]
  );

  const handleTouchStart = useCallback(
    (event) => {
      const t = event.touches[0];
      startDrag(t.clientX, t.clientY);
    },
    [startDrag]
  );

  // Clean up listeners on unmount
  useEffect(
    () => () => stopDrag(),
    [stopDrag]
  );

  // ── Apply ────────────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!imageFile || !onApply) return;
    onApply({
      file: imageFile,
      cropJson: { x: panX, y: panY, zoom },
    });
  }, [imageFile, onApply, panX, panY, zoom]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="avatar-crop-editor">
      <p className="avatar-crop-hint">
        Перетащите изображение, чтобы выбрать область фокуса
      </p>

      <div
        ref={viewportRef}
        className="avatar-crop-viewport"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        aria-label="Область кадрирования аватара"
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt=""
            draggable={false}
            onLoad={handleImageLoad}
            style={
              loaded
                ? {
                    position: "absolute",
                    width: imgW + "px",
                    height: imgH + "px",
                    left: imgLeft + "px",
                    top: imgTop + "px",
                    pointerEvents: "none",
                    userSelect: "none",
                  }
                : { opacity: 0 }
            }
          />
        ) : null}
        {!loaded ? (
          <span className="avatar-crop-loading">Загрузка…</span>
        ) : null}
      </div>

      <div className="avatar-crop-controls">
        <label htmlFor="avatar-crop-zoom">Масштаб</label>
        <input
          id="avatar-crop-zoom"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(event) => setZoom(parseFloat(event.target.value))}
        />
        <span>{zoom.toFixed(1)}×</span>
      </div>

      <div className="avatar-crop-actions">
        <button className="btn" type="button" onClick={handleApply} disabled={!loaded}>
          Применить
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
