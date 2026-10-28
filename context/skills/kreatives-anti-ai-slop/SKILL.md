---
name: kreatives-anti-ai-slop
description: Verwijder alle "AI-slop" uit HTML/React builds en zorg dat de build exact doet wat Ricky vraagt en de inspiratie nauwkeurig volgt. Gebruik deze skill ALTIJD bij elke HTML- of React-website, landingspagina, sectie of component die gebouwd of aangepast wordt, ook wanneer Ricky inspiratie + een korte brief stuurt en zegt "bouw maar", wanneer hij een bestaande build laat aanpassen of tweaken, of wanneer een eerdere build "te AI", "te generiek" of "niet zoals de inspiratie" aanvoelt. Dit is de basislaag die bovenaan elke build hoort, naast project-specifieke instructies.
---

# KREATIVES — Anti-AI-slop

Deze skill bestaat omdat builds steeds dezelfde fouten maken: er worden honderden aanpassingen achteraf gevraagd die elke keer terugkomen, de build luistert niet naar wat er gevraagd is, en het eindresultaat lijkt niet op de inspiratie. Dit document fixt dat in één keer.

Werkwijze waar dit op slaat: **Cursor + Claude, inspiratie + korte brief erin, build eruit.** Geldt voor plain HTML/CSS/JS én React.

De regels hieronder zijn hard. Niet "in deze context wel", niet "deze ene keer". Lees dit vóór je begint te bouwen en houd het er de hele build bij.

---

## 0. De drie regels die boven alles staan

Als je niets anders onthoudt, onthoud dit. Dit is waar het 90% van de tijd misgaat.

1. **De referentie is wet.** Krijg je screenshots of een voorbeeld, dan neem je de échte verhoudingen, spacing, schaal en sfeer over, niet je eigen interpretatie of "verbetering". Een referentie met kleine tekst en veel witruimte betekent kleine tekst en veel witruimte. Niet jouw default van grote koppen en strakke spacing.
2. **Verander alleen wat gevraagd is.** Zegt Ricky "fix de mobile", dan blijf je van de desktop af. Vraagt hij een tweak of een effect, dan is dat een chirurgische wijziging, geen herontwerp. Werkende dingen laat je met rust.
3. **Verzin niets zelf.** Geen extra secties, geen iconen, geen badges, geen copy-onderwerpen, geen kleuren die niet uit het merk of de brief komen. Bij twijfel: minder, niet meer. Is iets onduidelijk, vraag het, bouw niet alvast "iets".

Alles hieronder is de uitwerking hiervan.

---

## 1. Werkhouding tijdens de build

```
✅ Referentie 1-op-1: verhoudingen, spacing, schaal, layout en sfeer overnemen.
❌ "Ik heb de hero wat groter/centraler gemaakt want dat oogt sterker."

✅ Alleen het gevraagde aanpassen, de rest exact laten staan.
❌ Bij een mobile-fix ook de desktop-spacing "even meenemen".

✅ De gegeven sectievolgorde / structuur exact aanhouden.
❌ Secties herordenen of toevoegen omdat het "logischer" voelt.

✅ Bestaande componenten en stijlen hergebruiken (zelfde card, zelfde marquee).
❌ Een nieuwe variant van iets verzinnen dat al bestaat.
```

Komt iets uit de inspiratie niet exact overeen na je eerste versie, dan is dat een bug, geen smaakkwestie. Fix het naar de referentie.

---

## 2. Layout & ruimte

```
✅ Echt grid met gelijke hoogtes en nette uitlijning. Foto's even hoog als hun kaart, rijen recht, footers onderaan uitgelijnd.
❌ Scheve rijen, zwevende gaten, kaarten van ongelijke hoogte.

✅ Asymmetrische, gevarieerde layouts binnen een grid.
❌ Saaie "tekst-links, foto-rechts" om de beurt door de hele pagina.

✅ Layout opbouwen met grid/flex en het type-/spacing-systeem.
❌ Absolute positionering met losse pixels om dingen "op hun plek te duwen".

✅ Royale witruimte boven/onder secties en tussen kolommen. Witruimte is een ontwerpelement.
❌ Alles tegen elkaar persen om "vol" te ogen. Bij twijfel: meer ruimte, niet minder.
```

