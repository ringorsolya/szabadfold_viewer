# Szabad Föld-korpusz – böngésző és javító felület

Statikus oldal (GitHub Pages, a repó gyökeréből), elérhető: https://digithist.com/szabadfold_viewer/

Adatot nem tartalmaz: minden adat a Supabase-ből jön, és csak a `sf_munkatarsak` listáján szereplő,
bejelentkezett felhasználók olvashatják. Javítani a szerkesztők és az admin tud, ellenőrzött
adatbázis-függvényeken keresztül; minden változás a `sf_naplo`-ba kerül, a felülírt érték megmarad
és visszaállítható.

A fájlban szereplő Supabase-kulcs a nyilvános (publishable) kulcs, ezt böngészőben futó kódnak szánták;
a hozzáférést az adatbázis RLS-szabályai védik.
