# 2pa.ms El País Redirect

This unpacked Chrome extension opens an El País link entered as `https://2pa.ms/https://elpais.com/...` as a top-level El País page. The address bar changes to `elpais.com`. The article then uses your normal Chrome session, including Bypass Paywalls Clean, so its interactive controls run in their usual context.

## Install or update

1. Keep this `extension` directory in a permanent location.
2. Open `chrome://extensions` in the Chrome profile where Bypass Paywalls Clean works.
3. If **2pa.ms El País Redirect** is already installed, click its reload icon. Otherwise, turn on **Developer mode**, click **Load unpacked**, and select this `extension` directory.
4. Open the article through `https://2pa.ms/https://elpais.com/...` in that profile.

The rule applies only to top-level HTTPS navigations from `2pa.ms/https://elpais.com/...` or `2pa.ms/https://www.elpais.com/...`. It does not run on other sites, store cookies, or change Railway or Cloudflare settings. Because Chrome redirects before requesting the 2pa.ms page, the article is served directly by El País.

The exact article must be checked manually; automated tests against news sites are prohibited by this project.
