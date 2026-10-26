export function ExtensionBanner() {
  return (
    <div className="banner bad install">
      <strong>Extension not found.</strong> The hunting happens in the Hillstone Watch Chrome extension. To install it:
      <ol>
        <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
        <li>Click <b>Load unpacked</b> and choose the <code>extension/dist</code> folder of this project.</li>
        <li>Reload this page.</li>
      </ol>
    </div>
  );
}
