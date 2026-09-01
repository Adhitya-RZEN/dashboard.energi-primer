# Full Worksheet Import Report

Tanggal: 30 Agustus 2026  
Project: Dashboard Batu Bara PLN Jeranjang  
Status: **FULL DRY-RUN — BLOCKED**

## Executive Summary

S1–S3 telah dijalankan terhadap seluruh 199 worksheet. Tahap ini hanya melakukan metadata discovery, pembacaan Google Sheets, parsing, schema detection, validasi, dan source-key classification. **Tidak ada database write**.

S4 menghentikan proses sebelum batch karena terdapat blocking issue dan worksheet yang belum aman untuk diimpor. S5–S8 tidak dijalankan. Worksheet yang sudah tersinkron sebelumnya tetap diperlakukan sebagai synchronized; tidak dilakukan import ulang pada fase ini.

## Environment

| Item | Value |
| --- | --- |
| Database write target | PostgreSQL LOCAL (dashboard_pln) — tidak ditulis pada fase dry-run |
| Google Sheets source | Service account server-side yang sudah dikonfigurasi; credential tidak dicatat |
| Range scan | A1:ZZ500 |
| Discovery | Read-only; 199 worksheet |
| Parser concurrency | 1 |
| Request spacing | 1.300 ms untuk kandidat BB |

## Google Sheets

- Total worksheet metadata: **199**.
- Visibility tidak tersedia pada type metadata existing; kolom inventory mencatat UNAVAILABLE_FROM_EXISTING_METADATA dan tidak mengasumsikan visibility.
- Worksheet dengan nama di luar pola existing importer BB diklasifikasikan UNSUPPORTED tanpa range read tambahan.
- Tidak ada Google Sheets mutation.

## Worksheet Inventory

Kolom Rows memakai hasil range untuk kandidat BB dan rowCount metadata untuk worksheet unsupported/duplicate yang sengaja tidak dibaca ulang.

