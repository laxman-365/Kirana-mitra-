# साथी (Sathi) — संपूर्ण माहिती व प्रश्न-उत्तरे

> **या दस्तऐवजाचा उद्देश:** तुम्ही (आणीबाणीत वापरणारा user) आणि App वापरणाऱ्या सर्व महिला-मुलां-लोकांमध्ये या App बाबत **पूर्ण विश्वास** निर्माण होणे. खाली प्रत्येक प्रश्नाचे उत्तर **खरे, तपशीलवार आणि काय शक्य नाही हेही स्पष्टपणे** दिले आहे.

---

## १. हे App काय आहे? (एक वाक्यात)

**संकटात २ सेकंद SOS दाबला की — तुमच्या जवळच्या ५०० मीटरमध्ये असलेला एक यादृच्छिक (random) "साथी" या App मधून थेट voice call करतो; फोन नंबर/ओळख अजिबात नसून दोघांचेही live location map वर दिसत राहते, आणि भाषा फरक असली तरी call मधून त्यांचे बोललेले/लिहिललेले तुमच्या भाषेत दिसते.**

### 🧪 डेमो कसे धरायचे (2 पद्धती)

1. **१-क्लिक Demo (सर्वात सोपे):** Landing page वर **“▶ Demo start करा”** बटण दाबा → App आपोआप **दुसरा tab “साथी (मदत)” मोडमध्ये** उघडवतो आणि हा tab “SOS” मोडमध्ये जातो. दुसऱ्या tab मध्ये location permission द्या → इथे **SOS २ सेकं. दबा** → दुसऱ्या tab मध्ये **call येतो**. (भाषा-अनुवाद तपासण्यासाठी दुसऱ्या tab मध्ये 🌐 वर भाषा बदल — उदा. गुजराती.)
2. **2-Tab demo:** हीच App दोन tab मध्ये उघडा; tab 1 “मला मदत करायची आहे”, tab 2 “मदत हवी आहे” + SOS.

> नोंद: SOS दबाला “जवळ सथी नाहीत” असे दिसेल तेवढ्यांत App बरोबरच चालतो आहे — फक्त **जवळ मदत करणारा व्यक्ती (tab) सुरू नाही**. वरील demo ने तो tab आपोआप उघडतो.

### पायरी-दर-पायरी कामगिरी

**A) मदत हवी असणाऱ्या व्यक्ती (SOS) साठी:**
1. App उघडा → "मदत हवी आहे" → location permission द्या.
2. लाल **SOS बटण २ सेकंद दाबून** ठेवा.
3. App तुमचे live location घेऊन server कडे SOS पाठवते.
4. Server ५०० मीटरमधील "तयार साथी"पैकी **एक random** निवडतो (500 मी. मध्ये नसेल तर १ किमी → २.५ किमी पर्यंत search — App मध्ये प्रत्येक ring दिसतो).
5. **आपोआप in-app call** जोडले जाते (WebRTC). दुसऱ्याला "Sathi #४८२१" असेच अज्ञात label दिसते.
6. Call मध्ये: 🎙 आवाज, 🔵/🔴 दोघांचे live location map वर, 💬 भाषा-अनुवाद chat, बोलल्यावर live subtitles, "112 थेट कॉल" बटण, "location link share" बटण.
7. बटण "End" दाबला की session बंद — location कायमचे हटते.

**B) मदत करणाऱ्या व्यक्ती (साथी/Volunteer) साठी:**
1. App उघडा → "मला मदत करायची आहे" → location permission.
2. तुम्ही **५०० मीटर क्षेत्रात "तयार" pool** मध्ये येता (आपले live location active).
3. जवळचा कोणी SOS दबवला की **तुम्हाला call येतो** — ५ सेकंदांचा auto-accept countdown + "लावू शकत नाही" बटण.
4. Call संपली की पुन्हा तयार pool मध्ये (तुम्ही बंद करेपर्यंत). कधीही "मदत बंद करा" दाबता येते.

---

