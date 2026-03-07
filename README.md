# FaceMash

FaceMash est une plateforme interactive de duel de profils publics avec classement Elo en temps reel.

## Ce qui est en place

- Pages separees : `index.html`, `battle.html`, `ranking.html`, `map.html`, `account.html`
- Comparaison stricte par genre : homme vs homme, femme vs femme
- Classements par continent et mondial
- Planisphere cliquable (jsVectorMap + fallback Google GeoChart)
- Bandeau cookies sur toutes les pages
- Dataset `celebs.json` avec 5000 profils

## Backend OAuth + KYC

Le backend est dans `server/` et fournit :

- OAuth Google
- OAuth Apple
- Session utilisateur
- Endpoint KYC avec upload photo + carte d'identite/passeport
- Verification de majorite par pays
- Stockage SQLite

### Lancer le backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## Generation dataset

Script principal : `scripts/generate-celebs.ps1`

Pour regenerer :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-celebs.ps1
```

## Notes

- Les identifiants OAuth doivent etre configures dans `server/.env`.
- Pour la production KYC, prevoir chiffrement stockage, retention legale et controle d'acces strict.