| Worksheet | Sheet ID | Position | Rows / Basis | Classification | Valid | Invalid | INSERT | UPDATE | SKIP | Status |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| MAR-BB | 1163937875 | 0 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| FLM-MAR | 1372850071 | 1 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MAR-DTS | 362371643 | 2 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MAR-ALBES | 864592494 | 3 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR-BB | 325288758 | 4 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUL-BB | 1594800893 | 5 | 389 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR-FLM | 1394902303 | 6 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR-ALBES | 1205099139 | 7 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR-DTS | 1246469724 | 8 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI-FLM | 1985219293 | 9 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI-BB | 898968059 | 10 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI-ALBES | 1725690686 | 11 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI DTS | 379588698 | 12 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUN-BB | 1995424217 | 13 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUN-ALBES | 1726989711 | 14 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUN-DTS | 97710545 | 15 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUN-FLM | 1176484545 | 16 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUL-FLM | 1456480366 | 17 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUL-ALBES | 758727738 | 18 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| AGS-BB | 1932215074 | 19 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUL-DTS | 401281985 | 20 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| SEP-BB | 24621482 | 21 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| OKT-BB | 1710329413 | 22 | 1001 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| NOV-BB | 493360087 | 23 | 1001 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| DES-BB | 493967379 | 24 | 1001 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JAN22 - BB | 893216642 | 25 | 1005 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JAN22-FLM | 1585029027 | 26 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JAN22-ALBES | 702246872 | 27 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JAN22-DTS | 242861514 | 28 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| FEB22-BB | 794558104 | 29 | 1002 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| FEB22-ALBES | 407774550 | 30 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar22-BB | 316648349 | 31 | 1005 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar22-ALBES | 79814206 | 32 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr22-BB | 644983516 | 33 | 1004 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr22-ALBES | 471835550 | 34 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei22-BB | 104698794 | 35 | 106 (range) | NEEDS_REVIEW | 342 | 0 | 342 | 0 | 0 | NEEDS_REVIEW |
| Mei22-ALBES | 1237954707 | 36 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni22-BB | 103877528 | 37 | 105 (range) | NEEDS_REVIEW | 331 | 0 | 331 | 0 | 0 | NEEDS_REVIEW |
| Juni22-ALBES | 1995515042 | 38 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli22-BB | 1099982156 | 39 | 106 (range) | NEEDS_REVIEW | 342 | 0 | 342 | 0 | 0 | NEEDS_REVIEW |
| Juli22-ALBES | 998714253 | 40 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agus22-BB | 371484647 | 41 | 1006 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agus22-ALBES | 1485205223 | 42 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Sep22-BB | 865635951 | 43 | 1005 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Sep22-ALBES | 1255766136 | 44 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt22-BB | 813970170 | 45 | 1006 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt22-ALBES | 176865966 | 46 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Flyash-Okt | 915289636 | 47 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov22-BB | 951409806 | 48 | 1001 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Flyash-Nov | 1833031594 | 49 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov22-ALBES | 469311728 | 50 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des22-BB | 1218743546 | 51 | 1006 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des22-FLYASH | 2099487753 | 52 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des22-ALBES | 679988697 | 53 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan23-BB | 611260778 | 54 | 988 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb23-BB | 1024386239 | 55 | 967 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar23-BB | 759862232 | 56 | 970 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr23-BB | 319813076 | 57 | 969 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei23-BB | 1865621727 | 58 | 174 (range) | NEEDS_REVIEW | 342 | 0 | 342 | 0 | 0 | NEEDS_REVIEW |
| Apr23-FLYASH | 2029555977 | 59 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr23-ALBES | 1138451444 | 60 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei23-FLYASH | 97598718 | 61 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei23-ALBES | 769093481 | 62 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni23-BB | 1828753411 | 63 | 113 (range) | DUPLICATE | 342 | 0 | 331 | 0 | 0 | DUPLICATE |
| Juni23-FLYASH | 1633468927 | 64 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni23-ALBES | 564496798 | 65 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli23-BB | 109209201 | 66 | 184 (range) | NEEDS_REVIEW | 342 | 0 | 342 | 0 | 0 | NEEDS_REVIEW |
| Juli23-FLYASH | 485095918 | 67 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli23-ALBES | 1877695207 | 68 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agust23-BB | 1453911995 | 69 | 704 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agust23-ALBES | 1778745161 | 70 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agust23-FLYASH | 743586091 | 71 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Sept23-BB | 271150569 | 72 | 704 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt23-BB | 1177758962 | 73 | 620 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Sept23-FLYASH | 436977961 | 74 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Sept23-ALBES | 274598825 | 75 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt23-FLYASH | 1396073952 | 76 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt23-ALBES | 225209581 | 77 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov23-BB | 667467656 | 78 | 620 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov23-FLYASH | 862865880 | 79 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov23-ALBES | 128416923 | 80 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des23-BB | 1704875383 | 81 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan24-BB | 2008096943 | 82 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb24-BB | 151877535 | 83 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des23-FLYASH | 1167746030 | 84 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des23-ALBES | 713185907 | 85 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan24-FLYASH | 2128980786 | 86 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan24-ALBES | 1164385451 | 87 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Fab24-FLYASH | 1880815880 | 88 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb24-ALBES | 1039031094 | 89 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar24-BB | 2065292523 | 90 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar24-FLYASH | 616162362 | 91 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar24-ALBES | 271908362 | 92 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR24-BB | 1801487692 | 93 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR24-FLYASH | 1440680174 | 94 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| APR24-ALBES | 1817544132 | 95 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI24-BB | 1076550787 | 96 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI24-FLYASH | 1561035227 | 97 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI24-ALBES | 945618369 | 98 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUNI24-BB | 265647391 | 99 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUNI24-FLYASH | 1399484330 | 100 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JUNI24-ALBES | 1730406777 | 101 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JULY24-BB | 211891194 | 102 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JULI24-FLYASH | 711547494 | 103 | 610 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JULI24-ALBES | 33085035 | 104 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| AGUS24-BB | 1699741717 | 105 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| AGUST24-FLYASH | 1171096456 | 106 | 610 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| AGUST24-ALBES | 1159484101 | 107 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| SEPT24-BB | 472796671 | 108 | 583 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| SEPT24-FLYASH | 557496839 | 109 | 610 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| SEPT24-ALBES | 1217356662 | 110 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt24-BB | 808188075 | 111 | 584 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt24-FLYASH | 767235089 | 112 | 645 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Okt24-ALBES | 946538419 | 113 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov24-BB | 828943981 | 114 | 584 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov24-FLYASH | 111162186 | 115 | 769 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Nov24-ALBES | 2098090171 | 116 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des24-BB | 983591355 | 117 | 584 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des24-FLYASH | 2121462412 | 118 | 769 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Des24 -ALBES | 1215614950 | 119 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan25-BB | 2119698708 | 120 | 588 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan25-DTS | 1091947907 | 121 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan25-FLYASH | 1315325613 | 122 | 769 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Jan25 -ALBES | 1355145591 | 123 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb25-BB | 528423240 | 124 | 588 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb25-DTS | 170635695 | 125 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb25 -ALBES | 1993124060 | 126 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Feb25-FLYASH | 1250945221 | 127 | 769 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar25-BB | 1149515580 | 128 | 588 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar25-DTS | 874156492 | 129 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar25 -ALBES | 661316806 | 130 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mar25-FLYASH | 666158410 | 131 | 769 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr25-BB | 1642789815 | 132 | 588 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr25 -ALBES | 74357442 | 133 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr25-FLYASH | 688390608 | 134 | 889 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Apr25-DTS | 51801341 | 135 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei25 -ALBES | 1558312492 | 136 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei25-BB | 1093511029 | 137 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Mei25-FLYASH | 31209842 | 138 | 902 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei25-DTS | 1069050935 | 139 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni25-FLYASH | 922928566 | 140 | 868 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni25-BB | 2074641503 | 141 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Juni25 -ALBES | 1779463470 | 142 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni25-DTS | 603533025 | 143 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli25-BB | 228801543 | 144 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Juli25-FLYASH | 1276673244 | 145 | 868 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli25-DTS | 2128041305 | 146 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli25 -ALBES | 554963007 | 147 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agustus25-BB | 449873733 | 148 | 0 (range) | NEEDS_REVIEW | 0 | 0 | 0 | 0 | 0 | NEEDS_REVIEW |
| Agustus25-FLYASH | 1615474079 | 149 | 1034 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agustus25-DTS | 180928192 | 150 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Agustus25 -ALBES | 1815950008 | 151 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| September25-BB | 808281310 | 152 | 143 (range) | DUPLICATE | 348 | 0 | 337 | 0 | 0 | DUPLICATE |
| September25-FLYASH | 1723245381 | 153 | 1034 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| September25-DTS | 105443680 | 154 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| September25 -ALBES | 130556143 | 155 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Oktober25-BB | 302799565 | 156 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Oktober25-FLYASH | 1250671763 | 157 | 1134 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| November25 -ALBES | 585377383 | 158 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Oktober25 -ALBES | 1474966847 | 159 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Oktober25-DTS | 725547723 | 160 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| November25-BB | 1682233213 | 161 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| November25-FLYASH | 1218950757 | 162 | 1135 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| November25-DTS | 1607060208 | 163 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Desember25-BB | 1211313229 | 164 | 143 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Desember25-FLYASH | 898942437 | 165 | 1135 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Desember25 -ALBES | 1688324151 | 166 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Desember25-DTS | 1219179745 | 167 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Januari26-BB | 1645706820 | 168 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Januari2026-FLYASH | 2122451213 | 169 | 1138 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Januari26 -ALBES | 1137739226 | 170 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Januari26-DTS | 1579974591 | 171 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Februari26-BB | 14647856 | 172 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Februari2026-FLYASH | 1958106681 | 173 | 1138 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Februari26 -ALBES | 1978260538 | 174 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Februari26-DTS | 933296293 | 175 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Maret26-BB | 1562455477 | 176 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Maret2026-FLYASH | 623010472 | 177 | 1138 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Maret26 -ALBES | 1468317831 | 178 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Maret26-DTS | 1472036458 | 179 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| April26-BB | 820266259 | 180 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| April2026-FLYASH | 188151951 | 181 | 1143 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| April26 -ALBES | 1800208118 | 182 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| April26-DTS | 551983363 | 183 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei26-BB | 278711690 | 184 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Mei2026-FLYASH | 806638193 | 185 | 1143 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei26 -ALBES | 369791030 | 186 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Mei26-DTS | 361847475 | 187 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni26-BB | 866748297 | 188 | 147 (range) | NEEDS_REVIEW | 348 | 0 | 348 | 0 | 0 | NEEDS_REVIEW |
| Juni2026-FLYASH | 791723941 | 189 | 1143 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni26 -ALBES | 560298150 | 190 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juni26-DTS | 2034763643 | 191 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli26-BB | 1171222689 | 192 | 148 (range) | READY_FOR_IMPORT | 352 | 0 | 0 | 0 | 352 | READY_FOR_IMPORT |
| Juli2026-FLYASH | 1293390133 | 193 | 1143 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli26 -ALBES | 493825551 | 194 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| Juli26-DTS | 134448604 | 195 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| JULI24-FLM | 827018867 | 196 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| MEI24-FLM | 1610697983 | 197 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |
| AGUST24-FLM | 1360692720 | 198 | 1000 (metadata) | UNSUPPORTED | 0 | 0 | 0 | 0 | 0 | UNSUPPORTED |

