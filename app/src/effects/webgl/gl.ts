/** Small WebGL 1 helpers (WebGL 1 for the widest device support). */

/** KHR_parallel_shader_compile: asks whether a link finished, without waiting for it. */
const COMPLETION_STATUS_KHR = 0x91b1;

/**
 * A program whose compile + link may still be running on the GPU side. Querying
 * COMPILE_STATUS / LINK_STATUS right away blocks the main thread until the driver is done
 * (seconds for a big shader on some GPUs), so the status is only read once `ready()`.
 */
export class PendingProgram {
  readonly program: WebGLProgram;
  private readonly gl: WebGLRenderingContext;
  private readonly shaders: readonly WebGLShader[];
  /** Without the extension, the first `ready()` waits like a plain link would. */
  private readonly parallel: boolean;
  private checked = false;

  constructor(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    shaders: readonly WebGLShader[],
    parallel: boolean,
  ) {
    this.gl = gl;
    this.program = program;
    this.shaders = shaders;
    this.parallel = parallel;
  }

  /** True once linked (throws on a compile / link error). Never blocks with the extension. */
  ready(): boolean {
    if (this.checked) return true;
    const gl = this.gl;
    if (this.parallel && !gl.getProgramParameter(this.program, COMPLETION_STATUS_KHR)) {
      return false;
    }
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const logs = this.shaders.map((s) => gl.getShaderInfoLog(s) ?? '').join('\n');
      throw new Error(`Program link error: ${gl.getProgramInfoLog(this.program) ?? ''}\n${logs}`);
    }
    this.checked = true;
    return true;
  }
}

/** Starts compiling and linking a program; see PendingProgram. */
export function startProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
  attributes: readonly string[] = ['aPos'],
): PendingProgram {
  const parallel = Boolean(gl.getExtension('KHR_parallel_shader_compile'));
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('createShader failed');
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  const shaders = [
    shader(gl.VERTEX_SHADER, vertexSource),
    shader(gl.FRAGMENT_SHADER, fragmentSource),
  ];
  shaders.forEach((s) => gl.attachShader(program, s));
  attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name));
  gl.linkProgram(program);
  return new PendingProgram(gl, program, shaders, parallel);
}

/** A unit quad (-1..1) as a triangle strip. */
export function createQuad(gl: WebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('createBuffer failed');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return buffer;
}

export function uploadTexture(gl: WebGLRenderingContext, image: TexImageSource): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  // Puff images are 512² (power of two): mipmaps give cheap blurred alpha for normals.
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const IMAGE_CACHE_SIZE = 24;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Loads and decodes an image, sharing the request with any earlier call for the same URL
 * (see `preloadImage`), so a puff fetched ahead of its reveal shows at once.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) {
    // Refresh its place in the LRU order.
    imageCache.delete(url);
    imageCache.set(url, cached);
    return cached;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      img.decode().then(
        () => resolve(img),
        () => resolve(img),
      );
    };
    img.onerror = () => reject(new Error(`Image failed to load: ${url}`));
    img.src = url;
  });
  promise.catch(() => imageCache.delete(url));
  imageCache.set(url, promise);
  while (imageCache.size > IMAGE_CACHE_SIZE) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
  return promise;
}

/** Starts fetching an image now so that a later `loadImage` of it resolves immediately. */
export function preloadImage(url: string): void {
  loadImage(url).catch(() => {});
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Uniform locations, looked up once. */
export function uniforms<K extends string>(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  names: readonly K[],
): Record<K, WebGLUniformLocation | null> {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<
    K,
    WebGLUniformLocation | null
  >;
}
