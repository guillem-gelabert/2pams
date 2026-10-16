# 2pa.ms El País Redirect

This unpacked Chrome extension opens an El País link entered as `https://2pa.ms/https://elpais.com/...` as a top-level El País page. The address bar changes to `elpais.com`. It applies a narrow El País subscription-script rule and cosmetic cleanup in Chrome, so Bypass Paywalls Clean is not required.

## Install or update

1. Keep this `extension` directory in a permanent location.
2. Open `chrome://extensions` in the Chrome profile where Bypass Paywalls Clean works.
3. If **2pa.ms El País Redirect** is already installed, click its reload icon and approve any new site permissions Chrome requests. Otherwise, turn on **Developer mode**, click **Load unpacked**, and select this `extension` directory.
4. Open the article through `https://2pa.ms/https://elpais.com/...` in that profile.

The redirect applies only to top-level HTTPS navigations from `2pa.ms/https://elpais.com/...` or `2pa.ms/https://www.elpais.com/...`. The blocking rules stop the El País subscription script pattern and the Arc XP subscription script used in the supplied Bypass Paywalls Clean configuration, only when an El País page initiates the request. The style rule hides two ad containers on El País. These rules do not run on other sites, store cookies, or change Railway or Cloudflare settings. Because Chrome redirects before requesting the 2pa.ms page, the article is served directly by El País.

The El País-specific blocking pattern and cosmetic selectors were adapted from Bypass Paywalls Clean by magnolia1234, licensed under MIT; see [LICENSE-BPC.txt](LICENSE-BPC.txt).

The exact article must be checked manually; automated tests against news sites are prohibited by this project.
