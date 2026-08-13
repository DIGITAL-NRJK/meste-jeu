# Recette et préparation de production

Date de lancement cible : **15 août 2026**.

Ce document est la gate opérationnelle de la V1. Une case non cochée dans les sections « Bloquants » ou « Recette manuelle » interdit de déclarer la production prête, même si la CI est verte.

## Verdict au 13 août 2026

**Code automatisé : prêt pour une Deploy Preview. Production événementielle : non validée.**

La fiabilité du moteur, du scoring, du temps serveur, de l’inscription, du classement et des commandes live dispose de tests unitaires et PostgreSQL. Le parcours mobile complet est automatisé avec des réponses HTTP simulées. Les points suivants restent à réaliser ou à valider humainement.

## Bloquants fonctionnels issus du cahier des charges

- [x] Raccorder à `/admin` la création, l’édition, la duplication, la validation et l’archivage des questions et catégories.
- [x] Raccorder à `/admin` la création des événements et sessions, la configuration de leur ordre de questions et l’ouverture des inscriptions.
- [x] Ajouter la recherche, la consultation et la désactivation d’un joueur.
- [x] Ajouter les ajustements de score `ADMIN_ADJUSTMENT` avec motif et audit.
- [ ] Raccorder la gestion et l’attribution des récompenses.
- [ ] Produire puis tester un QR code vers l’URL joueur définitive.

Le schéma et plusieurs services métier existent déjà pour certaines de ces capacités, mais une personne MESTE ne peut pas encore les utiliser intégralement sans intervention technique. Cela diverge du critère du cahier des charges selon lequel l’administration doit piloter tout le quiz.

TASK 13 raccorde la bibliothèque à `/admin/questions` avec recherche, filtres, cycle éditorial, sources, QCM texte/image et activation des catégories. Elle est fusionnée et déployée.

TASK 14 ajoute `/admin/sessions` pour créer un événement, créer ses sessions, composer le conducteur ordonné à partir des seules questions validées, fixer chaque durée et verrouiller une session en `READY`. L’ouverture des inscriptions fait passer l’événement de `DRAFT` à `READY` uniquement si une session est elle-même prête. Elle est fusionnée et déployée depuis le 13 août 2026.

TASK 15 ajoute `/admin/players` pour rechercher un joueur par pseudo ou code public, filtrer son statut, consulter son score calculé depuis le ledger et ses réponses, puis le désactiver. La désactivation révoque ses sessions actives dans la même opération et produit un audit `PLAYER_DISABLED`. Le résultat d’une réponse reste masqué tant que la question n’est pas `REVEALED`. Elle est fusionnée et déployée depuis le 13 août 2026.

TASK 16 complète la fiche joueur avec un ajustement de score exceptionnel rattaché à une session. Un entier positif ou négatif et un motif sont obligatoires, une confirmation précède l’écriture, puis le serveur ajoute atomiquement un événement `ADMIN_ADJUSTMENT` et un audit `SCORE_ADJUSTED`. Le score existant n’est jamais écrasé. La validation PostgreSQL du ledger, du classement recalculé et de l’audit doit être effectuée sur la branche Neon éphémère de la PR avant fusion.

Le seed éditorial du 66e anniversaire prépare 5 catégories, 50 questions sourcées et 6 sessions en brouillon dans le fuseau `Africa/Accra`. Sa procédure sécurisée est documentée dans `docs/seed-independence-66.md`. Il a été validé sur la branche Neon éphémère puis appliqué sur Neon production après création d’un point de restauration et confirmation explicite de l’opérateur.

