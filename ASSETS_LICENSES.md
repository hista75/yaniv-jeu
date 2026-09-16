# Licences des assets

## Personnages et coiffures — Quaternius

- Auteur : **Quaternius**.
- Pack : **Universal Base Characters — Standard**, version gratuite téléchargée depuis la page officielle.
- Source : https://quaternius.com/packs/universalbasecharacters.html
- Téléchargement officiel : https://quaternius.itch.io/universal-base-characters
- Licence : **CC0 1.0 Universal — Public Domain Dedication**.
- Texte inclus : `public/assets/models/QUATERNIUS_LICENSE.txt`.
- Licence officielle : https://creativecommons.org/publicdomain/zero/1.0/

Fichiers intégrés :

| Fichier                 | Original et modifications                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cafe-humanoid.glb`     | `Superhero_Male_FullBody.gltf` : fusion en GLB autonome, textures ramenées à 512 px, séparation des matériaux de peau/vêtements/chaussures, suppression des attributs de couleurs inutilisés |
| `Hair_Buzzed.glb`       | `Hair_Buzzed.gltf` : GLB autonome, textures redimensionnées                                                                                                                                  |
| `Hair_SimpleParted.glb` | `Hair_SimpleParted.gltf` : idem                                                                                                                                                              |
| `Hair_Beard.glb`        | `Hair_Beard.gltf` : idem                                                                                                                                                                     |

Les variantes vestimentaires, poses assises, animations procédurales, accessoires et portraits sont créés dans le code. Les parties dérivées des assets Quaternius conservent leur statut CC0.

## Créations originales de ce projet

Géométries de café, chaises, table, nappe, plantes, scooter, théière, verres, chicha, fez, lunettes, chapeau, textures de cartes et motifs : générés par le code du projet, sans image de décor empruntée.

Ambiances et effets : synthèse Web Audio originale ; textes vocaux originaux, joués seulement par une voix locale du navigateur lorsqu’elle existe. Aucun enregistrement musical, extrait de film ou piste protégée intégré.

Police : familles système locales Segoe UI et Georgia, avec fallbacks Arial et serif. **Aucun fichier de police propriétaire n’est redistribué.**

## Bibliothèques

Three.js, Express, Socket.IO, socket.io-client, Vite, TypeScript et Prettier : licences distribuées dans leurs paquets npm (principalement MIT ; TypeScript Apache-2.0). Playwright : Apache-2.0, outil de test uniquement. Les navigateurs de test ne sont pas inclus dans le livrable.