## Classification

| Classification | Count |
| --- | ---: |
| READY_FOR_IMPORT | 1 |
| EMPTY | 0 |
| UNSUPPORTED | 178 |
| DUPLICATE | 2 |
| SCHEMA_CHANGED | 0 |
| NEEDS_REVIEW | 18 |
| **Total** | **199** |

READY worksheet: Juli26-BB.

UNSUPPORTED worksheet titles were not sent to the existing BB import plan. Daftar lengkapnya tercantum pada inventory; jumlahnya 178 worksheet.

## Full Dry-Run

| Metric | Result |
| --- | ---: |
| Worksheet count | 199 |
| Source rows total | 170032 |
| Range rows actually read | 2819 |
| Metadata row-count estimates | 167213 |
| Valid staging candidates | 6917 |
| Invalid | 0 |
| INSERT candidate | 6543 |
| UPDATE candidate | 0 |
| SKIP candidate | 352 |
| Rejected | 0 |
| Blocking issue entries | 107 |
| Database writes | **0** |

Candidate INSERT/UPDATE dari worksheet NEEDS_REVIEW tidak eligible untuk batch. Angka tersebut hanya hasil classification dan tidak dieksekusi.

## Import Readiness

| Gate | Status |
| --- | --- |
| Database local-only | PASS |
| Google API/authentication | PASS |
| Metadata discovery | PASS |
| Parser global | PASS |
| Full dry-run completed | PASS |
| Blocking issues = 0 | **FAIL** |
| Semua candidate aman ditentukan | **FAIL** |
| Import readiness | **BLOCKED** |

