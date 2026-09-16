# Validation — 16 septembre 2026

## Version 6.1.0 — vérifications de cette livraison

- 57 tests automatisés réussis : nouvelles extrémités logiques, Jokers ambigus et internes, bonus aux bornes, paliers de score, sockets et simulations.
- Installation réussie depuis le cache npm (`npm install --offline --no-audit --no-fund`), build TypeScript/Vite réussi.
- `/version` vérifié : 6.1.0.
- Contrôle visuel avec huit connexions : prise à deux mains, différences de posture et tuyau articulé ; aucune erreur console relevée.
- Aperçus des trois poses ajoutés au menu.
- Archive destinée à Render ; aucun déploiement public effectué.

## Historique de validation de la version 6.0.0

- Installation npm réussie ; audit npm : zéro vulnérabilité signalée lors de la vérification.
- Contrôle TypeScript strict et build Vite réussis.
- **41 tests automatisés réussis**, sans test ignoré : règles, vrais sockets HTTP/WebSocket, confidentialité, reprise et simulations de parties complètes à 2, 3, 4, 5, 6, 7 et 8 joueurs.
- Serveur démarré localement sur le port 3000 ; `/version` répond avec la version 6.0.0.
- **Deux sessions indépendantes du navigateur intégré** ont rejoint le même salon. Une manche a été jouée jusqu’à Yaniv, révélation et score : 2 points pour l’appelant, zéro ajouté ; adversaire à 6, six ajoutés.
- Pose avant pioche, récupération de l’ancienne défausse, changement de tour et bonus vérifiés via l’interface.
- Copie du code vérifiée en lisant le presse-papiers : code attendu présent.
- Rechargement de la page : reconnexion au même salon et conservation de la main.
- Interface mobile dans un viewport de **390 × 844** : salon créé, deuxième joueur admis, pose de deux 6 puis pioche, compte passé de cinq à quatre cartes.
- Aucune erreur console observée dans les sessions inspectées après les corrections.
- Contrôle visuel à huit places avec sept clients Socket.IO de test et un navigateur : huit participants réels connectés, cinq cartes chacun, 67 cartes restant au paquet après distribution et défausse initiale (108 au départ). Clients de test retirés après contrôle.
- Chaîne finale `npm install`, `npm test`, `npm run build`, `npm start` exécutée avec succès ; accueil et quatre modèles GLB servis avec HTTP 200.

## Limites de validation

- L’exécution du script Playwright **Chromium + Firefox** a été tentée, mais le lancement des exécutables a été refusé par cet environnement Windows (`spawn EPERM`). Le test existe et un workflow CI Linux est fourni ; **ce test à deux moteurs n’est pas annoncé comme réussi**.
- Le mobile a été vérifié dans un viewport de navigateur, pas sur un téléphone physique.
- La cible 60 FPS n’a pas fait l’objet d’un benchmark matériel représentatif.
- Aucun déploiement Render n’a été effectué. La configuration est fournie ; l’URL publique devra être vérifiée après déploiement.

## Reproduire

```sh
npm install
npm test
npm run build
npm start
```

Puis, dans un environnement autorisant les navigateurs de test :

```sh
npx playwright install chromium firefox
npm run test:e2e
```
