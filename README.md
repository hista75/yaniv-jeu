# Yaniv Café 3D — version finale

Jeu Yaniv multijoueur en temps réel (Node.js + Socket.IO) avec vue 3D en première personne.

## Nouveautés
- 5 cartes exactement au début de chaque manche.
- Table carrée style café tunisien / plastique avec nappe rouge.
- Vue première personne : ton propre personnage n'est pas affiché devant toi.
- Jusqu'à 4 joueurs autour de la table.
- Choix du personnage avant de créer/rejoindre : Classique, Jeune, Costaud, Nain, Vieux, BG.
- Personnages 3D procéduraux : mouvements de tête et de bras.
- Animation 3D lorsqu'un joueur pose ou pioche une carte.
- Glisser horizontalement sur la scène pour regarder les joueurs assis à tes côtés.
- Bouton Règles intégré.
- Yaniv ≤ 7, Assaf +30, Joker 0 pour l'Assaf / +10 chez les autres à la fin.
- Suites circulaires R → As, ordre de pose conservé pour le bait.
- Élimination progressive à 200 points.
- Chambrage après Yaniv réussi avec synthèse vocale disponible sur l'appareil.

## Lancer en local
```bash
npm install
npm start
```
Puis ouvre `http://localhost:3000`.

## Mettre à jour Render
Remplace les fichiers de ton dépôt GitHub par ceux de ce dossier, puis commit/push. Render redéploiera automatiquement si l'auto-deploy est activé.

## Note 3D
La scène utilise Three.js chargé depuis jsDelivr. Les personnages sont générés directement en 3D dans le navigateur : il n'y a pas de fichiers de modèles externes à gérer.