## Batch Execution

Tidak ada batch yang dijalankan karena S4 blocked. Default batch size 20 tidak diterapkan.

| Batch | Worksheets | Source Rows | INSERT | UPDATE | SKIP | FAILED | Verification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Tidak dijalankan | 0 | 0 | 0 | 0 | 0 | 0 | BLOCKED at S4 |

## Batch Verification

Tidak ada batch verification karena tidak ada database write pada fase ini. Baseline controlled import Juli26-BB sebelumnya tetap telah diverifikasi dan tidak diubah.

## Idempotency Verification

Classification read-only mengenali Juli26-BB sebagai **SKIP 352**, dengan INSERT 0 dan UPDATE 0. Re-import write tidak dilakukan karena global gate blocked. Tidak ada duplicate yang dibuat pada fase ini.

## Full Dataset Verification

Belum dijalankan sebagai verifikasi pasca-bulk-import karena S5 tidak dimulai. Inventory dan classification lengkap tersedia di atas sebagai dasar perbaikan berikutnya.

## Dashboard Verification

Tidak ada perubahan database sehingga baseline dashboard PostgreSQL normalized tetap berlaku. Controlled baseline sebelumnya memverifikasi target biomassa 70.020 ton, Unit 1–3, dan KPI Juli 2026. Full bulk regression setelah seluruh worksheet **belum dilakukan**.

