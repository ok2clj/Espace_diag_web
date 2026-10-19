# EspaceWeb 0.2
Česká webová diagnostika Renault Espace inspirovaná ZoeWeb. Experimentální implementace, ne plný port PyRenu. Bez proprietárních databází. Připojení a servisní procedury zatím nebyly ověřeny s reálným adaptérem / vozidlem.

## Spuštění
Bez sestavování a externích CDN:

    python3 -m http.server 8080 --directory dist

Otevřete http://localhost:8080. HTTPS nebo localhost je nutný pro BLE/Serial. Demo funguje bez hardwaru. `npm test` spustí testy; `npm run check` ověří syntaxi JS.

## Nové ve verzi 0.2
- Automatický CAN sken adres z importovaných DDT definic, identifikace UDS i starších ECU přes 2180, přesné porovnání čtyř identifikačních polí a export reportu. Volitelné identifikační relace, zastavení skenu a rozlišení neověřené / jednoznačné / víceznačné varianty.
- Deklarativní servisní runner: vlastní JSON postup, přesná ECU a otisk SW, předpoklady, pevné rutiny UDS 31, sledování stavu, timeout, pokus o definované zastavení, kontrola výsledku a místní protokol.
- Vestavěná čtecí předservisní kontrola EOBD: napájení, otáčky, rychlost, teplota, MIL / počet emisních závad / surové readiness bity.
- Simulovaný sken a celý servisní průběh pro vyzkoušení bez vozu. Syntetická ECU má příznak, který jí brání komunikovat s hardwarem.
- Sériové vlastnictví komunikace: ruční akce počká na probíhající čtení; sken ani servis se nemíchají s automatickým pollingem.

Podrobný formát, podmínky, limity a postup: [SERVICE-SCENARIOS.md](dist/SERVICE-SCENARIOS.md). Přiložené JSON příklady jsou výhradně syntetické; nezaměňujte je za funkční regeneraci DPF.

## Dřívější funkce
BLE/Serial/WebSocket přenos; EOBD automatický protokol ATSP0. Standardní PID pro rychlost, otáčky, teploty, napětí ECU, zatížení, průtok vzduchu, MAP, škrticí klapku a palivo. VIN 0902; emisní DTC 03/07 a potvrzené smazání 04. CSV záznam, JSON report a log komunikace. DDT4All JSON/ZIP import, čtení 21/22 přes CAN ISO-TP a řízený zápis krátkého DID (1–4 bajty) s původní hodnotou, potvrzením, zpětným ověřením a kontrolovanou obnovou.

## Reálné pokrytí
Výběr Espace IV (2003–2014), V (2015–2023), VI (2023–2024) je profil, nikoli ověřená mapa všech jednotek. Adresy pro sken jsou pouze z uživatelských definic správného vozu. CAN driver je 500 kbps; K-line DDT, DoIP a jiné sběrnice / rychlosti nejsou implementovány. Generické EOBD může dle adaptéru fungovat i přes starší protokoly, to neznamená podporu Renault K-line DDT.

Chybí CLIP engine, automatický import/scénářový interpret Python/XML PyRenu, Renault DF katalogy, kompletní modelové mapy, dlouhé/dynamické servisní zápisy, SecurityAccess a odemykání zabezpečené brány. Espace VI neověřen.

DPF regenerace, odvzdušnění ABS ani kódování vstřikovačů NEJSOU přiložené hotové procedury pro reálný Espace. Runner umí pouze dokumentovaný postup v podporovaném formátu pro přesnou ECU. Například vstřikovačové kódování potřebuje další implementaci zápisů; nelze je vyřešit samotným vložením libovolného JSON. Nelze univerzálně odvodit servisní postup z názvu modelu nebo samotného seznamu DDT požadavků. Nejsou dodávány vymyšlené příkazy.

Před každou rutinou se opakuje identifikace a vstupní podmínky. Přerušení po odeslání startu zkouší definovaný stop, ale bez spojení nelze zastavení garantovat. NRC 78/response pending není plně obsluhováno; nepovažuje se za úspěch, následuje chybové ukončení a pokus o stop. Nepoužívejte takto neověřené dlouhé procedury. Stránku je nutné držet aktivní; zavření, uspání či pád prohlížeče nezastaví nezávisle běžící ECU.

## Platformy
- iPhone/iPad: kompatibilní BLE ELM327 + Bluefy. Běžné Safari/Chrome neposkytují Web Bluetooth; přidání na plochu to neřeší.
- macOS: Chrome/Edge, BLE nebo USB Web Serial. Classic po párování přes dostupný `/dev/cu.*`, případně most.
- Windows: Chrome/Edge, BLE nebo USB/COM. Classic přes dostupný virtuální COM nebo most.
- Úspěch závisí na GATT profilu, kvalitě adaptéru, ECU a přístupových podmínkách. Wi-Fi TCP adaptéry přímo nepodporovány.

## Bluetooth Classic most
Python 3.10+ a existující sériový port spárovaného adaptéru:

    python -m pip install -r tools/requirements.txt
    python tools/bridge.py --port COM5

macOS:

    python3 tools/bridge.py --port /dev/cu.OBDII

Ve webu zvolte Bluetooth Classic most a `ws://127.0.0.1:8472`. Most i web jsou na stejném počítači. Není to BLE řešení pro běžné Safari iPhonu. Most naslouchá na loopbacku, povoluje určené Origin a jednoho klienta. Pro vlastní HTTPS hosting přidejte `--origin https://vas-host.example`. Pokud prohlížeč zablokuje HTTPS → lokální most, použijte lokální web http://localhost:8080. Případná oprávnění lokální sítě potvrzuje uživatel v prohlížeči.

## Ověření
29 automatických testů: EOBD dekódování, VIN, DTC, chybějící data, řazení příkazů, BLE fragmentace a timeouty; ISO-TP délka/pořadí/NRC; DDT škálování, signed, enum, endian, truncation a příznak simulace; sken, duplicity, chybná adresa, neúplná identifikace, storno a zavření relace; servisní podmínky, nesprávný SW, rutina, přesný návratový status, sledování, timeout, ztráta spojení po startu, stop/nejistý stav, perzistentní log, odmítnutí simulace na hardwaru a validace vstupu.

Kontrola syntaxe JS/Python je součástí předání. Vizuální QA nebyla dokončena: spravovaný preview selhal na bwrap mount proc a nebyl k dispozici opravený náhled. Ověření na reálném voze a konkrétních adaptérech neproběhlo.

## Licence a původ
GPL-3.0-or-later, LICENSE. `dist/vendor/{transport,elm327,ddt,unzip}.js` ze ZoeWeb, commit eb8bc28af89d30a285ec74c530c96730182431e7 (GPL-3.0). Lokální úpravy parseru a ovladače označeny komentáři. Credit pjpetrov, přispěvatelé ZoeWeb a CanZE. Aplikace, UI, EOBD, sken, runner a most: EspaceWeb, 2026.

Identifikační rozložení zkontrolováno proti oficiálnímu DDT4All `src/ddt4all/core/ecu/ecu_scanner.py`; vlastní implementace v scan.js. Referenční PyRen: https://gitlab.com/py_ren/pyren/-/tree/pyren3 commit b0ae37376ac1cd33f22df0f72314f45fa0936b0f. PyRen kód ani proprietární Renault databáze nejsou přiloženy. Nezávislý projekt bez spojení s Renault.
