# Yaniv Café — multijoueur

## Lancer en local
1. Installe Node.js 18+.
2. Dans ce dossier : `npm install`
3. Lance : `npm start`
4. Ouvre `http://localhost:3000`

Pour jouer avec des amis sur Internet, déploie ce dossier sur un hébergeur Node.js compatible WebSockets (Socket.IO) et partage l'URL.

## Règles codées
- 5 cartes distribuées à chaque joueur au début de chaque manche.
- Tour strict : poser puis piocher.
- Pose : 1 carte, groupe de même valeur, ou suite de même couleur (Joker autorisé).
- Suites circulaires autorisant R → As, donc V-D-Joker-As est valide avec Joker=R.
- L'ordre visuel choisi par le joueur est conservé pour le bait.
- Pour la récupération, le serveur vérifie les vraies extrémités possibles de la suite, indépendamment de l'ordre affiché.
- Yaniv à 7 ou moins ; réussi = 0 point.
- Assaf si un autre joueur a une main de valeur <= : annonceur prend valeur de sa main + 30.
- Joker = 0 pour la valeur courante et la comparaison Assaf ; Joker = +10 dans la main des autres à la fin d'un Yaniv.
- Élimination à 200 points ou plus ; dernier survivant gagne.
