# Yaniv Café · 6.3.2

Jeu de Yaniv entre amis, de **2 à 8 joueurs**, dans un café djerbien en vraie 3D. Le serveur possède toutes les cartes, valide les actions et calcule les scores. Aucun bot ni joueur fictif n’est créé dans une partie.

## Lancer

Prérequis : **Node.js 22.12 ou plus récent** et npm. Depuis ce dossier :

```sh
npm install
npm run build
npm start
```

Ouvrir **http://localhost:3000**. Choisir un pseudo, un skin et une pose, puis créer une table. Ouvrir une deuxième session/navigateur et rejoindre avec le code affiché. L’hôte lance à partir de deux joueurs.

- Version : **http://localhost:3000/version**.
- Port : variable d’environnement `PORT`, 3000 par défaut.
- Tests : `npm test`.
- Développement : `npm start` pour le serveur, puis `npm run dev` dans un second terminal. Vite transmet Socket.IO au port 3000.
- Caméra : maintenir le clic gauche et glisser sur le décor ; glissement tactile sur mobile. Rotation limitée, aucun déplacement libre.
- L’ordre des clics sur les cartes définit l’ordre de pose. Les petits numéros indiquent cet ordre. « Effacer » permet de recommencer.

## Déploiement Render

Créer **un Web Service Node.js**, connecté au repository contenant ce dossier à sa racine. Le fichier `render.yaml` fournit aussi un Blueprint.

| Réglage           | Valeur                                |
| ----------------- | ------------------------------------- |
| Build Command     | `npm install && npm run build`        |
| Start Command     | `npm start`                           |
| Health Check Path | `/version`                            |
| Node              | 22.16.0, configuré dans `render.yaml` |
| Instances         | **1**                                 |

Express sert `dist/` et Socket.IO utilise le même service, le même domaine et le même port. Le serveur écoute sur `0.0.0.0` et `process.env.PORT`. Aucun CDN n’est nécessaire au jeu.

Après déploiement, vérifier **`https://NOM-DU-SERVICE.onrender.com/version`** : JSON contenant `version`, `build` (commit Render lorsqu’il est fourni), `rules` et `uptime`.

Les salons vivent **en mémoire** : un redémarrage ou un déploiement les ferme. Ne pas multiplier les instances sans ajouter un stockage partagé et un adaptateur Socket.IO. Le Blueprint utilise le plan Starter pour éviter la mise en veille d’un service gratuit ; sa création chez Render reste à la charge du propriétaire. Aucun service payant n’a été créé automatiquement.