**Spacing-schaal (4px-basis), gebruik alleen deze stappen:**
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`

- Sectie-padding verticaal: minimaal **96px desktop / 56px mobiel**. Is de referentie ruimer, neem die ruimere maat over.
- Content-breedte: ~**1200px** voor volle secties, ~**680–760px** voor tekstkolommen.
- Grid-gap: **24–48px**.

---

## 3. Typografie

```
✅ Type-schaal volgen: H1 duidelijk groter dan H2, H2 duidelijk groter dan body. Vaste stappen.
❌ Willekeurige losse groottes per sectie.

✅ Default = rustig. Koppen niet automatisch enorm.
❌ Standaard een 80–120px hero. Dat doe je ALLEEN in awwwards-mode (zie 3.2).

✅ Eén tekst, één stijl: hele zin in hetzelfde font/gewicht/kleur.
❌ Eén woord of jaartal midden in een zin een ander font, kleur of italic geven.
```

### 3.1 Vaste type-schaal (fallback als er geen merk-schaal is)

Fluid via `clamp()` tussen mobiel en desktop, maar de waardes liggen vast.

```css
:root {
  --font: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;

  --text-hero: clamp(2rem, 1.3rem + 2.4vw, 2.75rem); /* 32 → 44px */
  --text-h2:   clamp(1.5rem, 1.2rem + 1vw, 1.875rem); /* 24 → 30px */
  --text-h3:   1.375rem;  /* 22px */
  --text-h4:   1.125rem;  /* 18px */
  --text-body: 1rem;      /* 16px */
  --text-sm:   0.875rem;  /* 14px */
  --text-xs:   0.75rem;   /* 12px */
}
```

- **Default font als er geen merk-font is opgegeven: Inter Tight.**
- Koppen: gewicht 600, line-height 1.1–1.3, hero letter-spacing -0.02em. Body: gewicht 400, line-height 1.6.
- Body nooit kleiner dan 16px. H2 altijd duidelijk kleiner dan de hero, niet bijna even groot.

### 3.2 Awwwards-mode (alleen op expliciet verzoek)

Grote display-typografie (tot ~96–160px) en zware animatie zijn **alleen** toegestaan als Ricky expliciet vraagt om een "awwwards-type" site, een showcase, "groot", of "veel animatie". In alle andere gevallen geldt de rustige schaal uit 3.1.

---

## 4. Slop-taboes (de typische AI-elementen)

Dit zijn de elementen die een site direct "AI" maken. Geen ervan, tenzij Ricky er expliciet om vraagt.

### 4.1 Iconen

```
✅ Geen generieke iconen. Op de plek van een icoon komt een leeg vlak van 48–56px.
❌ Emoji, clipart, gekleurde "app-tegels", random line-icons die jij erbij verzint.
```

Placeholder, niets erin, Ricky vult het later:

```html
<div class="feature__icon" aria-hidden="true"></div>
```
```css
.feature__icon {
  width: 52px;
  height: 52px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
```

Levert Ricky zelf iconen/SVG's aan, dan gebruik je die exact zo. Verzin geen vervanger.

### 4.2 Schaduwen op cards

```
✅ Scheiding via een 1px hairline-border (var(--line)) of een subtiel achtergrondverschil.
❌ box-shadow / dropshadow op cards om ze te laten "zweven".
```

Shadow mag alleen bij echte overlay-elementen waar hoogte functioneel is (dropdown, modal, sticky bar), niet als decoratie op statische kaarten.

### 4.3 Gradients op cards

```
✅ Effen merkkleur of off-white als card-achtergrond.
❌ Decoratieve blauw-paarse "blob"-gradients of glow op kaarten.
```

Een merk-gradient mag alleen waar Ricky er specifiek om vraagt. Een **overlay-gradient over een foto** (voor leesbare tekst) is iets anders en is wél toegestaan, want functioneel (zie 5).

### 4.4 De gespatieerde caps-kicker

```
❌ Een klein gespatieerd kopje boven de hero: "O N S   B E D R I J F" / "O U R   C O M P A N Y".
```

Heb je een kicker/label nodig: normale sentence case of nette caps, letter-spacing maximaal ~0.04em, klein. Geen 0.2em letter-spacing-effect.

### 4.5 Badges, labels en clutter

```
❌ "MEEST GEKOZEN", "BESTSELLER", "POPULAIR", "100% Tevredenheidsgarantie" en soortgelijke stickers.
❌ Carousels, autoplay, roterende/typende woorden, sterren-scores, bullet-spam.
```

Alles in deze categorie alleen als Ricky het expliciet vraagt. Default = clean en rustig.

### 4.6 States verschillen op meer dan opacity

```
✅ Actief vs. inactief verschilt op kleur, gewicht, border, achtergrond én/of grootte, zoals de referentie laat zien.
❌ Inactief = alleen opacity: 0.3 en verder niks.
```

---

## 5. Tekst op foto's

```
✅ Tekst over een foto/video krijgt altijd een overlay-gradient zodat het leesbaar blijft.
❌ Wit op een lichte lucht, donker op een donker silhouet, tekst die half wegvalt.
```

```css
/* lichte tekst op (mogelijk) donkere foto */
.hero__media::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0) 60%);
}
```

---

## 6. Copy (NL én EN)

De copy-laag werkt in beide talen. **NL-site = NL-copy, EN-site = EN-copy.** Nooit mengen, nooit lorem/placeholder tenzij gevraagd. Schrijf als een mens die zijn vak serieus neemt.

### 6.1 Geen "dashes" als zinsmiddel

Bedoeld is de AI-gewoonte om met streepjes te schrijven. Gebruik nooit `—`, `–` of ` - ` als verbinder of tussenzin. Herschrijf met een komma, een punt, of twee zinnen.

```
❌ De site die we bouwen - snel en op maat - laadt in milliseconden.
✅ De site die we bouwen is snel en op maat gebouwd, en laadt in milliseconden.