## Contrôles automatisés avant chaque fusion

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run db:check`
- [ ] `npm audit --omit=dev --audit-level=high`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] workflow Neon : migrations et tests d’intégration PostgreSQL réussis sur la branche de PR.
- [ ] deploy Netlify réussi et règles de rate limiting visibles dans le post-processing du log.

La CI GitHub exécute lint, typecheck, historique Drizzle, audit des dépendances de production, tests unitaires, build et Playwright. Le workflow Neon reste l’unique environnement autorisé pour les tests qui modifient PostgreSQL.

## Recette manuelle sur la Deploy Preview

Tester au minimum sur un iPhone et un Android réels, dont un écran proche de 360 px :

- [ ] ouvrir le lien joueur sur Wi-Fi puis sur réseau mobile ;
- [ ] s’inscrire avec un pseudo et vérifier le cookie après actualisation ;
- [ ] rejoindre le lobby et une session live ;
- [ ] répondre puis tenter une seconde réponse ;
- [ ] tenter une réponse au moment exact de la fermeture ;
- [ ] vérifier que ni la bonne option ni l’explication n’apparaissent avant `REVEALED` ;
- [ ] vérifier le score, la série et le classement après révélation ;
- [ ] annuler une question et vérifier la disparition des points associés ;
- [ ] exécuter le cycle complet depuis un second appareil connecté à `/admin` ;
- [ ] créer un événement et une session depuis `/admin/sessions`, enregistrer l’ordre, rendre la session prête puis ouvrir les inscriptions ;
- [ ] rechercher un joueur par pseudo puis par code public dans `/admin/players` et vérifier son score ainsi que son historique ;
- [ ] désactiver un joueur de recette, vérifier son audit `PLAYER_DISABLED`, puis confirmer que sa session existante ne donne plus accès au jeu ;
- [ ] appliquer `+50`, puis `-50` au même joueur avec deux motifs distincts et vérifier le score, le classement, l’historique et les audits `SCORE_ADJUSTED` ;
- [ ] couper puis rétablir le réseau sur un téléphone pendant une question ;
- [ ] télécharger et ouvrir les trois CSV dans Excel et Google Sheets ;
- [ ] vérifier la navigation clavier de la connexion admin et des réponses joueur ;
- [ ] vérifier l’absence de débordement horizontal à 360 px ;
- [ ] vérifier l’heure et le fuseau configurés pour l’événement ;
- [ ] scanner le QR code imprimé à plusieurs distances et luminosités.

## Test de charge léger

Le script n’envoie que des requêtes GET sans cookie. Ne jamais lui fournir de secret et ne jamais cibler une route de mutation.

Validation locale après `npm run build` et `npm run start` :

```bash
npm run test:load -- \
  --base-url http://127.0.0.1:3000 \
  --path /api/health \
  --path / \
  --requests 500 \
  --concurrency 50
```

Validation de la Deploy Preview, puis de la production avant l’ouverture :

```bash
npm run test:load -- \
  --base-url https://DEPLOY-PREVIEW-URL \
  --path /api/health \
  --path / \
  --requests 1000 \
  --concurrency 100 \
  --max-p95-ms 1500 \
  --max-error-rate 0.01
```

Le test réussit avec au plus 1 % d’échecs et un p95 inférieur ou égal à 1,5 seconde. Ces seuils sont une gate de fumée, pas une garantie de capacité à 1 000 joueurs : une répétition avec le polling et la base réels reste obligatoire.

Baseline locale du 13 août 2026, sur le build de production : 500 requêtes vers `/api/health` et `/`, concurrence 50, zéro échec, p50 83 ms, p95 242 ms, maximum 335 ms et 480,5 requêtes par seconde. Cette mesure ne sollicite ni Neon ni les écritures de réponses et ne doit pas être extrapolée à la production.

## Pré-déploiement Netlify et Neon

- [ ] `main` contient uniquement des PR approuvées et toutes les Actions sont vertes.
- [ ] le dernier backup / point de restauration Neon est identifié et daté ;
- [ ] les migrations ont été validées sur la branche Neon de PR ;
- [ ] `DATABASE_URL` est l’URL poolée et `DATABASE_URL_UNPOOLED` l’URL directe du même projet de production ;
- [ ] `APP_URL` correspond exactement au domaine public en HTTPS ;
- [ ] `SESSION_SECRET` et `ADMIN_AUTH_SECRET` sont distincts, aléatoires et longs d’au moins 32 caractères ;
- [ ] aucune valeur de `.env.example` n’est utilisée en production ;
- [ ] le premier compte administrateur est actif et testé depuis un appareil de secours ;
- [ ] le build Netlify utilise Node 22.18.0 et npm 11.6.2 ;
- [ ] les deux règles Netlify Edge de rate limiting sont reconnues dans le log du déploiement ;
- [ ] `/api/health` répond en HTTPS avec `status: ok` ;
- [ ] les en-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` et `Permissions-Policy` sont présents ;
- [ ] les logs Netlify Functions et les métriques Neon sont accessibles à l’opérateur de secours.