Documentation de référence : [Render — Express](https://render.com/docs/deploy-node-express-app).

## Architecture

```text
server/rules.js        Deck, combinaisons, extrémités, valeurs, scoring
server/game.js         Machine à états et vues privées par joueur
server/index.js        Express, Socket.IO, salons, reprise, délais
src/main.ts           Menu, salon, sélection, chat, résultats, réglages
src/scene.ts          Café 3D, caméra, sièges, cartes et déplacements
src/avatar.ts         GLB skinné, poses, AnimationMixer, skins et regards
src/cards.ts          Cartes et textures originales générées localement
src/audio.ts          Mixeur Web Audio sans annonces vocales
public/assets/models/ Modèles GLB et licence Quaternius
tests/                Règles, sockets réels et simulations complètes
scripts/e2e.mjs       Contrôles UI Chromium + Firefox
scripts/build.mjs     Build Vite avec transpilation TypeScript en processus
```

Machine à états :

```text
WAITING → PLAY → DRAW → [BONUS] → PLAY …
             ↘ YANIV_REVEAL → ROUND_END → PLAY
                            ↘ GAME_END
```

Chaque action de jeu utilise la session authentifiée du socket et une révision d’état. Un client ne peut pas agir à la place d’un autre, envoyer le deck ou imposer un score. Les snapshots n’envoient que sa main ; les événements de pioche du paquet ne contiennent pas la carte. Les mains sont révélées seulement après l’annonce de Yaniv.

Reconnexion : jeton opaque stocké dans `sessionStorage`, place conservée pendant **30 secondes**. Un départ explicite libère immédiatement la place. Les sièges des autres joueurs restent fixes pendant la partie. Les joueurs éliminés restent visibles. Le pseudo et les messages sont affichés comme du texte, les actions et messages sont limités en fréquence.

## Règles de cette version

- 54 cartes pour 2–5 joueurs actifs ; 108 pour 6–8. Cinq cartes exactement, puis une carte de départ à la défausse.
- As = 1 ; nombres = valeur nominale ; V/D/R = 10 ; Joker = 0 dans la main et pour comparer l’Assaf.
- Une carte, un groupe de **même rang** (D avec D, pas D avec R), ou une suite d’au moins trois cartes de même enseigne. Joker wildcard uniquement pour les suites. Une suite peut boucler du Roi vers l’As, sans dépasser treize rangs.
- L’ordre visuel sélectionné est conservé. Pour une suite, seules ses extrémités **logiques** sont récupérables, indépendamment du placement. Toutes les cartes d’un groupe de même rang sont récupérables.
- Poser d’abord dans `currentPlay`. L’ancienne `previousDiscard` reste récupérable jusqu’à la pioche. Impossible de reprendre sa propre pose. La combinaison posée remplace l’ancienne à la fin du tour.
- Une pioche du même rang qu’une carte posée ouvre un bonus de **6 secondes** : rajouter ou garder. Cela marche aussi après une suite. Le bonus est ajouté à droite ; après une suite, il est récupérable uniquement si son rang correspond à une extrémité logique de la suite originale. Sans réponse, la carte est conservée.
- Yaniv est annoncé au début de son tour, main ≤7. Une main adverse inférieure **ou égale** provoque un Assaf : l’appelant prend sa main +30. Sinon il prend zéro.
- Les autres joueurs ajoutent leur main. Le Joker détenu par un adversaire vaut +10 **seulement lors d’un Yaniv réussi** ; il reste à zéro lors d’un Assaf.
- Objectif : le moins de points possible. Après ajout des points de manche, 50 exactement → 0 ; 100 exactement → 50. Une seule réduction, sans cascade. Aucun effet si le palier est dépassé.
- Au-dessus de 100 points après les paliers : élimination. Dernier actif : victoire. Cas limite d’élimination simultanée de tous : le plus petit score final gagne, départagé par l’ordre des sièges en cas d’égalité.
- La défausse retirée est recyclée sans créer de cartes. En dernier recours, lorsque la réserve et les anciennes piles sont vides, la défausse disponible est remélangée pour la pioche ; les mains et la pose du tour ne sont jamais réintroduites.
- Après **90 secondes d’inactivité par phase**, le serveur joue une carte puis pioche, ou annonce Yaniv si la main le permet. Cette action ne crée pas de joueur artificiel.

## 3D et audio

Le café, les portes, les chaises, la table, la nappe, les plantes, le scooter, la théière et les accessoires sont des géométries 3D. Les personnages utilisent un vrai maillage humanoïde GLB avec squelette et six déclinaisons vestimentaires. Respiration par `AnimationMixer`, mouvements des bras liés aux événements réseau, regards, clignements, arrivée et réactions de fin de manche. Les cartes adverses restent de dos avant la révélation.

Rendu **stylisé**, avec matériaux PBR, ombres, éclairage chaud et tone mapping. Les personnages partagent le modèle de base Quaternius ; ce ne sont pas six sculptures photoréalistes distinctes ni des animations de motion capture. Les textures procédurales sont originales. Les objets statiques sont regroupés et le feuillage utilise l’instancing.

Qualité Bas/Moyen/Élevé : ratio de pixels, ombres et résolution de shadow map. Le mode Bas désactive les ombres. La cible 60 FPS dépend du GPU et n’a pas été certifiée sur une gamme de machines physiques.

Sons de cartes, oiseaux, rue et ambiance synthétisés via Web Audio. Volumes séparés. Aucune annonce vocale automatique ni voix synthétique. Aucun fichier audio protégé.

## Validation

```sh
npm test
npm run build
npm start
```

`npm test` couvre **65 tests** : toutes les règles demandées, entrées invalides, confidentialité réseau, salons jusqu’à huit joueurs, reprise de session et parties simulées complètes pour chaque effectif de 2 à 8. Le lanceur reste dans un seul processus pour fonctionner aussi sur les postes Windows restreints.

Pour les tests UI automatisés sur deux moteurs :

```sh
npx playwright install chromium firefox
npm run test:e2e
```

Ils démarrent leur propre serveur sur un port libre. Les captures sont écrites dans `test-results/`. Les variables facultatives `CHROMIUM_EXECUTABLE_PATH` et `FIREFOX_EXECUTABLE_PATH` permettent d’utiliser des navigateurs déjà installés. Le workflow GitHub Actions fourni exécute ces commandes sur Linux après publication du repository.

Voir **[VALIDATION.md](VALIDATION.md)** pour les résultats effectivement observés et la limite de l’environnement de test.

## Licences

Voir **[ASSETS_LICENSES.md](ASSETS_LICENSES.md)**. Les GLB nécessaires sont inclus ; aucun téléchargement n’est effectué au lancement. Les bibliothèques conservent leurs licences dans les paquets npm.

### Suites avec Joker
Le serveur privilégie une interprétation où les Jokers sont internes. En cas d'ambiguïté restante, il choisit le départ le plus bas (As, 2… Roi). Ainsi 2/Joker/3 est interprété As/2/3 ; le Joker et le 3 sont récupérables. L'ordre visuel ne modifie jamais cette décision.

### Apparence
Les cartes sont soutenues par les deux mains au repos. Focus penche le buste et relève les cartes ; Chicha incline le buste vers l'arrière, avec un tuyau qui suit la main. Réglages → Ambiance visuelle : Jour / Nuit, mémorisé sur l'appareil.



## Nouveautés 6.2 : vestiaire et vannes

Les victoires de parties complètes (dernier joueur après élimination au-dessus de 100) sont comptées par le serveur. Une victoire par abandon seul ne donne pas de récompense. Un profil anonyme est créé : son jeton secret reste dans le navigateur et ses victoires sont enregistrées côté serveur, sans route pour modifier le compteur.

Paliers : 1 victoire mosaïque, 2 figures or, 3 pose Patron, 5 dos Nuit vivante animé, 7 tenue azur, 10 figures porcelaine, 12 pose Tranquille, 15 tenue prestige, 20 dos Soleil animé. Ouvrir **Vestiaire** et équiper avant de rejoindre un salon. Les deux dos animés sont des matériaux 3D animés ; les aperçus du vestiaire scintillent également.

### Sauvegarde indispensable sur Render

Le Blueprint inclut un disque persistant de 1 Go, monté dans `/var/data`, et `DATA_DIR=/var/data`. Pour un service Render existant, ajouter ce disque et cette variable dans le tableau de bord. Le stockage persistant Render nécessite un service payant : aucune ressource n'est créée par cette archive. Sans disque persistant, les profils sont perdus au redéploiement. Garder une seule instance. En local : fichier `data/profiles.json`, exclu du ZIP et de Git. Le jeton d'accès reste propre à ce navigateur ; pas de compte multi-appareils dans cette version.

Documentation : https://render.com/docs/disks

### Vannes assistées par IA, sans voix automatique

Après un Assaf, les joueurs qui ont contré voient **Chambrer après cet Assaf**. Ils peuvent écrire directement leur message, ou demander une proposition IA puis la modifier et l'envoyer. Aucun texte n'est publié automatiquement. Toutes les voix synthétiques ont été supprimées ; les effets sonores restent disponibles.

Configurer `OPENAI_API_KEY` comme secret dans Render → Environment. `OPENAI_MODEL` est optionnel (défaut `gpt-5.6-luna`). La clé ne doit jamais être préfixée `VITE_`, committée ou collée dans le chat du jeu. Les appels API nécessitent un compte API actif et sont facturés selon ce compte. Seuls le thème écrit par le joueur et le total de l'annonce sont transmis, pas les mains ni les jetons de profil. Trois propositions maximum par Assaf, délai de 15 secondes, trois requêtes simultanées maximum par serveur et expiration à 12 secondes.

Sans clé, l'écriture manuelle fonctionne et la génération indique clairement qu'elle n'est pas configurée. L'intégration a été testée avec des réponses simulées et ses cas d'erreur ; aucun appel réel n'a été effectué sans clé.

Documentation officielle OpenAI : https://developers.openai.com/api/docs/guides/text

### Build Render

Garder `npm install && npm run build` et `npm start`. `.npmrc` inclut les outils nécessaires au build même avec NODE_ENV=production. Le script prestart compile le client si `dist/index.html` manque, pour éviter l'erreur ENOENT observée sur Render.


### Premier joueur de la manche suivante
Un Yaniv réussi fait commencer son appelant. En cas d’Assaf, le contreur avec la plus petite valeur de main commence (Joker = 0), puis ordre des sièges en cas d’égalité. Les joueurs éliminés ou partis sont ignorés ; sans candidat restant, le premier siège actif commence.

## Version 6.3 : comptes et vannes vocales
Le bouton **Compte** permet de créer un identifiant (3–24 caractères) et un mot de passe (10–128 caractères), ou de se connecter. Créer un compte rattache les victoires et équipements de l’invité courant. Se connecter à un compte existant retrouve sa progression sans fusionner celle d’un autre invité. Un même profil ne peut pas occuper deux sièges d’une table.

Les mots de passe sont salés et dérivés avec scrypt ; aucun mot de passe brut n’est stocké. Sessions de 30 jours, dix appareils maximum, déconnexion révocable. Limitation des tentatives de connexion. Pas de récupération par e-mail : conserver son mot de passe. Les comptes nécessitent le même serveur et le disque persistant Render `DATA_DIR=/var/data`. Sauvegarder ce disque ; ne pas publier `data/profiles.json`.

Après un Yaniv réussi, l’appelant peut chambrer le joueur avec le plus de points **dans cette manche**, Joker de fin inclus. En cas d’égalité, ordre des sièges. Après Assaf, les contreurs peuvent chambrer l’appelant. Texte écrit ou généré, modifiable, envoyé explicitement ; une vanne envoyée par joueur autorisé et par manche. Case **Lire à la table avec une voix générée par IA**. Le lecteur permet d’arrêter/rejouer la voix ; le réglage **Voix IA des vannes** permet de la couper. Aucun cri automatique Yaniv/Assaf. Les requêtes terminées après le changement de manche sont annulées.

Configurer `OPENAI_API_KEY` pour texte et voix (appels payants selon le compte API). Voix : `OPENAI_TTS_MODEL=gpt-4o-mini-tts`, `OPENAI_TTS_VOICE=coral`. Sans clé, décocher la voix et écrire manuellement. Intégration suivant la [documentation officielle de synthèse vocale](https://developers.openai.com/api/docs/guides/text-to-speech). Les anciens passages indiquant un profil limité au navigateur sont remplacés par le système de comptes de cette version.

Un Joker peut compléter un groupe de même rang dès deux cartes au total : 7 + Joker, 7 + 7 + Joker. Toutes les cartes de ce groupe sont récupérables dans la défausse précédente, y compris le Joker. Les suites de même enseigne restent de trois cartes minimum.

Assaf subi : la pénalité de l’appelant vaut sa main avec chaque Joker à 10, plus 30. Pour la comparaison Assaf, le Joker reste à 0 ; le score des contreurs conserve cette valeur. Le joueur éliminé reste spectateur jusqu’à la fin, sans nouvelles cartes. À deux, son adversaire gagne immédiatement.