## २. Satellite / Live Location — खरे आहे का? 🛰️

**उत्तर: होय — live location खरे आहे, आणि ते १००% मोफत आहे.** तपशील:

| प्रश्न | उत्तर |
|---|---|
| App खऱ्या satellite ला connect करते का? | App स्वतः satellite ला connect **करत नाही**. तुमच्या **फोनमधील GPS chip**च खऱ्या satellite च्या कडून (GPS – USA, **NavIC – भारत**, Galileo – EU, GLONASS – रूस) free signal घेते. हे सर्व **सरकारी प्रसारण सेवा** आहेत. |
| GPS वापरण्याला खर्च येतो का? | **नाही. कायम नाही.** GPS ल्हारांवर (L1) सरकार कोणाहीच शुल्क घेत नाही. कोणताही "GPS सबस्क्रिप्शन"/"satellite charge" हे **जुलमजोस्ट (scam) आहे**. |
| अचूकता किती? | बाहेर/आकाश दिसत असल्यास **३–१० मीटर**. अंदर/उंच इमारतींमध्ये २०–५० मीटर. म्हणून App मध्ये **"manual pin" option** — location permission मिळाली नाही तर map वर click करून स्वतःचे ठिकाण set करता येते. |
| Location internetशिवाय येते का? | **येते** (GPS स्वतंत्र आहे). पण साथी मध्ये **matching + call internet वरच** चालतो (खाली Q५–Q८ पाहा). |
| "Satellite free connect करण्यासाठी काय करायचे?" | **काही करायचे नाही.** फोन हातात, GPS चालू — तितके पुरेसे. App ला काहीही जोडावे/खरेदीसावे लागत नाही. |
| माझे location server वर साठते का? | **नाही.** Location फक्त मदतीच्या session दरम्यान real-time पाठवला जातो; call/पेअर बंद झाली की **कायमचे हटतो**. Server वर database नाही, history नाही. |

---

## ३. हा App "तुझ्याशी" (या AI/sandbox बाहेर) launch कसा करेन? 🚀

App = दोन भाग:
- **(a) Frontend** — static files (index.html, app.js, i18n.js, css, leaflet, manifest) — browser मध्ये चालतो.
- **(b) Backend** — Node.js server (matching pool + call signalling + location relay).

### Launch पर्याय (सर्व स्वतःच्या हाताने — मी/कोणताही AI अपेक्षित नाही)

| पर्याय | खर्च | कशासाठी |
|---|---|---|
| **Render.com / Railway.app / Glitch.com** | **₹० (free tier)** | सर्वात सोपा: GitHub repo push करा → "New Web Service" → build `npm install`, start `npm start` → https URL मिळतो → फोन मध्ये उघडा |
| **Oracle Cloud "Always Free" VPS** | **₹० (आयुष्यभर free)** | २ CPU / २४ GB RAM free — सर्वात मोठी free शक्ती, production साठी उत्तम |
| **होस्टिंग VPS (Hostinger/GSTHosting/DigitalOcean)** | ₹१००–३००/मा | free tier मधून अस्वस्त्या वाटत असेल तर |
| **घरातील laptop/सर्व्हर** | ₹० | `npm install && npm start` → LAN मधून फोनवर http://IP:3000 (गृह-परिसर trial) |

