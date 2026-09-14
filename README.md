# Yaniv Café — V4 Terrasse réaliste

Version multijoueur Node.js + Socket.IO + Three.js.

## Ce qui change dans cette version

- caméra **fixée à ta chaise** : aucune caméra libre dans la map ; seulement un mouvement de tête limité gauche/droite/haut/bas ;
- terrasse de café **ouverte vers l'extérieur**, avec façade, portes bleues, plantes, pergola, lampes, tables secondaires et scooter ;
- table plastique blanche avec tapis de cartes usé ;
- ta chaise et ton corps deviennent visibles quand tu regardes vers le bas ;
- personnages 3D plus détaillés : visage, oreilles, yeux, sourcils, vêtements, doigts, accessoires et morphologies différentes ;
- mouvements de tête vers le joueur actif ;
- animation du bras et de la carte lorsqu'un joueur pose/pioche ;
- 6 personnages au menu : Classique, Jeune, Costaud, Nain, Vieux, BG ;
- chaque nouvelle manche distribue **exactement 5 cartes** ;
- règles Yaniv/Assaf/Joker/bait + élimination à 200 conservées.

## Installation

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`.

## Vérifier la version déployée

Ouvrir `/version` sur le site. Cette archive doit répondre :

`4.1.0-arrivee-avatar-chaises`

Cela permet de vérifier immédiatement si Render sert le bon commit.


## Ajustements 4.1

- Un avatar 3D apparaît immédiatement avec une petite animation quand un nouveau joueur rejoint le salon.
- Les trois places adverses ont été reculées : les corps et les chaises ne traversent plus le bord de la table.
- Ta propre chaise est aussi reculée derrière la caméra pour renforcer la vue assise.
