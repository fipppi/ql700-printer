// config.js — build-time feature flags (the static-site equivalent of env vars).
// Flip a value here and redeploy. For a one-off local toggle without editing,
// a flag can also be enabled per browser from the console:
//   localStorage.setItem('ql700-feature-shippingPdf', '1')   (reload to apply)
const defaults = {
  // File → Import shipping PDF… (eBay-style address page → sender | cut | receiver)
  shippingPdf: false,
};

function withOverrides(flags) {
  const out = { ...flags };
  for (const k of Object.keys(out)) {
    try {
      const v = localStorage.getItem('ql700-feature-' + k);
      if (v === '1') out[k] = true;
      else if (v === '0') out[k] = false;
    } catch (_) {}
  }
  return out;
}

export const FEATURES = withOverrides(defaults);