❌ The site we build — fast and custom — loads in milliseconds.
✅ The site we build is fast and custom-made, and it loads in milliseconds.
```

(Een `|` mag alleen als letterlijke scheiding in een meta-regel, bijvoorbeeld "Rotterdam | sinds 2019", nooit als leesteken in een lopende zin.)

### 6.2 Geen AI-staccato en geen "negatief + positief"

```
❌ Geen templates. Geen lage kwaliteit. Gewoon maatwerk.
✅ Iedere site is op maat gebouwd voor de klant en de doelgroep, met focus op wat conversie oplevert in plaats van wat oppervlakkig mooi oogt.

❌ No templates. No fluff. Just custom websites.
✅ Every site is built from scratch for the client and their audience, focused on what actually converts rather than what merely looks good.

❌ Snel. Slim. Schaalbaar.
✅ We bouwen sites die snel laden, schaalbaar zijn vanaf dag één, en meegroeien met de ambitie erachter.
```

### 6.3 Niet doen

- Geen "geen X maar Y" / "niet zomaar X, maar Y".
- Geen "no fluff", "no nonsense", "no X".
- Geen losse woorden als zin ("Resultaat." / "Done.").
- Geen lege bureautaal ("wij ontzorgen", "uw partner in", "naar een hoger niveau tillen").

### 6.4 Wel doen

- Vloeiende zinnen met variërende lengte, komma's, natuurlijke syntax.
- Concreet en zelfverzekerd, elke zin zegt iets.
- In de merkstem en voor de juiste doelgroep.

---

## 7. Code-kwaliteit

```
✅ Betekenisvolle class-namen die het component beschrijven: .hero__title, .service-card, .pricing__row.
❌ .box, .wrapper, .div2, .container2.

✅ Styling in classes / CSS / CSS-modules.
❌ style="..." of style={{...}} door de markup. (Tailwind mag, maar dan zonder losse magic numbers: trek waardes uit de type- en spacing-schaal, geen willekeurige bracket-values.)

✅ Echte, werkende interacties: sliders, menu's, hover-states die kloppen.
❌ Hover-gaten, kapotte componenten, knoppen zonder gedrag.

