// contact-center/client/src/softphone/popout.js
/**
 * Opens a lightweight popup and renders a remote-only Softphone inside it.
 * No string style props; everything is React objects to avoid the error you saw.
 */
export async function openSoftphonePopup() {
  // center-ish popup
  const w = 380, h = 640;
  const y = Math.max(0, (window.screen.height - h) / 2);
  const x = Math.max(0, (window.screen.width - w) / 2);

  const win = window.open(
    '',
    'softphone-popout',
    `popup=yes,toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes,width=${w},height=${h},left=${x},top=${y}`
  );
  if (!win) return;

  // clean doc
  win.document.title = 'Softphone';
  win.document.body.style.margin = '0';
  const mount = win.document.createElement('div');
  mount.id = 'softphone-root';
  win.document.body.appendChild(mount);

  // lazy import to avoid circular deps & reduce main bundle
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Theme } = await import('@twilio-paste/core/theme');
  const { Box } = await import('@twilio-paste/core/box');
  const mod = await import('../components/Softphone.jsx');

  const Root = createRoot(mount);
  const Softphone = mod.default;

  Root.render(
    React.createElement(
      Theme.Provider,
      { theme: 'default' },
      React.createElement(
        Box,
        {
          minHeight: '100vh',
          backgroundColor: 'colorBackgroundBody',
          padding: 'space70',
        },
        React.createElement(Softphone, { remoteOnly: true })
      )
    )
  );

  win.addEventListener('beforeunload', () => {
    try { Root.unmount(); } catch {}
  });

  return win;
}