## Database Safety

- DROP: NO
- TRUNCATE: NO
- Mass DELETE: NO
- Reset: NO
- Prisma migration/db push: NO
- Database write pada S1–S4: NO
- Production write: NO
- Supabase write: NO
- Deployment: NO

## Test Results

| Test | Status |
| --- | --- |
| Preflight script lint | PASS |
| Preflight script TypeScript | PASS |
| Full inventory/classification/dry-run | PASS; databaseWrites=0 |
| Existing dynamic parser verification | PASS |
| Existing PostgreSQL/dashboard baseline | PASS |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| Prisma validate | PASS |
| Prisma migrate status | PASS; database schema up to date |
| Database read verification | PASS |
| Overview PostgreSQL verification | PASS |
| Import data integrity verification | PASS |
| Sync state verification | PASS |
| Production build | PASS; Next.js 16.3.3 |
| Full bulk batch test | NOT RUN; gate blocked |

Semua regression check yang tersedia dijalankan setelah safe verification selesai dan PASS. Output verifikasi hanya menunjukkan metadata database lokal dan hasil agregat; tidak ada secret yang dicetak. Tidak ada test script `npm test` pada `package.json`.

## Exceptions

- 2 worksheet duplicate berdasarkan identity/title yang harus dipisahkan atau dikonfirmasi sebelum import.
- 18 worksheet memiliki blocking parser/semantic issue.
- 0 worksheet schema change.
- Unsupported legacy/auxiliary title count: 178.
- Blocking entries total: 107.
- Rate limit pada putaran awal diatasi dengan dry-run konservatif; putaran final tidak melaporkan read rate limit.

## NEEDS_REVIEW Worksheets

- **Mei22-BB** — NEEDS_REVIEW; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020; reason: Existing import plan has blocking validation issues.
- **Juni22-BB** — NEEDS_REVIEW; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020; reason: Existing import plan has blocking validation issues.
- **Juli22-BB** — NEEDS_REVIEW; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, biomass_supplier_receipt_empty, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020; reason: Existing import plan has blocking validation issues.
- **Mei23-BB** — NEEDS_REVIEW; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Juni23-BB** — DUPLICATE; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields, duplicate_source_key; reason: Duplicate stable source key detected in worksheet.
- **Juli23-BB** — NEEDS_REVIEW; blocking: biomass_supplier_schema_incomplete, biomass_supplier_identity_incomplete, solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Mei25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Juni25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Juli25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Agustus25-BB** — NEEDS_REVIEW; blocking: read_api; reason: Google Sheets read failed.
- **September25-BB** — DUPLICATE; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields, duplicate_source_key; reason: Duplicate stable source key detected in worksheet.
- **Oktober25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **November25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Desember25-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Januari26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Februari26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Maret26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **April26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Mei26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.
- **Juni26-BB** — NEEDS_REVIEW; blocking: solar_receipt_unresolved, coal_receipt_unresolved, biomass_target_does_not_match_70020, biomass_cumulative_unresolved, ambiguous_fields; reason: Existing import plan has blocking validation issues.

## Recommended Next Action

1. Review duplicate worksheet titles dan tetapkan source worksheet yang sah.
2. Review field yang unresolved pada worksheet period lama, khususnya coal receipt, solar receipt, cumulative, target biomassa, dan ambiguous fields.
3. Tetapkan apakah worksheet legacy/auxiliary perlu parser terpisah atau memang di luar scope dashboard.
4. Jalankan ulang S2–S4 setelah keputusan schema/identity tersedia.
5. Hanya setelah blocking = 0, lakukan batch import maksimum 20 worksheet per batch dengan verifikasi di antara batch.

## Final Status

**FULL DRY-RUN — BLOCKED**

Bulk import dihentikan sesuai critical stop condition. Tidak ada perubahan database, Google Sheets, Laravel, credential, authentication, atau deployment.