Le seuil d’inscription est volontairement fixé à 1 500 requêtes par minute et par combinaison domaine/IP : un seuil plus bas pourrait bloquer les invités réunis derrière l’adresse publique unique du Wi-Fi du lieu. Le login admin reste limité à huit tentatives sur trois minutes.

## Répétition générale

- [ ] charger le contenu final validé et ses sources ;
- [ ] contrôler le seed du 66e anniversaire sur la branche Neon éphémère, puis l’exécuter une seule fois sur production selon `docs/seed-independence-66.md` ;
- [ ] jouer toutes les questions dans l’ordre réel ;
- [ ] vérifier chaque bonne réponse, explication, image et durée ;
- [ ] simuler une annulation et une perte réseau ;
- [ ] simuler deux administrateurs agissant presque simultanément ;
- [ ] exporter le classement final et le comparer au ledger ;
- [ ] exécuter le test de charge sur la Deploy Preview ;
- [ ] consigner l’heure, les appareils, le nombre de joueurs simulés et le résultat ;
- [ ] figer les fonctionnalités après validation.

## Procédure du 15 août

Avant ouverture :

1. vérifier `/api/health`, la connexion Neon et le dernier déploiement publié ;
2. tester une inscription, une question, une réponse, une révélation et le classement ;
3. vérifier l’heure UTC et le fuseau de l’événement ;
4. tester le QR et l’URL courte ;
5. ouvrir la régie sur l’appareil principal et l’appareil de secours ;
6. garder les pages Netlify Functions et Neon Monitoring ouvertes.

Pendant le quiz :

- un opérateur conduit la session ;
- un second administrateur surveille les erreurs et le classement sans lancer de commande sauf reprise ;
- aucune migration, modification de secret ou fonctionnalité n’est déployée ;
- tout incident note l’heure UTC, la route, le statut HTTP et l’action en cours sans copier de token.

## Observabilité et déclencheurs de rollback

Surveiller après chaque déploiement et pendant le live : taux de réponses HTTP 5xx/429, durée des fonctions, erreurs Neon, connexions, stockage, inscription, réponses reçues et progression des audits.

Rollback immédiat vers le dernier déploiement Netlify fonctionnel si l’un de ces événements survient :

- `/api/health` échoue deux fois consécutives sur deux réseaux ;
- inscription ou réponse retourne plus de 5 % d’erreurs sur cinq minutes ;
- une bonne réponse apparaît avant révélation ;
- une réponse tardive est acceptée ;
- plusieurs réponses sont acceptées pour le même joueur et la même occurrence ;
- le classement diverge du ledger sur un échantillon contrôlé ;
- la régie ne peut plus fermer ou révéler la question courante.

Un rollback applicatif ne doit jamais être accompagné d’un rollback destructif de la base. Les migrations de cette V1 sont additives ; toute restauration de données nécessite une décision explicite et un point de restauration Neon vérifié.

## Plan B opérationnel

- conserver l’URL joueur et le classement accessibles directement, indépendamment de WhatsApp ;
- afficher le QR code sur un support distinct ;
- garder un appareil admin de secours sur un autre réseau ;
- en cas d’incident prolongé, fermer la question, noter les joueurs concernés et reprendre uniquement après stabilisation ;
- contrôler manuellement le classement final à partir de l’export CSV et du ledger.
