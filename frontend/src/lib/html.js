// For the few places that build HTML strings (the 3D tooltip): data from external databases must
// be treated as text, never as markup, or a crafted name could inject script (XSS).
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c])

// Only plain hex colours may be placed inside a style attribute.
export const safeColor = (value, fallback = '#9ca3af') => (/^#[0-9a-f]{3,8}$/i.test(value ?? '') ? value : fallback)
