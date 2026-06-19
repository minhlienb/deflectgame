class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { alpha: false, antialias: true });
        if (!this.gl) throw new Error('WebGL not supported');

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.maxQuads = 10000;
        this.vertices = new Float32Array(this.maxQuads * 6 * 9);
        this.quadCount = 0;
        this.textureCache = new Map();
        this.currentTexture = null;
        this.drawCalls = 0;

        this._initShaders();
        this._initBuffers();
        this._initProjection();

        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = canvas.width;
        this.textCanvas.height = canvas.height;
        this.textCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
        canvas.parentElement.style.position = 'relative';
        canvas.parentElement.appendChild(this.textCanvas);
        this.textCtx = this.textCanvas.getContext('2d');
    }

    _initShaders() {
        const gl = this.gl;
        const vsSource = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            attribute vec4 aColor;
            uniform vec2 uResolution;
            varying vec2 vTexCoord;
            varying vec4 vColor;
            void main() {
                vec2 clipSpace = (aPosition / uResolution) * 2.0 - 1.0;
                gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
                vTexCoord = aTexCoord;
                vColor = aColor;
            }
        `;
        const fsSource = `
            precision mediump float;
            varying vec2 vTexCoord;
            varying vec4 vColor;
            uniform sampler2D uTexture;
            uniform bool uUseTexture;
            void main() {
                if (uUseTexture) {
                    vec4 texColor = texture2D(uTexture, vTexCoord);
                    gl_FragColor = texColor * vColor;
                } else {
                    gl_FragColor = vColor;
                }
            }
        `;
        const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        gl.useProgram(this.program);

        this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
        this.aTexCoord = gl.getAttribLocation(this.program, 'aTexCoord');
        this.aColor = gl.getAttribLocation(this.program, 'aColor');
        this.uResolution = gl.getUniformLocation(this.program, 'uResolution');
        this.uUseTexture = gl.getUniformLocation(this.program, 'uUseTexture');
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _initBuffers() {
        const gl = this.gl;
        this.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);

        const stride = 9 * 4;
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.aTexCoord);
        gl.vertexAttribPointer(this.aTexCoord, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(this.aColor);
        gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 16);
    }

    _initProjection() {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    }

    loadTexture(src) {
        if (this.textureCache.has(src)) return Promise.resolve(this.textureCache.get(src));
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const gl = this.gl;
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                const info = { texture: tex, width: img.width, height: img.height };
                this.textureCache.set(src, info);
                resolve(info);
            };
            img.src = src;
        });
    }

    _flush() {
        if (this.quadCount === 0) return;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, this.quadCount * 6 * 9));
        gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
        this.quadCount = 0;
        this.drawCalls++;
    }

    _setTexture(texInfo) {
        if (this.currentTexture !== texInfo) {
            this._flush();
            this.currentTexture = texInfo;
            const gl = this.gl;
            if (texInfo) {
                gl.uniform1i(this.uUseTexture, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);
            } else {
                gl.uniform1i(this.uUseTexture, 0);
            }
        }
    }

    _addQuad(x, y, w, h, u0, v0, u1, v1, r, g, b, a) {
        if (this.quadCount >= this.maxQuads) this._flush();
        const i = this.quadCount * 6 * 9;
        const v = this.vertices;
        // Triangle 1
        v[i]    = x;     v[i+1]  = y;     v[i+2]  = u0; v[i+3]  = v0; v[i+4]  = r; v[i+5]  = g; v[i+6]  = b; v[i+7]  = a;
        v[i+9]  = x + w; v[i+10] = y;     v[i+11] = u1; v[i+12] = v0; v[i+13] = r; v[i+14] = g; v[i+15] = b; v[i+16] = a;
        v[i+18] = x;     v[i+19] = y + h; v[i+20] = u0; v[i+21] = v1; v[i+22] = r; v[i+23] = g; v[i+24] = b; v[i+25] = a;
        // Triangle 2
        v[i+27] = x + w; v[i+28] = y;     v[i+29] = u1; v[i+30] = v0; v[i+31] = r; v[i+32] = g; v[i+33] = b; v[i+34] = a;
        v[i+36] = x + w; v[i+37] = y + h; v[i+38] = u1; v[i+39] = v1; v[i+40] = r; v[i+41] = g; v[i+42] = b; v[i+43] = a;
        v[i+45] = x;     v[i+46] = y + h; v[i+47] = u0; v[i+48] = v1; v[i+49] = r; v[i+50] = g; v[i+51] = b; v[i+52] = a;
        this.quadCount++;
    }

    begin() {
        this.quadCount = 0;
        this.drawCalls = 0;
        this.currentTexture = null;
        this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
        this.gl.useProgram(this.program);
        this.gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
        this.gl.uniform1i(this.uUseTexture, 0);
        this.gl.clearColor(0.569, 0.569, 0.569, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    end() {
        this._flush();
    }

    fillRect(x, y, w, h, r, g, b, a = 1.0) {
        this._setTexture(null);
        this._addQuad(x, y, w, h, 0, 0, 0, 0, r, g, b, a);
    }

    drawSprite(textureInfo, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH, flipX = false) {
        this._setTexture(textureInfo);
        const tw = textureInfo.width;
        const th = textureInfo.height;
        let u0 = srcX / tw;
        let v0 = srcY / th;
        let u1 = (srcX + srcW) / tw;
        let v1 = (srcY + srcH) / th;
        if (flipX) {
            const tmp = u0;
            u0 = u1;
            u1 = tmp;
        }
        this._addQuad(dstX, dstY, dstW, dstH, u0, v0, u1, v1, 1, 1, 1, 1);
    }

    drawCircle(cx, cy, radius, r, g, b, a = 1.0, lineWidth = 2) {
        const segments = 32;
        const angleStep = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
            const angle1 = i * angleStep;
            const angle2 = (i + 1) * angleStep;
            const x1 = cx + Math.cos(angle1) * radius;
            const y1 = cy + Math.sin(angle1) * radius;
            const x2 = cx + Math.cos(angle2) * radius;
            const y2 = cy + Math.sin(angle2) * radius;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = (-dy / len) * lineWidth * 0.5;
            const ny = (dx / len) * lineWidth * 0.5;

            const i0 = this.quadCount * 6 * 9;
            if (this.quadCount >= this.maxQuads) this._flush();
            const v = this.vertices;

            v[i0]    = x1 + nx; v[i0+1]  = y1 + ny;
            v[i0+2]  = 0; v[i0+3]  = 0; v[i0+4]  = r; v[i0+5]  = g; v[i0+6]  = b; v[i0+7]  = a;

            v[i0+9]  = x2 + nx; v[i0+10] = y2 + ny;
            v[i0+11] = 0; v[i0+12] = 0; v[i0+13] = r; v[i0+14] = g; v[i0+15] = b; v[i0+16] = a;

            v[i0+18] = x1 - nx; v[i0+19] = y1 - ny;
            v[i0+20] = 0; v[i0+21] = 0; v[i0+22] = r; v[i0+23] = g; v[i0+24] = b; v[i0+25] = a;

            v[i0+27] = x2 + nx; v[i0+28] = y2 + ny;
            v[i0+29] = 0; v[i0+30] = 0; v[i0+31] = r; v[i0+32] = g; v[i0+33] = b; v[i0+34] = a;

            v[i0+36] = x2 - nx; v[i0+37] = y2 - ny;
            v[i0+38] = 0; v[i0+39] = 0; v[i0+40] = r; v[i0+41] = g; v[i0+42] = b; v[i0+43] = a;

            v[i0+45] = x1 - nx; v[i0+46] = y1 - ny;
            v[i0+47] = 0; v[i0+48] = 0; v[i0+49] = r; v[i0+50] = g; v[i0+51] = b; v[i0+52] = a;

            this.quadCount++;
        }
    }

    fillCircle(cx, cy, radius, r, g, b, a = 1.0) {
        const segments = 32;
        const angleStep = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
            const angle1 = i * angleStep;
            const angle2 = (i + 1) * angleStep;

            if (this.quadCount >= this.maxQuads) this._flush();
            const i0 = this.quadCount * 6 * 9;
            const v = this.vertices;

            v[i0]    = cx;     v[i0+1]  = cy;
            v[i0+2]  = 0; v[i0+3]  = 0; v[i0+4]  = r; v[i0+5]  = g; v[i0+6]  = b; v[i0+7]  = a;

            v[i0+9]  = cx + Math.cos(angle1) * radius; v[i0+10] = cy + Math.sin(angle1) * radius;
            v[i0+11] = 0; v[i0+12] = 0; v[i0+13] = r; v[i0+14] = g; v[i0+15] = b; v[i0+16] = a;

            v[i0+18] = cx + Math.cos(angle2) * radius; v[i0+19] = cy + Math.sin(angle2) * radius;
            v[i0+20] = 0; v[i0+21] = 0; v[i0+22] = r; v[i0+23] = g; v[i0+24] = b; v[i0+25] = a;

            this.quadCount++;
        }
    }

    fillText(text, x, y, font = '14px Arial', color = '#fff', align = 'left') {
        this.textCtx.font = font;
        this.textCtx.fillStyle = color;
        this.textCtx.textAlign = align;
        this.textCtx.fillText(text, x, y);
    }
}
