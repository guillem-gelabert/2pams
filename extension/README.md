# 2pa.ms Live Article Bridge

This unpacked Chrome extension tries to show a live El País article inside the isolated Railway content origin after opening `https://2pa.ms/https://elpais.com/...`. It is intended to run alongside Bypass Paywalls Clean in the same Chrome profile. It does not store or forward cookies or article content to 2pa.ms.

## Install

1. Keep this `extension` directory in a permanent location.
2. Open `chrome://extensions` in the Chrome profile where Bypass Paywalls Clean works.
3. Turn on **Developer mode**, click **Load unpacked**, and select this `extension` directory.
4. Open the article through `https://2pa.ms/https://elpais.com/...` in that profile.

The extension only runs on `cooperative-flexibility-production.up.railway.app` and only frames HTTPS URLs on `elpais.com` or its subdomains. Its network rule removes `X-Frame-Options` and `Content-Security-Policy` only from El País subframe responses initiated by that content origin. The `2pa.ms` shell receives no upstream content or state.

This is a browser-side prototype. A site may still refuse to operate as a third-party frame, and Bypass Paywalls Clean may behave differently in a frame. Use **Open directly** if the embedded article does not load. The exact article must be checked manually; automated tests against news sites are prohibited by this project.
