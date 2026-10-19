# EspaceWeb 0.2 · sken a servisní scénáře

## Automatický sken CAN
1. Připojte adaptér a zapněte zapalování.
2. Expert · DDT → načtěte vlastní ECU JSON nebo ecu.zip s definicemi pro váš vůz.
3. Řídicí jednotky → případně omezte výběr názvem → Automatický sken CAN.
4. Sken se ptá jen na adresy z těchto definic. Nepředpokládá, že adresy Zoe platí pro Espace.
5. Porovnává DiagVersion, Supplier, Soft a Version s autoidents z definice. Jedinou úplnou shodu lze vybrat. Odpovídající adresa bez úplné shody neopravňuje k volbě varianty pro zápis.
6. Exportujte JSON report včetně odpovědí a chyb. „Bez odpovědi“ není důkaz nepřítomné jednotky: může spát, potřebovat relaci, jinou rychlost CAN, jinou sběrnici nebo autorizovanou bránu.

Výchozí sken nemění diagnostickou relaci. Volitelné 1003/10C0 může probudit identifikaci; po něm se zkouší 1001. Neshoda nebo selhání návratu je v reportu. UDS identifikace: 22F1A0, 22F18A, 22F194, 22F195; starší CAN: 2180. K-line ani DoIP se nezkoušejí. CAN ovladač v této verzi používá 500 kbps. Druhá sběrnice či 250 kbps potřebují další podporu. Rozsah je omezen na 1500 vybraných definic / 128 adres. ZIP načtěte z odpovídajícího výběru; pro obrovskou databázi použijte filtr názvu.

## Vestavěná předservisní kontrola
Čtecí postup načte standardní EOBD napětí ECU, otáčky, rychlost, chladicí kapalinu a PID 0101 (MIL, počet emisních DTC a surové readiness bity). Neznámé / neposkytované hodnoty zůstanou nevyhodnocené. Kontrola nezaručuje splnění podmínek libovolné servisní procedury.

## Servisní runner
Tento runner NENÍ interpret libovolného Pythonu nebo XML PyRenu. Je to deklarativní formát přesných postupů pro konkrétní CAN ECU. Neobsahuje databázi reálných DPF, ABS či vstřikovačových příkazů. Kódování vstřikovačů, dlouhé zápisy, SecurityAccess a odemykání brány nejsou podporovány.

Pro reálný postup je nutná odpovídající DDT definice, dokumentace, přesné identifikační odpovědi a ověřený algoritmus. Neodvozujte start/stop DPF ani jeho podmínky z níže uvedené simulace. Připojení a procedury zatím nebyly testovány s vozidlem.

### Formát JSON
- `schema`: přesně `espaceweb.service.v1`.
- `id`, `title`: identifikátor a srozumitelný název.
- `reference`: zdroj dokumentace pro přesnou ECU / verzi SW. Pro reálný scénář povinné.
- `target`: `{ "name": "přesný název DDT ECU", "tx": "CAN TX", "rx": "CAN RX" }`.
- `instructions`: neprázdný seznam pokynů před spuštěním.
- `fingerprint`: minimálně dva různé čtecí požadavky 21xx nebo 22xxxx s ÚPLNOU očekávanou hex odpovědí. Každá odpověď se porovnává přesně, nikoli jen prefix. Provádí se před relací a před každou rutinou. Vyberte stabilní identifikátory SW, ne proměnlivá data.
- `session`: nepovinně 1001, 1003 nebo 10C0. Bez automatického SecurityAccess. Během sledování se v zadané relaci používá 3E00, na konci 1001.
- `preconditions`: kontroly odkazující na DDT název čtecího požadavku a datového pole. Kontrolují se před rutinou a v každém cyklu sledování.
- `steps`: seznam čtení, rutin nebo sledování; nejvýše 64 kroků.
- `stop`: při startu rutiny povinný definovaný požadavek 3102 se stejným ID rutiny a přesnou očekávanou odpovědí.
- `postconditions`: neprázdný seznam kontrol dokončení. Potvrzený start rutiny sám o sobě není ověřený výsledek.
- `demoOnly: true`: povinně jen simulace; nelze spustit s reálným autem.

Kontrola:

    {"request":"název DDT čtení","item":"název DDT pole","op":"between","value":12.0,"max":15.5,"label":"Napájení"}

Operátory: eq, ne, gte, lte, between (včetně mezí). Čísla jsou v fyzikálních jednotkách dle DDT škálování, u enumů se porovnává surový číselný kód. NaN, chybějící data či nepodporované dekódování nesmí projít.

Čtecí krok:

    {"type":"read","request":"přesný název DDT čtecího požadavku"}

Rutina:

    {"type":"routine","request":"přesný název pevného DDT UDS31 požadavku","expect":"úplná očekávaná odpověď 71..."}

Podporovány jen pevné 3101/3102/3103 požadavky o nejvýše 7 bajtech. Dynamická sendbyte_dataitems nejsou povolena. Odpověď musí odpovídat celá, včetně návratového stavu, ne jen 71. Jeden scénář může spouštět pouze jedno ID rutiny, aby mohl existovat jednoznačný stop příkaz.

Sledování:

    {"type":"monitor","until":{"request":"stavový DDT požadavek","item":"výsledek","op":"eq","value":1},"intervalMs":1000,"timeoutMs":60000}

Interval 500–5000 ms, timeout nejvýše 900000 ms. Aktuální požadavek se při kliknutí Zastavit nechá doběhnout; následuje definovaný stop, byl-li start již odeslán. NRC 78/response pending není považováno za úspěch: postup přejde do chybového ukončení a pokusí se zastavit. Dlouhé UDS procedury vyžadující zvláštní obsluhu pending potřebují další implementaci.

### Log a přerušení
Před odesláním rutiny se záměr zapisuje do místního protokolu. Pokud zápis protokolu selže, rutina se nespustí. Po selhání již odeslaného startu se zkouší stop i tehdy, když není jasné, zda ECU start přijala. Pokud stop nepotvrdí ECU, protokol výslovně hlásí nejistý stav.

Zavření stránky, výpadek BLE, ztráta napájení, uspání nebo ukončení prohlížeče mohou znemožnit zastavení. Web nemůže zaručit ukončení rutiny bez aktivního spojení. Stránku udržujte v popředí. Automatické pokračování po obnovení se neprovádí. Rutiny nelze obecně vrátit jako konfigurační DID zápis.

Historie uchovává posledních 20 postupů, v každém posledních 1000 událostí; exportujte protokol. Po vymazání dat prohlížeče historie zmizí. Úplný aktuální log v paměti runneru je omezen na 2000 událostí.

## Vyzkoušení bez auta
Spusťte demo aplikace → Servisní funkce → Ukázkový scénář → Připravit → potvrzení SPUSTIT. Ukázka má syntetické adresy i příkazy a nesmí být použita pro skutečné vozidlo. Tlačítko Zastavit si můžete vyzkoušet během sledování. V Řídicí jednotky lze spustit simulovaný sken.

## Původ identifikačního algoritmu
Adresační data jsou jen z uživatelských DDT definic. Rozložení UDS a 2180 identifikace bylo zkontrolováno proti oficiálnímu projektu DDT4All (`src/ddt4all/core/ecu/ecu_scanner.py`). Jde o samostatnou implementaci EspaceWeb. Sken ani runner neobsahují proprietární Renault databáze. Pro srovnání konkrétních servisních stavových algoritmů byl použit veřejný PyRen `scen_ecri_fap5.py`; tento scénář nebyl portován a žádný jeho univerzální start příkaz nebyl vymyšlen.
