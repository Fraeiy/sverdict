/** @returns {boolean} Page runs inside an iframe (e.g. embedded in Sphere). */
export function isInIframe() {
  try {
    return window.parent !== window && window.self !== window.top
  } catch {
    return true
  }
}

/** @returns {boolean} Sphere browser extension is installed. */
export function hasExtension() {
  try {
    const sphere = window.sphere
    if (!sphere || typeof sphere !== 'object') return false
    if (typeof sphere.isInstalled !== 'function') return false
    return sphere.isInstalled() === true
  } catch {
    return false
  }
}
