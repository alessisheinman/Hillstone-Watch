export function ExtensionBanner() {
  return (
    <div className="banner bad install">
      <strong>Extension not found.</strong> The hunting happens in the Hillstone Watch Chrome extension. To install it:
      <ol>
        <li>
          <a href="https://github.com/alessisheinman/Hillstone-Watch/archive/refs/heads/main.zip">Download the extension</a> and unzip it
          somewhere it can stay (e.g. Documents) — Chrome keeps using that folder.
        </li>
        <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
        <li>Click <b>Load unpacked</b> and choose the <code>Hillstone-Watch-main/extension/dist</code> folder you unzipped.</li>
        <li>Reload this page.</li>
      </ol>
    </div>
  );
}
