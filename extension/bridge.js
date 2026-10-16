(() => {
  const prefix = '/https://';
  if (!location.pathname.startsWith(prefix)) return;

  let articleUrl;
  try {
    articleUrl = new URL(
      location.pathname.slice(1) + location.search + location.hash
    );
  } catch {
    return;
  }
  if (
    articleUrl.protocol !== 'https:' ||
    (articleUrl.hostname !== 'elpais.com' &&
      !articleUrl.hostname.endsWith('.elpais.com'))
  ) {
    return;
  }

  const root = document.documentElement;
  if (!root) return;
  root.replaceChildren();

  const head = document.createElement('head');
  const title = document.createElement('title');
  title.textContent = 'El País · 2pa.ms';
  head.append(title);
  const style = document.createElement('style');
  style.textContent =
    'html,body{margin:0;width:100%;height:100%;font:14px system-ui,sans-serif}' +
    'body{display:flex;flex-direction:column;background:#fff}' +
    'header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.5rem 1rem;background:#f3f3f3}' +
    'a{color:#0645ad}' +
    'iframe{display:block;width:100%;flex:1;border:0}';
  head.append(style);

  const body = document.createElement('body');
  const header = document.createElement('header');
  const label = document.createElement('span');
  label.textContent = 'El País';
  const directLink = document.createElement('a');
  directLink.href = articleUrl.href;
  directLink.target = '_blank';
  directLink.rel = 'noopener noreferrer';
  directLink.textContent = 'Open directly';
  header.append(label, directLink);

  const frame = document.createElement('iframe');
  frame.title = 'El País article';
  frame.referrerPolicy = 'no-referrer';
  frame.src = articleUrl.href;
  body.append(header, frame);
  root.append(head, body);
})();