✅ Responsive met clamp() voor tekst en geteste breakpoints (mobiel, tablet, desktop).
❌ Eén breakpoint half doen en de rest laten clippen of breken.
```

Inline `style` is alleen oké voor écht dynamische runtime-waardes (bv. een berekende hoogte uit JS).

---

## 8. Animatie

Vaste stack: **GSAP + SplitText + Lenis.** Lenis is optioneel en kan per project wegvallen; ga er niet vanuit dat het er altijd is.

```
✅ SplitText met behoud van spaties: words/chars correct opgedeeld.
❌ Spaties die wegvallen ("Hallodaarvriend") door verkeerde split.

✅ Reveals komen rustig binnen: fade + lichte y-translate, normale easing.
❌ Poppen, bouncen, overshoot, scale van 0 → 1.

✅ Subtiel en doelgericht.
❌ Flashy effecten op alles tegelijk.
```

Awwwards-mode (zie 3.2) is de enige uitzondering waar animatie groter en nadrukkelijker mag, en alleen op expliciet verzoek.

---

## 9. Kleur & merk

```
✅ Échte merkkleuren uit de brief/brand. Accenten alleen waar ze functioneel horen (CTA, focus).
❌ Willekeurige grijzen, filler-kleuren of een accent overal "voor de fleur".

✅ Off-white als pagina-achtergrond boven puur wit.
❌ #ffffff als grote vlakke achtergrond.
```

**Fallback-tokens (alleen als er géén merk is opgegeven):**

```css
:root {
  --bg:    #f4f3ef; /* off-white, nooit puur wit als page-bg */
  --ink:   #111111;
  --muted: rgba(17,17,17,0.6);
  --line:  rgba(17,17,17,0.12);
  /* geen fallback-accent: zonder merk blijft het monochroom ink/off-white. Vraag de accentkleur. */
}
```

Is er geen merk-accent bekend, verzin er dan geen, maar houd het neutraal en vraag het.

---

## 10. Self-check vóór je oplevert

Loop dit letterlijk af. Eén regel per punt waar nodig.

```
Referentie
[ ] Verhoudingen, spacing en sfeer komen overeen met de inspiratie?
[ ] Niets toegevoegd dat niet uit de inspiratie/brief kwam?
[ ] Alleen aangepast wat gevraagd is, rest ongemoeid?

Layout & type
[ ] Echt grid, gelijke hoogtes, nette uitlijning, geen zwevende gaten?
[ ] Spacing uit de schaal, sectie-padding ruim (min. 96px desktop)?
[ ] Type-schaal gevolgd, koppen niet automatisch enorm?

Slop-taboes
[ ] Geen verzonnen iconen (placeholder 48–56px waar nodig)?
[ ] Geen card-shadows, geen decoratieve gradients?
[ ] Geen gespatieerde caps-kicker, geen badges/carousels/sterren?
[ ] States verschillen op meer dan opacity?

Copy
[ ] Geen dashes als zinsmiddel, geen staccato, geen "geen X maar Y", geen "no fluff"?
[ ] Geen rare styling op losse woorden/getallen?
[ ] Juiste taal (NL/EN), merkstem, vloeiende zinnen?

Code & animatie
[ ] Betekenisvolle classes, geen inline styles / magic numbers?
[ ] Werkende interacties, responsive met clamp(), niks clipt op mobiel?
[ ] SplitText eet geen spaties, reveals komen rustig binnen?

Kleur
[ ] Échte merkkleuren, off-white boven puur wit, accent alleen waar het hoort?
```

---

## Wat je NIET doet

- Niet de referentie "verbeteren" of je eigen draai geven.
- Niet meer veranderen dan gevraagd is.
- Niet zelf iconen, badges, secties of kleuren verzinnen.
- Niet de type-schaal negeren en alsnog een 80–120px hero neerzetten buiten awwwards-mode.
- Niet copy schrijven met dashes, staccato of "geen X maar Y", ook niet "omdat het bij het merk past".
- Niet tekst op een foto zetten zonder overlay.
- Niet `style=` door de markup strooien.
