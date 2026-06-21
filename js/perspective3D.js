class Perspective3D {
    constructor(container, sourceCanvas) {
        this.container = container;
        this.sourceCanvas = sourceCanvas;
        this.options = {
            enabled: true,
            rotateX: 55,
            rotateY: -15,
            rotateZ: 0,
            perspective: 1200,
            lightX: -0.5,
            lightY: -0.7,
            lightZ: 0.8,
            ambientIntensity: 0.35,
            diffuseIntensity: 0.6,
            specularIntensity: 0.25,
            shadowBlur: 25,
            shadowOffsetX: 8,
            shadowOffsetY: 12,
            shadowOpacity: 0.4,
            pageScale: 0.75
        };
        this._dirty = true;
        this._rafId = null;
        this._lastRenderTime = 0;
        this._minFrameInterval = 16;
        this._paperCacheWidth = 0;
        this._paperCacheHeight = 0;
        this._paperCacheVersion = 0;
        this._sourceVersion = 0;
        this._initDOM();
    }

    _initDOM() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.scene = document.createElement('div');
        this.scene.className = 'perspective-scene';
        this.scene.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 600px;
            display: flex;
            justify-content: center;
            align-items: center;
            perspective: ${this.options.perspective}px;
            perspective-origin: 50% 50%;
        `;
        this.desktop = document.createElement('div');
        this.desktop.className = 'perspective-desktop';
        this.desktop.style.cssText = `
            position: absolute;
            inset: 0;
            background: 
                radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.1) 0%, transparent 50%),
                linear-gradient(135deg, #3a3428 0%, #2a2520 50%, #1a1815 100%);
            border-radius: 12px;
            overflow: hidden;
        `;
        const desktopNoise = document.createElement('div');
        desktopNoise.style.cssText = `
            position: absolute;
            inset: 0;
            opacity: 0.08;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        `;
        this.desktop.appendChild(desktopNoise);
        const paperWrapper = document.createElement('div');
        paperWrapper.className = 'paper-wrapper';
        paperWrapper.style.cssText = `
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.05s linear;
            will-change: transform;
        `;
        this.shadowCanvas = document.createElement('canvas');
        this.shadowCanvas.className = 'paper-shadow-canvas';
        this.shadowCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            transform: translateZ(-1px);
            filter: blur(${this.options.shadowBlur}px);
            opacity: ${this.options.shadowOpacity};
            will-change: transform, opacity;
        `;
        this.shadowCtx = this.shadowCanvas.getContext('2d');
        this.paperContainer = document.createElement('div');
        this.paperContainer.className = 'paper-container';
        this.paperContainer.style.cssText = `
            position: relative;
            transform-style: preserve-3d;
            will-change: transform;
        `;
        this.displayCanvas = document.createElement('canvas');
        this.displayCanvas.className = 'perspective-paper-canvas';
        this.displayCanvas.style.cssText = `
            display: block;
            box-shadow: none;
            border-radius: 2px;
            will-change: transform;
        `;
        this.displayCtx = this.displayCanvas.getContext('2d');
        this.lightCanvas = document.createElement('canvas');
        this.lightCanvas.className = 'perspective-light-canvas';
        this.lightCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            mix-blend-mode: overlay;
            border-radius: 2px;
            will-change: opacity;
        `;
        this.lightCtx = this.lightCanvas.getContext('2d');
        this.specularCanvas = document.createElement('canvas');
        this.specularCanvas.className = 'perspective-specular-canvas';
        this.specularCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            mix-blend-mode: screen;
            border-radius: 2px;
            opacity: ${this.options.specularIntensity};
            will-change: opacity;
        `;
        this.specularCtx = this.specularCanvas.getContext('2d');
        this.paperContainer.appendChild(this.displayCanvas);
        this.paperContainer.appendChild(this.lightCanvas);
        this.paperContainer.appendChild(this.specularCanvas);
        paperWrapper.appendChild(this.shadowCanvas);
        paperWrapper.appendChild(this.paperContainer);
        this.scene.appendChild(this.desktop);
        this.scene.appendChild(paperWrapper);
        this.container.appendChild(this.scene);
        this.paperWrapper = paperWrapper;
    }

    setOptions(options) {
        let changed = false;
        for (const key in options) {
            if (this.options[key] !== options[key]) {
                this.options[key] = options[key];
                changed = true;
            }
        }
        if (changed) {
            this._dirty = true;
            this.scheduleRender();
        }
    }

    setSourceCanvas(canvas) {
        this.sourceCanvas = canvas;
        this._sourceVersion++;
        this._dirty = true;
        this.scheduleRender();
    }

    scheduleRender() {
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            this.render();
        });
    }

    render() {
        const now = performance.now();
        if (!this._dirty && now - this._lastRenderTime < this._minFrameInterval) {
            return;
        }
        this._lastRenderTime = now;
        if (!this.options.enabled) {
            this._renderFlat();
            this._dirty = false;
            return;
        }
        this._updateTransforms();
        this._renderPaper();
        this._renderShadow();
        this._renderLighting();
        this._renderSpecular();
        this._dirty = false;
    }

    _renderFlat() {
        if (!this.sourceCanvas) return;
        this.displayCanvas.width = this.sourceCanvas.width;
        this.displayCanvas.height = this.sourceCanvas.height;
        this.displayCanvas.style.width = this.sourceCanvas.width + 'px';
        this.displayCanvas.style.height = this.sourceCanvas.height + 'px';
        this.displayCtx.drawImage(this.sourceCanvas, 0, 0);
        this.paperWrapper.style.transform = 'none';
        this.shadowCanvas.style.display = 'none';
        this.lightCanvas.style.display = 'none';
        this.specularCanvas.style.display = 'none';
    }

    _updateTransforms() {
        const { rotateX, rotateY, rotateZ, perspective, pageScale } = this.options;
        this.scene.style.perspective = perspective + 'px';
        const radX = (rotateX * Math.PI) / 180;
        const radY = (rotateY * Math.PI) / 180;
        const radZ = (rotateZ * Math.PI) / 180;
        this._surfaceNormal = this._computeSurfaceNormal(radX, radY, radZ);
        this.paperWrapper.style.transform = `
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            rotateZ(${rotateZ}deg)
            scale(${pageScale})
        `;
    }

    _computeSurfaceNormal(radX, radY, radZ) {
        let nx = 0, ny = 0, nz = 1;
        const cosX = Math.cos(radX), sinX = Math.sin(radX);
        const y1 = ny * cosX - nz * sinX;
        const z1 = ny * sinX + nz * cosX;
        ny = y1; nz = z1;
        const cosY = Math.cos(radY), sinY = Math.sin(radY);
        const x2 = nx * cosY + nz * sinY;
        const z2 = -nx * sinY + nz * cosY;
        nx = x2; nz = z2;
        const cosZ = Math.cos(radZ), sinZ = Math.sin(radZ);
        const x3 = nx * cosZ - ny * sinZ;
        const y3 = nx * sinZ + ny * cosZ;
        nx = x3; ny = y3;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return { x: nx / len, y: ny / len, z: nz / len };
    }

    _renderPaper() {
        if (!this.sourceCanvas) return;
        const w = this.sourceCanvas.width;
        const h = this.sourceCanvas.height;
        if (this._paperCacheWidth === w &&
            this._paperCacheHeight === h &&
            this._paperCacheVersion === this._sourceVersion &&
            this.displayCanvas.width === w) {
            return;
        }
        this.displayCanvas.width = w;
        this.displayCanvas.height = h;
        this.displayCanvas.style.width = w + 'px';
        this.displayCanvas.style.height = h + 'px';
        this.displayCtx.drawImage(this.sourceCanvas, 0, 0);
        this.lightCanvas.width = w;
        this.lightCanvas.height = h;
        this.lightCanvas.style.width = w + 'px';
        this.lightCanvas.style.height = h + 'px';
        this.specularCanvas.width = w;
        this.specularCanvas.height = h;
        this.specularCanvas.style.width = w + 'px';
        this.specularCanvas.style.height = h + 'px';
        this.shadowCanvas.width = w;
        this.shadowCanvas.height = h;
        this.shadowCanvas.style.width = w + 'px';
        this.shadowCanvas.style.height = h + 'px';
        this._paperCacheWidth = w;
        this._paperCacheHeight = h;
        this._paperCacheVersion = this._sourceVersion;
    }

    _renderShadow() {
        const { shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity, rotateX } = this.options;
        const w = this.shadowCanvas.width;
        const h = this.shadowCanvas.height;
        if (!w || !h) return;
        this.shadowCtx.clearRect(0, 0, w, h);
        this.shadowCtx.fillStyle = '#000000';
        const shrink = Math.max(2, h * 0.01);
        this.shadowCtx.fillRect(shrink, shrink, w - shrink * 2, h - shrink * 2);
        this.shadowCanvas.style.filter = `blur(${shadowBlur}px)`;
        this.shadowCanvas.style.opacity = shadowOpacity;
        const tiltFactor = Math.max(0.2, Math.sin((rotateX * Math.PI) / 180));
        const offsetX = shadowOffsetX * tiltFactor;
        const offsetY = shadowOffsetY * tiltFactor;
        this.shadowCanvas.style.transform = `translate(${offsetX}px, ${offsetY}px) translateZ(-1px)`;
    }

    _renderLighting() {
        const { lightX, lightY, lightZ, ambientIntensity, diffuseIntensity } = this.options;
        const w = this.lightCanvas.width;
        const h = this.lightCanvas.height;
        if (!w || !h) return;
        const lightLen = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ);
        const lx = lightX / lightLen;
        const ly = lightY / lightLen;
        const lz = lightZ / lightLen;
        const normal = this._surfaceNormal || { x: 0, y: 0, z: 1 };
        let dot = normal.x * lx + normal.y * ly + normal.z * lz;
        dot = Math.max(0, dot);
        this.lightCtx.clearRect(0, 0, w, h);
        const lightSourceX = (w / 2) - lx * w * 0.8;
        const lightSourceY = (h / 2) - ly * h * 0.8;
        const grad = this.lightCtx.createRadialGradient(
            lightSourceX, lightSourceY, 0,
            lightSourceX, lightSourceY, Math.max(w, h) * 1.2
        );
        const maxBrightness = Math.min(1, ambientIntensity + diffuseIntensity * dot);
        const minBrightness = ambientIntensity * 0.5;
        const brightHex = (v) => {
            const c = Math.round(v * 255);
            return `rgb(${c},${c},${c})`;
        };
        grad.addColorStop(0, brightHex(maxBrightness));
        grad.addColorStop(0.6, brightHex((maxBrightness + minBrightness) * 0.55));
        grad.addColorStop(1, brightHex(minBrightness));
        this.lightCtx.globalCompositeOperation = 'source-over';
        this.lightCtx.fillStyle = grad;
        this.lightCtx.fillRect(0, 0, w, h);
        const edgeDarkness = (1 - dot) * 0.25;
        if (edgeDarkness > 0.02) {
            const edgeGrad = this.lightCtx.createLinearGradient(0, 0, 0, h);
            edgeGrad.addColorStop(0, `rgba(0,0,0,${edgeDarkness})`);
            edgeGrad.addColorStop(0.15, 'rgba(0,0,0,0)');
            edgeGrad.addColorStop(0.85, 'rgba(0,0,0,0)');
            edgeGrad.addColorStop(1, `rgba(0,0,0,${edgeDarkness * 0.7})`);
            this.lightCtx.globalCompositeOperation = 'multiply';
            this.lightCtx.fillStyle = edgeGrad;
            this.lightCtx.fillRect(0, 0, w, h);
            const edgeGrad2 = this.lightCtx.createLinearGradient(0, 0, w, 0);
            edgeGrad2.addColorStop(0, `rgba(0,0,0,${edgeDarkness * 0.6})`);
            edgeGrad2.addColorStop(0.1, 'rgba(0,0,0,0)');
            edgeGrad2.addColorStop(0.9, 'rgba(0,0,0,0)');
            edgeGrad2.addColorStop(1, `rgba(0,0,0,${edgeDarkness * 0.6})`);
            this.lightCtx.fillStyle = edgeGrad2;
            this.lightCtx.fillRect(0, 0, w, h);
        }
        this.lightCtx.globalCompositeOperation = 'source-over';
    }

    _renderSpecular() {
        const { lightX, lightY, lightZ, specularIntensity, rotateX, rotateY } = this.options;
        const w = this.specularCanvas.width;
        const h = this.specularCanvas.height;
        if (!w || !h) return;
        this.specularCtx.clearRect(0, 0, w, h);
        const normal = this._surfaceNormal || { x: 0, y: 0, z: 1 };
        const lightLen = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ);
        const lx = lightX / lightLen;
        const ly = lightY / lightLen;
        const lz = lightZ / lightLen;
        const dot = normal.x * lx + normal.y * ly + normal.z * lz;
        if (dot <= 0) {
            this.specularCanvas.style.opacity = '0';
            return;
        }
        const halfLen = Math.sqrt((lx + normal.x) ** 2 + (ly + normal.y) ** 2 + (lz + normal.z) ** 2);
        const hx = (lx + normal.x) / halfLen;
        const hy = (ly + normal.y) / halfLen;
        const hz = (lz + normal.z) / halfLen;
        const viewDot = hz;
        const specPower = Math.pow(Math.max(0, viewDot), 32);
        if (specPower < 0.01) {
            this.specularCanvas.style.opacity = '0';
            return;
        }
        const highlightX = (w / 2) - (hx * w * 0.5);
        const highlightY = (h / 2) - (hy * h * 0.5);
        const specSize = Math.max(w, h) * 0.4;
        const grad = this.specularCtx.createRadialGradient(
            highlightX, highlightY, 0,
            highlightX, highlightY, specSize
        );
        const intensity = specPower * specularIntensity;
        grad.addColorStop(0, `rgba(255,255,240,${intensity * 0.8})`);
        grad.addColorStop(0.3, `rgba(255,255,220,${intensity * 0.4})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        this.specularCtx.fillStyle = grad;
        this.specularCtx.fillRect(0, 0, w, h);
        this.specularCanvas.style.opacity = specularIntensity.toString();
    }

    resize() {
        this._dirty = true;
        this.scheduleRender();
    }

    destroy() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
        }
    }
}

if (typeof window !== 'undefined') {
    window.Perspective3D = Perspective3D;
}
