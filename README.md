# FaceMash

FaceMash est une plateforme interactive de duel de profils publics avec classement Elo en temps reel.

## Ce qui est en place

- Pages separees : `index.html` (redirige vers battle), `battle.html`, `ranking.html`, `map.html`
- Comparaison stricte par genre : homme vs homme, femme vs femme
- Classements par continent et mondial
- Planisphere cliquable (jsVectorMap + fallback Google GeoChart)
- Bandeau cookies sur toutes les pages avec 3 actions : Accepter / Ne pas accepter / En savoir plus
- Dataset `celebs.json` privilegie sur des profils publics tres connus

## Generation dataset

Script principal : `scripts/generate-celebs.ps1`

Pour regenerer :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-celebs.ps1
```