**प्रत्यक्ष पायऱ्या (Render उदाहरण):**
1. हा repo GitHub वर push करा (आधीच `sathi/` folder तयार आहे).
2. Render.com → "New Web Service" → repo select → build `npm install` → start `npm start` → port 3000.
3. Render तुम्हाला **free HTTPS URL** देतो (WebRTC ला HTTPS **महत्त्वाचा** आहे — free hosting मध्ये Let's Encrypt स्वतः देते).
4. त्या URL मध्ये फोन उघडा → App तयार. **आता तो App मला/या platform ला काहीच देऊल नसतो — तो स्वतंत्रपणे चालतो.**

---

## ४. API शिवाय App वापरता येईल का? 🔌

**Paid/third-party API = शून्य.** प्रत्येक घटक free आहे:

| घटक | वर आधारित | API key? | खर्च? |
|---|---|---|---|
| Map | OpenStreetMap tiles | **नाही** | ₹० (फक्त credits/attribution) |
| Voice call | WebRTC (W3C standard) | नाही | ₹० |
| Real-time matching | Socket.IO — **स्वतःच्या server वर** | नाही | ₹० (open source) |
| Call connection (NAT) | Google public STUN | नाही | ₹० |
| भाषा-अनुवाद | MyMemory **free tier** | नाही (optional: free email-registered key → ५०,००० अक्षर/दि) | ₹० |
| GPS/Location | फोनचा GPS + W3C Geolocation | नाही | ₹० |

"API" शब्दाचा दुसरा अर्थ (internet service) — तो **लागतो**: server internet वर असतोच (free hosting मध्येही). पण **कोणतीही API key, कोणतेही शुल्क — नाही.**

---

## ५. सर्वकाही FREE — कोणालाही खर्च नाही? 💰

| घटक | कोणावर खर्च | रक्कम |
|---|---|---|
| GPS/satellite signal | कोणावरच नाही (सरकारी service) | **₹०** |
| Map (OSM) | कोणावरच नाही | **₹०** |
| Voice call (WebRTC) | carrier charge **नसतो** (internet वापर) | **₹०** |
| Matching server software | open source | **₹०** |
| भाषा-अनुवाद (MyMemory) | free tier | **₹०** |
| फोन नंबर / SMS | App मध्ये **नंबरही नसतो, SMSही नाही** | **₹०** |
| Hosting (launch) | free tier (Render/Oracle) | **₹०** (optional: ₹१००–३००/मा) |
| Software development | मी (या agent ने) या session मध्ये — तुम्हाला काही दिले नाही | **₹०** |
| **वापरणाऱ्या user चा हिस्सा** | फक्त त्याचा **अपला mobile data** | पाहा Q६ |

**निष्कर्ष: App बनवण्याचा = ₹० · चालवण्याचा (free hosting) = ₹० · वापरणाऱ्याचा (प्रत्येक आणीबाणी) = ₹० — फक्त त्याचा स्वतःचा data. नाही मला, नाही तुम्हाला, नाही user ला.**

---

## ६. Internet कमीत-कमी कसा वापरतो? (data बजेट) 📶

| गोष्ट | data वापर |
|---|---|
| App पहिलीदा load (mग cache) | ~०.२ MB (नंतर ०) |
| Map tiles (एका क्षेत्रासाठी) | ~०.१–०.३ MB |
| **Voice call (Opus codec, ~१२–२४ kbps)** | **~१००–२०० KB/मिनिट** |
| Location update (प्रत्येक २.५ स) | <१ KB |
| Chat/अनुवाद message | ~०.१–०.३ KB/message |

**एक ५ मिनिटांची SOS + call = सुमारे १.५–३ MB.** २G/३G वरही चालतो. Call बंद केली की data बंद. App सुरू असून call नसेल तर लगभग ०.

---

## ७. Phone/Call कसे जोडले जाते? (नंबरशिवाय कसे?) 📞

- ही **SIM/carrier call नाही** — ही **WebRTC** call आहे: दोन फोन्स internet वर **peer-to-peer audio** (Opus codec) पाठवतात.
- जुडण्यासाठी **STUN** (free public, Google चो) वापरतो — फोन-फोन direct link साठवतो.
- **Carrier चार्ज नाही, नंबर उघडत नाही, डायल नसते.** दोघांनाही internet (4G/3G/WiFi) लागतो.
- **कॉणाल् call नाही का?** कारण normal call मध्ये **फोन नंबर उघडं** होतो — या App चा ध्यास **पूर्ण anonimity** म्हणून.
- काही कडक NAT network मध्ये **TURN server** लागू शकतो — तो **coturn** (open source) स्वतःच्या free VPS वर चालवता येतो (roadmap मध्ये).
- Call functions: auto-answer (५ सेकं. countdown), mute, speaker, end, "112 थेट" (tel: link — हा फक्त एक tap, त्यात call charge असेल तर तो user चा अपला).

---

## ८. Map कसे जोडले आहे? 🗺️

- **Leaflet** (open source, free) + **OpenStreetMap** tiles (free, **API key नाही**).
- Map "API key" शिवाय चालतो — OSM ची अट फक्त **credits/attribution** (Leaflet मध्ये दिलेले आहे).
- Live markers: 🔵 तुम्ही, 🔴 साथी — प्रत्येक २.५ सेकंदाहून नवीन location.
- Production मध्ये स्वतःचा **tile cache server** (tileserver, free) चालवता येतो — OSM वरची request कमी करायला.
- Offline map option (आगामी) — एकदा झूम केल्याचे क्षेत्र offline.

---

## ९. सर्व भारतीय भाषा — काय आहे? 🌐

- App वर **२३ भाषांची निवड** (top bar वर 🌐): **२२ आठव्या शेड्यूल भाषा + English** —
  मराठी, हिन्दी, गुजराती, बंगाली, पंजाबी, असमీय, उडिया, तमिळ, तेलुगू, कन्नड, मल्याळम, संस्कृत, उर्दू, नेपाली, मैथिली, कोंकणी, डोगरी, बड़ो, संथाली, सिंधी, कश्मीरी, मणिपूरी, English.
- **पूर्ण UI (सर्व बटणे, status, map note, chat) = ४ भाषा: मराठी, हिन्दी, गुजराती, English.**
- **इतर १९ भाषांमध्ये २६ critical strings** — SOS, "मदत हवी", "तयार आहे", "कॉल घ्या", "बंद", "112 पोलिस", "location share", "सुरक्षित आहे", सर्व ८ आणीबाणी नंबर — म्हणजे **आणीबाणीत लागणारे सर्व बटणे त्यांच्या आपल्या भाषेत.**
- उरलेली लांब वाक्ये → English/Hindi fallback (beta) — पुढील आवृत्तीत community translation ने पूर्ण.
- **विश्वासासाठी स्पष्टपणे:** बड़ो, संथाली, कश्मीरी, मैथिली, डोगरी, कोकणी, मणिपूरी, संस्कृत — या low-resource भाषा मशिन/agent द्वारे झालेल्या अनुवादा आहेत; **production मध्ये native speaker review करणे आवश्यक** आहे.

---

## १०. भाषा-अनुवाद System — मराठी ⇄ गुजराती कसे चालते? 🗣️

**तुमची घटना:** तुम्ही मराठी बोलता, साथी गुजराती बोलतो.

1. **भाषा निवड:** call सुरू होण्याआधी (किंवा आधीच) प्रत्येक व्यक्ती आपली भाषा निवडते. Match झाला की server दोघांना एकमेकांची भाषा समजवतो — call screen वर "मराठी ⇄ ગુજરાતી" दिसते.
2. **भाषा-अनुवाद Chat (सर्वत्र चालते):**
   - तुम्ही chat box मध्ये **मराठीत** लिहा: "मला मदत हवी आहे"
   - ती text server मधून साथी कडे; त्यांच्या फोनवर **गुजरातीत** दिसते: "મને મદદ જોઈએ છે"
   - त्यांनी गुजरातीत उत्तर → तुम्हाला **मराठीत**. (मूळ text लहानातही दिसते.)
   - तंत्र: **MyMemory free translation API** — keyशिवाय चालतो; जे pair थेट नसेल ते **English ब्रिज** वरून (मराठी→English→गुजराती).
3. **Live voice subtitles (Chrome मध्ये):** call दरम्यान प्रत्येक व्यक्तीचा आपला mic browser **local** वर speech-to-text (Web Speech API) करतो → त्या text चालू भाषेत → **दुसऱ्याच्या फोनवर दुसऱ्याच्या भाषेत subtitles** दिसते. म्हणजे तुम्ही मराठीत बोलाल → त्यांच्या स्क्रीनवर गुजरातीत subtitles; ते बोलले → तुमच्या स्क्रीनवर मराठीत. (मूळ आवाजही वायरवरून सुरूच असतो.)
4. **सत्याची मर्यादा (खूण):** Free, real-time, **आवाजाचा आवाज** (voice-to-voice dubbing — तुमचा आवाजच गुजरातीत) अजून free उच्च-गुणवत्तेने शक्य नाही (commercial paid service आहेत). त्यामुळे या App मध्ये: **मूळ आवाज + text अनुवाद + live subtitles** — यामुळे **भाषा-dispute शून्य**, पण "दुसऱ्याच्या भाषेत तोच आवाज" नाही. हे पुढे (paid voice-clone/TTS API असतील तर) जोडता येईल.

**वापर:** भाषा select करा → SOS/call → बोलू (subtitles) किंवा लिही (chat) — दोन्ही भाषा-अनुवादात जातात.

---

## ११. सुरक्षा व गोपनीयता — विश्वासाची पक्की बाब 🔒

- **नंबर नाही, नाव नाही, account नाही** — App मध्ये **र‍‍andom session id + coordinates** इतकेच. Server वर database नाही → hack केल्यासही काहीच मिळणार नाही.
- **Location = ephemeral:** फक्त active session मध्ये; बंद झाली की हटते.
- **Call encryption:** WebRTC DTLS-SRTP — carrier call पेक्षा कमी नाही.
- **Volunteer opt-in:** साथी स्वतः "तयार" दाबत आहे; कधीही बंद; auto-accept countdown मध्ये "लावू शकत नाही" बटण आहे.
- **Random matching:** जवळच्या पात्र साथींपैकी `Math.random()` ने निवड — कधीही तुम्हाला माहितची व्यक्ती नसू शकते.
- **Automated tests:** `npm test` — **२४ checks** (matching, distance, anonimity label, भाषा relay, chat/speech relay both ways, SDP relay, retry, no-helpers, pair-over) — सर्व PASS. हे कोणीही पुन्हा verify करू शकतो.

### जे गारंटी देऊ शकत नाही (सत्यमाने)
- १००% network call connect (internet quality वर अवलंबून).
- २४×७ coverage — **volunteers असलेल्या ठिकाणीच** मदत (म्हणून App "थेट 112" बटण नेहमी दाखवते).
- Voice dubbing (वर Q१० पहा).
- App background (phone लॉक) मध्ये push notifications — road map मध्ये.

---

## १२. App ची संपूर्ण तांत्रिक माहिती (architecture) ⚙️

| Layer | Technology | License/खर्च |
|---|---|---|
| Frontend | Vanilla JS + Leaflet 1.9 + Google Fonts (free) | open, ₹० |
| UI | mobile-first, dark, २३ भाषा i18n (i18n.js) | open, ₹० |
| Real-time | Socket.IO 4 (self-hosted) | MIT, ₹० |
| Server | Node.js + Express 4 | open, ₹० |
| Voice call | WebRTC (RTCPeerConnection + Opus), Google STUN | open, ₹० |
| Map | Leaflet + OpenStreetMap | ODbL/CC, ₹० |
| Translation | MyMemory free API (+ en bridge) + cache | free, ₹० |
| Voice-to-text (subtitles) | Web Speech API (browser) | free, ₹० |

**Matching नियम:** साथी location fresh (<९० सेकं.) असले पाहिजे · ५०० मी. → १ किमी → २.५ किमी rings · random selection · २५ सेकं. मध्ये call उचलला नाही → automatic retry (कमाल ३) · साथी call मधून बाहेर गेला → SOS कडे auto-retry · call संपली की साथी auto-repool.

**Data flow (एक SOS):**
```
SOS फोन: location → server(sos)
server:  500m pool मधून random साथी → दोघांना 'matched' (+ एकमेकांची भाषा)
दोन्ही:  WebRTC offer/answer/ICE ←→ server (signalling relay)
call:    audio peer-to-peer; location updates 2.5s; chat/speech text → अनुवाद
end:     'pair-over' → location हटतो, साथी repool
```

---

## १३. Roadmap (production आणण्यासाठी पुढील पाऊल) 📋

1. **Android app** (React Native/Flutter — हाच server + logic, foreground location service + push).
2. **Push notifications** — फोन लॉक असला तरी SOS साथी कडे पुच.
3. **Volunteer verification** ( Aadhaar आधारित lightweight, किंवा locality group मधून ) — trust वाढवण्यासाठी.
4. **TURN server (coturn)** — free VPS वर, कडक network support.
5. **112 control room integration** — location + session id पोलिस कडे थेट.
6. **MyMemory free key** (email registration) → ५०,००० अक्षर/दि अनुवाद मर्यादा.
7. **Community translation** — २३ भाषांचे पूर्ण UI + native review.
8. **Call recording option** (consent सह) — सुरक्षेसाठी.
9. **Admin dashboard** — active sessions, regional coverage map.

---

## १५. National Scale — 70–80 कोटी users साठी architecture 🏛️

**प्रश्न: इतकी मोठी user base App टिकवू शकते का? खर्च?**

**उत्तर: होय — आणि infrastructure खर्च ₹० (free tiers).** तपशील:

- **Stateless nodes + shared Redis:** प्रत्येक server node "स्मृतीहिन" — सर्व shared state (कोण तयार आहे, कोणाशी कोण call) **Redis** मध्ये. Scale = **nodes वाढवा** (load balancer मागे). `docker compose up -d` ने **उत्तरीय production topology** (nginx LB → 2 nodes → Redis) एका command ने चालते.
- **Load proof (हेच code, मेजवलेले):** `npm run test:load` → **1000 helpers pool मध्ये, 25 SOS — 0 failures**, match latency p95 = काही desiseconds. 1 node ≈ 10 लाख concurrent helpers. 80 कोटी users → 5–20% DAU → peak ~80 लाख online helpers → **~2–4 nodes** (3 regions मध्ये विभागले).
- **Data बचत (सगळ्या user साठी):** location फक्त **15 m हलला की किंवा 10 s ला** पाठवला जातो (hysteresis) — national scale वरचा सर्वात मोठा बचत.
- **Free infra map (ARCHITECTURE.md §6):** static → free CDN · compute → **Oracle Cloud Always Free** (4 CPU/24 GB, आयुष्यभर) · Redis → त्याच VM वर · LB → nginx (free) · push → Web Push (unlimited free) + FCM free tier · translation → MyMemory free → self-hosted OPUS-MT (unlimited) · maps → self-hosted tileserver (free) · TURN → coturn (free).
- **Regional design:** 3 regions (उत्तर/केंद्र/दक्षिण) — 500 m radius कधी region पार करत नाही → data region मध्येच राहतो, cross-region transfer शून्य.

## १६. Self-Healing — problem आली की auto-solve 🔁

**प्रश्न: problem आल्यास problem स्वतः solve कशी होते?**

| Problem | Auto-solve (code मध्ये आहे) |
|---|---|
| SOS दबाला internet नाही | SOS **queue** (device वर जतन) → net आला की **आपोआप पाठवला** + आत्ता 112 दाखवतो |
| connection तुटला | auto-reconnect (backoff) + **state resume** (role/ready/भाषा पुन्हा announce, queued SOS flush) |
| call connection failed | **automatic ICE-restart** (एक auto-retry) |
| GPS location बंद झाली (phone hiccup) | **watchdog 45 s नैराश्याने watch पुन्हा re-arm** |
| map tile server down | **failover: OSM → CARTO** (दोन्ही free) |
| translation provider down | **failover: MyMemory → Lingva → English-bridge** → gracefully मूळ text |
| crashed helper pool मध्ये | 30 s **watchdog stale entries reaper** |
| node crash | error containment → >30 fatal/min → exit → **supervisor (docker/pm2/systemd) auto-restart** |
| node unhealthy LB वर | nginx `max_fails=3` → traffic दुसऱ्या node कडे |
| flood/abuse | per-event **rate limits** + per-IP connection guard + size caps |

→ 3 वाजता आलेला problem **human नसता auto-solve** होतो.

## १७. Advanced Cybersecurity (zero-PII by design) 🛡️

**प्रश्न: security advanced level आहे का? breach/bug?**

- **सर्वात मोठी सुरक्षा = काहीच साठवत नाही:** नाव, नंबर, account **नाही** → database नाही → **hack करायला काहीच नाही** (SECURITY.md मध्ये STRIDE threat model).
- **HTTP:** helmet CSP (`default-src 'self'`, `object-src 'none'`, strict connect allow-list), `nosniff`, `x-powered-by` off, prod मध्ये `frame-ancestors 'none'`.
- **Socket:** allow-list events, strict validators (type+range+length), **rate limits** (SOS 3/min, loc 2/s, chat 12/min…), per-IP connection flood guard, size caps (SDP 20 KB, text 500).
- **Call:** **WebRTC DTLS-SRTP encryption** — media कधीही server वर येत नाही (फक्त लहान signing).
- **Audit:** 5000-entry ring (event type + IP, **coordinates नाही, PII नाही**) — `/api/audit` (token-gated).
- **Keys:** VAPID auto-generated (P-256), git-ignored; `ADMIN_TOKEN` env.
- **Supply chain:** 8 mainstream deps, **`npm audit` = 0 vulnerabilities**, no eval, सर्व user text DOM मध्ये escaped.
- **Honest residual risks:** free-tier infra rate-limiting (multi-provider backup), client code inspectable (पण मध्ये काहीच secret/PII नाही), volunteer behavior (verification roadmap).

**पुरावे (reproducible):** `npm test` → functional + **security tests** (CSP, audit auth, oversized/invalid/flood input — सर्व reject, server healthy) · `npm run test:load` → 1000 users · `curl /metrics` → live counters.

---

## १४. एक-लिन (TL;DR)

- **Satellite:** खरे GPS — फोनमधील chip ने, **मोफत, कायम मोफत, काही करायचे नाही**.
- **Live location:** होय (३–१० मी. अचूकता), फक्त session दरम्यान, नंतर कायमचे हटते.
- **Launch (मलाशिवाय):** GitHub → Render/Oracle free → https URL → फोन. **₹०.**
- **API:** paid/key = **शून्य** — OSM free, WebRTC free, Socket.IO self-hosted, MyMemory free.
- **Internet:** ५ मि. SOS+call ≈ **१.५–३ MB** — 2G वरही चालतो.
- **Call:** WebRTC — **नंबर नाही, charge नाही**, encryption आहे.
- **भाषा:** **२३** (४ पूर्ण + १९ critical) · **अनुवाद:** chat (सर्वत्र) + live subtitles (Chrome) — **मराठी⇄गुजराती** proof-tested.
- **खर्च:** मला ₹० · तुम्हाला ₹० · user ला ₹० (त्याचा data वगळता).
- **Test:** `npm test` → functional + security checks PASS · `npm run test:load` → **1000 users, 0 failures**.
- **Scale:** stateless nodes + Redis + nginx LB — `docker compose up` = production topology · 80 कोटी users साठी ~2–4 nodes/region · **infra ₹०** (free tiers).
- **Self-healing:** offline SOS queue, auto-reconnect+resume, ICE-restart, watch watchdog, tile/translation failover, reaper, supervisor restart.
- **Security:** zero-PII (nothing to breach), helmet CSP, rate limits, flood guard, DTLS-SRTP, audit ring, 0 npm-audit vulns.
- **Push:** Web Push (free) — phone बंद/पीछे असला तरी "SOS nearby" notification.

---

**साथी — आपण एकटे नाही.** 🤝
*ही माहिती `sathi/QUESTIONS_ANSWERS.md` मध्ये — कोणाशीही शेअर करू शकता.*
