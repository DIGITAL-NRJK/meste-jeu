# Schéma PostgreSQL — V1

Le schéma Drizzle de MESTE Héritage Congo se trouve dans `db/schema/index.ts`. La migration initiale versionnée se trouve dans `db/migrations`.

## Modèle couvert

La V1 définit les 17 tables prévues par le cahier des charges :

- événements, joueurs et sessions d'authentification ;
- catégories, questions, propositions et sources ;
- sessions de quiz et occurrences de questions ;
- réponses et ledger de score ;
- récompenses et attributions ;
- administrateurs et sessions d'administration ;
- consentements et journal d'audit.

Tous les instants sont stockés avec `timestamp with time zone`. L'application manipule ces instants en UTC ; le champ `events.timezone` conserve le fuseau d'affichage métier de l'événement.

La difficulté est stockée sous forme de niveau numérique stable, séparé du libellé affiché :

| Niveau | Libellé V1 |
|---:|---|
| 1 | Découverte |
| 2 | Connaisseur |
| 3 | Expert |
| 4 | Maître du Congo |

## Garanties PostgreSQL

La base garantit notamment :

- un pseudo insensible à la casse unique par événement ;
- des tokens de session uniquement sous forme de hash unique ;
- une seule réponse par couple `player_id + session_question_id` ;
- au maximum une proposition correcte par question et quatre propositions maximum ;
- des positions uniques dans une session ;
- une seule occurrence `OPEN` à la fois dans une même session ;
- des durées, dates et compteurs cohérents ;
- un ledger de score conservé, avec invalidation par `voided_at` au lieu d'une suppression ;
- un auteur administrateur obligatoire pour les ajustements manuels ;
- la conservation de l'historique grâce à des clés étrangères restrictives.

## Invariants applicatifs

Les services transactionnels appliquent les contrôles portant sur plusieurs tables :

- avant validation, une question doit posséder exactement une bonne réponse et au moins une source ;
- une proposition enregistrée comme réponse doit appartenir à la question jouée ;
- le joueur, la session et l'occurrence doivent appartenir au même événement ;
- le serveur décide de l'ouverture, de la clôture, de la recevabilité et du score ;
- une annulation conserve les réponses et invalide les événements de score associés.

PostgreSQL garantit déjà l'anti-double réponse même en cas de concurrence. Les services ne doivent pas remplacer cette contrainte par une simple vérification JavaScript.

Le classement est dérivé du ledger actif sans colonne de total matérialisée. Les égalités utilisent `RANK()` sur les points décroissants ; `voided_at` et le statut du joueur sont évalués à chaque calcul.

Les comptes administrateur suivent aussi les échecs de connexion avec `failed_login_count` et `locked_until`. Une session réussie remet ces champs à zéro ; cinq échecs consécutifs déclenchent un verrouillage de quinze minutes sans modifier ni exposer le hash du mot de passe.

## Cycle des migrations

Pour une évolution de schéma :

```bash
npm run db:generate
npm run db:check
```

Relire le SQL généré avant de le commiter. À l'ouverture ou à la synchronisation d'une PR, GitHub Actions crée une branche Neon éphémère, applique `npm run db:migrate` avec sa connexion directe, puis supprime cette branche à la fermeture de la PR.

Ne jamais exécuter `npm run db:migrate` avec l'URL de production sans instruction explicite.
