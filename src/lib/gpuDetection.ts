export type GpuTier = 'webgpu' | 'webgl2' | 'unsupported';

export interface GpuCapabilities {
  tier: GpuTier;
  adapterName: string;
  vendor: string;
  architecture: string;
  features: string[];
  maxComputeWorkgroupSizeX?: number;
  maxStorageBufferBindingSize?: number;
  maxBufferSize?: number;
  isFallback: boolean;
  fallbackReason?: string;
  rawInfo?: Record<string, any>;
}

let cachedCapabilities: GpuCapabilities | null = null;

/**
 * Detects hardware GPU capabilities: WebGPU with fallback to WebGL2.
 * Caches result so repeated checks don't incur hardware query latency.
 */
export async function detectGpuCapabilities(forceRecheck = false): Promise<GpuCapabilities> {
  if (cachedCapabilities && !forceRecheck) {
    return cachedCapabilities;
  }

  // 1. Check for WebGPU
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (adapter) {
        // Request device to verify actual hardware pipeline access
        const device = await adapter.requestDevice({
          requiredFeatures: [],
        });

        let adapterInfo: any = {};
        if ('requestAdapterInfo' in adapter) {
          try {
            adapterInfo = await (adapter as any).requestAdapterInfo();
          } catch (e) {
            console.warn('[GPU Detect] requestAdapterInfo error:', e);
          }
        } else if ((adapter as any).info) {
          adapterInfo = (adapter as any).info;
        }

        // Test basic WGSL compute shader compilation to ensure driver compatibility
        const testShader = device.createShaderModule({
          code: `
            @compute @workgroup_size(1)
            fn main() {}
          `
        });

        if (testShader) {
          const limits = device.limits;
          const featuresList: string[] = [];
          device.features.forEach(f => featuresList.push(f));

          cachedCapabilities = {
            tier: 'webgpu',
            adapterName: adapterInfo.description || adapterInfo.device || adapterInfo.vendor || 'Hardware WebGPU Device',
            vendor: adapterInfo.vendor || 'WebGPU Vendor',
            architecture: adapterInfo.architecture || 'WebGPU Compute',
            features: featuresList,
            maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
            maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
            maxBufferSize: limits.maxBufferSize,
            isFallback: false,
            rawInfo: adapterInfo,
          };
          
          // Clean up temporary probe device to prevent GPU resource leaks
          try {
            if (typeof device.destroy === 'function') {
              device.destroy();
            }
          } catch (cleanErr) {}

          console.log('[GPU Detect] Detected WebGPU hardware acceleration:', cachedCapabilities);
          return cachedCapabilities;
        } else {
          try { device.destroy?.(); } catch (e) {}
        }
      }
    } catch (err: any) {
      console.warn('[GPU Detect] WebGPU initialization failed, falling back to WebGL2:', err?.message || err);
    }
  }

  // 2. Fallback check: WebGL2
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2', { powerPreference: 'high-performance' });
    if (gl2) {
      const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Standard WebGL2';
      const vendor = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Standard Vendor';

      cachedCapabilities = {
        tier: 'webgl2',
        adapterName: renderer || 'WebGL2 Hardware Renderer',
        vendor: vendor || 'WebGL2 Vendor',
        architecture: 'OpenGL ES / WebGL2 Pipeline',
        features: ['webgl2', 'float-textures', 'instanced-arrays'],
        isFallback: true,
        fallbackReason: 'WebGPU is unavailable on this browser/OS or disabled in flags. Running on optimized WebGL2 engine.',
      };

      // Release context slot to avoid exhausting browser WebGL context limits
      try {
        const loseExt = gl2.getExtension('WEBGL_lose_context');
        loseExt?.loseContext();
      } catch (e) {}

      console.log('[GPU Detect] Running in WebGL2 fallback mode:', cachedCapabilities);
      return cachedCapabilities;
    }
  } catch (e: any) {
    console.warn('[GPU Detect] WebGL2 check failed:', e);
  }

  // 3. Fallback check: WebGL 1
  try {
    const canvas = document.createElement('canvas');
    const gl1 = canvas.getContext('webgl');
    if (gl1) {
      cachedCapabilities = {
        tier: 'webgl2',
        adapterName: 'Legacy WebGL 1.0 (Limited)',
        vendor: 'Generic',
        architecture: 'Legacy WebGL',
        features: ['webgl1'],
        isFallback: true,
        fallbackReason: 'Only WebGL 1.0 is supported. Advanced compute features are disabled.',
      };

      try {
        const loseExt = gl1.getExtension('WEBGL_lose_context');
        loseExt?.loseContext();
      } catch (e) {}

      return cachedCapabilities;
    }
  } catch (e) {
    // ignore
  }

  // 4. Unsupported
  cachedCapabilities = {
    tier: 'unsupported',
    adapterName: 'Software / Unsupported',
    vendor: 'None',
    architecture: 'None',
    features: [],
    isFallback: true,
    fallbackReason: 'No GPU hardware acceleration or WebGL/WebGPU context could be created.',
  };
  return cachedCapabilities;
}
