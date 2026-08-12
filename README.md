# MESTE — Héritage Congo

Application web mobile-first de quiz culturel consacrée à la République du Congo (Congo-Brazzaville), conçue pour l'événement MESTE du 15 août 2026.

## Prérequis

- Node.js 22.13 ou plus récent ;
- npm 11 ;
- un projet Neon pour les tâches nécessitant PostgreSQL.

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

L'application est disponible sur `http://localhost:3000`. Le health check est exposé sur `http://localhost:3000/api/health`.

Remplacez toutes les valeurs d'exemple dans `.env.local` avant d'utiliser une fonctionnalité serveur. Ne versionnez jamais ce fichier.

## Commandes

```bash
npm run dev             # serveur de développement
npm run lint            # règles ESLint et Next.js
npm run typecheck       # TypeScript strict sans émission
npm test                # tests unitaires Vitest
npm run test:integration:db # réservé au workflow Neon de prévisualisation
npm run test:watch      # Vitest en mode interactif
npm run test:e2e        # smoke tests Playwright mobile
npm run build           # build de production Next.js (compilateur Webpack)
npm run netlify:build   # build local avec le contexte Netlify
npm run admin:create -- --email ... --name ... # créer un administrateur (interactif)
npm run db:check        # vérifier l'intégrité de l'historique des migrations
npm run db:generate     # générer les migrations Drizzle
npm run db:migrate      # appliquer les migrations Drizzle
npm run db:studio       # ouvrir Drizzle Studio
```

Installez Chromium une première fois avant les tests E2E :

```bash
npx playwright install chromium
```

## Base de données

L'application utilise Drizzle ORM et le pilote HTTP `@neondatabase/serverless`, adapté aux fonctions serverless Netlify. Utilisez :

- `DATABASE_URL` avec l'URL Neon poolée pour le trafic applicatif ;
- `DATABASE_URL_UNPOOLED` avec l'URL directe pour Drizzle Kit et les migrations.

Le schéma métier est défini dans `db/schema/index.ts` et les migrations versionnées dans `db/migrations`. Après une modification du schéma, générez la migration avec `npm run db:generate`, vérifiez-la, puis exécutez `npm run db:check`.

Le workflow GitHub crée une branche Neon éphémère pour chaque PR et y applique automatiquement les migrations. N'exécutez jamais une migration sur la base de production sans instruction explicite.

Les choix de modélisation et les invariants sont détaillés dans `docs/database-schema.md`.

## API joueur

- `POST /api/register` crée un joueur et sa session à partir de `eventSlug` et `nickname` ;
- `GET /api/me` restaure le joueur courant depuis son cookie sécurisé.

Le token joueur brut reste exclusivement dans un cookie `HttpOnly`. Seule son empreinte HMAC est stockée dans PostgreSQL. Le contrat complet est documenté dans `docs/player-registration.md`.

## Bibliothèque de questions

La couche serveur permet de créer les catégories et de gérer le cycle `DRAFT → REVIEW → VALIDATED → ARCHIVED` des questions texte ou image. La revue et la validation exigent de deux à quatre propositions, exactement une bonne réponse et au moins une source. Les interfaces administrateur seront raccordées lors de la TASK 09 ; aucun secret de réponse n’est exposé par une route publique à ce stade.

Le contrat métier et les invariants sont documentés dans `docs/question-library.md`.

## Moteur de session

Le moteur serveur crée et configure les sessions, n’accepte que des questions validées et contrôle les cycles `DRAFT → READY → LIVE → FINISHED` et `PENDING → OPEN → CLOSED → REVEALED`. PostgreSQL garantit qu’une seule occurrence peut être ouverte à la fois dans une session.

Le DTO joueur omet la bonne réponse et l’explication avant la révélation. Les interfaces joueur et administrateur seront raccordées dans les tâches dédiées. Le contrat complet est documenté dans `docs/session-engine.md`.

## Réponse et scoring

- `POST /api/session-questions/:id/answer` enregistre atomiquement la première réponse recevable ;
- `GET /api/session-questions/:id/result` masque la correction jusqu’à l’état `REVEALED`.

Le serveur calcule le score depuis son heure de réception, met à jour la série et écrit chaque composante dans le ledger. PostgreSQL arbitre les doubles soumissions concurrentes. Une annulation conserve la réponse mais invalide les événements de score associés. Le contrat complet est documenté dans `docs/answer-scoring.md`.

## Interface joueur

La landing mobile mène à `/play/heritage-congo-2026`. Le parcours restaure le joueur après rechargement, propose l’inscription par pseudo, affiche le lobby, synchronise la question active avec un polling jitteré et présente la correction uniquement après `REVEALED`.

Les endpoints légers `GET /api/events/:eventSlug/state` et `GET /api/sessions/:id/current-question` complètent les routes de réponse. Les règles d’interface et de synchronisation sont documentées dans `docs/player-interface.md`.

## Classement

`GET /api/leaderboard?eventSlug=…` calcule le classement général depuis le ledger actif. Le paramètre facultatif `sessionId` fournit la portée session. L’écran `/leaderboard/:eventSlug` affiche le Top 10, les égalités et la position personnelle, puis se rafraîchit avec un polling jitteré.

Le calcul exclut les scores invalidés et les joueurs désactivés. Le contrat et les règles d’égalité sont documentés dans `docs/leaderboard.md`.

## Administration

L’espace `/admin` est protégé par une session serveur de douze heures. Les mots de passe administrateur sont hashés avec `scrypt`, les tokens bruts restent dans un cookie `HttpOnly` et seule leur empreinte HMAC est stockée. Cinq échecs de connexion verrouillent temporairement le compte.

Le dashboard affiche les participants, l’activité récente, la session et la question courantes, les statistiques de réponse, le Top 10 et l’état de la bibliothèque. La régie permet aussi de préparer et lancer une session, conduire le cycle des questions, annuler une question, terminer la session, exporter les joueurs, le classement et les réponses, puis consulter les dernières actions administratives. Le contrat de sécurité, les métriques et les commandes sont documentés dans `docs/admin-dashboard.md`, `docs/live-control.md` et `docs/admin-reporting.md`.

## Déploiement Netlify

Netlify détecte Next.js et applique automatiquement l'adaptateur OpenNext. Configurez les variables de `.env.example` dans l'interface Netlify, puis utilisez la commande de build `npm run build` et le répertoire de publication `.next`.

Le build force Webpack, pris en charge par Next.js, car Turbopack ouvre un port de compilation PostCSS qui n'est pas disponible dans certains environnements d'intégration isolés.

## Documentation

- Cahier des charges : `docs/cahier-des-charges-v1.md`
- Inscription et session joueur : `docs/player-registration.md`
- Bibliothèque de questions : `docs/question-library.md`
- Moteur de session : `docs/session-engine.md`
- Réponse et scoring : `docs/answer-scoring.md`
- Interface joueur : `docs/player-interface.md`
- Classement : `docs/leaderboard.md`
- Authentification et dashboard admin : `docs/admin-dashboard.md`
- Contrôle live : `docs/live-control.md`
- Exports et journal d’audit : `docs/admin-reporting.md`
- Roadmap : `docs/roadmap-v1.md`
- Instructions agents : `AGENTS.md`
